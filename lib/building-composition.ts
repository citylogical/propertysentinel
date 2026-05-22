import { getClassDescription } from './class-codes'
import { getSupabaseAdmin } from './supabase-admin'
import { normalizePinSilent } from './supabase-search'

/**
 * Threshold above which a building is rendered as a class-breakdown summary
 * rather than a per-PIN list. Avoids N+1 fetches against assessed_values,
 * property_chars_*, and per-PIN address lookups for buildings like
 * 440 N Wabash (854 PINs).
 */
export const LARGE_BUILDING_THRESHOLD = 7

export type UnitBreakdown = {
  units: number
  parking: number
  other: number
}

export type CommercialUse = {
  propertyType: string
  rentPsf: number | null
}

export type BuildingCompositionRow = {
  class: string
  description: string | null
  pinCount: number
  /** Populated only for residential class 299 rows. */
  unitBreakdown: UnitBreakdown | null
  /** Populated only for commercial classes (5xx, 6xx, 7xx, 8xx). */
  commercialUses: CommercialUse[] | null
}

export type RecentSale = {
  saleDate: string
  salePrice: number | null
}

export type BuildingComposition = {
  totalPins: number
  yearBuilt: number | null
  /** From hansen_buildings; null when not populated or 0. */
  stories: number | null
  floorArea: number | null
  /** Lot dimensions in feet from hansen_buildings (lot_width × lot_length).
   *  Stored separately rather than computed area since the raw dimensions
   *  preserve shape (square vs long-and-narrow) and Hansen's bounding-box
   *  approximation is imprecise for irregular lots. */
  lotDims: { width: number; length: number } | null
  /** Assessor land_sqft fallback when Hansen lot dimensions absent. */
  lotAreaFallback: number | null
  constrType: string | null
  /** Assessor exterior + roof material fallback when Hansen constr_type absent. */
  materials: { exterior: string | null; roof: string | null } | null
  /** Most recent valid sale across building PINs; null when none on file. */
  recentSale: RecentSale | null
  rows: BuildingCompositionRow[]

  // ── Single-PIN-only fields below. Populated only when totalPins === 1 and
  //    Assessor chars are available. Multi-PIN composition view leaves null.

  /** "2 Story, Multi-Family" — type_of_residence + single_v_multi_family joined.  */
  propertyType: string | null
  /** Counts from property_chars_residential. */
  rooms: number | null
  beds: number | null
  bathsFull: number | null
  bathsHalf: number | null
  /** "Full" / "Crawl" / etc. from property_chars_residential. */
  basement: string | null
  /** Numeric garage_size in cars from property_chars_residential. */
  garageSize: number | null
  /** "Open" / "Enclosed" / etc. from property_chars_residential. */
  porch: string | null
  /** central_heating + central_air values from property_chars_residential. */
  heating: string | null
  centralAir: string | null
  /** Footer identity row. Single-PIN only. */
  singlePinClass: string | null
  singlePinClassDescription: string | null
  singlePinPin: string | null
}

type CondoRow = {
  pin: string | null
  class: string | null
  is_parking_space: boolean | null
  is_common_area: boolean | null
  building_sqft: number | null
  year_built: number | null
}

type CommercialRow = {
  keypin: string | null
  tax_year: number | null
  property_type_use: string | null
  building_sqft: number | null
  adj_rent_sf: number | null
  class: string | null
  year_built: number | null
}

type HansenRow = {
  stories: number | null
  floor_area: number | null
  lot_width: number | null
  lot_length: number | null
  constr_type: string | null
}

const CONDO_BATCH = 200
const SALES_BATCH = 200

/**
 * Class breakdown + building-level facts for a large multi-PIN building.
 * Runs four independent queries in parallel:
 *   1. property_chars_condo  — class + parking/common flags + building_sqft + year for condo PINs
 *   2. property_chars_commercial — property_type_use + rent psf + sqft, keyed on keypin
 *   3. hansen_buildings — stories + floor_area + constr_type via address match
 *   4. parcel_sales — most recent valid sale across PINs
 *
 * Each batched (<=200 per .in() call) to stay under Supabase REST URL limits.
 */
