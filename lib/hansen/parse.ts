// lib/hansen/parse.ts
//
// Parses the HTML returned by webapps1.chicago.gov/buildingrecords/doSearch
// into a typed object matching the five `hansen_*` Supabase tables.
//
// This module is PURE: HTML string in, typed object out. No network, no DB.
// That makes it testable offline against a saved doSearch response.
//
// Page structure (confirmed against a real 1501 N Leamington Ave response):
//   - "Range address"      → one line of text
//   - "Building Attributes" → table#resultstable_attributes, exactly one <tbody> row
//   - "Building Permits"    → table#resultstable_permits, N rows
//   - "Building Code Enforcement Case Activity" → table#resultstable_caseactivity, N rows
//   - "Department of Buildings Inspections"     → table#resultstable_inspections, N rows
//   - "Alleged Code Violations" → table#resultstable_violations, a STATEFUL table:
//        grey header row (inspection context) → sub-header row (skip) → N data rows → repeat
//
// Dates: every date cell carries a hidden <span style="display:none;">YYYYMMDD</span>.
// We parse THAT, not the visible MM/DD/YYYY string — the city pre-normalized it for us.
//
// Inspection links look like:
//   /buildingrecords/inspectiondetails?addr=108241&insp=14652277
// The `addr=` value is a stable Hansen-internal address key, constant across all
// rows on the page. We capture it once as `detail_addr_id`.

import * as cheerio from 'cheerio'
import type { Element } from 'domhandler'

// ─────────────────────────────────────────────────────────────────────────────
// Types — mirror the hansen_* tables. `bldg_id` / `fetched_at` are added by the
// caller (the API route) at upsert time, not by the parser.
// ─────────────────────────────────────────────────────────────────────────────

export type HansenBuildingAttributes = {
  bldg_id: string                  // "313633" — the table's own first column
  input_address: string | null     // echoed from the "Input Address" block
  range_address: string | null     // "1501-1501 N LEAMINGTON AVE CHICAGO IL 60651"
  detail_addr_id: string | null     // "108241" — from inspectiondetails?addr=...
  stories: number | null
  basement: boolean | null          // "Y"/"N" → bool; anything else → null
  length_ft: number | null
  width_ft: number | null
  height_ft: number | null
  floor_area: number | null         // "FLR AREA"
  constr_type: string | null        // "3B"
  porch: string | null              // often blank
  lot_width: number | null
  lot_length: number | null
  dwelling_units: number | null     // "DU"
}

export type HansenPermit = {
  permit_number: string             // "101027525", "EL7852087" — alphanumeric
  date_issued: string | null        // ISO "YYYY-MM-DD"
  description: string | null
}

export type HansenEnforcementCase = {
  case_number: string               // "16M1401126"
  case_type: string | null          // "CIRCUIT COURT" | "ADMINISTRATIVE HEARING"
}

export type HansenInspection = {
  inspection_number: string         // "14652277"
  inspection_date: string | null    // ISO "YYYY-MM-DD"
  status: string | null             // "CLOSED" | "PASSED" | "FAILED" | "PARTIAL PASSED"
  type_description: string | null   // "DEMO COURT", "DOB PLUMBING INSPECTION", ...
}

export type HansenViolation = {
  inspection_number: string         // groups violations; ties to hansen_inspections
  inspection_type: string | null    // "DEMO COURT" — from the grey header row
  inspection_date: string | null    // ISO "YYYY-MM-DD" — from the grey header row
  violation_code: string            // "CN193000"
  code_citation: string | null      // the long ordinance text
  violation_details: string | null  // third column — often blank
}

