// lib/rentroll/extract.ts
//
// Deterministic row extraction: sheet grid + column map → ParsedUnitRow[].
// Handles every mess pattern observed in the GC Realty rent roll
// (data/GCRD_rentroll.csv): junk prefixes ("PMA Canceled *..."), units
// embedded in the address cell, dual-range addresses ("1113 - 1115 W
// Patterson Ave"), summary rows ("Total"), repeated headers, blank lines.
// Rows it cannot break out are flagged 'unparsed' for the Gemini rescue pass.
//
// All cell text passes through sanitizeCell: control chars stripped, length
// capped, and leading formula sigils (= @ +) neutralized so a hostile cell
// can never execute if this data is ever re-exported to a spreadsheet.

import type { ColumnMap, ParsedUnitRow, RowFlag } from './types'

const MAX_CELL_LEN = 200

/** Strip control chars, cap length, neutralize spreadsheet formula sigils. */
export function sanitizeCell(raw: unknown): string {
  if (raw === null || raw === undefined) return ''
  let s = String(raw)
     
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (s.length > MAX_CELL_LEN) s = s.slice(0, MAX_CELL_LEN)
  // "=..." and "@..." are never legitimate rent-roll values; "+..." only as a
  // number. Strip the sigil rather than storing an executable-looking cell.
  while (/^[=@]/.test(s) || (/^\+/.test(s) && !/^\+\d/.test(s))) s = s.slice(1).trim()
  return s
}

/** "2,020.00" / "$1,600" → 2020.00 / 1600. Null when absent or non-numeric. */
export function parseMoney(cell: string): number | null {
  const t = cell.replace(/[$,\s]/g, '')
  if (t === '' || t === '-') return null
  const n = Number(t)
  return Number.isFinite(n) ? n : null
}

/** "09/22/2025", "9/22/25", "2025-09-22" → "2025-09-22". Null when unparseable. */
export function parseDateCell(cell: string): string | null {
  const t = cell.trim()
  if (!t) return null
  let y: number, m: number, d: number
  let match = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/)
  if (match) {
    m = Number(match[1]); d = Number(match[2]); y = Number(match[3])
    if (y < 100) y += y < 50 ? 2000 : 1900
  } else {
    match = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
    if (!match) return null
    y = Number(match[1]); m = Number(match[2]); d = Number(match[3])
  }
  if (m < 1 || m > 12 || d < 1 || d > 31 || y < 1900 || y > 2100) return null
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

