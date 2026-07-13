'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import type { ParsedUnitRow, ParseStats } from '@/lib/rentroll/types'
import { MAX_SHEET_ROWS } from '@/lib/rentroll/types'
import type { ImportResolution } from '@/lib/rentroll/resolve'

// The rent-roll upload flow: drop a CSV/XLSX → the file is parsed in THIS
// browser (SheetJS; the file never leaves the machine — only extracted cell
// text is sent) → /api/dashboard/import/start creates the job → this modal
// drives /import/process until every address is resolved → the review screen
// behaves like the staging queue: paginated, collapsible property groups,
// edits persisted to the job (PATCH /import/job) so closing and reopening
// resumes exactly where the user left off. Amber addresses re-resolve
// automatically on blur/Enter.
//
// The final "Add to queue" handoff (staged_properties + staged_property_units
// + the existing plan/checkout wizard) is the next build step — the button
// says so until it lands.

type Step = 'drop' | 'reading' | 'resolving' | 'review'

type Props = {
  isOpen: boolean
  onClose: () => void
  initialFile: File | null
}

type ReviewUnit = ParsedUnitRow & {
  key: number
  included: boolean
  draft_unit_label: string
  draft_rent: string
}

type JobPayload = {
  id: string
  status: string
  file_name: string | null
  parsed_rows: ParsedUnitRow[]
  results: ImportResolution[]
}

const MAX_FILE_BYTES = 10 * 1024 * 1024
const ACCEPTED_EXTENSIONS = ['.csv', '.xlsx', '.xls']
const PER_PAGE_OPTIONS = [10, 25, 50]

function fileKind(name: string): 'csv' | 'xlsx' | null {
  const lower = name.toLowerCase()
  if (lower.endsWith('.csv')) return 'csv'
  if (lower.endsWith('.xlsx') || lower.endsWith('.xls')) return 'xlsx'
  return null
}

function formatMoney(n: number | null): string {
  if (n === null) return ''
  return n.toLocaleString('en-US', { maximumFractionDigits: 0 })
}

