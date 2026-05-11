// app/api/admin/import-rentroll/route.ts
//
// One-shot import of a rent-roll CSV into portfolio_properties + portfolio_property_units.
// Reuses the production resolution stack (fetchProperty → fetchSiblingPins → getPortfolioSaveBuildingSnapshot
// → fetchPortfolioActivity) so resolved buildings have identical shape and metadata to what manual
// SavePropertyModal saves produce — including correct multi-PIN year_built / implied_value /
// property_class / community_area composition.
//
// Reads CSV from disk at data/GCRD_rentroll.csv (override with GCRD_RENTROLL_PATH env var).
// Hit as GET in browser:
//   /api/admin/import-rentroll                              → dry run, writes to caller's user_id
//   /api/admin/import-rentroll?dryRun=true                  → explicit dry run
//   /api/admin/import-rentroll?dryRun=false                 → LIVE, writes to caller's user_id
//   /api/admin/import-rentroll?dryRun=false&targetUserId=user_XXX → LIVE, writes under target user

import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import {
  normalizeAddress,
  fetchProperty,
  fetchSiblingPins,
  fetchPropertyChars,
  fetchParcelUniverse,
} from '@/lib/supabase-search'
import { fetchPortfolioActivity } from '@/lib/portfolio-stats'
import { getPortfolioSaveBuildingSnapshot } from '@/lib/portfolio-save-building-snapshot'

export const maxDuration = 60  // serverless safety net — actual long imports run locally

const CSV_PATH =
  process.env.GCRD_RENTROLL_PATH || join(process.cwd(), 'data', 'GCRD_rentroll.csv')

// ─────────────────────────────────────────────────────────────────────────────
// CSV parsing — inline (no extra dependency)
// ─────────────────────────────────────────────────────────────────────────────

function parseCSV(content: string): Record<string, string>[] {
  const lines = content.split(/\r?\n/).filter((l) => l.trim() !== '')
  if (lines.length === 0) return []
  const headers = parseLine(lines[0])
  const rows: Record<string, string>[] = []
  for (let i = 1; i < lines.length; i++) {
    const fields = parseLine(lines[i])
    if (fields.length === 0 || fields.every((f) => f === '')) continue
    const row: Record<string, string> = {}
    headers.forEach((h, idx) => {
      row[h] = fields[idx] ?? ''
    })
    rows.push(row)
  }
  return rows
}

function parseLine(line: string): string[] {
  const fields: string[] = []
  let current = ''
  let inQuote = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (c === '"') {
      if (inQuote && line[i + 1] === '"') {
        current += '"'
        i++
      } else {
        inQuote = !inQuote
      }
    } else if (c === ',' && !inQuote) {
      fields.push(current)
      current = ''
    } else {
      current += c
    }
  }
  fields.push(current)
  return fields.map((f) => f.trim())
}

// ─────────────────────────────────────────────────────────────────────────────
// Field parsing
// ─────────────────────────────────────────────────────────────────────────────

// "1/15/2025" → "2025-01-15"
function parseDate(s: string): string | null {
  if (!s || !s.trim()) return null
  const m = s.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (!m) return null
  return `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`
}

// "2,020.00" → 2020
function parseRent(s: string): number | null {
  if (!s || !s.trim()) return null
  const n = parseFloat(s.replace(/,/g, '').trim())
  return Number.isFinite(n) ? n : null
}

