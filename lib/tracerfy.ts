// Tracerfy Instant Trace Lookup client
// POST {BASE}/trace/lookup/ — synchronous single-address skip trace
// Set TRACERFY_BASE_URL to the API root including path prefix (e.g. …/v1/api)

function tracerfyBaseUrl(): string {
  const raw = process.env.TRACERFY_BASE_URL
  if (!raw?.trim()) throw new Error('TRACERFY_BASE_URL is not set')
  return raw.replace(/\/$/, '')
}

function tracerfyToken(): string {
  const t = process.env.TRACERFY_API_TOKEN
  if (!t?.trim()) throw new Error('TRACERFY_API_TOKEN is not set')
  return t
}

export type TracerfyPhone = {
  number: string
  type: 'Mobile' | 'Landline' | 'VOIP' | string
  dnc: boolean
  carrier: string
  rank: number
}

export type TracerfyEmail = {
  email: string
  rank: number
}

export type TracerfyPerson = {
  first_name: string
  last_name: string
  full_name: string
  dob: string
  age: string
  deceased: boolean
  property_owner: boolean
  litigator: boolean
  mailing_address: {
    street: string
    city: string
    state: string
    zip: string
  }
  phones: TracerfyPhone[]
  emails: TracerfyEmail[]
}

export type TracerfyLookupResponse = {
  address: string
  city: string
  state: string
  zip: string
  find_owner: boolean
  hit: boolean
  persons_count: number
  credits_deducted: number
  persons: TracerfyPerson[]
}

export async function tracerfyInstantLookup(params: {
  address: string
  city: string
  state: string
  zip?: string
  find_owner?: boolean
}): Promise<TracerfyLookupResponse> {
  const base = tracerfyBaseUrl()
  const res = await fetch(`${base}/trace/lookup/`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${tracerfyToken()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      address: params.address,
      city: params.city,
      state: params.state,
      zip: params.zip || undefined,
      find_owner: params.find_owner !== false,
    }),
  })

  if (!res.ok) {
    const errText = await res.text().catch(() => 'unknown error')
    throw new Error(`Tracerfy API returned ${res.status}: ${errText}`)
  }

  return res.json() as Promise<TracerfyLookupResponse>
}

export function rankOnePhone(phones: TracerfyPhone[]): TracerfyPhone | null {
  if (!phones || phones.length === 0) return null
  return [...phones].sort((a, b) => a.rank - b.rank)[0]
}

export function rankOneEmail(emails: TracerfyEmail[]): TracerfyEmail | null {
  if (!emails || emails.length === 0) return null
  return [...emails].sort((a, b) => a.rank - b.rank)[0]
}