export type HansenParseResult = {
    // Top-level (not just inside `building`) so the range is available even when
    // an address resolves to a range with no Building Attributes row — the
    // "surface the range" use case is the primary one.
    input_address: string | null
    range_addresses: string[]
    building: HansenBuildingAttributes | null   // null only when there is no usable building key at all
    addr_ids: HansenAddrId[]
    permits: HansenPermit[]
  enforcement_cases: HansenEnforcementCase[]
  inspections: HansenInspection[]
  violations: HansenViolation[]
  // Soft signal for the caller: true when the page rendered but every section
  // was empty (valid address, no DOB activity) vs. a structurally unexpected page.
  is_empty: boolean
}

// ─────────────────────────────────────────────────────────────────────────────
// Small helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Collapse whitespace (incl. newlines, &nbsp;) and trim. Returns null for empty. */
function clean(raw: string | undefined | null): string | null {
  if (raw == null) return null
  const s = raw
    .replace(/\u00a0/g, ' ')   // &nbsp;
    .replace(/\s+/g, ' ')
    .trim()
  return s.length > 0 ? s : null
}

/** Parse an integer cell. Empty / non-numeric → null (NOT 0 — absence ≠ zero). */
function toInt(raw: string | undefined | null): number | null {
  const s = clean(raw)
  if (s == null) return null
  // strip commas just in case ("1,210")
  const n = parseInt(s.replace(/,/g, ''), 10)
  return Number.isFinite(n) ? n : null
}

/** "Y" → true, "N" → false, anything else → null. */
function toBool(raw: string | undefined | null): boolean | null {
  const s = clean(raw)?.toUpperCase()
  if (s === 'Y') return true
  if (s === 'N') return false
  return null
}

/**
 * Extract the ISO date from a date cell.
 *
 * Each date cell looks like:
 *   <td><span style="display:none;">20231121</span> 11/21/2023</td>
 *
 * Strategy: prefer the hidden YYYYMMDD span (already normalized, sortable).
 * Fall back to parsing a visible MM/DD/YYYY if the span is ever missing.
 * Returns ISO "YYYY-MM-DD" or null.
 */
function extractDate($cell: cheerio.Cheerio<Element>): string | null {
  // 1. Hidden span — the reliable path.
  const hidden = clean($cell.find('span').first().text())
  if (hidden && /^\d{8}$/.test(hidden)) {
    return `${hidden.slice(0, 4)}-${hidden.slice(4, 6)}-${hidden.slice(6, 8)}`
  }
  // 2. Fallback — visible text, strip the (possibly absent) span text first.
  const full = clean($cell.text()) ?? ''
  const m = full.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/)
  if (m) {
    const mm = m[1].padStart(2, '0')
    const dd = m[2].padStart(2, '0')
    return `${m[3]}-${mm}-${dd}`
  }
  return null
}

export type HansenAddrId = {
  detail_addr_id: string   // the raw addr= value, e.g. "115461"
  occurrences: number      // how many inspection links carried it
  is_primary: boolean      // the chosen representative for this page
}

/**
 * Collect EVERY `addr=` value from the inspection-detail links, with counts.
 *
 * A page is NOT guaranteed to use a single addr= — 1600 N Milwaukee carries
 * mostly addr=115461 with a few addr=1196540. We capture the full set (it may
 * be useful for cross-referencing other Hansen-keyed datasets later) and pick
 * one deterministic representative: most frequent, lowest numeric value on a
 * tie. Positional (.first()) selection is unstable because the table re-sorts
 * as inspections are added.
 *
 * Returns [] when there are no inspection links at all.
 */
function extractAddrIds($: cheerio.CheerioAPI): HansenAddrId[] {
  const counts = new Map<string, number>()
  $('#resultstable_inspections a[href*="inspectiondetails"]').each((_, a) => {
    const href = $(a).attr('href') ?? ''
    const m = href.match(/[?&]addr=(\d+)/)
    if (m) counts.set(m[1], (counts.get(m[1]) ?? 0) + 1)
  })
  if (counts.size === 0) return []

  // Determine the primary: highest occurrences, then lowest numeric value.
  let primary: string | null = null
  let primaryCount = -1
  for (const [id, n] of counts) {
    if (
      n > primaryCount ||
      (n === primaryCount && primary != null && parseInt(id, 10) < parseInt(primary, 10))
    ) {
      primary = id
      primaryCount = n
    }
  }

  return [...counts.entries()].map(([detail_addr_id, occurrences]) => ({
    detail_addr_id,
    occurrences,
    is_primary: detail_addr_id === primary,
  }))
}

