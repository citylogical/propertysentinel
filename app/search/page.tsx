'use client'

import { useEffect, useState, useCallback, Suspense } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import type { ServiceRequestRow, ViolationRow } from '@/lib/socrata-search'

const NAVY_DEEP = '#001f3f'
const NAVY = '#003366'
const RED = '#C8102E'
const GREY_HERO = '#f0f0ed'

function formatDate(isoLike: string | undefined): string {
  if (!isoLike) return 'Unknown date'
  const d = new Date(isoLike)
  if (Number.isNaN(d.getTime())) return 'Unknown date'
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
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
      <>
        <header
          className="fixed top-0 left-0 right-0 z-[100] flex items-center justify-between h-14 px-6 border-b border-white/10"
          style={{ backgroundColor: NAVY_DEEP }}
        >
          <Link href="/" className="text-white font-bold text-lg no-underline" style={{ fontFamily: 'Merriweather, Georgia, serif' }}>
            Property Sentinel
          </Link>
          <Link href="/" className="text-white text-sm font-medium px-4 py-2 rounded hover:opacity-90" style={{ backgroundColor: NAVY }}>
            New search
          </Link>
        </header>
        <main className="min-h-screen pt-14 px-6 py-12 flex flex-col items-center justify-center" style={{ backgroundColor: GREY_HERO }}>
          <div className="max-w-xl w-full rounded-lg border border-[#d4cfc4] bg-white p-8 shadow-sm">
            <h1 className="text-2xl font-bold mb-3" style={{ color: NAVY_DEEP, fontFamily: 'Merriweather, Georgia, serif' }}>
              Search Chicago 311 complaints
            </h1>
            <p className="text-[#3d3d3d] mb-6 text-sm">Enter an address on the homepage to view complaint activity.</p>
            <Link href="/" className="inline-flex px-4 py-2 rounded text-sm font-semibold text-white" style={{ backgroundColor: NAVY }}>
              Back to search
            </Link>
          </div>
        </main>
      </>
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
    <>
      <header
        className="fixed top-0 left-0 right-0 z-[100] flex items-center justify-between h-14 px-6 border-b border-white/10"
        style={{ backgroundColor: NAVY_DEEP }}
      >
        <Link href="/" className="text-white font-bold text-lg no-underline" style={{ fontFamily: 'Merriweather, Georgia, serif' }}>
          Property Sentinel
        </Link>
        <Link href="/" className="text-white text-sm font-medium px-4 py-2 rounded hover:opacity-90" style={{ backgroundColor: NAVY }}>
          New search
        </Link>
      </header>

      <main className="min-h-screen pt-14 px-6 py-8" style={{ backgroundColor: GREY_HERO }}>
        <div className="max-w-5xl mx-auto">
          {loading ? (
            <LoadingSpinner />
          ) : (
            <>
              <div className="mb-8">
                <h1 className="text-2xl font-bold mb-1" style={{ color: NAVY_DEEP, fontFamily: 'Merriweather, Georgia, serif' }}>
                  Search results
                </h1>
                <p className="text-[#3d3d3d] text-sm">
                  Address: <span className="font-semibold text-[#1a1a1a]">{addressRaw}</span>
                </p>
                <p className="text-[#6b6b6b] text-xs mt-1">City of Chicago 311 &amp; building violations (live)</p>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 flex flex-col gap-6">
                  {error ? (
                    <div className="rounded-lg border border-amber-200 bg-amber-50 p-5 text-amber-900">
                      <div className="font-semibold">311 complaints</div>
                      <div className="text-sm mt-1">{error}</div>
                    </div>
                  ) : (
                    <>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <div className="rounded-lg border border-[#d4cfc4] bg-white p-5">
                          <div className="text-xs uppercase tracking-wider text-[#6b6b6b]">Complaint count</div>
                          <div className="text-2xl font-bold text-[#1a1a1a] mt-2">{count ?? '—'}</div>
                          <div className="text-xs text-[#6b6b6b] mt-1">Matches &quot;{normalized}&quot;…</div>
                        </div>
                        <div className="rounded-lg border border-[#d4cfc4] bg-white p-5 sm:col-span-2">
                          <div className="text-xs uppercase tracking-wider text-[#6b6b6b]">Most recent complaint</div>
                          <div className="text-base font-semibold text-[#1a1a1a] mt-2">{mostRecentType}</div>
                          <div className="text-sm text-[#3d3d3d] mt-1">{mostRecentDate}</div>
                        </div>
                      </div>

                      <div className="rounded-lg border border-[#d4cfc4] bg-white p-5">
                        <div className="text-sm font-semibold text-[#1a1a1a] mb-2">Complaint details</div>
                        <p className="text-sm text-[#3d3d3d] leading-relaxed">{lockedText}</p>
                      </div>
                    </>
                  )}

                  <div className="rounded-lg border border-[#d4cfc4] bg-white p-5">
                    <div className="text-xs uppercase tracking-wider text-[#6b6b6b] mb-3">Building violations</div>
                    {violationsError ? (
                      <p className="text-sm text-amber-600">{violationsError}</p>
                    ) : violationsOpenCount === 0 && !recentViolation ? (
                      <>
                        <p className="text-[#1a1a1a] font-medium">No open violations on record.</p>
                        <p className="text-sm text-[#6b6b6b] mt-1">No violations found for this address.</p>
                      </>
                    ) : (
                      <>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
                          <div>
                            <div className="text-xs uppercase tracking-wider text-[#6b6b6b]">Open violations</div>
                            <div className="text-xl font-bold text-[#1a1a1a] mt-1">{violationsOpenCount}</div>
                          </div>
                          <div className="sm:col-span-2">
                            <div className="text-xs uppercase tracking-wider text-[#6b6b6b]">Most recent</div>
                            <div className="text-base font-semibold text-[#1a1a1a] mt-1">{recentViolation?.violation_description ?? '—'}</div>
                            <div className="text-sm text-[#3d3d3d] mt-0.5">
                              {recentViolation?.violation_date ? formatDate(recentViolation.violation_date) : '—'}
                            </div>
                          </div>
                        </div>
                        <div className="pt-3 border-t border-[#d4cfc4]">
                          <div className="text-sm font-semibold text-[#1a1a1a] mb-2">Violation details</div>
                          <p className="text-sm text-[#3d3d3d] leading-relaxed">{violationLockedText}</p>
                        </div>
                      </>
                    )}
                  </div>
                </div>

                <aside>
                  <div className="rounded-lg border border-[#d4cfc4] bg-white p-6 sticky top-20">
                    <div className="text-sm font-semibold text-[#1a1a1a]">Want alerts?</div>
                    <p className="text-sm text-[#3d3d3d] mt-2">Get notified the moment a new 311 complaint is filed for this property.</p>
                    <Link href="/signup" className="inline-flex mt-4 px-4 py-2 rounded text-sm font-semibold text-white hover:opacity-90" style={{ backgroundColor: RED }}>
                      Subscribe
                    </Link>
                  </div>
                </aside>
              </div>
            </>
          )}
        </div>
      </main>
    </>
  )
}

export default function SearchPage() {
  return (
    <Suspense fallback={
      <>
        <header
          className="fixed top-0 left-0 right-0 z-[100] flex items-center justify-between h-14 px-6 border-b border-white/10"
          style={{ backgroundColor: NAVY_DEEP }}
        >
          <Link href="/" className="text-white font-bold text-lg no-underline" style={{ fontFamily: 'Merriweather, Georgia, serif' }}>
            Property Sentinel
          </Link>
          <Link href="/" className="text-white text-sm font-medium px-4 py-2 rounded hover:opacity-90" style={{ backgroundColor: NAVY }}>
            New search
          </Link>
        </header>
        <main className="min-h-screen pt-14 px-6 py-12" style={{ backgroundColor: GREY_HERO }}>
          <div className="max-w-5xl mx-auto">
            <LoadingSpinner />
          </div>
        </main>
      </>
    }>
      <SearchPageContent />
    </Suspense>
  )
}
