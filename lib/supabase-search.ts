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

    const rows = (data ?? []) as ViolationRow[]
    console.log('[fetchViolations] addressNormalized:', addressNormalized, '| violation rows returned:', rows.length)

    return { violations: rows, error: null }
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

export type AssessedValueRawRow = {
  tax_year: number | string | null
  board_tot: number | null
  certified_tot: number | null
  mailed_tot: number | null
}

export type AssessedValueResult = {
  displayValue: number
  valueType: 'board' | 'certified' | 'mailed'
  taxYear: number
}

/**
 * Fetches the most recent year's best available assessed value by PIN.
 * PIN: no dashes, 14 digits (strip dashes from properties/complaints PIN before querying).
 * Uses COALESCE: board_tot → certified_tot → mailed_tot; value_source = board | certified | mailed.
 */
export async function fetchAssessedValue(pin: string | null): Promise<{
  assessed: AssessedValueResult | null
  error: string | null
}> {
  if (pin == null || String(pin).trim() === '') {
    return { assessed: null, error: null }
  }
  let pinNoDashes = String(pin).trim().replace(/-/g, '')
  if (!pinNoDashes) return { assessed: null, error: null }
  if (/^\d+$/.test(pinNoDashes) && pinNoDashes.length < 14) {
    pinNoDashes = pinNoDashes.padStart(14, '0')
  }

  try {
    const { data, error } = await supabase
      .from('assessed_values')
      .select('tax_year, board_tot, certified_tot, mailed_tot')
      .eq('pin', pinNoDashes)
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
      assessed: { displayValue: Number(displayValue), valueType, taxYear },
      error: null,
    }
  } catch (e) {
    return {
      assessed: null,
      error: e instanceof Error ? e.message : 'Unknown error',
    }
  }
}