/**
 * Read the single text line that follows a section's <h6> title.
 * Used for "Input Address" and "Range address", which aren't tables —
 * they're an <h6> followed by a <p>.
 *
 * We locate the <h6> whose bold text matches `label`, then take the next <p>.
 */
function sectionLine($: cheerio.CheerioAPI, label: string): string | null {
  let found: string | null = null
  $('h6').each((_, el) => {
    if (found != null) return
    const titleText = clean($(el).text())?.toUpperCase() ?? ''
    if (titleText.includes(label.toUpperCase())) {
      // The value <p> is the next sibling of the <h6> (same .city-row-title div).
      const p = $(el).nextAll('p').first()
      found = clean(p.text())
    }
  })
  return found
}

/**
 * Like sectionLine, but collects EVERY <p> following the section's <h6>.
 * The "Range address" block lists one <p> per range — a building fronting two
 * streets shows multiple, and the city sometimes literally repeats a line.
 * Deduped, trimmed, in page order.
 */
function sectionLines($: cheerio.CheerioAPI, label: string): string[] {
  let found: string[] | null = null
  $('h6').each((_, el) => {
    if (found != null) return
    const titleText = clean($(el).text())?.toUpperCase() ?? ''
    if (titleText.includes(label.toUpperCase())) {
      const lines: string[] = []
      const seen = new Set<string>()
      $(el).nextAll('p').each((_, p) => {
        const t = clean($(p).text())
        if (t && !seen.has(t)) {
          seen.add(t)
          lines.push(t)
        }
      })
      found = lines
    }
  })
  return found ?? []
}

// ─────────────────────────────────────────────────────────────────────────────
// Section parsers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Building Attributes — table#resultstable_attributes.
 * Exactly one data row in practice. Columns, in order:
 *   BLDG ID | STORIES | BASEMENT | LENGTH | WIDTH | HEIGHT | FLR AREA |
 *   CONSTR TYPE | PORCH | LOT WIDTH | LOT LENGTH | DU
 *
 * Returns null if the table is absent or has no data row — that's the
 * "address resolved but has no building record" case.
 */
function parseBuildingAttributes(
  $: cheerio.CheerioAPI,
  inputAddress: string | null,
  rangeAddress: string | null,
  detailAddrId: string | null
): HansenBuildingAttributes | null {
  const $row = $('#resultstable_attributes tbody tr').first()
  const $cells = $row.length > 0 ? $row.find('td') : $()
  const attrBldgId = $cells.length > 0 ? clean($cells.eq(0).text()) : null

  // Fallback path: no Building Attributes table (or no BLDG ID in it), but the
  // page still has inspection links carrying an addr= key. Synthesize a minimal
  // building keyed on the prefixed addr= id so the child tables (permits,
  // inspections, etc.) still have a parent to attach to. Attribute fields are
  // null because the city genuinely didn't supply them.
  if (!attrBldgId) {
    if (!detailAddrId) return null  // no attributes AND no addr= → truly no key
    return {
      bldg_id: `addr:${detailAddrId}`,
      input_address: inputAddress,
      range_address: rangeAddress,
      detail_addr_id: detailAddrId,
      stories: null,
      basement: null,
      length_ft: null,
      width_ft: null,
      height_ft: null,
      floor_area: null,
      constr_type: null,
      porch: null,
      lot_width: null,
      lot_length: null,
      dwelling_units: null,
    }
  }

  const cell = (i: number) => $cells.eq(i)
  const bldgId = attrBldgId

  return {
    bldg_id: bldgId,
    input_address: inputAddress,
    range_address: rangeAddress,
    detail_addr_id: detailAddrId,
    stories: toInt(cell(1).text()),
    basement: toBool(cell(2).text()),
    length_ft: toInt(cell(3).text()),
    width_ft: toInt(cell(4).text()),
    height_ft: toInt(cell(5).text()),
    floor_area: toInt(cell(6).text()),
    constr_type: clean(cell(7).text()),
    porch: clean(cell(8).text()),
    lot_width: toInt(cell(9).text()),
    lot_length: toInt(cell(10).text()),
    dwelling_units: toInt(cell(11).text()),
  }
}