export async function fetchBuildingComposition(params: {
  pins: string[]
  addresses: string[]
}): Promise<{ composition: BuildingComposition | null; error: string | null }> {
  const { pins, addresses } = params
  const normalized = [...new Set(pins.map((p) => normalizePinSilent(p)).filter(Boolean))]
  if (!normalized.length) {
    return { composition: null, error: null }
  }

  const supabaseAdmin = getSupabaseAdmin()

  try {
    const [condoResults, commercialResults, hansen, recentSale] = await Promise.all([
      fetchCondoRows(supabaseAdmin, normalized),
      fetchCommercialRows(supabaseAdmin, addresses),
      fetchHansenRow(supabaseAdmin, addresses),
      fetchMostRecentSale(supabaseAdmin, normalized),
    ])

    // ── Condo aggregation ──
    const condoByClass = new Map<
      string,
      { totalPins: number; units: number; parking: number; other: number }
    >()
    let condoYearBuilt: number | null = null

    for (const row of condoResults) {
      if (!row.pin) continue
      const cls = row.class ?? 'UNKNOWN'
      let bucket = condoByClass.get(cls)
      if (!bucket) {
        bucket = { totalPins: 0, units: 0, parking: 0, other: 0 }
        condoByClass.set(cls, bucket)
      }
      bucket.totalPins += 1
      if (row.is_parking_space) {
        bucket.parking += 1
      } else if (row.is_common_area) {
        bucket.other += 1
      } else {
        bucket.units += 1
      }

      if (condoYearBuilt == null && row.year_built != null) {
        const y = Number(row.year_built)
        if (Number.isFinite(y) && y > 1800) condoYearBuilt = y
      }
    }

    // ── Commercial aggregation: latest tax_year per keypin only ──
    // One bucket per class, one use entry per parcel. Reclassifications between years
    // (Storage→Retail-Single Tenant) defer to the assessor's most recent classification.
    const latestByKeypin = new Map<string, CommercialRow>()
    let commercialYearBuilt: number | null = null

    for (const row of commercialResults) {
      if (!row.keypin) continue
      const ty = row.tax_year ?? 0
      const existing = latestByKeypin.get(row.keypin)
      if (!existing || ty > (existing.tax_year ?? 0)) {
        latestByKeypin.set(row.keypin, row)
      }
      if (commercialYearBuilt == null && row.year_built != null) {
        const y = Number(row.year_built)
        if (Number.isFinite(y) && y > 1800) commercialYearBuilt = y
      }
    }

    const commercialByClass = new Map<string, { uses: CommercialUse[]; pinCount: number }>()
    for (const row of latestByKeypin.values()) {
      // Assessor stores class as "597", "5-97", or comma-separated "5-97, 5-97" for
      // multi-class parcels. Take first class token and strip hyphens for bucketing.
      const rawClass = row.class ?? 'UNKNOWN'
      const cls = rawClass.split(',')[0].trim().replace(/-/g, '')
      let bucket = commercialByClass.get(cls)
      if (!bucket) {
        bucket = { uses: [], pinCount: 0 }
        commercialByClass.set(cls, bucket)
      }
      bucket.pinCount += 1
      if (row.property_type_use && row.property_type_use.trim() !== '') {
        bucket.uses.push({
          propertyType: row.property_type_use.trim(),
          rentPsf:
            row.adj_rent_sf != null && Number.isFinite(Number(row.adj_rent_sf))
              ? Number(row.adj_rent_sf)
              : null,
        })
      }
    }

    // ── Compose rows: residential first, then commercial sorted by PIN count desc ──
    const rows: BuildingCompositionRow[] = []

    for (const [cls, bucket] of condoByClass) {
      rows.push({
        class: cls,
        description: cls !== 'UNKNOWN' ? getClassDescription(cls) ?? null : null,
        pinCount: bucket.totalPins,
        unitBreakdown: {
          units: bucket.units,
          parking: bucket.parking,
          other: bucket.other,
        },
        commercialUses: null,
      })
    }

    const commercialRows: BuildingCompositionRow[] = [...commercialByClass.entries()].map(
      ([cls, bucket]) => ({
        class: cls,
        description: cls !== 'UNKNOWN' ? getClassDescription(cls) ?? null : null,
        pinCount: bucket.pinCount,
        unitBreakdown: null,
        commercialUses: bucket.uses,
      })
    )
    commercialRows.sort((a, b) => b.pinCount - a.pinCount)
    rows.push(...commercialRows)

    const totalPins =
      [...condoByClass.values()].reduce((s, b) => s + b.totalPins, 0) +
      [...commercialByClass.values()].reduce((s, b) => s + b.pinCount, 0)

    return {
      composition: {
        totalPins,
        yearBuilt: condoYearBuilt ?? commercialYearBuilt,
        stories: hansen?.stories != null && hansen.stories > 0 ? hansen.stories : null,
        floorArea: hansen?.floor_area != null && hansen.floor_area > 0 ? hansen.floor_area : null,
        lotDims:
          hansen?.lot_width != null &&
          hansen?.lot_length != null &&
          hansen.lot_width > 0 &&
          hansen.lot_length > 0
            ? { width: hansen.lot_width, length: hansen.lot_length }
            : null,
        lotAreaFallback: null,
        constrType:
          hansen?.constr_type != null && hansen.constr_type.trim() !== ''
            ? hansen.constr_type.trim()
            : null,
        materials: null,
        recentSale,
        rows,
        // Multi-PIN composition view — single-PIN identity fields not applicable.
        propertyType: null,
        rooms: null,
        beds: null,
        bathsFull: null,
        bathsHalf: null,
        basement: null,
        garageSize: null,
        porch: null,
        heating: null,
        centralAir: null,
        singlePinClass: null,
        singlePinClassDescription: null,
        singlePinPin: null,
      },
      error: null,
    }
  } catch (e) {
    return {
      composition: null,
      error: e instanceof Error ? e.message : 'Unknown error',
    }
  }
}

