'use client'

import { useEffect, useState, useCallback, Suspense } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import type { ServiceRequestRow, ViolationRow } from '@/lib/socrata-search'

function formatDate(isoLike: string | undefined): string {
  if (!isoLike) return 'Unknown date'
  const d = new Date(isoLike)
  if (Number.isNaN(d.getTime())) return 'Unknown date'
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

function LockedDescriptionCard({ text }: { text: string }) {
  return (
    <div className="relative rounded-xl border border-slate-200 bg-white p-6 overflow-hidden">
      <div className="text-sm font-semibold text-slate-800 mb-2">Full complaint description</div>
      <div className="text-slate-400 blur-sm select-none leading-relaxed">{text}</div>
      <div className="absolute inset-0 bg-white/70 backdrop-blur-[1px] flex items-center justify-center">
        <div className="text-center px-6">
          <div className="text-slate-900 font-semibold text-base">Subscribe to unlock</div>
          <div className="text-slate-600 text-sm mt-1">See the full complaint narrative and get instant alerts.</div>
          <div className="mt-4 flex items-center justify-center gap-3">
            <Link href="/signup" className="px-4 py-2 rounded-lg text-sm font-semibold text-white" style={{ backgroundColor: '#C8102E' }}>Get Started</Link>
            <Link href="/" className="px-4 py-2 rounded-lg text-sm font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 transition-colors">Search another</Link>
          </div>
        </div>
      </div>
    </div>
  )
}

function LockedViolationCard({ text }: { text: string }) {
  return (
    <div className="relative rounded-xl border border-slate-200 bg-white p-6 overflow-hidden">
      <div className="text-sm font-semibold text-slate-800 mb-2">Violation description &amp; code</div>
      <div className="text-slate-400 blur-sm select-none leading-relaxed">{text}</div>
      <div className="absolute inset-0 bg-white/70 backdrop-blur-[1px] flex items-center justify-center">
        <div className="text-center px-6">
          <div className="text-slate-900 font-semibold text-base">Subscribe to unlock</div>
          <div className="text-slate-600 text-sm mt-1">See full violation details and get instant alerts.</div>
          <div className="mt-4 flex items-center justify-center gap-3">
            <Link href="/signup" className="px-4 py-2 rounded-lg text-sm font-semibold text-white" style={{ backgroundColor: '#C8102E' }}>Get Started</Link>
            <Link href="/" className="px-4 py-2 rounded-lg text-sm font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 transition-colors">Search another</Link>
          </div>
        </div>
      </div>
    </div>
  )
}

function LoadingSpinner() {
  return (
    <div className="flex flex-col items-center justify-center py-24 gap-4">
      <div
        className="h-10 w-10 rounded-full border-4 border-slate-200 border-t-slate-600 animate-spin"
        aria-hidden
      />
      <p className="text-sm text-slate-500">Loading property data…</p>
    </div>
  )
}

type State311 = { count: number | null; recent: ServiceRequestRow | null; error: string | null }
type StateViolations = { violationsOpenCount: number; recentViolation: ViolationRow | null; error: string | null }

function SearchPageContent() {
  const searchParams = useSearchParams()
  const addressRaw = searchParams.get('address')?.trim() ?? ''

  const [loading, setLoading] = useState(!!addressRaw)
  const [data311, setData311] = useState<State311 | null>(null)
  const [dataViolations, setDataViolations] = useState<StateViolations | null>(null)

  const fetchData = useCallback(async (address: string) => {
    setLoading(true)
    setData311(null)
    setDataViolations(null)
    const encoded = encodeURIComponent(address)
    try {
      const [res311, resViolations] = await Promise.all([
        fetch(`/api/search/311?address=${encoded}`),
        fetch(`/api/search/violations?address=${encoded}`),
      ])
      const json311: State311 = res311.ok
        ? await res311.json()
        : { count: null, recent: null, error: ((await res311.json().catch(() => ({}))) as { error?: string })?.error ?? res311.statusText }
      const jsonViolations: StateViolations = resViolations.ok
        ? await resViolations.json()
        : { violationsOpenCount: 0, recentViolation: null, error: ((await resViolations.json().catch(() => ({}))) as { error?: string })?.error ?? resViolations.statusText }
      setData311(json311)
      setDataViolations(jsonViolations)
    } catch (e) {
      setData311({ count: null, recent: null, error: e instanceof Error ? e.message : 'Unknown error' })
      setDataViolations({ violationsOpenCount: 0, recentViolation: null, error: 'Unable to load violations' })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!addressRaw) {
      setLoading(false)
      setData311(null)
      setDataViolations(null)
      return
    }
    fetchData(addressRaw)
  }, [addressRaw, fetchData])

  if (!addressRaw) {
    return (
      <main className="min-h-screen px-6 py-16" style={{ backgroundColor: '#F5F5F5' }}>
        <div className="max-w-3xl mx-auto">
          <h1 className="text-3xl font-bold mb-3" style={{ color: '#003366', fontFamily: 'Georgia, serif' }}>
            Search Chicago 311 complaints
          </h1>
          <p className="text-slate-600 mb-6">Enter an address on the homepage to view complaint activity.</p>
          <Link href="/" className="inline-flex px-4 py-2 rounded-lg text-sm font-semibold text-white" style={{ backgroundColor: '#003366' }}>
            Back to search
          </Link>
        </div>
      </main>
    )
  }

  const normalized = addressRaw.split(',')[0]?.trim().toUpperCase() ?? addressRaw.toUpperCase()
  const count = data311?.count ?? null
  const recent = data311?.recent ?? null
  const error = data311?.error ?? null
  const violationsOpenCount = dataViolations?.violationsOpenCount ?? 0
  const recentViolation = dataViolations?.recentViolation ?? null
  const violationsError = dataViolations?.error ?? null

  const mostRecentType = recent?.sr_type ?? 'No matching complaints found'
  const mostRecentDate = recent?.created_date ? formatDate(recent.created_date) : '—'
  const lockedText = recent
    ? [
        `Request #${recent.sr_number ?? '—'}`,
        `Type: ${recent.sr_type ?? '—'}`,
        `Created: ${recent.created_date ?? '—'}`,
        `Status: ${recent.status ?? '—'}`,
        `Origin: ${recent.origin ?? '—'}`,
        `Address on file: ${recent.street_address ?? '—'}`,
      ].join(' • ')
    : 'No complaint description available.'
  const violationLockedText = recentViolation
    ? [
        `Code: ${recentViolation.violation_code ?? '—'}`,
        `Description: ${recentViolation.violation_description ?? '—'}`,
        `Ordinance: ${recentViolation.violation_ordinance ?? '—'}`,
        recentViolation.violation_inspector_comments ? `Inspector: ${recentViolation.violation_inspector_comments}` : '',
      ]
        .filter(Boolean)
        .join(' • ')
    : 'No violation details available.'

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
            <p className="text-xs text-slate-400 mt-2">Data source: City of Chicago 311 Service Requests (live).</p>
          </div>
          <Link href="/" className="px-4 py-2 rounded-lg text-sm font-semibold text-white" style={{ backgroundColor: '#003366' }}>
            New search
          </Link>
        </div>

        {loading ? (
          <LoadingSpinner />
        ) : (
          <>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 space-y-6">
                {error ? (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-amber-900">
                    <div className="font-semibold">311 complaints</div>
                    <div className="text-sm mt-1">{error}</div>
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <div className="rounded-xl bg-white border border-slate-200 p-5">
                        <div className="text-xs uppercase tracking-wide text-slate-500">Complaint count</div>
                        <div className="text-3xl font-bold text-slate-900 mt-2">{count ?? '—'}</div>
                        <div className="text-xs text-slate-400 mt-1">Matches &quot;{normalized}&quot;…</div>
                      </div>
                      <div className="rounded-xl bg-white border border-slate-200 p-5 sm:col-span-2">
                        <div className="text-xs uppercase tracking-wide text-slate-500">Most recent complaint</div>
                        <div className="text-lg font-semibold text-slate-900 mt-2">{mostRecentType}</div>
                        <div className="text-sm text-slate-600 mt-1">{mostRecentDate}</div>
                      </div>
                    </div>
                    <LockedDescriptionCard text={lockedText} />
                  </>
                )}

                <div className="rounded-xl border border-slate-200 bg-white p-5">
                  <div className="text-xs uppercase tracking-wide text-slate-500 mb-3">Building violations</div>
                  {violationsError ? (
                    <p className="text-sm text-amber-600">{violationsError}</p>
                  ) : violationsOpenCount === 0 && !recentViolation ? (
                    <>
                      <p className="text-slate-700 font-medium">No open violations on record.</p>
                      <p className="text-sm text-slate-500 mt-1">No violations found for this address.</p>
                    </>
                  ) : (
                    <>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
                        <div>
                          <div className="text-xs uppercase tracking-wide text-slate-500">Open violations</div>
                          <div className="text-2xl font-bold text-slate-900 mt-1">{violationsOpenCount}</div>
                        </div>
                        <div className="sm:col-span-2">
                          <div className="text-xs uppercase tracking-wide text-slate-500">Most recent violation</div>
                          <div className="text-lg font-semibold text-slate-900 mt-1">{recentViolation?.violation_description ?? '—'}</div>
                          <div className="text-sm text-slate-600 mt-0.5">
                            {recentViolation?.violation_date ? formatDate(recentViolation.violation_date) : '—'}
                          </div>
                        </div>
                      </div>
                      <LockedViolationCard text={violationLockedText} />
                    </>
                  )}
                </div>
              </div>

              <aside className="space-y-4">
                <div className="rounded-xl border border-slate-200 bg-white p-6">
                  <div className="text-sm font-semibold text-slate-900">Want alerts?</div>
                  <p className="text-sm text-slate-600 mt-2">Get notified the moment a new 311 complaint is filed for this property.</p>
                  <Link href="/signup" className="inline-flex mt-4 px-4 py-2 rounded-lg text-sm font-semibold text-white" style={{ backgroundColor: '#C8102E' }}>
                    Subscribe
                  </Link>
                </div>
              </aside>
            </div>
          </>
        )}
      </div>
    </main>
  )
}

export default function SearchPage() {
  return (
    <Suspense fallback={
      <main className="min-h-screen px-6 py-12" style={{ backgroundColor: '#F5F5F5' }}>
        <div className="max-w-5xl mx-auto">
          <LoadingSpinner />
        </div>
      </main>
    }>
      <SearchPageContent />
    </Suspense>
  )
}
