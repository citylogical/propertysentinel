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
      .select('sr_number, sr_type, status, owner_department, origin, created_date, closed_date, last_modified_date, pin, ward, community_area')
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

export async function fetchViolations(normalizedAddress: string): Promise<{
  violations: ViolationRow[]
  error: string | null
}> {
  try {
    const { data, error } = await supabase
      .from('violations')
      .select('violation_description, violation_status, violation_date, violation_last_modified_date, inspection_status, inspection_category, department_bureau, violation_inspector_comments, violation_ordinance, inspection_number, is_stop_work_order')
      .eq('address_normalized', normalizedAddress)
      .order('violation_date', { ascending: false })

    if (error) throw new Error(error.message)

    return { violations: (data as ViolationRow[]) ?? [], error: null }
  } catch (e) {
    return {
      violations: [],
      error: e instanceof Error ? e.message : 'Unknown error',
    }
  }
}