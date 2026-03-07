'use client'

import { useEffect, useState, useCallback, Suspense } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import type { ComplaintRow } from '@/lib/supabase-search'

const NAVY_DEEP = '#001f3f'
const NAVY = '#003366'
const RED = '#C8102E'
const GREY_HERO = '#f0f0ed'

// Format a date string to e.g. "Mar 3, 2026"
function formatDate(isoLike: string | null | undefined): string {
  if (!isoLike) return '—'
  const d = new Date(isoLike)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
}

// Format hour from 24h integer to e.g. "7am", "1pm"
function formatHour(hour: number | null | undefined): string {
  if (hour === null || hour === undefined) return ''
  if (hour === 0) return '12am'
  if (hour === 12) return '12pm'
  return hour < 12 ? `${hour}am` : `${hour - 12}pm`
}

// Format created_date + created_hour together: "Mar 3, 2026 7am"
function formatFiled(created_date: string | null, created_hour: number | null): string {
  const date = formatDate(created_date)
  const hour = formatHour(created_hour)
  return hour ? `${date} ${hour}` : date
}

function statusBadge(status: string | null) {
  const s = status?.toUpperCase() ?? ''
  const isOpen = s === 'OPEN'
  return (
    <span
      className="inline-block text-xs font-semibold px-2 py-0.5 rounded-full"
      style={{
        backgroundColor: isOpen ? '#fef3c7' : '#dcfce7',
        color: isOpen ? '#92400e' : '#166534',
      }}
    >
      {status ?? '—'}
    </span>
  )
}

function ComplaintCard({ complaint }: { complaint: ComplaintRow }) {
  const isClosed = complaint.status?.toUpperCase() === 'CLOSED' || complaint.status?.toUpperCase() === 'COMPLETED'
  const filedStr = formatFiled(complaint.created_date, complaint.created_hour)

  // Only show last_modified if it differs from created_date (compare date portion only)
  const createdDay = complaint.created_date?.slice(0, 10)
  const modifiedDay = complaint.last_modified_date?.slice(0, 10)
  const showModified = !isClosed && complaint.last_modified_date && modifiedDay !== createdDay

  return (
    <div className="rounded-lg border border-[#d4cfc4] bg-white p-5">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <div className="text-sm font-semibold text-[#1a1a1a]">
            {complaint.sr_type ?? '—'}
          </div>
          <div className="text-xs text-[#6b6b6b] mt-0.5">
            {complaint.owner_department ?? '—'}
            {complaint.origin ? ` · ${complaint.origin}` : ''}
          </div>
        </div>
        {statusBadge(complaint.status)}
      </div>

      <div className="flex flex-col gap-1 text-xs text-[#3d3d3d]">
        <div>
          <span className="text-[#6b6b6b]">Filed: </span>
          {filedStr}
        </div>

        {isClosed && complaint.closed_date && (
          <div>
            <span className="text-[#6b6b6b]">Closed: </span>
            {formatDate(complaint.closed_date)}
          </div>
        )}

        {showModified && (
          <div>
            <span className="text-[#6b6b6b]">Last updated: </span>
            {formatDate(complaint.last_modified_date)}
          </div>
        )}
      </div>

      <div className="text-xs text-[#9b9b9b] mt-3">
        #{complaint.sr_number}
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

function SearchPageContent() {
  const searchParams = useSearchParams()
  const addressRaw = searchParams.get('address')?.trim() ?? ''

  const [loading, setLoading] = useState(!!addressRaw)
  const [complaints, setComplaints] = useState<ComplaintRow[]>([])
  const [error, setError] = useState<string | null>(null)

  const fetchData = useCallback(async (address: string) => {
    setLoading(true)
    setComplaints([])
    setError(null)
    try {
      const res = await fetch(`/api/search/311?address=${encodeURIComponent(address)}`)
      const json = await res.json()
      if (!res.ok) {
        setError(json.error ?? res.statusText)
      } else {
        setComplaints(json.complaints ?? [])
        setError(json.error ?? null)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!addressRaw) {
      setLoading(false)
      return
    }
    fetchData(addressRaw)
  }, [addressRaw, fetchData])

  if (!addressRaw) {
    return (
      <>
        <Header />
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

  return (
    <>
      <Header />
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
                <p className="text-[#6b6b6b] text-xs mt-1">City of Chicago 311 complaints</p>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 flex flex-col gap-4">
                  {error ? (
                    <div className="rounded-lg border border-amber-200 bg-amber-50 p-5 text-amber-900">
                      <div className="font-semibold">Error loading complaints</div>
                      <div className="text-sm mt-1">{error}</div>
                    </div>
                  ) : complaints.length === 0 ? (
                    <div className="rounded-lg border border-[#d4cfc4] bg-white p-6">
                      <p className="text-[#1a1a1a] font-medium">No complaints on record.</p>
                      <p className="text-sm text-[#6b6b6b] mt-1">No 311 complaints found for this address.</p>
                    </div>
                  ) : (
                    <>
                      <div className="text-sm text-[#6b6b6b] font-medium">
                        {complaints.length} complaint{complaints.length !== 1 ? 's' : ''} found
                      </div>
                      {complaints.map((c) => (
                        <ComplaintCard key={c.sr_number} complaint={c} />
                      ))}
                    </>
                  )}
                </div>

                <aside>
                  <div className="rounded-lg border border-[#d4cfc4] bg-white p-6 sticky top-20">
                    <div className="text-sm font-semibold text-[#1a1a1a]">Want alerts?</div>
                    <p className="text-sm text-[#3d3d3d] mt-2">
                      Get notified the moment a new 311 complaint is filed for this property.
                    </p>
                    <Link
                      href="/signup"
                      className="inline-flex mt-4 px-4 py-2 rounded text-sm font-semibold text-white hover:opacity-90"
                      style={{ backgroundColor: RED }}
                    >
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

function Header() {
  return (
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
  )
}

export default function SearchPage() {
  return (
    <Suspense fallback={
      <>
        <Header />
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