/**
 * Building Permits — table#resultstable_permits.
 * Columns: PERMIT # | DATE ISSUED | DESCRIPTION OF WORK
 */
function parsePermits($: cheerio.CheerioAPI): HansenPermit[] {
  const out: HansenPermit[] = []
  $('#resultstable_permits tbody tr').each((_, tr) => {
    const $cells = $(tr).find('td')
    if ($cells.length < 3) return
    const permitNumber = clean($cells.eq(0).text())
    if (!permitNumber) return
    out.push({
      permit_number: permitNumber,
      date_issued: extractDate($cells.eq(1)),
      description: clean($cells.eq(2).text()),
    })
  })
  return out
}

/**
 * Building Code Enforcement Case Activity — table#resultstable_caseactivity.
 * Columns: CASE NUMBER | CASE TYPE
 */
function parseEnforcementCases($: cheerio.CheerioAPI): HansenEnforcementCase[] {
  const out: HansenEnforcementCase[] = []
  $('#resultstable_caseactivity tbody tr').each((_, tr) => {
    const $cells = $(tr).find('td')
    if ($cells.length < 2) return
    const caseNumber = clean($cells.eq(0).text())
    if (!caseNumber) return
    out.push({
      case_number: caseNumber,
      case_type: clean($cells.eq(1).text()),
    })
  })
  return out
}

/**
 * Department of Buildings Inspections — table#resultstable_inspections.
 * Columns: INSP # (wrapped in an <a>) | INSPECTION DATE | STATUS | TYPE DESCRIPTION
 */
function parseInspections($: cheerio.CheerioAPI): HansenInspection[] {
  const out: HansenInspection[] = []
  $('#resultstable_inspections tbody tr').each((_, tr) => {
    const $cells = $(tr).find('td')
    if ($cells.length < 4) return
    // INSP # is inside an <a>; .text() on the cell still yields the number.
    const inspectionNumber = clean($cells.eq(0).text())
    if (!inspectionNumber) return
    out.push({
      inspection_number: inspectionNumber,
      inspection_date: extractDate($cells.eq(1)),
      status: clean($cells.eq(2).text()),
      type_description: clean($cells.eq(3).text()),
    })
  })
  return out
}

/**
 * Alleged Code Violations — table#resultstable_violations.
 *
 * This table is NOT a flat grid. It's a sequence of groups, each:
 *
 *   <tr style="background-color:#B6B6B4">      ← GREY HEADER (inspection context)
 *     <th><span style="display:none;">14652277</span></th>
 *     <th>DEMO COURT # 14652277 &nbsp;INSPECTION DATE: 04/30/2025</th>
 *     <th>Number of Violations: 5</th>
 *   </tr>
 *   <tr> <th>VIOLATIONS</th><th>BUILDING CODE CITATION</th><th>VIOLATION DETAILS</th> </tr>  ← SUB-HEADER (skip)
 *   <tr> <td>CN193000</td><td>...citation...</td><td>...details...</td> </tr>               ← DATA
 *   <tr> ... more data rows ... </tr>
 *   <tr style="background-color:#B6B6B4"> ... next inspection ... </tr>
 *
 * We walk rows statefully:
 *   - grey row (has bgcolor #B6B6B4, or its first cell is a <th> with a hidden
 *     numeric span) → parse + set current inspection context
 *   - a row of all <th> that isn't grey → sub-header → skip
 *   - a row with <td> cells → data row → emit under the current context
 *
 * Robustness choices:
 *   - We detect the grey row by EITHER the inline bgcolor OR the hidden-span
 *     signature, so a CSS tweak on the city's side doesn't silently break it.
 *   - The inspection number comes from the hidden <span> in the grey row's
 *     first <th> — the most stable source (the visible text repeats it but
 *     is wrapped in prose).
 *   - inspection_type and inspection_date are pulled from the grey row's
 *     second <th> ("DEMO COURT # 14652277  INSPECTION DATE: 04/30/2025").
 */
