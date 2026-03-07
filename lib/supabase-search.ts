import { supabase } from './supabase'

export type ComplaintRow = {
  sr_number: string
  sr_type: string | null
  status: string | null
  owner_department: string | null
  origin: string | null
  created_date: string | null
  created_hour: number | null
  closed_date: string | null
  last_modified_date: string | null
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
      .select('sr_number, sr_type, status, owner_department, origin, created_date, created_hour, closed_date, last_modified_date')
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