/** Unit designation embedded at the end of an address string. */
const EMBEDDED_UNIT_RE = /\s+(?:(unit|apt\.?|apartment)\s+|#\s*)([\w][\w./-]*)$/i

/**
 * Split an address cell into { address, unitFromAddress, flags }.
 * Exported for the rescue pass, which re-runs it on Gemini's output.
 */
export function cleanAddressCell(rawAddress: string): {
  address: string | null
  unitFromAddress: string | null
  flags: RowFlag[]
} {
  const flags: RowFlag[] = []
  let s = rawAddress

  // Junk prefix: annotations PM software prepends to the address. Two shapes:
  //   "PMA Canceled *1765 E 55th St"  /  "FOR SALE *10122 S Luella Ave"
  //   "OB 05/08/26 *253 E Delaware Pl" (prefix itself contains digits)
  // The '*' delimiter is authoritative when present; otherwise strip to the
  // first digit (safe because Chicago addresses always start with the number).
  if (s && !/^\d/.test(s)) {
    const star = s.lastIndexOf('*')
    if (star >= 0 && /^\s*\d/.test(s.slice(star + 1))) {
      s = s.slice(star + 1).trim()
      flags.push('junk_prefix')
    } else {
      const m = s.match(/^[^\d]+(\d.*)$/)
      if (m) {
        s = m[1].trim()
        flags.push('junk_prefix')
      }
    }
  }

  // Dual-range address: "1113 - 1115 W Patterson Ave" → resolve by the low
  // number (matches how the Assessor stores range buildings); keep the flag
  // so review shows the range badge and resolution can fan out later.
  const range = s.match(/^(\d+)\s*-\s*\d+\s+(.+)$/)
  if (range) {
    s = `${range[1]} ${range[2]}`.trim()
    flags.push('dual_range')
  }

  // Embedded unit: "1050 W Dakin St Unit 1A" / "123 Main St #5".
  let unitFromAddress: string | null = null
  const unit = s.match(EMBEDDED_UNIT_RE)
  if (unit) {
    const keyword = unit[1] ? unit[1].replace(/\.$/, '') : '#'
    const label = unit[2]
    unitFromAddress =
      keyword === '#'
        ? `#${label}`
        : `${keyword[0].toUpperCase()}${keyword.slice(1).toLowerCase()} ${label}`
    s = s.slice(0, unit.index).trim()
    flags.push('unit_in_address')
  }

  // Trailing annotation: "2965 N Lincoln Ave - Residential" → strip the
  // " - <words>" tail (a dash followed by letters is never part of an
  // address; dash followed by digits is a range, handled above).
  const tail = s.match(/\s+-\s+[A-Za-z].*$/)
  if (tail) {
    s = s.slice(0, tail.index).trim()
    if (!flags.includes('junk_prefix')) flags.push('junk_prefix')
  }

  // A usable Chicago address is "<number> <words>". Anything else needs rescue.
  if (!/^\d+\s+\S+/.test(s)) {
    return { address: null, unitFromAddress, flags: [...flags, 'unparsed'] }
  }
  // Strip trailing punctuation ("10005 S. Van Vlissingen Rd." keeps its
  // internal periods — normalizeAddress handles those at resolution time).
  s = s.replace(/[.,]+$/, '').trim()
  return { address: s, unitFromAddress, flags }
}

// Chicago proper is 606xx, plus the split-boundary zips (60707 Galewood /
// Elmwood Park, 60827 Riverdale) where we give the benefit of the doubt —
// resolution against the parcel data settles those.
const CHICAGO_ZIP_RE = /^(?:606\d{2}|60707|60827)$/

/**
 * True when the raw address cell carries positive evidence the property is
 * OUTSIDE Chicago — a "<city>, IL" tail that isn't Chicago, or a non-Chicago
 * zip. Cells with no city/zip evidence (plain street addresses) return false:
 * exclusion needs proof, not absence.
 *
 * A zip outranks the city text: "West Chicago, IL 60185" ends in the word
 * "chicago" but the zip gives it away. A trailing 5-digit token that is a
 * unit/account number ("#20514", "Apt 30512") is NOT a zip and is ignored.
 */
export function isNonChicagoAddress(rawAddress: string): boolean {
  const s = rawAddress.trim()
  if (!s) return false

  const zipMatch = s.match(/\b(\d{5})(?:-\d{4})?\s*$/)
  const zipIsUnitNumber = /(?:#|\b(?:unit|apt|apartment|suite|ste|no)\.?\s*)\d{5}(?:-\d{4})?\s*$/i.test(s)
  if (zipMatch && !zipIsUnitNumber) return !CHICAGO_ZIP_RE.test(zipMatch[1])

  // No zip — fall back to the city name before ", IL" / ", Illinois". City
  // names can be multi-word ("Calumet City"), so the safe test is whether the
  // tail's last word is "chicago" itself ("Chicago Heights" and friends end
  // with a different word) — except the municipalities that END in "chicago"
  // (West Chicago, North Chicago), caught by the preceding word.
  const cityMatch = s.match(/([A-Za-z][A-Za-z .'-]*?)\s*,\s*(?:IL|Illinois)\b/i)
  if (cityMatch) {
    const words = cityMatch[1].trim().toLowerCase().split(/\s+/)
    if (words[words.length - 1] !== 'chicago') return true
    const prev = words[words.length - 2]
    return prev === 'west' || prev === 'north' || prev === 'east'
  }

  return false
}

function cellAt(row: string[], idx: number): string {
  return idx >= 0 ? (row[idx] ?? '') : ''
}

export type ExtractResult = {
  rows: ParsedUnitRow[]
  skippedBlank: number
  skippedRepeatHeader: number
}

export function extractRows(sheet: string[][], map: ColumnMap): ExtractResult {
  const rows: ParsedUnitRow[] = []
  let skippedBlank = 0
  let skippedRepeatHeader = 0
  const headerAddressText = cellAt(sheet[map.header_row] ?? [], map.address)

  for (let r = map.header_row + 1; r < sheet.length; r++) {
    const raw = sheet[r] ?? []
    const cells = raw.map(sanitizeCell)
    if (cells.every((c) => c === '')) {
      skippedBlank++
      continue
    }

    const rawAddress = cellAt(cells, map.address)

    // Multi-page exports repeat the header row mid-sheet.
    if (rawAddress !== '' && rawAddress === headerAddressText) {
      skippedRepeatHeader++
      continue
    }

    const base: ParsedUnitRow = {
      row_num: r + 1,
      raw_address: rawAddress,
      address: null,
      unit_label: cellAt(cells, map.unit) || null,
      bd_ba: cellAt(cells, map.bd_ba) || null,
      rent: parseMoney(cellAt(cells, map.rent)),
      status: cellAt(cells, map.status) || null,
      lease_from: parseDateCell(cellAt(cells, map.lease_from)),
      lease_to: parseDateCell(cellAt(cells, map.lease_to)),
      move_in: parseDateCell(cellAt(cells, map.move_in)),
      move_out: parseDateCell(cellAt(cells, map.move_out)),
      flags: [],
    }

    // Summary rows ("Total", "Grand Total") are aggregates, not units.
    if (/^(grand\s+)?total\b/i.test(rawAddress)) {
      base.flags = ['summary_row']
      rows.push(base)
      continue
    }

    const { address, unitFromAddress, flags } = cleanAddressCell(rawAddress)
    base.address = address
    base.flags = flags
    if (!base.unit_label && unitFromAddress) base.unit_label = unitFromAddress
    rows.push(base)
  }

  return { rows, skippedBlank, skippedRepeatHeader }
}