// "3515-17 S Lituanica" → baseAddress: "3515 S Lituanica", rangeDisplay: "3515–3517 S LITUANICA AVE"
// Handles abbreviated high-end ("3515-17" = 3515 to 3517) and sanity-guards on huge ranges.
function parseAddressRange(raw: string): {
  baseAddress: string
  rangeDisplay: string | null
} {
  const m = raw.match(/^\s*(\d+)\s*[\u2013\u2014\u2212\-–—]\s*(\d+)\s+(.+)$/)
  if (!m) {
    return { baseAddress: raw, rangeDisplay: null }
  }
  const lowStr = m[1]
  let highStr = m[2]
  if (highStr.length < lowStr.length) {
    highStr = lowStr.slice(0, lowStr.length - highStr.length) + highStr
  }
  const low = parseInt(lowStr, 10)
  const high = parseInt(highStr, 10)
  const rest = m[3].trim()
  if (Math.abs(high - low) > 30) {
    return { baseAddress: raw, rangeDisplay: null }
  }
  const restNormalized = normalizeAddress(rest)
  return {
    baseAddress: `${low} ${rest}`,
    rangeDisplay: `${low}–${high} ${restNormalized}`,
  }
}

// "1632 N WOOD ST" + "60622" → "1632-North-Wood-Street-Chicago-60622"
function generateSlug(canonicalAddress: string, zip: string | null): string {
  const REVERSE_DIR: Record<string, string> = { N: 'North', S: 'South', E: 'East', W: 'West' }
  const REVERSE_TYPE: Record<string, string> = {
    ST: 'Street',
    AVE: 'Avenue',
    BLVD: 'Boulevard',
    DR: 'Drive',
    CT: 'Court',
    PL: 'Place',
    LN: 'Lane',
    RD: 'Road',
    PKWY: 'Parkway',
    TER: 'Terrace',
    CIR: 'Circle',
    HWY: 'Highway',
  }
  const tokens = canonicalAddress.split(' ').map((t) => {
    const up = t.toUpperCase()
    if (REVERSE_DIR[up]) return REVERSE_DIR[up]
    if (REVERSE_TYPE[up]) return REVERSE_TYPE[up]
    return t.charAt(0).toUpperCase() + t.slice(1).toLowerCase()
  })
  return zip ? `${tokens.join('-')}-Chicago-${zip}` : `${tokens.join('-')}-Chicago`
}

// ─────────────────────────────────────────────────────────────────────────────
// Resolution types
// ─────────────────────────────────────────────────────────────────────────────

type Resolution = {
  raw_name: string
  unit_count: number
  base_address: string
  address_range_display: string | null
  status: 'matched' | 'nearest_promoted' | 'no_match_imported_blind' | 'error'
  canonical_address: string | null
  pins: string[]
  sibling_addresses: string[]
  zip: string | null
  property_class: string | null
  year_built: string | null
  implied_value: number | null
  sqft: number | null
  num_units_from_chars: number | null
  community_area: string | null
  error?: string
}

// ─────────────────────────────────────────────────────────────────────────────
// Main route handler
// ─────────────────────────────────────────────────────────────────────────────