function parseViolations($: cheerio.CheerioAPI): HansenViolation[] {
  const out: HansenViolation[] = []

  let currentInspNumber: string | null = null
  let currentInspType: string | null = null
  let currentInspDate: string | null = null

  $('#resultstable_violations tbody tr').each((_, tr) => {
    const $tr = $(tr)
    const $th = $tr.find('th')
    const $td = $tr.find('td')

    // Identify a grey header row.
    const styleAttr = ($tr.attr('style') ?? '').toUpperCase().replace(/\s/g, '')
    const looksGreyByStyle = styleAttr.includes('BACKGROUND-COLOR:#B6B6B4')
    const firstThHiddenSpan = clean($th.first().find('span').first().text())
    const looksGreyBySpan =
      $th.length >= 2 && firstThHiddenSpan != null && /^\d+$/.test(firstThHiddenSpan)

    if (looksGreyByStyle || looksGreyBySpan) {
      // ── New inspection context ──────────────────────────────────────────
      // First <th>: hidden span with the inspection number.
      currentInspNumber = firstThHiddenSpan && /^\d+$/.test(firstThHiddenSpan)
        ? firstThHiddenSpan
        : null

      // Second <th>: "DEMO COURT # 14652277  INSPECTION DATE: 04/30/2025"
      const headerText = clean($th.eq(1).text()) ?? ''

      // inspection_type = everything before " # "
      const typeMatch = headerText.match(/^(.*?)\s*#\s*\d+/)
      currentInspType = typeMatch ? clean(typeMatch[1]) : null

      // inspection_date = the MM/DD/YYYY after "INSPECTION DATE:"
      const dateMatch = headerText.match(
        /INSPECTION DATE:\s*(\d{1,2})\/(\d{1,2})\/(\d{4})/i
      )
      currentInspDate = dateMatch
        ? `${dateMatch[3]}-${dateMatch[1].padStart(2, '0')}-${dateMatch[2].padStart(2, '0')}`
        : null

      // Fallback: if the hidden span was missing, try to recover the number
      // from the header text itself ("... # 14652277 ...").
      if (currentInspNumber == null) {
        const numMatch = headerText.match(/#\s*(\d+)/)
        currentInspNumber = numMatch ? numMatch[1] : null
      }
      return
    }

    // A row that is all <th> and not grey → the VIOLATIONS/CITATION/DETAILS
    // sub-header. Skip it.
    if ($td.length === 0 && $th.length > 0) return

    // ── Data row ──────────────────────────────────────────────────────────
    if ($td.length >= 2) {
      // We must have an inspection context to attach to. If we somehow hit a
      // data row before any grey row, skip it rather than emit an orphan.
      if (currentInspNumber == null) return

      const violationCode = clean($td.eq(0).text())
      if (!violationCode) return

      out.push({
        inspection_number: currentInspNumber,
        inspection_type: currentInspType,
        inspection_date: currentInspDate,
        violation_code: violationCode,
        code_citation: clean($td.eq(1).text()),
        violation_details: $td.length >= 3 ? clean($td.eq(2).text()) : null,
      })
    }
  })

  return out
}

// ─────────────────────────────────────────────────────────────────────────────
// Entry point
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Parse a raw doSearch results HTML page into the five-table shape.
 *
 * Throws only on input that isn't recognizably the buildingrecords results
 * page at all (wrong page, truncated response, error page). A valid page
 * with no DOB activity returns a result with `is_empty: true` and empty
 * arrays — that's a legitimate outcome, not an error.
 */
export function parseHansenResults(html: string): HansenParseResult {
  if (!html || html.length < 200) {
    throw new Error('Hansen parse: empty or truncated HTML')
  }

  const $ = cheerio.load(html)

  // Sanity check: is this actually the results page? The results page has the
  // section tables; the search form / agreement / error pages do not.
  const looksLikeResultsPage =
    $('#resultstable_attributes').length > 0 ||
    $('#resultstable_inspections').length > 0 ||
    $('#resultstable_violations').length > 0 ||
    $('#resultstable_permits').length > 0

  if (!looksLikeResultsPage) {
    // Distinguish "wrong page" from "right page, no data". The results page
    // always renders the "Range address" block even when every table is empty;
    // if we don't even have that, we were handed something else entirely.
    const rangeLines = sectionLines($, 'Range address')
    if (rangeLines.length === 0) {
      throw new Error(
        'Hansen parse: HTML does not look like a doSearch results page ' +
          '(no section tables, no "Range address" block)'
      )
    }
  }

  const inputAddress = sectionLine($, 'Input Address')
  const rangeAddresses = sectionLines($, 'Range address')
  const addrIds = extractAddrIds($)
  const primaryAddrId = addrIds.find((a) => a.is_primary)?.detail_addr_id ?? null

  const building = parseBuildingAttributes(
    $,
    inputAddress,
    rangeAddresses[0] ?? null,
    primaryAddrId
  )
  const permits = parsePermits($)
  const enforcement_cases = parseEnforcementCases($)
  const inspections = parseInspections($)
  const violations = parseViolations($)

  const is_empty =
    building == null &&
    permits.length === 0 &&
    enforcement_cases.length === 0 &&
    inspections.length === 0 &&
    violations.length === 0

  return {
    input_address: inputAddress,
    range_addresses: rangeAddresses,
    building,
    addr_ids: addrIds,
    permits,
    enforcement_cases,
    inspections,
    violations,
    is_empty,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Cross-check helper (optional, for the caller / tests)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The grey header rows in the violations table state "Number of Violations: N".
 * This re-derives those counts from the parsed violation rows so the caller
 * (or a test) can assert the stateful walk didn't drop or double-count rows.
 *
 * Returns a map of inspection_number → count of parsed violation rows.
 * Compare against the "Number of Violations" claims if you want a self-check.
 */
export function violationCountsByInspection(
  violations: HansenViolation[]
): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const v of violations) {
    counts[v.inspection_number] = (counts[v.inspection_number] ?? 0) + 1
  }
  return counts
}

/**
 * Parse the "Number of Violations: N" claims straight from the grey header
 * rows, so a test can assert parsed-row-count === claimed-count per inspection.
 * Kept separate from parseViolations so the main parser stays focused on
 * producing table rows, not validating itself.
 */
export function claimedViolationCounts(html: string): Record<string, number> {
  const $ = cheerio.load(html)
  const claims: Record<string, number> = {}

  $('#resultstable_violations tbody tr').each((_, tr) => {
    const $tr = $(tr)
    const styleAttr = ($tr.attr('style') ?? '').toUpperCase().replace(/\s/g, '')
    if (!styleAttr.includes('BACKGROUND-COLOR:#B6B6B4')) return

    const $th = $tr.find('th')
    const inspNum = clean($th.first().find('span').first().text())
    if (!inspNum || !/^\d+$/.test(inspNum)) return

    const claimText = clean($th.eq(2).text()) ?? ''
    const m = claimText.match(/Number of Violations:\s*(\d+)/i)
    if (m) claims[inspNum] = parseInt(m[1], 10)
  })

  return claims
}