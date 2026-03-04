import Link from 'next/link'

export const dynamic = 'force-dynamic'

type SearchParams = {
  address?: string | string[]
}

type SocrataCountRow = {
  count?: string
}

type ServiceRequestRow = {
  sr_number?: string
  sr_type?: string
  created_date?: string
  status?: string
  origin?: string
  street_address?: string
}

function pickFirst(value: string | string[] | undefined): string | undefined {
  if (!value) return undefined
  return Array.isArray(value) ? value[0] : value
}

function normalizeAddressFor311(raw: string): string {
  let s = raw.trim()
  if (!s) return s

  // Keep just the street portion; user often includes "Chicago, IL ..."
  s = s.split(',')[0] ?? s

  // Strip common unit markers to improve matching.
  s = s.replace(/\s+(apt|apartment|unit|#)\s*.*$/i, '')

  // Collapse whitespace.
  s = s.replace(/\s+/g, ' ').trim()

  return s.toUpperCase()
}

function soqlEscapeLiteral(value: string): string {
  return value.replace(/'/g, "''")
}

function formatDate(isoLike: string | undefined): string {
  if (!isoLike) return 'Unknown date'
  const d = new Date(isoLike)
  if (Number.isNaN(d.getTime())) return 'Unknown date'
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

async function fetch311Count(normalizedAddress: string): Promise<number> {
  const baseUrl = 'https://data.cityofchicago.org/resource/v6vf-nfxy.json'

  const addrUpper = soqlEscapeLiteral(normalizedAddress)
  const where = `street_address is not null AND upper(street_address) like '%${addrUpper}%'`

  const params = new URLSearchParams()
  params.set('$select', 'count(1) as count')
  params.set('$where', where)

  const res = await fetch(`${baseUrl}?${params.toString()}`, { cache: 'no-store' })
  if (!res.ok) throw new Error(`311 count request failed (${res.status})`)

  const json = (await res.json()) as SocrataCountRow[]
  const count = Number(json?.[0]?.count ?? 0)
  return Number.isFinite(count) ? count : 0
}

async function fetchMostRecent311(normalizedAddress: string): Promise<ServiceRequestRow | null> {
  const baseUrl = 'https://data.cityofchicago.org/resource/v6vf-nfxy.json'

  const addrUpper = soqlEscapeLiteral(normalizedAddress)
  const where = `street_address is not null AND upper(street_address) like '%${addrUpper}%'`

  const params = new URLSearchParams()
  params.set('$select', 'sr_number,sr_type,created_date,status,origin,street_address')
  params.set('$where', where)
  params.set('$order', 'created_date DESC')
  params.set('$limit', '1')

  const res = await fetch(`${baseUrl}?${params.toString()}`, { cache: 'no-store' })
  if (!res.ok) throw new Error(`311 recent request failed (${res.status})`)

  const json = (await res.json()) as ServiceRequestRow[]
  return json?.[0] ?? null
}

function LockedDescriptionCard({ text }: { text: string }) {
  return (
    <div className="relative rounded-xl border border-slate-200 bg-white p-6 overflow-hidden">
      <div className="text-sm font-semibold text-slate-800 mb-2">Full complaint description</div>
      <div className="text-slate-400 blur-sm select-none leading-relaxed">{text}</div>

      <div className="absolute inset-0 bg-white/70 backdrop-blur-[1px] flex items-center justify-center">
        <div className="text-center px-6">
          <div className="text-slate-900 font-semibold text-base">Subscribe to unlock</div>
          <div className="text-slate-600 text-sm mt-1">
            See the full complaint narrative and get instant alerts.
          </div>
          <div className="mt-4 flex items-center justify-center gap-3">
            <Link
              href="/signup"
              className="px-4 py-2 rounded-lg text-sm font-semibold text-white"
              style={{ backgroundColor: '#C8102E' }}
            >
              Get Started
            </Link>
            <Link
              href="/"
              className="px-4 py-2 rounded-lg text-sm font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 transition-colors"
            >
              Search another
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}

export default async function SearchPage({ searchParams }: { searchParams: Promise<SearchParams> | SearchParams }) {
  const sp = (await searchParams) as SearchParams
  const addressRaw = pickFirst(sp.address)?.trim()

  if (!addressRaw) {
    return (
      <main className="min-h-screen px-6 py-16" style={{ backgroundColor: '#F5F5F5' }}>
        <div className="max-w-3xl mx-auto">
          <h1 className="text-3xl font-bold mb-3" style={{ color: '#003366', fontFamily: 'Georgia, serif' }}>
            Search Chicago 311 complaints
          </h1>
          <p className="text-slate-600 mb-6">
            Enter an address on the homepage to view complaint activity.
          </p>
          <Link
            href="/"
            className="inline-flex px-4 py-2 rounded-lg text-sm font-semibold text-white"
            style={{ backgroundColor: '#003366' }}
          >
            Back to search
          </Link>
        </div>
      </main>
    )
  }

  const normalized = normalizeAddressFor311(addressRaw)

  let count: number | null = null
  let recent: ServiceRequestRow | null = null
  let error: string | null = null

  try {
    ;[count, recent] = await Promise.all([fetch311Count(normalized), fetchMostRecent311(normalized)])
  } catch (e) {
    error = e instanceof Error ? e.message : 'Unknown error'
  }

  const mostRecentType = recent?.sr_type ?? 'No matching complaints found'
  const mostRecentDate = recent?.created_date ? formatDate(recent.created_date) : '—'

  const lockedText =
    recent
      ? [
          `Request #${recent.sr_number ?? '—'}`,
          `Type: ${recent.sr_type ?? '—'}`,
          `Created: ${recent.created_date ?? '—'}`,
          `Status: ${recent.status ?? '—'}`,
          `Origin: ${recent.origin ?? '—'}`,
          `Address on file: ${recent.street_address ?? '—'}`,
        ].join(' • ')
      : 'No complaint description available.'

  return (
    <main className="min-h-screen px-6 py-12" style={{ backgroundColor: '#F5F5F5' }}>
      <div className="max-w-5xl mx-auto">
        <div className="flex items-start justify-between gap-6 mb-8">
          <div>
            <h1 className="text-3xl font-bold" style={{ color: '#003366', fontFamily: 'Georgia, serif' }}>
              Search results
            </h1>
            <p className="text-slate-600 mt-2">
              Address: <span className="font-semibold text-slate-800">{addressRaw}</span>
            </p>
            <p className="text-xs text-slate-400 mt-2">
              Data source: City of Chicago 311 Service Requests (live).
            </p>
          </div>
          <Link
            href="/"
            className="px-4 py-2 rounded-lg text-sm font-semibold text-white"
            style={{ backgroundColor: '#003366' }}
          >
            New search
          </Link>
        </div>

        {error ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-amber-900">
            <div className="font-semibold">Couldn’t load 311 results</div>
            <div className="text-sm mt-1">{error}</div>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="rounded-xl bg-white border border-slate-200 p-5">
                  <div className="text-xs uppercase tracking-wide text-slate-500">Complaint count</div>
                  <div className="text-3xl font-bold text-slate-900 mt-2">{count ?? '—'}</div>
                  <div className="text-xs text-slate-400 mt-1">Matches “{normalized}…”</div>
                </div>
                <div className="rounded-xl bg-white border border-slate-200 p-5 sm:col-span-2">
                  <div className="text-xs uppercase tracking-wide text-slate-500">Most recent complaint</div>
                  <div className="text-lg font-semibold text-slate-900 mt-2">{mostRecentType}</div>
                  <div className="text-sm text-slate-600 mt-1">{mostRecentDate}</div>
                </div>
              </div>

              <LockedDescriptionCard text={lockedText} />
            </div>

            <aside className="space-y-4">
              <div className="rounded-xl border border-slate-200 bg-white p-6">
                <div className="text-sm font-semibold text-slate-900">Want alerts?</div>
                <p className="text-sm text-slate-600 mt-2">
                  Get notified the moment a new 311 complaint is filed for this property.
                </p>
                <Link
                  href="/signup"
                  className="inline-flex mt-4 px-4 py-2 rounded-lg text-sm font-semibold text-white"
                  style={{ backgroundColor: '#C8102E' }}
                >
                  Subscribe
                </Link>
              </div>
            </aside>
          </div>
        )}
      </div>
    </main>
  )
}