// ───────────────────────── helpers ─────────────────────────

async function fetchCondoRows(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  pins: string[]
): Promise<CondoRow[]> {
  const out: CondoRow[] = []
  // Latest tax_year per PIN — order DESC and dedupe by PIN in app code
  const seenPins = new Set<string>()
  for (let i = 0; i < pins.length; i += CONDO_BATCH) {
    const batch = pins.slice(i, i + CONDO_BATCH)
    const { data, error } = await supabase
      .from('property_chars_condo')
      .select('pin, class, is_parking_space, is_common_area, building_sqft, year_built, tax_year')
      .in('pin', batch)
      .order('tax_year', { ascending: false })
    if (error) {
      console.log('[building-composition] condo batch error:', error.message)
      continue
    }
    for (const r of (data ?? []) as (CondoRow & { tax_year: number | null })[]) {
      if (!r.pin || seenPins.has(r.pin)) continue
      seenPins.add(r.pin)
      out.push(r)
    }
  }
  return out
}

async function fetchCommercialRows(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  addresses: string[]
): Promise<CommercialRow[]> {
  if (!addresses.length) return []

  // property_chars_commercial.address does NOT include street-type suffixes (AVE/ST/BLVD)
  // and sometimes appends " CHICAGO". Strip the suffix from each input address to build
  // a permissive prefix pattern. "440 N WABASH AVE" → ilike "440 N WABASH%" which catches
  // both "440 N WABASH" and "440 N WABASH CHICAGO".
  const STREET_TYPES = /\s+(AVE|ST|BLVD|DR|CT|PL|LN|RD|WAY|PKWY|TER|CIR|HWY)(\s+.*)?$/
  // Strip street type suffix AND any unit/floor suffix that follows. "600 N LAKE
  // SHORE DR 3602" → "600 N LAKE SHORE" → dedupe to one pattern per building.
  // Without this, a 370-unit condo tower fires 370 parallel ilike queries and
  // exhausts Supabase's connection pool.
  const patterns = [
    ...new Set(
      addresses
        .map((a) => a.trim().toUpperCase().replace(STREET_TYPES, '').trim())
        .filter(Boolean)
    ),
  ]

  if (!patterns.length) return []

  // Issue one query per pattern. For Trump this is ~2 queries (Hubbard, Wabash) — cheap.
  // Avoids PostgREST .or() quoting issues with spaces and special chars in the patterns.
  const out: CommercialRow[] = []
  try {
    const results = await Promise.all(
      patterns.map(async (pattern) => {
        const { data, error } = await supabase
          .from('property_chars_commercial')
          .select('keypin, tax_year, property_type_use, building_sqft, adj_rent_sf, class, year_built')
          .ilike('address', `${pattern}%`)
          .order('tax_year', { ascending: false })
        if (error) {
          console.log('[building-composition] commercial pattern error:', pattern, error.message)
          return [] as CommercialRow[]
        }
        return (data ?? []) as CommercialRow[]
      })
    )
    // Flatten + dedupe by (keypin + tax_year + property_type_use) since same building
    // matched by multiple address patterns would return duplicate rows.
    const seen = new Set<string>()
    for (const batch of results) {
      for (const row of batch) {
        const key = `${row.keypin ?? ''}|${row.tax_year ?? ''}|${row.property_type_use ?? ''}`
        if (seen.has(key)) continue
        seen.add(key)
        out.push(row)
      }
    }
  } catch (e) {
    console.log('[building-composition] commercial exception:', e instanceof Error ? e.message : String(e))
  }
  return out
}

