import { supabase } from './supabase'

export type ComplaintRow = {
  sr_number: string
  sr_type: string | null
  status: string | null
  owner_department: string | null
  origin: string | null
  created_date: string | null
  closed_date: string | null
  last_modified_date: string | null
  pin: string | null
  ward: string | number | null
  community_area: number | string | null
  address_normalized: string | null
}

export type PropertyRow = {
  address_normalized: string | null
  street_address: string | null
  pin: string | null
  zip: string | null
  community_area: string | null
  ward: string | null
  class_code: string | null
  units: number | null
  tax_year: string | null
  zoning: string | null
}

/** Fields from property_chars_residential / property_chars_condo for property details card. */
export type PropertyCharsRow = {
  class_code?: string | null
  units?: number | null
  tax_year?: string | null
  zoning?: string | null
  community_area?: string | null
  ward?: string | null
  [key: string]: unknown
}

/** Explicit row shape for property_chars_residential (most recent year). */
export type PropertyCharsResidentialRow = {
  year_built?: number | string | null
  building_sqft?: number | null
  land_sqft?: number | null
  num_bedrooms?: number | null
  num_rooms?: number | null
  num_full_baths?: number | null
  num_half_baths?: number | null
  num_fireplaces?: number | null
  type_of_residence?: string | null
  num_apartments?: number | null
  garage_size?: string | null
  garage_attached?: boolean | string | null
  basement_type?: string | null
  ext_wall_material?: string | null
  central_heating?: string | null
  central_air?: string | null
  attic_type?: string | null
  roof_material?: string | null
  construction_quality?: string | null
  single_v_multi_family?: string | null
  tax_year?: number | string | null
  [key: string]: unknown
}

/** Explicit row shape for property_chars_condo (most recent year, excluding parking/common). */
export type PropertyCharsCondoRow = {
  year_built?: number | string | null
  building_sqft?: number | null
  unit_sqft?: number | null
  num_bedrooms?: number | null
  building_pins?: number | null
  building_non_units?: number | null
  bldg_is_mixed_use?: boolean | string | null
  is_parking_space?: boolean | null
  is_common_area?: boolean | null
  land_sqft?: number | null
  tax_year?: number | string | null
  [key: string]: unknown
}

function normalizePinSilent(pin: string): string {
  if (!pin || String(pin).trim() === '') return ''
  const digitsOnly = String(pin).trim().replace(/-/g, '').replace(/\D/g, '')
  if (!digitsOnly) return ''
  return digitsOnly.padStart(14, '0').slice(0, 14)
}

/**
 * Normalizes PIN for all DB queries: strip dashes, digits only, zero-pad to 14 digits.
 * Logs the sanitized PIN to console for verification.
 */
export function normalizePin(pin: string | null | undefined): string {
  const out = normalizePinSilent(pin ?? '')
  if (out && typeof console !== 'undefined' && console.log) {
    console.log('[property] Sanitized PIN:', JSON.stringify(out))
  }
  return out
}

const DIRECTIONAL_ABBREV: [RegExp, string][] = [
  [/\bWEST\b/g, 'W'],
  [/\bEAST\b/g, 'E'],
  [/\bNORTH\b/g, 'N'],
  [/\bSOUTH\b/g, 'S'],
]

const STREET_TYPE_ABBREV: [RegExp, string][] = [
  [/\bSTREET\b/g, 'ST'],
  [/\bAVENUE\b/g, 'AVE'],
  [/\bBOULEVARD\b/g, 'BLVD'],
  [/\bDRIVE\b/g, 'DR'],
  [/\bCOURT\b/g, 'CT'],
  [/\bPLACE\b/g, 'PL'],
  [/\bLANE\b/g, 'LN'],
  [/\bROAD\b/g, 'RD'],
]

