'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { bandForUnits, bandLabel, MAX_TIER_UNITS } from '@/lib/pricing'

// The staging-queue review modal for the onboarding/activation flow.
// Opens from the dashboard ("Review added properties") and from the green
// check on an address page. Rows live in staged_properties; units and
// property name are editable inline (saved on blur), rows are removable,
// and "Save to portfolio" stays disabled until every SELECTED row has a
// unit count. Checkout wiring is the next build step — the button currently
// reports that in place.

export type StagedRow = {
  id: string
  canonical_address: string
  slug: string
  property_name: string | null
  units: number | null
  address_range: string | null
  status: string
  created_at: string
}

type Props = {
  isOpen: boolean
  onClose: () => void
  /** Fired whenever the queue size changes (remove), so triggers can update badges. */
  onQueueChange?: (count: number) => void
}

function parseUnitsInput(raw: string): number | null {
  const t = raw.replace(/,/g, '').trim()
  if (t === '') return null
  const n = parseInt(t, 10)
  return Number.isFinite(n) && n > 0 ? n : null
}

export default function StagedQueueModal({ isOpen, onClose, onQueueChange }: Props) {
  const [rows, setRows] = useState<StagedRow[]>([])
  const [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  // Local text state for units inputs so typing isn't fought by row state.
  const [unitsDraft, setUnitsDraft] = useState<Record<string, string>>({})
  const [nameDraft, setNameDraft] = useState<Record<string, string>>({})
  const [notice, setNotice] = useState<string | null>(null)
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const showNotice = useCallback((text: string) => {
    if (noticeTimer.current) clearTimeout(noticeTimer.current)
    setNotice(text)
    noticeTimer.current = setTimeout(() => setNotice(null), 3200)
  }, [])

  useEffect(() => {
    return () => {
      if (noticeTimer.current) clearTimeout(noticeTimer.current)
    }
  }, [])

  useEffect(() => {
    if (!isOpen) return
    let cancelled = false
    setLoading(true)
    fetch('/api/dashboard/stage?list=1')
      .then((res) => res.json())
      .then((data: { rows?: StagedRow[]; staged_count?: number }) => {
        if (cancelled) return
        const fetched = data.rows ?? []
        setRows(fetched)
        // Default: everything selected — committing the whole queue is the
        // common case; deselecting is the exception.
        setSelected(new Set(fetched.map((r) => r.id)))
        setUnitsDraft(
          Object.fromEntries(fetched.map((r) => [r.id, r.units != null ? String(r.units) : '']))
        )
        setNameDraft(Object.fromEntries(fetched.map((r) => [r.id, r.property_name ?? ''])))
        onQueueChange?.(data.staged_count ?? fetched.length)
      })
      .catch(() => {
        if (!cancelled) showNotice('Could not load your queue — try again')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
    // onQueueChange deliberately omitted: refetch only on open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, showNotice])

  const toggleRow = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const allSelected = rows.length > 0 && selected.size === rows.length
  const toggleAll = () => {
    setSelected(allSelected ? new Set() : new Set(rows.map((r) => r.id)))
  }

  const persistField = useCallback(
    (id: string, field: 'units' | 'property_name', value: number | string | null) => {
      fetch('/api/dashboard/stage', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, [field]: value }),
      }).catch(() => showNotice('Could not save your change — try again'))
    },
    [showNotice]
  )

  const handleUnitsBlur = (row: StagedRow) => {
    const parsed = parseUnitsInput(unitsDraft[row.id] ?? '')
    setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, units: parsed } : r)))
    if (parsed !== row.units) persistField(row.id, 'units', parsed)
  }

  const handleNameBlur = (row: StagedRow) => {
    const name = (nameDraft[row.id] ?? '').trim() || null
    setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, property_name: name } : r)))
    if (name !== row.property_name) persistField(row.id, 'property_name', name)
  }

  const removeRow = async (row: StagedRow) => {
    try {
      const res = await fetch(`/api/dashboard/stage?id=${encodeURIComponent(row.id)}`, {
        method: 'DELETE',
      })
      if (!res.ok) throw new Error()
      setRows((prev) => {
        const next = prev.filter((r) => r.id !== row.id)
        onQueueChange?.(next.length)
        return next
      })
      setSelected((prev) => {
        const next = new Set(prev)
        next.delete(row.id)
        return next
      })
    } catch {
      showNotice('Could not remove — try again')
    }
  }

  const selectedRows = useMemo(() => rows.filter((r) => selected.has(r.id)), [rows, selected])
  const missingUnits = selectedRows.filter((r) => r.units == null || r.units <= 0)
  const totalUnits = selectedRows.reduce((sum, r) => sum + (r.units ?? 0), 0)
  const canCommit = selectedRows.length > 0 && missingUnits.length === 0
  const band = canCommit ? bandForUnits(totalUnits) : null
  const isMaxTier = canCommit && totalUnits > MAX_TIER_UNITS

  const handleCommit = () => {
    if (!canCommit) return
    // Step 5 wires this to band selection → Stripe Checkout (30-day trial,
    // card up front, $0 today). Until then, make the state visible.
    showNotice('Checkout wiring is the next build step — your queue is saved.')
  }

  if (!isOpen) return null
  if (typeof window === 'undefined') return null

  return createPortal(
    <div className="save-modal-backdrop" onClick={onClose} role="presentation">
      <div
        className="save-modal"
        style={{ maxWidth: 720 }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-labelledby="staged-queue-title"
        aria-modal="true"
      >
        <div className="save-modal-header">
          <div>
            <div id="staged-queue-title" className="save-modal-title">
              Review added properties
            </div>
            <div className="save-modal-sub">
              {rows.length} propert{rows.length === 1 ? 'y' : 'ies'} in your queue · enter unit
              counts, then save to your portfolio
            </div>
          </div>
          <button type="button" className="save-modal-close" onClick={onClose} aria-label="Close">
            &times;
          </button>
        </div>

        <div className="save-modal-body">
          {loading ? (
            <div style={emptyStyle}>Loading your queue…</div>
          ) : rows.length === 0 ? (
            <div style={emptyStyle}>
              Nothing in your queue. Search any Chicago address and click the + button to add it.
            </div>
          ) : (
            <div>
              <div style={{ ...rowStyle, borderBottom: '1px solid var(--border, #ddd9d0)' }}>
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleAll}
                  aria-label={allSelected ? 'Deselect all' : 'Select all'}
                  style={checkboxStyle}
                />
                <div style={{ ...headLabelStyle, flex: '1 1 200px' }}>Property name</div>
                <div style={{ ...headLabelStyle, flex: '1 1 180px' }}>Address</div>
                <div style={{ ...headLabelStyle, width: 72, flexShrink: 0 }}>Units</div>
                <div style={{ width: 28, flexShrink: 0 }} />
              </div>

              {rows.map((row) => {
                const isRowSelected = selected.has(row.id)
                const rowMissingUnits =
                  isRowSelected && parseUnitsInput(unitsDraft[row.id] ?? '') == null
                return (
                  <div key={row.id} style={rowStyle}>
                    <input
                      type="checkbox"
                      checked={isRowSelected}
                      onChange={() => toggleRow(row.id)}
                      aria-label={`Select ${row.property_name || row.canonical_address}`}
                      style={checkboxStyle}
                    />
                    <div style={{ flex: '1 1 200px', minWidth: 0 }}>
                      <input
                        className="save-field-input"
                        type="text"
                        value={nameDraft[row.id] ?? ''}
                        onChange={(e) =>
                          setNameDraft((prev) => ({ ...prev, [row.id]: e.target.value }))
                        }
                        onBlur={() => handleNameBlur(row)}
                        placeholder="Property name"
                        aria-label="Property name"
                      />
                    </div>
                    <div style={addressCellStyle} title={row.address_range ?? row.canonical_address}>
                      {row.address_range || row.canonical_address}
                    </div>
                    <div style={{ width: 72, flexShrink: 0 }}>
                      <input
                        className="save-field-input"
                        type="text"
                        inputMode="numeric"
                        value={unitsDraft[row.id] ?? ''}
                        onChange={(e) =>
                          setUnitsDraft((prev) => ({ ...prev, [row.id]: e.target.value }))
                        }
                        onBlur={() => handleUnitsBlur(row)}
                        placeholder="—"
                        aria-label="Unit count"
                        style={
                          rowMissingUnits
                            ? { borderColor: 'var(--red, #c0392b)' }
                            : undefined
                        }
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => void removeRow(row)}
                      aria-label={`Remove ${row.property_name || row.canonical_address} from queue`}
                      title="Remove from queue"
                      style={removeBtnStyle}
                    >
                      &times;
                    </button>
                  </div>
                )
              })}
            </div>
          )}

          {notice && (
            <div role="status" style={noticeStyle}>
              {notice}
            </div>
          )}
        </div>

        {rows.length > 0 && (
          <div style={footerStyle}>
            <div style={{ minWidth: 0 }}>
              <div style={summaryStyle}>
                {selectedRows.length} of {rows.length} selected · {totalUnits.toLocaleString()}{' '}
                unit{totalUnits === 1 ? '' : 's'}
              </div>
              <div style={recommendStyle}>
                {!canCommit ? (
                  selectedRows.length === 0 ? (
                    'Select the properties you want to monitor.'
                  ) : (
                    `Enter a unit count for ${missingUnits.length === 1 ? 'the highlighted property' : `all ${missingUnits.length} highlighted properties`} to continue.`
                  )
                ) : isMaxTier ? (
                  <>Over {MAX_TIER_UNITS} units — we&apos;ll set you up on a custom plan.</>
                ) : band ? (
                  <>
                    Recommended plan: <strong>{bandLabel(band)}</strong> — ${band.monthly}/mo, or $
                    {band.annualMonthly}/mo billed annually. 30-day free trial either way.
                  </>
                ) : null}
              </div>
            </div>
            <button
              type="button"
              onClick={handleCommit}
              disabled={!canCommit}
              style={{
                ...commitBtnStyle,
                opacity: canCommit ? 1 : 0.45,
                cursor: canCommit ? 'pointer' : 'not-allowed',
              }}
            >
              Save to portfolio
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body
  )
}

const rowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  padding: '8px 0',
}

const checkboxStyle: CSSProperties = {
  width: 15,
  height: 15,
  flexShrink: 0,
  accentColor: '#0f2744',
  cursor: 'pointer',
}

const headLabelStyle: CSSProperties = {
  fontFamily: 'DM Mono, ui-monospace, monospace',
  fontSize: 10,
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  color: '#8a94a0',
}

const addressCellStyle: CSSProperties = {
  flex: '1 1 180px',
  minWidth: 0,
  fontFamily: 'DM Mono, ui-monospace, monospace',
  fontSize: 11,
  color: '#4a5568',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
}

const removeBtnStyle: CSSProperties = {
  width: 28,
  height: 28,
  flexShrink: 0,
  background: 'none',
  border: 'none',
  fontSize: 18,
  lineHeight: 1,
  color: '#8a94a0',
  cursor: 'pointer',
}

const emptyStyle: CSSProperties = {
  padding: '28px 8px',
  textAlign: 'center',
  fontSize: 13,
  color: '#4a5568',
}

const noticeStyle: CSSProperties = {
  marginTop: 10,
  padding: '8px 12px',
  background: '#f2f0eb',
  border: '1px solid #e8e4dc',
  borderRadius: 6,
  fontSize: 12,
  color: '#0f2744',
}

const footerStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 16,
  padding: '14px 20px',
  borderTop: '1px solid var(--border, #ddd9d0)',
}

const summaryStyle: CSSProperties = {
  fontFamily: 'DM Mono, ui-monospace, monospace',
  fontSize: 11,
  color: '#0f2744',
}

const recommendStyle: CSSProperties = {
  fontSize: 12,
  color: '#4a5568',
  marginTop: 3,
  lineHeight: 1.45,
}

const commitBtnStyle: CSSProperties = {
  padding: '10px 20px',
  background: '#166534',
  color: '#ffffff',
  border: 'none',
  borderRadius: 6,
  fontFamily: 'Inter, system-ui, sans-serif',
  fontSize: 13,
  fontWeight: 600,
  whiteSpace: 'nowrap',
  flexShrink: 0,
}