async function fetchHansenRow(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  addresses: string[]
): Promise<HansenRow | null> {
  if (!addresses.length) return null
  // Pick the most-populated row across all address variants. Hansen stores
  // populated values for most fields together (or none), so ordering by
  // `stories IS NOT NULL` + `stories > 0` surfaces the useful row.
  const cleaned = [...new Set(addresses.map((a) => a.trim().toUpperCase()).filter(Boolean))]
  try {
    const { data, error } = await supabase
      .from('hansen_buildings')
      .select('stories, floor_area, lot_width, lot_length, constr_type')
      .in('input_address', cleaned)
      .order('stories', { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle()
    if (error) {
      console.log('[building-composition] hansen error:', error.message)
      return null
    }
    return (data as HansenRow | null) ?? null
  } catch (e) {
    console.log('[building-composition] hansen exception:', e instanceof Error ? e.message : String(e))
    return null
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Single-PIN composition builder
// ─────────────────────────────────────────────────────────────────────────────

export type SinglePinCompositionInput = {
  pin: string
  addresses: string[]
  /** From property_chars_residential. Pass null if not a residential parcel. */
  residentialChars: {
    year_built: number | null
    building_sqft: number | null
    land_sqft: number | null
    type_of_residence: string | null
    single_v_multi_family: string | null
    num_rooms: number | null
    num_bedrooms: number | null
    num_full_baths: number | null
    num_half_baths: number | null
    basement_type: string | null
    garage_size: number | string | null
    porch: string | null
    central_heating: string | null
    central_air: string | null
    ext_wall_material: string | null
    roof_material: string | null
  } | null
  /** From property_chars_condo. Pass null if not a condo parcel. */
  condoChars: {
    year_built: number | null
    building_sqft: number | null
    land_sqft: number | null
  } | null
  /** Pre-resolved class string and description (e.g. "211", "Apartment Building, 2-6 Units"). */
  classCode: string | null
  classDescription: string | null
}

/**
 * Build a single-PIN BuildingComposition payload. Caller (PropertyDataSections)
 * resolves chars from the residential/condo/commercial fetches it already runs,
 * passes them in. We layer Hansen data on top + run the recent-sale lookup.
 *
 * Use this only for residential/condo single-PIN parcels. Commercial single-PIN
 * keeps its existing rendering path (CommercialCharacteristicRows) per Phase 1
 * scoping — fields don't map cleanly to the unified card schema.
 */
export async function buildSinglePinComposition(
  input: SinglePinCompositionInput
): Promise<{ composition: BuildingComposition | null; error: string | null }> {
  const supabaseAdmin = getSupabaseAdmin()
  const normalized = normalizePinSilent(input.pin)
  if (!normalized) return { composition: null, error: 'invalid pin' }

  try {
    const [hansen, recentSale] = await Promise.all([
      fetchHansenRow(supabaseAdmin, input.addresses),
      fetchMostRecentSale(supabaseAdmin, [normalized]),
    ])

    const r = input.residentialChars
    const c = input.condoChars

    // Year built: Hansen has no year_built field — falls straight through to Assessor.
    const yearBuiltAssessor = r?.year_built ?? c?.year_built ?? null
    const yearBuilt =
      yearBuiltAssessor != null && Number(yearBuiltAssessor) > 1800
        ? Number(yearBuiltAssessor)
        : null

    // Floor area: Hansen wins; Assessor building_sqft fallback (residential preferred over condo)
    const hansenFloor = hansen?.floor_area != null && hansen.floor_area > 0 ? hansen.floor_area : null
    const assessorFloor =
      r?.building_sqft != null && Number(r.building_sqft) > 0
        ? Number(r.building_sqft)
        : c?.building_sqft != null && Number(c.building_sqft) > 0
          ? Number(c.building_sqft)
          : null
    const floorArea = hansenFloor ?? assessorFloor

    // Stories: Hansen only — Assessor doesn't store a clean integer stories field.
    // (type_of_residence has "2 Story" etc., but parsing is fragile; defer to property_type.)
    const stories = hansen?.stories != null && hansen.stories > 0 ? hansen.stories : null

    // Lot: Hansen dimensions preferred; Assessor land_sqft as area-only fallback.
    const lotDims =
      hansen?.lot_width != null &&
      hansen?.lot_length != null &&
      hansen.lot_width > 0 &&
      hansen.lot_length > 0
        ? { width: hansen.lot_width, length: hansen.lot_length }
        : null
    const lotAreaFallback =
      lotDims == null
        ? r?.land_sqft != null && Number(r.land_sqft) > 0
          ? Number(r.land_sqft)
          : c?.land_sqft != null && Number(c.land_sqft) > 0
            ? Number(c.land_sqft)
            : null
        : null

    // Construction: Hansen constr_type preferred; Assessor materials as fallback.
    const constrType =
      hansen?.constr_type != null && hansen.constr_type.trim() !== ''
        ? hansen.constr_type.trim()
        : null
    const materials =
      constrType == null && r != null
        ? {
            exterior: r.ext_wall_material?.trim() || null,
            roof: r.roof_material?.trim() || null,
          }
        : null

    // Property type: residential only ("2 Story, Multi-Family")
    const propertyType = (() => {
      if (!r) return null
      const tor = r.type_of_residence?.trim() || null
      const svmf = r.single_v_multi_family?.trim() || null
      if (tor && svmf) return `${tor}, ${svmf}`
      return tor ?? svmf ?? null
    })()

    // Numeric helpers
    const toPositiveInt = (v: number | string | null | undefined): number | null => {
      if (v == null) return null
      const n = typeof v === 'number' ? v : Number(String(v).trim())
      return Number.isFinite(n) && n > 0 ? n : null
    }
    const toNonNegInt = (v: number | string | null | undefined): number | null => {
      if (v == null) return null
      const n = typeof v === 'number' ? v : Number(String(v).trim())
      return Number.isFinite(n) && n >= 0 ? n : null
    }

    return {
      composition: {
        totalPins: 1,
        yearBuilt,
        stories,
        floorArea,
        lotDims,
        lotAreaFallback,
        constrType,
        materials,
        recentSale,
        rows: [], // Class breakdown empty in single-PIN mode — class lives in footer.

        propertyType,
        rooms: toPositiveInt(r?.num_rooms),
        beds: toPositiveInt(r?.num_bedrooms),
        bathsFull: toPositiveInt(r?.num_full_baths),
        bathsHalf: toNonNegInt(r?.num_half_baths),
        basement: r?.basement_type?.trim() || null,
        garageSize: toNonNegInt(r?.garage_size as number | string | null | undefined),
        porch: r?.porch?.trim() || null,
        heating: r?.central_heating?.trim() || null,
        centralAir: r?.central_air?.trim() || null,
        singlePinClass: input.classCode,
        singlePinClassDescription: input.classDescription,
        singlePinPin: input.pin,
      },
      error: null,
    }
  } catch (e) {
    return {
      composition: null,
      error: e instanceof Error ? e.message : 'Unknown error',
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Display formatters for single-PIN composition fields. Used by both the card
// (in main body if we re-add) and PropertyDataSections (in Additional
// Characteristics). When ANY segment is present, missing segments render as
// "NA" so the user knows we checked. When ALL segments are null, the caller
// should hide the row entirely.
// ─────────────────────────────────────────────────────────────────────────────

export function formatBaths(full: number | null, half: number | null): string | null {
  if (full == null && half == null) return null
  if (full != null && half != null && half > 0) return `${full}F + ${half}H`
  if (full != null) return `${full}F`
  if (half != null && half > 0) return `${half}H`
  return null
}

export function formatRoomsBedsBathsWithNa(
  rooms: number | null,
  beds: number | null,
  bathsFull: number | null,
  bathsHalf: number | null
): string | null {
  const baths = formatBaths(bathsFull, bathsHalf)
  // Hide row entirely if nothing populated
  if (rooms == null && beds == null && baths == null) return null
  return [
    rooms != null ? String(rooms) : 'NA',
    beds != null ? String(beds) : 'NA',
    baths ?? 'NA',
  ].join(' / ')
}

export function formatBasementGaragePorchWithNa(
  basement: string | null,
  garageSize: number | null,
  porch: string | null
): string | null {
  // Hide row entirely if nothing populated
  if (basement == null && garageSize == null && porch == null) return null
  return [
    basement ?? 'NA',
    garageSize != null ? `${garageSize} ${garageSize === 1 ? 'car' : 'cars'}` : 'NA',
    porch ?? 'NA',
  ].join(' / ')
}

export function formatHvacWithNa(
  heating: string | null,
  centralAir: string | null
): string | null {
  // Hide row entirely if nothing populated
  if (heating == null && centralAir == null) return null
  return [heating ?? 'NA', centralAir ?? 'NA'].join(' / ')
}

async function fetchMostRecentSale(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  pins: string[]
): Promise<{ saleDate: string; salePrice: number | null } | null> {
  let best: { saleDate: string; salePrice: number | null } | null = null
  for (let i = 0; i < pins.length; i += SALES_BATCH) {
    const batch = pins.slice(i, i + SALES_BATCH)
    const { data, error } = await supabase
      .from('parcel_sales')
      .select('sale_date, sale_price')
      .in('pin', batch)
      .eq('sale_filter_less_than_10k', false)
      .eq('sale_filter_deed_type', false)
      .order('sale_date', { ascending: false })
      .limit(1)
    if (error) {
      console.log('[building-composition] sales batch error:', error.message)
      continue
    }
    const row = (data ?? [])[0] as { sale_date: string | null; sale_price: number | null } | undefined
    if (row?.sale_date) {
      if (!best || row.sale_date > best.saleDate) {
        best = {
          saleDate: row.sale_date,
          salePrice: row.sale_price != null && Number.isFinite(Number(row.sale_price))
            ? Number(row.sale_price)
            : null,
        }
      }
    }
  }
  return best
}