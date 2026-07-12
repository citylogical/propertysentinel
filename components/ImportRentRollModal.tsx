'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import type { ParsedUnitRow, ParseStats } from '@/lib/rentroll/types'
import { MAX_SHEET_ROWS } from '@/lib/rentroll/types'
import type { ImportResolution } from '@/lib/rentroll/resolve'

// The rent-roll upload flow: drop a CSV/XLSX → the file is parsed in THIS
// browser (SheetJS; the file never leaves the machine — only extracted cell
// text is sent) → /api/dashboard/import/start creates the job → this modal
// drives /import/process until every address is resolved → the review table
// shows green checks (verified/range) and amber rows (nearest/no-match) with
// inline edits and per-address re-checks.
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
  /** Client-side edits (address edits live at the group level). */
  draft_unit_label: string
  draft_rent: string
}

const MAX_FILE_BYTES = 10 * 1024 * 1024
const ACCEPTED_EXTENSIONS = ['.csv', '.xlsx', '.xls']

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
  const fileInputRef = useRef<HTMLInputElement>(null)
  const cancelledRef = useRef(false)
  const startedFileRef = useRef<File | null>(null)

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
  }, [])

  const loadReview = useCallback(async (id: string) => {
    const res = await fetch(`/api/dashboard/import/job?job_id=${encodeURIComponent(id)}`)
    const data = (await res.json()) as {
      job?: { parsed_rows: ParsedUnitRow[]; results: ImportResolution[]; file_name: string | null }
      error?: string
    }
    if (!res.ok || !data.job) throw new Error(data.error ?? 'Could not load results')
    const resultMap: Record<string, ImportResolution> = {}
    for (const r of data.job.results ?? []) resultMap[r.raw_address] = r
    setResolutions(resultMap)
    setUnits(
      (data.job.parsed_rows ?? []).map((row, i) => ({
        ...row,
        key: i,
        included: !row.flags.includes('summary_row'),
        draft_unit_label: row.unit_label ?? '',
        draft_rent: formatMoney(row.rent),
      }))
    )
    setStep('review')
  }, [])

  const driveProcessing = useCallback(
    async (id: string) => {
      setStep('resolving')
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
        setProgress({ processed: data.processed ?? 0, total: data.total ?? 0 })
        if (data.status === 'review') break
        if (data.status !== 'resolving' && data.status !== 'pending') {
          throw new Error(`Unexpected job status: ${data.status}`)
        }
      }
      await loadReview(id)
    },
    [loadReview]
  )

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

  useEffect(() => {
    if (!isOpen) cancelledRef.current = true
    else cancelledRef.current = false
  }, [isOpen])

  // ── Review grouping ────────────────────────────────────────────────────
  // Units group by their extracted address; the group's resolution comes
  // from the job results keyed by that same string. Unaddressed rows
  // (summary/unparsed) form their own single-row groups.
  const groups = useMemo(() => {
    const map = new Map<string, ReviewUnit[]>()
    for (const u of units) {
      const key = u.address ?? `__row_${u.key}`
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(u)
    }
    return [...map.entries()].map(([key, list]) => {
      const resolution = resolutions[key] ?? null
      return { key, units: list, resolution, hasAddress: !key.startsWith('__row_') }
    })
  }, [units, resolutions])

  const selected = useMemo(() => units.filter((u) => u.included && u.address), [units])
  const selectedProperties = useMemo(
    () => new Set(selected.map((u) => u.address)).size,
    [selected]
  )
  const flaggedGroups = useMemo(
    () =>
      groups.filter(
        (g) =>
          g.hasAddress &&
          g.resolution &&
          (g.resolution.match === 'nearest' || g.resolution.match === 'no_match')
      ).length,
    [groups]
  )

  const setUnitField = useCallback((key: number, patch: Partial<ReviewUnit>) => {
    setUnits((prev) => prev.map((u) => (u.key === key ? { ...u, ...patch } : u)))
  }, [])

  const setGroupIncluded = useCallback((address: string, included: boolean) => {
    setUnits((prev) => prev.map((u) => (u.address === address ? { ...u, included } : u)))
  }, [])

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
    reset()
    onClose()
  }

  const pct = progress.total > 0 ? Math.round((progress.processed / progress.total) * 100) : 0

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
          <div>
            <div id="import-rentroll-title" style={titleStyle}>
              {step === 'review' ? 'Review your rent roll' : 'Upload your rent roll'}
            </div>
            <div style={headerSubStyle}>
              {step === 'review' ? (
                <>
                  {fileName} · {selectedProperties} propert{selectedProperties === 1 ? 'y' : 'ies'} ·{' '}
                  {selected.length} unit{selected.length === 1 ? '' : 's'} selected
                  {flaggedGroups > 0 ? ` · ${flaggedGroups} need${flaggedGroups === 1 ? 's' : ''} a look` : ''}
                </>
              ) : (
                'CSV or Excel, any format — we pull out the addresses, units, and rents.'
              )}
            </div>
          </div>
          <button type="button" style={closeBtnStyle} onClick={handleClose} aria-label="Close">
            &times;
          </button>
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
                  {progress.processed}/{progress.total}
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
              {groups.map((g) => {
                const res = g.resolution
                const green = res && (res.match === 'verified' || res.match === 'range')
                const groupIncluded = g.units.some((u) => u.included)
                const isJunk = g.units.every((u) => u.flags.includes('summary_row'))
                return (
                  <div key={g.key} className="ir-group">
                    <div className="ir-group-head">
                      <input
                        type="checkbox"
                        checked={groupIncluded}
                        onChange={(e) =>
                          g.hasAddress
                            ? setGroupIncluded(g.key, e.target.checked)
                            : g.units.forEach((u) => setUnitField(u.key, { included: e.target.checked }))
                        }
                        aria-label="Include property"
                      />
                      {g.hasAddress && res ? (
                        green ? (
                          <span className="ir-chip ir-chip-ok" title="Matched to city records">
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                              <polyline points="20 6 9 17 4 12" />
                            </svg>
                            {res.match === 'range' ? 'Verified · building' : 'Verified'}
                          </span>
                        ) : (
                          <span className="ir-chip ir-chip-warn" title={res.match === 'nearest' ? 'Matched to a nearby parcel — confirm' : 'No city record found — edit the address'}>
                            {res.match === 'nearest' ? 'Check match' : 'Not found'}
                          </span>
                        )
                      ) : isJunk ? (
                        <span className="ir-chip ir-chip-muted">Summary row</span>
                      ) : (
                        <span className="ir-chip ir-chip-warn">Needs address</span>
                      )}

                      <div className="ir-group-addr">
                        {g.hasAddress && res && (res.match === 'no_match' || res.match === 'nearest') ? (
                          <span className="ir-addr-edit">
                            <input
                              className="ir-addr-input"
                              value={groupDrafts[g.key] ?? g.key}
                              onChange={(e) =>
                                setGroupDrafts((prev) => ({ ...prev, [g.key]: e.target.value }))
                              }
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') void recheckAddress(g.key)
                              }}
                              aria-label="Edit address"
                            />
                            <button
                              type="button"
                              className="ir-recheck"
                              disabled={
                                rechecking[g.key] ||
                                !(groupDrafts[g.key] ?? '').trim() ||
                                (groupDrafts[g.key] ?? g.key) === g.key
                              }
                              onClick={() => void recheckAddress(g.key)}
                            >
                              {rechecking[g.key] ? 'Checking…' : 'Re-check'}
                            </button>
                          </span>
                        ) : (
                          <span className="ir-addr-text">
                            {g.hasAddress ? (res?.canonical_address ?? g.key) : (g.units[0]?.raw_address || '(empty row)')}
                          </span>
                        )}
                        {res?.address_range && green ? (
                          <span className="ir-range-note">{res.address_range}</span>
                        ) : null}
                        {res?.match === 'nearest' && res.nearest_distance !== null ? (
                          <span className="ir-range-note">
                            closest parcel: {res.canonical_address}
                          </span>
                        ) : null}
                        {res?.match === 'no_match' && res.nearest_suggestion ? (
                          <span className="ir-range-note">did you mean {res.nearest_suggestion}?</span>
                        ) : null}
                      </div>

                      <span className="ir-group-count">
                        {g.units.length} unit{g.units.length === 1 ? '' : 's'}
                      </span>
                    </div>

                    {!isJunk ? (
                      <table className="ir-units">
                        <tbody>
                          {g.units.map((u) => (
                            <tr key={u.key} className={u.included ? undefined : 'ir-unit-excluded'}>
                              <td className="ir-unit-check">
                                <input
                                  type="checkbox"
                                  checked={u.included}
                                  onChange={(e) => setUnitField(u.key, { included: e.target.checked })}
                                  aria-label="Include unit"
                                />
                              </td>
                              <td className="ir-unit-label">
                                <input
                                  className="ir-cell-input"
                                  value={u.draft_unit_label}
                                  placeholder="Unit"
                                  onChange={(e) => setUnitField(u.key, { draft_unit_label: e.target.value })}
                                  aria-label="Unit label"
                                />
                              </td>
                              <td className="ir-unit-meta">{u.bd_ba ?? ''}</td>
                              <td className="ir-unit-meta">{u.status ?? ''}</td>
                              <td className="ir-unit-rent">
                                <input
                                  className="ir-cell-input ir-cell-rent"
                                  value={u.draft_rent}
                                  placeholder="Rent"
                                  inputMode="decimal"
                                  onChange={(e) => setUnitField(u.key, { draft_rent: e.target.value })}
                                  aria-label="Monthly rent"
                                />
                              </td>
                              <td className="ir-unit-flags">
                                {u.flags.includes('junk_prefix') ? (
                                  <span className="ir-flag" title={`Original: ${u.raw_address}`}>cleaned</span>
                                ) : null}
                                {u.flags.includes('llm_rescued') ? (
                                  <span className="ir-flag" title={`Original: ${u.raw_address}`}>recovered</span>
                                ) : null}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    ) : null}
                  </div>
                )
              })}
            </div>
          ) : null}
        </div>

        {step === 'review' ? (
          <div style={footerStyle}>
            <div style={summaryStyle}>
              {selectedProperties} PROPERTIES · {selected.length} UNITS SELECTED
            </div>
            <button type="button" className="ps-cta ps-cta-green" style={{ padding: '10px 18px', fontSize: 13, opacity: 0.55, cursor: 'default' }} disabled title="Final step — coming in the next build">
              Add to queue (coming next)
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
  borderRadius: 8,
  width: '100%',
  maxWidth: 860,
  maxHeight: '86vh',
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
  boxShadow: '0 16px 48px rgba(15, 39, 68, 0.28)',
}

const headerStyle: CSSProperties = {
  background: '#0f2744',
  padding: '16px 22px',
  display: 'flex',
  alignItems: 'flex-start',
  justifyContent: 'space-between',
  gap: 16,
  flexShrink: 0,
}

const titleStyle: CSSProperties = {
  fontFamily: 'Merriweather, Georgia, serif',
  fontSize: 18,
  fontWeight: 700,
  color: '#ffffff',
  lineHeight: 1.2,
}

const headerSubStyle: CSSProperties = {
  fontFamily: 'Inter, system-ui, sans-serif',
  fontSize: 12,
  color: 'rgba(255, 255, 255, 0.65)',
  marginTop: 4,
}

const closeBtnStyle: CSSProperties = {
  background: 'none',
  border: 'none',
  fontSize: 22,
  lineHeight: 1,
  color: 'rgba(255, 255, 255, 0.7)',
  cursor: 'pointer',
  padding: '0 2px',
  flexShrink: 0,
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
