export type SocrataCountRow = { count?: string }

export type ServiceRequestRow = {
  sr_number?: string
  sr_type?: string
  created_date?: string
  status?: string
  origin?: string
  street_address?: string
}

export type ViolationRow = {
  address?: string
  violation_status?: string
  violation_date?: string
  violation_code?: string
  violation_description?: string
  violation_ordinance?: string
  violation_inspector_comments?: string
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

function soqlEscapeLiteral(value: string): string {
  return value.replace(/'/g, "''")
}

function withSocrataToken(params: URLSearchParams): void {
  const token = process.env.SOCRATA_APP_TOKEN
  if (token) params.set('$$app_token', token)
}

const BASE_311 = 'https://data.cityofchicago.org/resource/v6vf-nfxy.json'
const BASE_VIOLATIONS = 'https://data.cityofchicago.org/resource/22u3-xenr.json'

export async function fetch311Count(normalizedAddress: string): Promise<number> {
  const addrUpper = soqlEscapeLiteral(normalizedAddress)
  const where = `street_address is not null AND upper(street_address) like '%${addrUpper}%'`
  const params = new URLSearchParams()
  params.set('$select', 'count(1) as count')
  params.set('$where', where)
  withSocrataToken(params)
  const res = await fetch(`${BASE_311}?${params.toString()}`, { cache: 'no-store' })
  if (!res.ok) throw new Error(`311 count request failed (${res.status})`)
  const json = (await res.json()) as SocrataCountRow[]
  const count = Number(json?.[0]?.count ?? 0)
  return Number.isFinite(count) ? count : 0
}

export async function fetchMostRecent311(normalizedAddress: string): Promise<ServiceRequestRow | null> {
  const addrUpper = soqlEscapeLiteral(normalizedAddress)
  const where = `street_address is not null AND upper(street_address) like '%${addrUpper}%'`
  const params = new URLSearchParams()
  params.set('$select', 'sr_number,sr_type,created_date,status,origin,street_address')
  params.set('$where', where)
  params.set('$order', 'created_date DESC')
  params.set('$limit', '1')
  withSocrataToken(params)
  const res = await fetch(`${BASE_311}?${params.toString()}`, { cache: 'no-store' })
  if (!res.ok) throw new Error(`311 recent request failed (${res.status})`)
  const json = (await res.json()) as ServiceRequestRow[]
  return json?.[0] ?? null
}

export async function fetchViolationsOpenCount(normalizedAddress: string): Promise<number> {
  const addrUpper = soqlEscapeLiteral(normalizedAddress)
  const where = `address is not null AND upper(address) like '%${addrUpper}%' AND violation_status = 'OPEN'`
  const params = new URLSearchParams()
  params.set('$select', 'count(1) as count')
  params.set('$where', where)
  withSocrataToken(params)
  const res = await fetch(`${BASE_VIOLATIONS}?${params.toString()}`, { cache: 'no-store' })
  if (!res.ok) throw new Error(`Violations count request failed (${res.status})`)
  const json = (await res.json()) as SocrataCountRow[]
  const count = Number(json?.[0]?.count ?? 0)
  return Number.isFinite(count) ? count : 0
}

export async function fetchMostRecentViolation(normalizedAddress: string): Promise<ViolationRow | null> {
  const addrUpper = soqlEscapeLiteral(normalizedAddress)
  const where = `address is not null AND upper(address) like '%${addrUpper}%'`
  const params = new URLSearchParams()
  params.set(
    '$select',
    'address,violation_status,violation_date,violation_code,violation_description,violation_ordinance,violation_inspector_comments'
  )
  params.set('$where', where)
  params.set('$order', 'violation_date DESC')
  params.set('$limit', '1')
  withSocrataToken(params)
  const res = await fetch(`${BASE_VIOLATIONS}?${params.toString()}`, { cache: 'no-store' })
  if (!res.ok) throw new Error(`Violations request failed (${res.status})`)
  const json = (await res.json()) as ViolationRow[]
  return json?.[0] ?? null
}

export async function fetch311WithTimeout(normalizedAddress: string): Promise<{
  count: number | null
  recent: ServiceRequestRow | null
  error: string | null
}> {
  try {
    const [count, recent] = await Promise.all([
      fetch311Count(normalizedAddress),
      fetchMostRecent311(normalizedAddress),
    ])
    return { count, recent, error: null }
  } catch (e) {
    return {
      count: null,
      recent: null,
      error: e instanceof Error ? e.message : 'Unknown error',
    }
  }
}

export async function fetchViolationsWithTimeout(normalizedAddress: string): Promise<{
  violationsOpenCount: number
  recentViolation: ViolationRow | null
  error: string | null
}> {
  try {
    const [violationsOpenCount, recentViolation] = await Promise.all([
      fetchViolationsOpenCount(normalizedAddress),
      fetchMostRecentViolation(normalizedAddress),
    ])
    return { violationsOpenCount, recentViolation, error: null }
  } catch (e) {
    return {
      violationsOpenCount: 0,
      recentViolation: null,
      error: e instanceof Error ? e.message : 'Unable to load violations',
    }
  }
}
