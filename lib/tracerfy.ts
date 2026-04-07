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

/**
 * Shape we persist to the `all_persons`, `all_phones`, `all_emails` JSONB columns.
 * Filters out deceased persons, flags mailing-address-matches-property, and
 * flattens phones/emails into deduplicated ranked arrays.
 */
export type TracerfyEnrichedPhone = {
  number: string
  type: string
  dnc: boolean
  carrier: string
  rank: number
  person_name: string
}

export type TracerfyEnrichedEmail = {
  email: string
  rank: number
  person_name: string
}

export type TracerfyEnrichedPerson = {
  first_name: string
  last_name: string
  full_name: string
  age: string
  dob: string
  property_owner: boolean
  litigator: boolean
  mailing_address: {
    street: string
    city: string
    state: string
    zip: string
  }
  mailing_matches_property: boolean
  phones: TracerfyPhone[]
  emails: TracerfyEmail[]
}

export type TracerfyEnrichedData = {
  all_persons: TracerfyEnrichedPerson[]
  all_phones: TracerfyEnrichedPhone[]
  all_emails: TracerfyEnrichedEmail[]
  primary_person: TracerfyEnrichedPerson | null
}

/**
 * Normalize a street address for comparison: uppercase, strip punctuation,
 * collapse whitespace, remove unit suffixes. Good enough for fuzzy matching
 * mailing addresses against the property being searched.
 */
function normalizeStreetForMatch(s: string | null | undefined): string {
  if (!s) return ''
  return s
    .toUpperCase()
    .replace(/\s+(APT|UNIT|#|STE|SUITE)\s*\S*/g, '')
    .replace(/[.,]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Takes the raw Tracerfy response and the normalized property address we
 * searched for, returns the enriched + filtered data structures we persist.
 *
 * - Drops deceased persons entirely
 * - Flags each remaining person with mailing_matches_property
 * - Sorts persons: property-mailing-match first, then Tracerfy's order
 * - Caps persons at 3, phones at 10, emails at 10
 * - Deduplicates phones by number and emails by email (keep first occurrence)
 */
export function enrichTracerfyResponse(
  response: TracerfyLookupResponse,
  searchedAddressNormalized: string
): TracerfyEnrichedData {
  const searchedStreet = normalizeStreetForMatch(searchedAddressNormalized)

  const living = (response.persons ?? []).filter((p) => !p.deceased)

  const annotated: TracerfyEnrichedPerson[] = living.map((p) => {
    const mailingStreet = normalizeStreetForMatch(p.mailing_address?.street ?? '')
    // Match if the mailing street starts with the same numeric + street name as the searched address.
    // This handles "4217 N MOBILE AVE" matching "4217 N Mobile Ave" after normalization.
    const mailing_matches_property =
      mailingStreet.length > 0 &&
      searchedStreet.length > 0 &&
      (mailingStreet === searchedStreet ||
        mailingStreet.startsWith(searchedStreet) ||
        searchedStreet.startsWith(mailingStreet))
    return {
      first_name: p.first_name,
      last_name: p.last_name,
      full_name: p.full_name,
      age: p.age,
      dob: p.dob,
      property_owner: p.property_owner,
      litigator: p.litigator,
      mailing_address: p.mailing_address,
      mailing_matches_property,
      phones: p.phones ?? [],
      emails: p.emails ?? [],
    }
  })

  // Sort: mailing-match persons first, then original order preserved.
  const sorted = [...annotated].sort((a, b) => {
    if (a.mailing_matches_property && !b.mailing_matches_property) return -1
    if (!a.mailing_matches_property && b.mailing_matches_property) return 1
    return 0
  })

  const cappedPersons = sorted.slice(0, 3)

  // Flatten phones across all (sorted) persons, dedupe by number, sort by rank.
  const seenPhones = new Set<string>()
  const allPhones: TracerfyEnrichedPhone[] = []
  for (const person of sorted) {
    for (const phone of person.phones ?? []) {
      if (!phone.number || seenPhones.has(phone.number)) continue
      seenPhones.add(phone.number)
      allPhones.push({
        number: phone.number,
        type: phone.type,
        dnc: phone.dnc,
        carrier: phone.carrier,
        rank: phone.rank,
        person_name: person.full_name,
      })
    }
  }
  allPhones.sort((a, b) => a.rank - b.rank)
  const cappedPhones = allPhones.slice(0, 10)

  // Flatten emails the same way.
  const seenEmails = new Set<string>()
  const allEmails: TracerfyEnrichedEmail[] = []
  for (const person of sorted) {
    for (const email of person.emails ?? []) {
      if (!email.email || seenEmails.has(email.email)) continue
      seenEmails.add(email.email)
      allEmails.push({
        email: email.email,
        rank: email.rank,
        person_name: person.full_name,
      })
    }
  }
  allEmails.sort((a, b) => a.rank - b.rank)
  const cappedEmails = allEmails.slice(0, 10)

  return {
    all_persons: cappedPersons,
    all_phones: cappedPhones,
    all_emails: cappedEmails,
    primary_person: sorted[0] ?? null,
  }
}