export async function GET(request: Request) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = getSupabaseAdmin()
  // Localhost bypass — dev Clerk IDs don't match prod Clerk IDs in subscribers.
  // Production deploy still enforces real admin check.
  if (process.env.NODE_ENV !== 'development') {
    const { data: caller } = await supabase
      .from('subscribers')
      .select('role, is_admin')
      .eq('clerk_id', userId)
      .maybeSingle()
    if (caller?.role !== 'admin' && !caller?.is_admin) {
      return NextResponse.json({ error: 'Forbidden — admin only' }, { status: 403 })
    }
  }

  const { searchParams } = new URL(request.url)
  const dryRun = searchParams.get('dryRun') !== 'false' // default true
  const targetUserId = searchParams.get('targetUserId') || userId

  // ─── Read & parse CSV from disk ─────────────────────────────────────────
  let csvContent: string
  try {
    csvContent = readFileSync(CSV_PATH, 'utf-8')
  } catch {
    return NextResponse.json(
      {
        error: `Could not read CSV at ${CSV_PATH}`,
        hint: 'Place rent roll at data/GCRD_rentroll.csv',
      },
      { status: 500 }
    )
  }

  const rentRollRows = parseCSV(csvContent).filter(
    (r) => r['Property Name'] && r['Property Name'] !== 'Total'
  )

  // Group by Property Name
  const buildings = new Map<string, Record<string, string>[]>()
  for (const r of rentRollRows) {
    const name = r['Property Name']
    if (!buildings.has(name)) buildings.set(name, [])
    buildings.get(name)!.push(r)
  }

  console.log(
    `[import-rentroll] ${buildings.size} buildings, ${rentRollRows.length} units, dryRun=${dryRun}, target=${targetUserId}`
  )

  // ─── Resolve each building ──────────────────────────────────────────────
  const resolutions: Resolution[] = []
  let processed = 0

  for (const [rawName, units] of buildings) {
    processed++
    if (processed % 25 === 0) {
      console.log(`[import-rentroll] resolved ${processed}/${buildings.size}`)
    }

    try {
      const { baseAddress, rangeDisplay } = parseAddressRange(rawName)
      const normalized = normalizeAddress(baseAddress)

      const { property, nearestParcel } = await fetchProperty(normalized)

      let resolved = property
      let resolutionStatus: Resolution['status'] = 'matched'

      // Auto-promote nearestParcel when distance ≤ 5
      if (!resolved && nearestParcel && nearestParcel._nearestDist <= 5) {
        resolved = nearestParcel
        resolutionStatus = 'nearest_promoted'
      }

      // No PIN found — import blind so activity feed still works at the address
      if (!resolved) {
        resolutions.push({
          raw_name: rawName,
          unit_count: units.length,
          base_address: baseAddress,
          address_range_display: rangeDisplay,
          status: 'no_match_imported_blind',
          canonical_address: normalized,
          pins: [],
          sibling_addresses: [normalized],
          zip: null,
          property_class: null,
          year_built: null,
          implied_value: null,
          sqft: null,
          num_units_from_chars: null,
          community_area: null,
        })
        continue
      }

      // Got a property — resolve siblings
      const siblings =
        resolved.pin && resolved.address_normalized
          ? await fetchSiblingPins(resolved.pin, resolved.address_normalized)
          : null

      const pins = siblings?.siblingPins ?? (resolved.pin ? [resolved.pin] : [])
      const siblingAddresses =
        siblings?.siblingAddresses ??
        (resolved.address_normalized ? [resolved.address_normalized] : [])

      // Building-level composition via the same helper the property page uses
      // for SavePropertyModal. Picks a representative non-299 PIN, applies the
      // correct assessment-level multiplier (10% / 25%) per class, sums across
      // multi-PIN buildings. Produces accurate year_built / implied_value /
      // property_class / community_area for condo towers and address ranges
      // — the cases the original import got wrong.
      let communityArea: string | null = null
      if (resolved.pin) {
        const { parcel } = await fetchParcelUniverse(resolved.pin)
        communityArea = parcel?.community_area_name?.trim() ?? null
      }

      const snapshot = await getPortfolioSaveBuildingSnapshot({
        normalizedPin: resolved.pin ?? null,
        siblingPins: pins,
        useMultiPinImplied: pins.length > 1,
        propertyClassFallback: resolved.property_class ?? null,
        communityArea,
      })

      // sqft + num_apartments still come from the primary PIN's chars row.
      // The snapshot helper doesn't expose these and that's fine — chars rows
      // hold building-level sqft for residential and condos alike, so the
      // primary PIN is a representative-enough source for these two fields.
      let sqft: number | null = null
      let numUnits: number | null = null
      if (resolved.pin) {
        const { chars } = await fetchPropertyChars(resolved.pin)
        if (chars) {
          sqft = (chars.building_sqft as number | null) ?? null
          numUnits = (chars.num_apartments as number | null) ?? null
        }
      }

      // Prefer sibling-derived range (e.g. "1112–1134 N LA SALLE ST"), fall back to our rent-roll range
      const finalAddressRange = siblings?.addressRange ?? rangeDisplay

      resolutions.push({
        raw_name: rawName,
        unit_count: units.length,
        base_address: baseAddress,
        address_range_display: finalAddressRange,
        status: resolutionStatus,
        canonical_address: resolved.address_normalized,
        pins,
        sibling_addresses: siblingAddresses,
        zip: resolved.zip ?? null,
        property_class: snapshot.propertyClass,
        year_built: snapshot.yearBuilt,
        implied_value: snapshot.impliedValue,
        sqft,
        num_units_from_chars: numUnits,
        community_area: snapshot.communityArea,
      })
    } catch (e) {
      resolutions.push({
        raw_name: rawName,
        unit_count: units.length,
        base_address: '',
        address_range_display: null,
        status: 'error',
        canonical_address: null,
        pins: [],
        sibling_addresses: [],
        zip: null,
        property_class: null,
        year_built: null,
        implied_value: null,
        sqft: null,
        num_units_from_chars: null,
        community_area: null,
        error: e instanceof Error ? e.message : String(e),
      })
    }
  }

  // ─── Summary ────────────────────────────────────────────────────────────
  const summary = {
    total_buildings: buildings.size,
    total_units: rentRollRows.length,
    by_status: {
      matched: resolutions.filter((r) => r.status === 'matched').length,
      nearest_promoted: resolutions.filter((r) => r.status === 'nearest_promoted').length,
      no_match_imported_blind: resolutions.filter((r) => r.status === 'no_match_imported_blind')
        .length,
      error: resolutions.filter((r) => r.status === 'error').length,
    },
    target_user_id: targetUserId,
    dry_run: dryRun,
  }

  if (dryRun) {
    return NextResponse.json({ summary, resolutions })
  }

  // ─── LIVE: dedupe + bulk INSERT portfolio_properties ────────────────────
  // Two rent-roll entries can resolve to the same canonical_address (e.g.,
  // "235 Van Buren St" and "235 W Van Buren St" both → "235 W VAN BUREN ST").
  // Postgres rejects an upsert where the same ON CONFLICT target appears twice
  // in one statement, so we dedupe by canonical_address first and merge unit counts.
  const insertable = resolutions.filter((r) => r.status !== 'error')

  const canonicalToRow = new Map<string, Record<string, unknown>>()
  const canonicalToRawNames = new Map<string, string[]>()

  for (const r of insertable) {
    const canonical = r.canonical_address ?? r.base_address
    const existing = canonicalToRow.get(canonical)
    if (existing) {
      existing.units_override = ((existing.units_override as number | null) ?? 0) + r.unit_count
      canonicalToRawNames.get(canonical)!.push(r.raw_name)
    } else {
      canonicalToRow.set(canonical, {
        user_id: targetUserId,
        canonical_address: canonical,
        address_range: r.address_range_display,
        additional_streets: null,
        pins: r.pins.length > 0 ? r.pins : null,
        slug: generateSlug(canonical, r.zip),
        display_name: r.raw_name,
        units_override: r.unit_count,
        sqft_override: r.sqft,
        notes: null,
        alerts_enabled: false,
        alert_email: false,
        alert_sms: false,
        updated_at: new Date().toISOString(),
        year_built: r.year_built,
        implied_value: r.implied_value,
        community_area: r.community_area,
        property_class: r.property_class,
      })
      canonicalToRawNames.set(canonical, [r.raw_name])
    }
  }

  const mergedDuplicates: Array<{ canonical: string; raw_names: string[] }> = []
  for (const [canonical, rawNames] of canonicalToRawNames) {
    if (rawNames.length > 1) {
      mergedDuplicates.push({ canonical, raw_names: rawNames })
    }
  }

  const propertyRowsToInsert = [...canonicalToRow.values()]

  const { data: insertedRows, error: insertError } = await supabase
    .from('portfolio_properties')
    .upsert(propertyRowsToInsert, { onConflict: 'user_id,canonical_address' })
    .select('id, canonical_address, display_name')

  if (insertError) {
    return NextResponse.json(
      {
        summary,
        merged_duplicates: mergedDuplicates,
        error: 'Portfolio property insert failed',
        details: insertError.message,
      },
      { status: 500 }
    )
  }

  // Map each raw rent-roll Property Name → its portfolio_property.id (via canonical_address)
  const canonicalToId = new Map<string, string>()
  for (const row of insertedRows ?? []) {
    canonicalToId.set(row.canonical_address as string, row.id as string)
  }
  const nameToId = new Map<string, string>()
  for (const [canonical, rawNames] of canonicalToRawNames) {
    const ppId = canonicalToId.get(canonical)
    if (!ppId) continue
    for (const rawName of rawNames) nameToId.set(rawName, ppId)
  }

  // ─── LIVE: bulk INSERT portfolio_property_units ─────────────────────────
  // First clear any existing units for these portfolio entries (idempotent re-run)
  const ppIds = [...nameToId.values()]
  if (ppIds.length > 0) {
    await supabase.from('portfolio_property_units').delete().in('portfolio_property_id', ppIds)
  }

  const unitRowsToInsert = rentRollRows
    .map((r) => {
      const ppId = nameToId.get(r['Property Name'])
      if (!ppId) return null
      return {
        portfolio_property_id: ppId,
        unit_label: r['Unit'] || null,
        bd_ba: r['BD/BA'] || null,
        tag: r['Tag'] || null,
        status: r['Status'] || null,
        rent: parseRent(r['Rent']),
        lease_from: parseDate(r['Lease From']),
        lease_to: parseDate(r['Lease To']),
        move_in: parseDate(r['Move-in']),
        move_out: parseDate(r['Move-out']),
        ob_date: parseDate(r['OB Date']),
        source: 'rent_roll',
      }
    })
    .filter((r): r is NonNullable<typeof r> => r != null)

  const { error: unitsError } = await supabase
    .from('portfolio_property_units')
    .insert(unitRowsToInsert)

  if (unitsError) {
    return NextResponse.json(
      {
        summary,
        portfolio_properties_inserted: insertedRows?.length ?? 0,
        error: 'Unit insert failed',
        details: unitsError.message,
      },
      { status: 500 }
    )
  }

  // ─── LIVE: activity backfill (concurrency 5) ────────────────────────────
  let backfillSuccess = 0
  let backfillFail = 0
  const BATCH_SIZE = 5

  const rowsList = insertedRows ?? []
  for (let i = 0; i < rowsList.length; i += BATCH_SIZE) {
    const batch = rowsList.slice(i, i + BATCH_SIZE)
    await Promise.all(
      batch.map(async (row) => {
        const resolution = resolutions.find((r) => r.raw_name === row.display_name)
        if (!resolution) {
          backfillFail++
          return
        }
        try {
          const activity = await fetchPortfolioActivity(
            supabase,
            row.canonical_address as string,
            resolution.address_range_display,
            null,
            resolution.pins.length > 0 ? resolution.pins : null
          )
          await supabase
            .from('portfolio_properties')
            .update({
              ...activity.stats,
              stats_updated_at: new Date().toISOString(),
            })
            .eq('id', row.id as string)
          backfillSuccess++
        } catch (e) {
          console.error(
            `[import-rentroll] activity backfill failed for ${row.display_name}:`,
            e instanceof Error ? e.message : String(e)
          )
          backfillFail++
        }
      })
    )
    console.log(
      `[import-rentroll] backfilled ${Math.min(i + BATCH_SIZE, rowsList.length)}/${rowsList.length}`
    )
  }

  return NextResponse.json({
    summary,
    portfolio_properties_inserted: insertedRows?.length ?? 0,
    units_inserted: unitRowsToInsert.length,
    merged_duplicates: mergedDuplicates,
    activity_backfill: {
      success: backfillSuccess,
      fail: backfillFail,
    },
  })
}