export default function ImportRentRollModal({ isOpen, onClose, initialFile }: Props) {
  const [step, setStep] = useState<Step>('drop')
  const [error, setError] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [fileName, setFileName] = useState<string | null>(null)
  const [jobId, setJobId] = useState<string | null>(null)
  const [progress, setProgress] = useState({ processed: 0, total: 0 })
  const [parseStats, setParseStats] = useState<ParseStats | null>(null)
  const [units, setUnits] = useState<ReviewUnit[]>([])
  const [resolutions, setResolutions] = useState<Record<string, ImportResolution>>({})
  const [groupDrafts, setGroupDrafts] = useState<Record<string, string>>({})
  const [rechecking, setRechecking] = useState<Record<string, boolean>>({})
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({})
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState(10)
  const [jobStatus, setJobStatus] = useState<'review' | 'committed'>('review')
  const [committing, setCommitting] = useState(false)
  // Smooth progress: the server confirms in chunks of 12, but the bar and
  // counter advance one address at a time by extrapolating the measured pace.
  const [smoothProcessed, setSmoothProcessed] = useState(0)
  const paceRef = useRef({ confirmed: 0, chunkStart: 0, msPerAddr: 2500, startedAt: 0 })
  const fileInputRef = useRef<HTMLInputElement>(null)
  const cancelledRef = useRef(false)
  const startedFileRef = useRef<File | null>(null)
  const resumeCheckedRef = useRef(false)

  const reset = useCallback(() => {
    setStep('drop')
    setError(null)
    setDragOver(false)
    setFileName(null)
    setJobId(null)
    setProgress({ processed: 0, total: 0 })
    setParseStats(null)
    setUnits([])
    setResolutions({})
    setGroupDrafts({})
    setRechecking({})
    setExpandedGroups({})
    setPage(1)
    setSmoothProcessed(0)
  }, [])

  // Fire-and-forget persistence — the review screen must survive close/reopen.
  const persistRows = useCallback(
    (id: string | null, updates: Array<{ row_num: number } & Partial<Pick<ParsedUnitRow, 'unit_label' | 'included'>> & { rent?: string | null }>) => {
      if (!id || updates.length === 0) return
      void fetch('/api/dashboard/import/job', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ job_id: id, updates }),
      }).catch(() => {})
    },
    []
  )

  const applyJob = useCallback((job: JobPayload) => {
    const resultMap: Record<string, ImportResolution> = {}
    for (const r of job.results ?? []) resultMap[r.raw_address] = r
    setResolutions(resultMap)
    const rows: ReviewUnit[] = (job.parsed_rows ?? []).map((row, i) => ({
      ...row,
      key: i,
      included: row.included ?? !row.flags.includes('summary_row'),
      draft_unit_label: row.unit_label ?? '',
      draft_rent: formatMoney(row.rent),
    }))
    // Rent rolls without a unit column still get labels: "Unit 1..N" within
    // each property — matching what promotion would materialize anyway.
    const counters = new Map<string, number>()
    for (const u of rows) {
      if (!u.address) continue
      const n = (counters.get(u.address) ?? 0) + 1
      counters.set(u.address, n)
      if (!u.draft_unit_label.trim()) u.draft_unit_label = `Unit ${n}`
    }
    setUnits(rows)
    setJobId(job.id)
    setFileName(job.file_name)
    setJobStatus(job.status === 'committed' ? 'committed' : 'review')
    setPage(1)
    setStep('review')
  }, [])

  const loadReview = useCallback(
    async (id: string) => {
      const res = await fetch(`/api/dashboard/import/job?job_id=${encodeURIComponent(id)}`)
      const data = (await res.json()) as { job?: JobPayload; error?: string }
      if (!res.ok || !data.job) throw new Error(data.error ?? 'Could not load results')
      applyJob(data.job)
    },
    [applyJob]
  )

  const driveProcessing = useCallback(
    async (id: string) => {
      setStep('resolving')
      setSmoothProcessed(0)
      paceRef.current = { confirmed: 0, chunkStart: Date.now(), msPerAddr: 2500, startedAt: Date.now() }
      // Browser-driven chunk loop, same shape as the enrichment backfill.
      for (;;) {
        if (cancelledRef.current) return
        const res = await fetch('/api/dashboard/import/process', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ job_id: id }),
        })
        const data = (await res.json()) as {
          processed?: number
          total?: number
          status?: string
          error?: string
        }
        if (!res.ok) throw new Error(data.error ?? 'Processing failed')
        const processed = data.processed ?? 0
        const now = Date.now()
        if (processed > 0) {
          paceRef.current.msPerAddr = (now - paceRef.current.startedAt) / processed
        }
        paceRef.current.confirmed = processed
        paceRef.current.chunkStart = now
        setProgress({ processed, total: data.total ?? 0 })
        if (data.status === 'review') break
        if (data.status !== 'resolving' && data.status !== 'pending') {
          throw new Error(`Unexpected job status: ${data.status}`)
        }
      }
      await loadReview(id)
    },
    [loadReview]
  )

  // Tick the displayed counter one address at a time between chunk responses.
  useEffect(() => {
    if (!isOpen || step !== 'resolving') return
    const id = setInterval(() => {
      const p = paceRef.current
      const extrapolated =
        p.confirmed + Math.floor((Date.now() - p.chunkStart) / Math.max(p.msPerAddr, 200))
      const cap = Math.min(progress.total, p.confirmed + 11)
      setSmoothProcessed((prev) => Math.max(prev, Math.min(extrapolated, cap)))
    }, 350)
    return () => clearInterval(id)
  }, [isOpen, step, progress.total])

  const handleFile = useCallback(
    async (file: File) => {
      setError(null)
      const kind = fileKind(file.name)
      if (!kind) {
        setError('Please upload a .csv or .xlsx file.')
        return
      }
      if (file.size > MAX_FILE_BYTES) {
        setError('File is larger than 10 MB. Email it to jim@propertysentinel.io instead.')
        return
      }
      setFileName(file.name)
      setStep('reading')
      try {
        // SheetJS loads on demand — it never ships in the dashboard bundle
        // until someone actually uploads a file.
        const XLSX = await import('xlsx')
        const wb = XLSX.read(await file.arrayBuffer(), { type: 'array', raw: false })
        const ws = wb.Sheets[wb.SheetNames[0]]
        if (!ws) throw new Error('The file has no sheets.')
        const sheet = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1, raw: false, defval: '' })
        if (sheet.length > MAX_SHEET_ROWS) {
          throw new Error(`File has ${sheet.length} rows — the limit is ${MAX_SHEET_ROWS}. Email it to jim@propertysentinel.io instead.`)
        }

        const res = await fetch('/api/dashboard/import/start', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ file_name: file.name, file_kind: kind, sheet }),
        })
        const data = (await res.json()) as {
          job_id?: string
          stats?: ParseStats
          total?: number
          error?: string
        }
        if (!res.ok || !data.job_id) throw new Error(data.error ?? 'Upload failed')
        setJobId(data.job_id)
        setParseStats(data.stats ?? null)
        setProgress({ processed: 0, total: data.total ?? 0 })
        await driveProcessing(data.job_id)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Something went wrong reading the file.')
        setStep('drop')
      }
    },
    [driveProcessing]
  )

  // A file handed over from AddPropertyModal starts immediately.
  useEffect(() => {
    if (!isOpen || !initialFile) return
    if (startedFileRef.current === initialFile) return
    startedFileRef.current = initialFile
    cancelledRef.current = false
    reset()
    void handleFile(initialFile)
  }, [isOpen, initialFile, handleFile, reset])

  // Opened without a file: resume the latest in-review import (queue
  // behavior), falling back to the dropzone when there is none.
  useEffect(() => {
    if (!isOpen || initialFile) return
    if (resumeCheckedRef.current) return
    resumeCheckedRef.current = true
    fetch('/api/dashboard/import/job')
      .then((r) => r.json())
      .then((data: { job?: JobPayload | null }) => {
        if (data.job && (data.job.status === 'review' || data.job.status === 'committed')) {
          applyJob(data.job)
        }
      })
      .catch(() => {})
  }, [isOpen, initialFile, applyJob])

  const commitToQueue = useCallback(async () => {
    if (!jobId || committing) return
    setCommitting(true)
    setError(null)
    try {
      const res = await fetch('/api/dashboard/import/commit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ job_id: jobId }),
      })
      const data = (await res.json()) as { staged?: number; error?: string }
      if (!res.ok) throw new Error(data.error ?? 'Could not add to queue')
      setJobStatus('committed')
      onClose()
      // Defer so this modal unmounts before the queue opens on top.
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent('ps:open-staged-queue'))
      }, 0)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not add to queue')
    } finally {
      setCommitting(false)
    }
  }, [jobId, committing, onClose])

  useEffect(() => {
    cancelledRef.current = !isOpen
  }, [isOpen])

  // ── Review grouping ────────────────────────────────────────────────────
  // Units group by their extracted address; the group's resolution comes
  // from the job results keyed by that same string. Summary rows are pure
  // noise ("Total, 593 Units") and are dropped from the review entirely.
  const groups = useMemo(() => {
    const map = new Map<string, ReviewUnit[]>()
    for (const u of units) {
      if (u.flags.includes('summary_row')) continue
      const key = u.address ?? `__row_${u.key}`
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(u)
    }
    const list = [...map.entries()].map(([key, list]) => {
      const resolution = resolutions[key] ?? null
      return { key, units: list, resolution, hasAddress: !key.startsWith('__row_') }
    })
    // Rows that need a human float to the top; verified sink below. Sort is
    // stable, so file order holds within each band.
    const rank = (g: (typeof list)[number]): number => {
      if (!g.hasAddress) return 0
      const m = g.resolution?.match
      return !m || m === 'nearest' || m === 'no_match' ? 0 : 1
    }
    return list.sort((a, b) => rank(a) - rank(b))
  }, [units, resolutions])

  const totalPages = Math.max(1, Math.ceil(groups.length / perPage))
  const pageClamped = Math.min(page, totalPages)
  const pageGroups = useMemo(
    () => groups.slice((pageClamped - 1) * perPage, pageClamped * perPage),
    [groups, pageClamped, perPage]
  )

  const selected = useMemo(() => units.filter((u) => u.included && u.address), [units])
  const selectedProperties = useMemo(
    () => new Set(selected.map((u) => u.address)).size,
    [selected]
  )
  const flaggedGroups = useMemo(
    () =>
      groups.filter(
        (g) =>
          !g.hasAddress ||
          !g.resolution ||
          g.resolution.match === 'nearest' ||
          g.resolution.match === 'no_match'
      ).length,
    [groups]
  )

  const setUnitField = useCallback((key: number, patch: Partial<ReviewUnit>) => {
    setUnits((prev) => prev.map((u) => (u.key === key ? { ...u, ...patch } : u)))
  }, [])

  const toggleUnitIncluded = useCallback(
    (u: ReviewUnit, included: boolean) => {
      setUnitField(u.key, { included })
      persistRows(jobId, [{ row_num: u.row_num, included }])
    },
    [jobId, persistRows, setUnitField]
  )

  const setGroupIncluded = useCallback(
    (groupUnits: ReviewUnit[], included: boolean) => {
      const keys = new Set(groupUnits.map((u) => u.key))
      setUnits((prev) => prev.map((u) => (keys.has(u.key) ? { ...u, included } : u)))
      persistRows(jobId, groupUnits.map((u) => ({ row_num: u.row_num, included })))
    },
    [jobId, persistRows]
  )

  const recheckAddress = useCallback(
    async (oldKey: string) => {
      if (!jobId) return
      const draft = (groupDrafts[oldKey] ?? '').trim()
      if (!draft || draft === oldKey) return
      setRechecking((prev) => ({ ...prev, [oldKey]: true }))
      try {
        const res = await fetch('/api/dashboard/import/reresolve', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ job_id: jobId, address: draft }),
        })
        const data = (await res.json()) as { resolution?: ImportResolution; error?: string }
        if (!res.ok || !data.resolution) throw new Error(data.error ?? 'Check failed')
        const resolution = data.resolution
        setResolutions((prev) => ({ ...prev, [draft]: resolution }))
        // Repoint every unit in the group at the corrected address string.
        setUnits((prev) => prev.map((u) => (u.address === oldKey ? { ...u, address: draft } : u)))
        setGroupDrafts((prev) => {
          const next = { ...prev }
          delete next[oldKey]
          return next
        })
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Address check failed')
      } finally {
        setRechecking((prev) => ({ ...prev, [oldKey]: false }))
      }
    },
    [jobId, groupDrafts]
  )

  if (!isOpen) return null
  if (typeof window === 'undefined') return null

  const handleClose = () => {
    cancelledRef.current = true
    startedFileRef.current = null
    resumeCheckedRef.current = false
    reset()
    onClose()
  }

  const shownProcessed = Math.max(smoothProcessed, 0)
  const pct = progress.total > 0 ? Math.round((shownProcessed / progress.total) * 100) : 0
  const remainingMs = Math.max(0, progress.total - shownProcessed) * paceRef.current.msPerAddr
  const remainingLabel =
    progress.total === 0 || shownProcessed === 0
      ? null
      : remainingMs < 60_000
        ? 'under a minute left'
        : `about ${Math.ceil(remainingMs / 60_000)} min left`

  return createPortal(
    <div className="save-modal-backdrop sq-backdrop" onClick={handleClose} role="presentation">
      <div
        className="sq-modal"
        style={modalStyle}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-labelledby="import-rentroll-title"
        aria-modal="true"
      >
        <div style={headerStyle}>
          <div style={{ minWidth: 0 }}>
            <div style={headTopStyle}>
              <div id="import-rentroll-title" style={titleStyle}>
                {step === 'review' ? 'Review your portfolio' : 'Upload your rent roll'}
              </div>
              <button type="button" className="ir-close" onClick={handleClose} aria-label="Close">
                &times;
              </button>
            </div>
            <div style={headerSubStyle}>
              {step === 'review' ? (
                <>
                  {fileName} · {selectedProperties} propert{selectedProperties === 1 ? 'y' : 'ies'} ·{' '}
                  {selected.length} unit{selected.length === 1 ? '' : 's'} selected
                  {flaggedGroups > 0 ? ` · ${flaggedGroups} need${flaggedGroups === 1 ? 's' : ''} a look` : ''}
                  <div style={{ marginTop: 2, color: '#8a94a0', fontSize: 12 }}>
                    You can edit property and unit-level details in your dashboard at any time.
                  </div>
                </>
              ) : (
                'CSV or Excel, any format — we pull out the addresses, units, and rents.'
              )}
            </div>
          </div>
        </div>

        <div style={bodyStyle}>
          {step === 'drop' ? (
            <div
              className={`ir-dropzone${dragOver ? ' ir-dropzone-over' : ''}`}
              onDragOver={(e) => {
                e.preventDefault()
                setDragOver(true)
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault()
                setDragOver(false)
                const file = e.dataTransfer.files?.[0]
                if (file) void handleFile(file)
              }}
              onClick={() => fileInputRef.current?.click()}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') fileInputRef.current?.click()
              }}
            >
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#0f2744" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
              <div className="ir-dropzone-title">Drop in your rent roll</div>
              <div className="ir-dropzone-sub">
                Drag a file here, or click to browse. {ACCEPTED_EXTENSIONS.join(', ')} up to 10 MB.
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept={ACCEPTED_EXTENSIONS.join(',')}
                style={{ display: 'none' }}
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) void handleFile(file)
                  e.target.value = ''
                }}
              />
              {error ? <div className="ir-error">{error}</div> : null}
            </div>
          ) : null}

          {step === 'reading' ? (
            <div className="ir-progress-wrap">
              <div className="ir-progress-label">Reading {fileName}…</div>
              <div className="ir-progress-track">
                <div className="ir-progress-fill ir-progress-indeterminate" />
              </div>
            </div>
          ) : null}

          {step === 'resolving' ? (
            <div className="ir-progress-wrap">
              <div className="ir-progress-label">
                Checking {progress.total} address{progress.total === 1 ? '' : 'es'} against city records…{' '}
                <span className="ir-progress-count">
                  {shownProcessed}/{progress.total}
                  {remainingLabel ? ` · ${remainingLabel}` : ''}
                </span>
              </div>
              <div className="ir-progress-track">
                <div className="ir-progress-fill" style={{ width: `${pct}%` }} />
              </div>
              {parseStats ? (
                <div className="ir-progress-note">
                  {parseStats.parsed_rows - parseStats.flag_counts.summary_row} unit rows found ·{' '}
                  {parseStats.distinct_addresses} distinct properties
                </div>
              ) : null}
            </div>
          ) : null}

          {step === 'review' ? (
            <div>
              {error ? <div className="ir-error" style={{ marginBottom: 10 }}>{error}</div> : null}
              {pageGroups.map((g) => {
                const res = g.resolution
                const green = res && (res.match === 'verified' || res.match === 'range')
                const amber = g.hasAddress && res && (res.match === 'no_match' || res.match === 'nearest')
                const groupIncluded = g.units.some((u) => u.included)
                const expanded = expandedGroups[g.key] ?? false
                return (
                  <div key={g.key} className="ir-group">
                    <div
                      className="ir-group-head ir-group-head-click"
                      onClick={() => setExpandedGroups((prev) => ({ ...prev, [g.key]: !expanded }))}
                    >
                      <input
                        type="checkbox"
                        checked={groupIncluded}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => setGroupIncluded(g.units, e.target.checked)}
                        aria-label="Include property"
                      />
                      <span className="ir-chip-slot">
                        {g.hasAddress && res ? (
                          green ? (
                            <span className="ir-chip ir-chip-ok" title="Matched to city records">
                              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                                <polyline points="20 6 9 17 4 12" />
                              </svg>
                            </span>
                          ) : (
                            <span className="ir-chip ir-chip-warn" title={res.match === 'nearest' ? 'Matched to a nearby parcel — confirm' : 'No city record found — edit the address'}>
                              {res.match === 'nearest' ? 'Check match' : 'Not found'}
                            </span>
                          )
                        ) : (
                          <span className="ir-chip ir-chip-warn">Needs address</span>
                        )}
                      </span>

                      <div className="ir-group-addr">
                        {amber ? (
                          <span className="ir-addr-edit" onClick={(e) => e.stopPropagation()}>
                            <input
                              className="ir-addr-input"
                              value={groupDrafts[g.key] ?? g.key}
                              onChange={(e) =>
                                setGroupDrafts((prev) => ({ ...prev, [g.key]: e.target.value }))
                              }
                              onBlur={() => void recheckAddress(g.key)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
                              }}
                              aria-label="Edit address"
                            />
                            {rechecking[g.key] ? (
                              <span className="ir-range-note">checking…</span>
                            ) : null}
                          </span>
                        ) : (
                          <span className="ir-addr-text">
                            {g.hasAddress ? (res?.canonical_address ?? g.key) : (g.units[0]?.raw_address || '(empty row)')}
                          </span>
                        )}
                        {res?.address_range && green ? (
                          <span className="ir-range-note">{res.address_range}</span>
                        ) : null}
                        {res?.match === 'nearest' && res.nearest_distance !== null && !rechecking[g.key] ? (
                          <span className="ir-range-note">
                            closest parcel: {res.canonical_address}
                          </span>
                        ) : null}
                        {res?.match === 'no_match' && res.nearest_suggestion && !rechecking[g.key] ? (
                          <span className="ir-range-note">did you mean {res.nearest_suggestion}?</span>
                        ) : null}
                      </div>

                      <span className="ir-group-count">
                        {g.units.length} unit{g.units.length === 1 ? '' : 's'}
                      </span>
                      <svg
                        className={`ir-chevron${expanded ? ' ir-chevron-open' : ''}`}
                        width="14" height="14" viewBox="0 0 24 24" fill="none"
                        stroke="#8a94a0" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"
                        aria-hidden
                      >
                        <polyline points="6 9 12 15 18 9" />
                      </svg>
                    </div>

                    {expanded ? (
                      <table className="ir-units">
                        <tbody>
                          {g.units.map((u) => (
                            <tr key={u.key} className={u.included ? undefined : 'ir-unit-excluded'}>
                              <td className="ir-unit-check">
                                <input
                                  type="checkbox"
                                  checked={u.included}
                                  onChange={(e) => toggleUnitIncluded(u, e.target.checked)}
                                  aria-label="Include unit"
                                />
                              </td>
                              <td className="ir-unit-label">
                                <input
                                  className="ir-cell-input"
                                  value={u.draft_unit_label}
                                  placeholder="Unit"
                                  onChange={(e) => setUnitField(u.key, { draft_unit_label: e.target.value })}
                                  onBlur={() =>
                                    persistRows(jobId, [
                                      { row_num: u.row_num, unit_label: u.draft_unit_label.trim() || null },
                                    ])
                                  }
                                  aria-label="Unit label"
                                />
                              </td>
                              <td className="ir-unit-rent">
                                <span className="ir-rent-wrap">
                                  <span className="ir-rent-sigil">$</span>
                                  <input
                                    className="ir-cell-input ir-cell-rent"
                                    value={u.draft_rent}
                                    placeholder="—"
                                    inputMode="decimal"
                                    onChange={(e) => setUnitField(u.key, { draft_rent: e.target.value })}
                                    onBlur={() =>
                                      persistRows(jobId, [
                                        { row_num: u.row_num, rent: u.draft_rent.trim() || null },
                                      ])
                                    }
                                    aria-label="Monthly rent"
                                  />
                                </span>
                              </td>
                              <td className="ir-unit-bdba">{u.bd_ba ?? ''}</td>
                              <td className="ir-unit-flags">
                                {u.flags.includes('junk_prefix') ? (
                                  <span className="ir-flag" title={`Original: ${u.raw_address}`}>cleaned</span>
                                ) : null}
                                {u.flags.includes('llm_rescued') ? (
                                  <span className="ir-flag" title={`Original: ${u.raw_address}`}>recovered</span>
                                ) : null}
                              </td>
                              <td className="ir-unit-status">{u.status ?? ''}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    ) : null}
                  </div>
                )
              })}

              {totalPages > 1 || groups.length > PER_PAGE_OPTIONS[0] ? (
                <div className="ir-pager">
                  <button
                    type="button"
                    className="ir-pager-btn"
                    disabled={pageClamped <= 1}
                    onClick={() => setPage(pageClamped - 1)}
                  >
                    ‹ Prev
                  </button>
                  <span className="ir-pager-info">
                    {(pageClamped - 1) * perPage + 1}–{Math.min(pageClamped * perPage, groups.length)} of{' '}
                    {groups.length}
                  </span>
                  <button
                    type="button"
                    className="ir-pager-btn"
                    disabled={pageClamped >= totalPages}
                    onClick={() => setPage(pageClamped + 1)}
                  >
                    Next ›
                  </button>
                  <select
                    className="ir-pager-select"
                    value={perPage}
                    onChange={(e) => {
                      setPerPage(Number(e.target.value))
                      setPage(1)
                    }}
                    aria-label="Properties per page"
                  >
                    {PER_PAGE_OPTIONS.map((n) => (
                      <option key={n} value={n}>
                        {n} / page
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>

        {step === 'review' ? (
          <div style={footerStyle}>
            <div style={summaryStyle}>
              {selectedProperties} PROPERTIES · {selected.length} UNITS SELECTED
            </div>
            <button
              type="button"
              className="ps-cta ps-cta-green"
              style={{ padding: '10px 18px', fontSize: 13 }}
              disabled={committing || selected.length === 0}
              onClick={() => void commitToQueue()}
            >
              {committing
                ? 'Adding…'
                : jobStatus === 'committed'
                  ? 'Update queue'
                  : `Add ${selectedProperties} propert${selectedProperties === 1 ? 'y' : 'ies'} to queue`}
            </button>
          </div>
        ) : null}
      </div>
    </div>,
    document.body
  )
}

const modalStyle: CSSProperties = {
  background: '#ffffff',
  borderRadius: 16,
  width: '100%',
  maxWidth: 860,
  maxHeight: '86vh',
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
  boxShadow: '0 20px 60px rgba(15, 39, 68, 0.28)',
}

// Header matches the site contact modal: white card, serif navy title,
// circular light close button — no dark banner.
const headerStyle: CSSProperties = {
  padding: '22px 26px 14px',
  borderBottom: '1px solid #e5e1d6',
  flexShrink: 0,
}

const headTopStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 16,
}

const titleStyle: CSSProperties = {
  fontFamily: 'Merriweather, Georgia, serif',
  fontSize: 22,
  fontWeight: 900,
  color: '#0f2744',
  lineHeight: 1.2,
}

const headerSubStyle: CSSProperties = {
  fontFamily: 'Inter, system-ui, sans-serif',
  fontSize: 13,
  color: '#4a5568',
  marginTop: 4,
}

const bodyStyle: CSSProperties = {
  padding: 22,
  overflowY: 'auto',
  flex: 1,
}

const footerStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 16,
  padding: '14px 22px',
  background: '#f2f0eb',
  borderTop: '1px solid #e8e4dc',
  flexShrink: 0,
}

const summaryStyle: CSSProperties = {
  fontFamily: 'DM Mono, ui-monospace, monospace',
  fontSize: 11,
  color: '#0f2744',
}