export function normalizeAddress(raw: string): string {
  let s = raw.trim()
  if (!s) return s
  s = (s.split(',')[0] ?? s).trim()
  s = s.replace(/\s+(apt|apartment|unit|#)\s*.*$/i, '').trim()
  s = s.replace(/\s+/g, ' ').trim()
  s = s.toUpperCase()
  for (const [re, repl] of DIRECTIONAL_ABBREV) s = s.replace(re, repl)
  for (const [re, repl] of STREET_TYPE_ABBREV) s = s.replace(re, repl)
  return s
}

export async function fetchComplaints(normalizedAddress: string): Promise<{
  complaints: ComplaintRow[]
  error: string | null
}> {
  try {
    const { data, error } = await supabase
      .from('complaints_311')
      .select('sr_number, sr_type, status, owner_department, origin, created_date, closed_date, last_modified_date, pin, ward, community_area, address_normalized')
      .eq('address_normalized', normalizedAddress)
      .order('created_date', { ascending: false })

    if (error) throw new Error(error.message)

    return { complaints: (data as ComplaintRow[]) ?? [], error: null }
  } catch (e) {
    return {
      complaints: [],
      error: e instanceof Error ? e.message : 'Unknown error',
    }
  }
}

/** Complaints by PIN (use after resolving PIN from properties table). */
export async function fetchComplaintsByPin(pin: string): Promise<{
  complaints: ComplaintRow[]
  error: string | null
}> {
  try {
    const { data, error } = await supabase
      .from('complaints_311')
      .select('sr_number, sr_type, status, owner_department, origin, created_date, closed_date, last_modified_date, pin, ward, community_area, address_normalized')
      .eq('pin', pin)
      .order('created_date', { ascending: false })

    if (error) throw new Error(error.message)

    return { complaints: (data as ComplaintRow[]) ?? [], error: null }
  } catch (e) {
    return {
      complaints: [],
      error: e instanceof Error ? e.message : 'Unknown error',
    }
  }
}

export type ViolationRow = {
  violation_description: string | null
  violation_status: string | null
  violation_date: string | null
  violation_last_modified_date: string | null
  inspection_status: string | null
  inspection_category: string | null
  department_bureau: string | null
  violation_inspector_comments: string | null
  violation_ordinance: string | null
  inspection_number: string | null
  is_stop_work_order: boolean | null
}

export async function fetchProperty(normalizedAddress: string): Promise<{
  property: PropertyRow | null
  error: string | null
}> {
  try {
    const { data, error } = await supabase
      .from('properties')
      .select('address_normalized, street_address, pin, zip, community_area, ward, class_code, units, tax_year, zoning')
      .eq('address_normalized', normalizedAddress)
      .maybeSingle()

    if (error) throw new Error(error.message)

    return { property: (data as PropertyRow | null) ?? null, error: null }
  } catch (e) {
    return {
      property: null,
      error: e instanceof Error ? e.message : 'Unknown error',
    }
  }
}

export async function fetchViolations(addressNormalized: string): Promise<{
  violations: ViolationRow[]
  error: string | null
}> {
  try {
    const { data, error } = await supabase
      .from('violations')
      .select('*')
      .eq('address_normalized', addressNormalized)
      .order('violation_date', { ascending: false })
      .limit(100)

    if (error) throw new Error(error.message)

    return { violations: (data ?? []) as ViolationRow[], error: null }
  } catch (e) {
    return {
      violations: [],
      error: e instanceof Error ? e.message : 'Unknown error',
    }
  }
}

/** Violations by PIN (use after resolving PIN from properties table). */
export async function fetchViolationsByPin(pin: string): Promise<{
  violations: ViolationRow[]
  error: string | null
}> {
  try {
    const { data, error } = await supabase
      .from('violations')
      .select('*')
      .eq('pin', pin)
      .order('violation_date', { ascending: false })
      .limit(100)

    if (error) throw new Error(error.message)

    return { violations: (data ?? []) as ViolationRow[], error: null }
  } catch (e) {
    return {
      violations: [],
      error: e instanceof Error ? e.message : 'Unknown error',
    }
  }
}

export type PermitRow = {
  permit_type: string | null
  permit_status: string | null
  work_description: string | null
  issue_date: string | null
  permit_number: string | null
  is_roof_permit: boolean | null
}

export async function fetchPermits(normalizedAddress: string): Promise<{
  permits: PermitRow[]
  error: string | null
}> {
  try {
    const pattern = `${normalizedAddress}%`
    const { data, error } = await supabase
      .from('permits')
      .select('permit_type, permit_status, work_description, issue_date, permit_number, is_roof_permit')
      .ilike('address_normalized', pattern)
      .order('issue_date', { ascending: false })

    if (error) throw new Error(error.message)

    return { permits: (data as PermitRow[]) ?? [], error: null }
  } catch (e) {
    return {
      permits: [],
      error: e instanceof Error ? e.message : 'Unknown error',
    }
  }
}

/** Permits by PIN (use after resolving PIN from properties table). */
export async function fetchPermitsByPin(pin: string): Promise<{
  permits: PermitRow[]
  error: string | null
}> {
  try {
    const { data, error } = await supabase
      .from('permits')
      .select('permit_type, permit_status, work_description, issue_date, permit_number, is_roof_permit')
      .eq('pin', pin)
      .order('issue_date', { ascending: false })

    if (error) throw new Error(error.message)

    return { permits: (data as PermitRow[]) ?? [], error: null }
  } catch (e) {
    return {
      permits: [],
      error: e instanceof Error ? e.message : 'Unknown error',
    }
  }
}

const RESIDENTIAL_COLS =
  'year_built,building_sqft,land_sqft,num_bedrooms,num_rooms,num_full_baths,num_half_baths,num_fireplaces,type_of_residence,num_apartments,garage_size,garage_attached,basement_type,ext_wall_material,central_heating,central_air,attic_type,roof_material,construction_quality,single_v_multi_family,tax_year'
const CONDO_COLS =
  'year_built,building_sqft,unit_sqft,num_bedrooms,building_pins,building_non_units,bldg_is_mixed_use,is_parking_space,is_common_area,land_sqft,tax_year'

/** Most recent property_chars_residential row by PIN. */
export async function fetchPropertyCharsResidential(pin: string): Promise<{
  chars: PropertyCharsResidentialRow | null
  error: string | null
}> {
  if (!pin || !normalizePinSilent(pin)) return { chars: null, error: null }
  const pinQuery = normalizePinSilent(pin)
  try {
    const { data, error } = await supabase
      .from('property_chars_residential')
      .select(RESIDENTIAL_COLS)
      .eq('pin', pinQuery)
      .order('tax_year', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (error) throw new Error(error.message)
    return { chars: (data as PropertyCharsResidentialRow | null) ?? null, error: null }
  } catch (e) {
    return {
      chars: null,
      error: e instanceof Error ? e.message : 'Unknown error',
    }
  }
}

/** Most recent property_chars_condo row by PIN (excludes parking and common area). */
export async function fetchPropertyCharsCondo(pin: string): Promise<{
  chars: PropertyCharsCondoRow | null
  error: string | null
}> {
  if (!pin || !normalizePinSilent(pin)) return { chars: null, error: null }
  const pinQuery = normalizePinSilent(pin)
  try {
    const { data, error } = await supabase
      .from('property_chars_condo')
      .select(CONDO_COLS)
      .eq('pin', pinQuery)
      .eq('is_parking_space', false)
      .eq('is_common_area', false)
      .order('tax_year', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (error) throw new Error(error.message)
    return { chars: (data as PropertyCharsCondoRow | null) ?? null, error: null }
  } catch (e) {
    return {
      chars: null,
      error: e instanceof Error ? e.message : 'Unknown error',
    }
  }
}

/** Property details from property_chars_residential or property_chars_condo by PIN (legacy). */
export async function fetchPropertyChars(pin: string): Promise<{
  chars: PropertyCharsRow | null
  error: string | null
}> {
  const [resResidential, resCondo] = await Promise.all([
    fetchPropertyCharsResidential(pin),
    fetchPropertyCharsCondo(pin),
  ])
  const residential = resResidential.chars
  const condo = resCondo.chars
  const chars = (residential ?? condo) as PropertyCharsRow | null
  return { chars, error: resResidential.error ?? resCondo.error }
}

export type AssessedValueRawRow = {
  tax_year: number | string | null
  class: string | null
  township_name: string | null
  neighborhood_code: string | null
  board_tot: number | null
  certified_tot: number | null
  mailed_tot: number | null
}

export type AssessedValueResult = {
  displayValue: number
  valueType: 'board' | 'certified' | 'mailed'
  taxYear: number
  class?: string | null
  township_name?: string | null
  neighborhood_code?: string | null
}

/**
 * Fetches the most recent year's best available assessed value by PIN.
 * Logical query: SELECT tax_year, COALESCE(board_tot, certified_tot, mailed_tot) as display_value,
 *   CASE WHEN board_tot IS NOT NULL THEN 'board' WHEN certified_tot IS NOT NULL THEN 'certified' ELSE 'mailed' END as value_source
 * FROM assessed_values WHERE pin = $pin ORDER BY tax_year DESC LIMIT 1.
 * $pin must be the 14-digit no-dash PIN. Do not run if pin is null, undefined, or empty.
 */
export async function fetchAssessedValue(pin: string | null | undefined): Promise<{
  assessed: AssessedValueResult | null
  error: string | null
}> {
  if (!pin || typeof pin !== 'string' || String(pin).trim() === '') {
    return { assessed: null, error: null }
  }
  const pinQuery = normalizePinSilent(pin)
  if (!pinQuery) return { assessed: null, error: null }

  console.log('Querying assessed_values with PIN:', pinQuery)

  try {
    const { data, error } = await supabase
      .from('assessed_values')
      .select('tax_year, class, township_name, neighborhood_code, board_tot, certified_tot, mailed_tot')
      .eq('pin', pinQuery)
      .order('tax_year', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error) throw new Error(error.message)

    const row = data as AssessedValueRawRow | null
    if (row == null) return { assessed: null, error: null }

    const displayValue = row.board_tot ?? row.certified_tot ?? row.mailed_tot
    if (displayValue == null || !Number.isFinite(Number(displayValue))) {
      return { assessed: null, error: null }
    }

    const valueType: 'board' | 'certified' | 'mailed' =
      row.board_tot != null ? 'board' : row.certified_tot != null ? 'certified' : 'mailed'
    const taxYear =
      typeof row.tax_year === 'number'
        ? row.tax_year
        : parseInt(String(row.tax_year ?? ''), 10)

    if (!Number.isFinite(taxYear)) return { assessed: null, error: null }

    return {
      assessed: {
        displayValue: Number(displayValue),
        valueType,
        taxYear,
        class: row.class ?? null,
        township_name: row.township_name ?? null,
        neighborhood_code: row.neighborhood_code ?? null,
      },
      error: null,
    }
  } catch (e) {
    return {
      assessed: null,
      error: e instanceof Error ? e.message : 'Unknown error',
    }
  }
}