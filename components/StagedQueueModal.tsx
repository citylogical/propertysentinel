'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import {
  bandForUnits,
  bandIndexForUnits,
  bandLabel,
  MAX_TIER_UNITS,
  PORTFOLIO_BANDS,
  type PortfolioBand,
} from '@/lib/pricing'

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
  // Wizard: 'queue' (review/edit rows) → 'plan' (pick a band → Stripe).
  // Entitled accounts never see 'plan' — the commit route promotes directly.
  const [step, setStep] = useState<'queue' | 'plan'>('queue')
  const [billing, setBilling] = useState<'yearly' | 'monthly'>('yearly')
  const [planChoice, setPlanChoice] = useState<'recommended' | 'custom'>('recommended')
  const [customTierIdx, setCustomTierIdx] = useState(0)
  const [committing, setCommitting] = useState(false)
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
    setStep('queue')
    setBilling('yearly')
    setPlanChoice('recommended')
    setCommitting(false)
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

  const recommendedIdx = bandIndexForUnits(totalUnits)
  const chosenBand: PortfolioBand | null =
    planChoice === 'recommended'
      ? recommendedIdx !== null
        ? PORTFOLIO_BANDS[recommendedIdx]
        : null
      : PORTFOLIO_BANDS[customTierIdx]
  const chosenTier =
    planChoice === 'recommended'
      ? recommendedIdx !== null
        ? recommendedIdx + 1
        : null
      : customTierIdx + 1

  // Effective rate at the top of the band, e.g. $250/mo ÷ 100 units = $2.50/unit.
  const perUnitText = (b: PortfolioBand) => {
    const rate = (billing === 'yearly' ? b.annualMonthly : b.monthly) / b.cap
    return `$${Number.isInteger(rate) ? rate : rate.toFixed(2)}/unit`
  }

  const priceText = (b: PortfolioBand) =>
    billing === 'yearly'
      ? `$${b.annualMonthly.toLocaleString()}/mo billed annually ($${(b.annualMonthly * 12).toLocaleString()}/yr), ${perUnitText(b)}`
      : `$${b.monthly.toLocaleString()}/mo, ${perUnitText(b)}`

  // The server is the authority on entitlement: entitled accounts get their
  // rows promoted directly (no Stripe); everyone else advances to the plan
  // step here.
  const handleCommit = async () => {
    if (!canCommit || committing) return
    setCommitting(true)
    try {
      const res = await fetch('/api/dashboard/stage/commit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ staged_ids: selectedRows.map((r) => r.id) }),
      })
      const data = (await res.json()) as {
        promoted?: number
        requires_checkout?: boolean
        error?: string
      }
      if (data.promoted) {
        window.location.assign('/dashboard/portfolio')
        return
      }
      if (data.requires_checkout) {
        setCustomTierIdx(recommendedIdx ?? PORTFOLIO_BANDS.length - 1)
        setPlanChoice('recommended')
        setStep('plan')
        return
      }
      showNotice(data.error || 'Could not save — try again')
    } catch {
      showNotice('Could not save — try again')
    } finally {
      setCommitting(false)
    }
  }

  const handleStartTrial = async () => {
    if (chosenTier === null || committing) return
    setCommitting(true)
    try {
      const res = await fetch('/api/stripe/checkout-portfolio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tier: chosenTier,
          interval: billing,
          staged_ids: selectedRows.map((r) => r.id),
          return_path: '/dashboard/portfolio',
        }),
      })
      const data = (await res.json()) as { url?: string; error?: string }
      if (data.url) {
        window.location.href = data.url
        return
      }
      showNotice(data.error || 'Could not open checkout — try again')
    } catch {
      showNotice('Could not open checkout — try again')
    } finally {
      setCommitting(false)
    }
  }

  if (!isOpen) return null
  if (typeof window === 'undefined') return null

  return createPortal(
    <div className="save-modal-backdrop" onClick={onClose} role="presentation">
      <div
        style={modalStyle}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-labelledby="staged-queue-title"
        aria-modal="true"
      >
        <div style={headerStyle}>
          <div>
            <div id="staged-queue-title" style={titleStyle}>
              {step === 'plan' ? 'Choose your plan' : 'Review added properties'}
            </div>
            <div style={headerSubStyle}>
              {step === 'plan' ? (
                <>
                  {selectedRows.length} propert{selectedRows.length === 1 ? 'y' : 'ies'} ·{' '}
                  {totalUnits.toLocaleString()} unit{totalUnits === 1 ? '' : 's'} · 30-day free
                  trial, $0 due today
                </>
              ) : (
                <>
                  {rows.length} propert{rows.length === 1 ? 'y' : 'ies'} in your queue · enter unit
                  counts, then save to your portfolio
                </>
              )}
            </div>
          </div>
          <button type="button" style={closeBtnStyle} onClick={onClose} aria-label="Close">
            &times;
          </button>
        </div>

        <div style={bodyStyle}>
          {step === 'plan' ? (
            <div>
              <div style={planTopRowStyle}>
                <button type="button" style={backLinkStyle} onClick={() => setStep('queue')}>
                  &larr; Back to queue
                </button>
                {recommendedIdx !== null && (
                  <div style={billingToggleWrapStyle} role="group" aria-label="Billing interval">
                    <button
                      type="button"
                      style={billing === 'yearly' ? billingOnStyle : billingOffStyle}
                      onClick={() => setBilling('yearly')}
                    >
                      Annual · save 20%
                    </button>
                    <button
                      type="button"
                      style={billing === 'monthly' ? billingOnStyle : billingOffStyle}
                      onClick={() => setBilling('monthly')}
                    >
                      Monthly
                    </button>
                  </div>
                )}
              </div>

              {recommendedIdx === null ? (
                <div style={maxPanelStyle}>
                  <div style={planTitleStyle}>Over {MAX_TIER_UNITS} units</div>
                  <p style={maxPanelTextStyle}>
                    Portfolios this size get a custom plan. Reach out and we&apos;ll set you up —
                    your queue stays saved in the meantime.
                  </p>
                  <a
                    href={`mailto:jim@propertysentinel.io?subject=${encodeURIComponent(`Custom plan (${totalUnits.toLocaleString()} units)`)}`}
                    style={contactBtnStyle}
                  >
                    Contact us
                  </a>
                </div>
              ) : (
                <>
                  <label style={planRowStyle(planChoice === 'recommended')}>
                    <input
                      type="radio"
                      name="plan-choice"
                      checked={planChoice === 'recommended'}
                      onChange={() => setPlanChoice('recommended')}
                      style={radioStyle}
                    />
                    <div>
                      <div style={planTagStyle}>
                        Recommended for your {totalUnits.toLocaleString()} unit
                        {totalUnits === 1 ? '' : 's'}
                      </div>
                      <div style={planTitleStyle}>
                        {bandLabel(PORTFOLIO_BANDS[recommendedIdx])}
                      </div>
                      <div style={planPriceStyle}>{priceText(PORTFOLIO_BANDS[recommendedIdx])}</div>
                    </div>
                  </label>

                  <label style={planRowStyle(planChoice === 'custom')}>
                    <input
                      type="radio"
                      name="plan-choice"
                      checked={planChoice === 'custom'}
                      onChange={() => setPlanChoice('custom')}
                      style={radioStyle}
                    />
                    <div>
                      <div style={planTitleStyle}>
                        Adding more units or a fluctuating portfolio size?
                      </div>
                      <div style={planPriceStyle}>See more prices</div>
                    </div>
                  </label>

                  {planChoice === 'custom' && (
                    <div style={subPlanListStyle}>
                      {PORTFOLIO_BANDS.map((b, i) => (
                        <label key={b.cap} style={subPlanRowStyle(customTierIdx === i)}>
                          <input
                            type="radio"
                            name="custom-tier"
                            checked={customTierIdx === i}
                            onChange={() => setCustomTierIdx(i)}
                            style={radioStyle}
                          />
                          <span style={subPlanLabelStyle}>{bandLabel(b)}</span>
                          <span style={subPlanPriceStyle}>{priceText(b)}</span>
                        </label>
                      ))}
                      {PORTFOLIO_BANDS[customTierIdx].cap < totalUnits && (
                        <div style={planNoteStyle}>
                          This plan covers fewer units than the {totalUnits.toLocaleString()} you
                          selected — you can change plans anytime.
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          ) : loading ? (
            <div style={emptyStyle}>Loading your queue…</div>
          ) : rows.length === 0 ? (
            <div style={emptyStyle}>
              Nothing in your queue. Search any Chicago address and click the + button to add it.
            </div>
          ) : (
            <div>
              <div style={{ ...gridRowStyle, ...headRowStyle }}>
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleAll}
                  aria-label={allSelected ? 'Deselect all' : 'Select all'}
                  style={checkboxStyle}
                />
                <div style={headLabelStyle}>Property name</div>
                <div style={headLabelStyle}>Address</div>
                <div style={{ ...headLabelStyle, textAlign: 'center' }}>Units</div>
                <div />
              </div>

              {rows.map((row) => {
                const isRowSelected = selected.has(row.id)
                const rowMissingUnits =
                  isRowSelected && parseUnitsInput(unitsDraft[row.id] ?? '') == null
                return (
                  <div key={row.id} style={gridRowStyle}>
                    <input
                      type="checkbox"
                      checked={isRowSelected}
                      onChange={() => toggleRow(row.id)}
                      aria-label={`Select ${row.property_name || row.canonical_address}`}
                      style={checkboxStyle}
                    />
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
                    <a
                      href={`/address/${row.slug}?building=true`}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={addressCellStyle}
                      title={row.address_range ?? row.canonical_address}
                    >
                      {row.address_range || row.canonical_address}
                    </a>
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
                      style={{
                        textAlign: 'center',
                        ...(rowMissingUnits ? { borderColor: 'var(--red, #c0392b)' } : null),
                      }}
                    />
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

        {step === 'plan' ? (
          <div style={footerStyle}>
            <div style={{ minWidth: 0 }}>
              <div style={summaryStyle}>
                {chosenBand
                  ? `${bandLabel(chosenBand)} · ${priceText(chosenBand)}`
                  : `${totalUnits.toLocaleString()} units · custom plan`}
              </div>
              <div style={recommendStyle}>
                {chosenBand
                  ? 'Card required · $0 due today · first charge after your 30-day trial'
                  : 'No card needed — we size custom plans by hand.'}
              </div>
            </div>
            {chosenBand ? (
              <button
                type="button"
                onClick={() => void handleStartTrial()}
                disabled={committing}
                style={{
                  ...commitBtnStyle,
                  opacity: committing ? 0.6 : 1,
                  cursor: committing ? 'wait' : 'pointer',
                }}
              >
                {committing ? 'Opening checkout…' : 'Start free trial'}
              </button>
            ) : null}
          </div>
        ) : rows.length > 0 ? (
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
              onClick={() => void handleCommit()}
              disabled={!canCommit || committing}
              style={{
                ...commitBtnStyle,
                opacity: canCommit && !committing ? 1 : 0.45,
                cursor: canCommit && !committing ? 'pointer' : 'not-allowed',
              }}
            >
              {committing ? 'Saving…' : 'Save to portfolio'}
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
  maxWidth: 720,
  maxHeight: '84vh',
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
  fontFamily: 'var(--serif, "Playfair Display", serif)',
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
  padding: '16px 22px 18px',
  overflowY: 'auto',
  flex: '1 1 auto',
}

// checkbox | property name | address | units | remove — shared by the head
// row and data rows so the columns stay aligned.
const gridRowStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '24px minmax(0, 1.2fr) minmax(0, 1fr) 84px 28px',
  gap: 12,
  alignItems: 'center',
  padding: '9px 0',
  borderBottom: '1px solid #f2f0eb',
}

const headRowStyle: CSSProperties = {
  padding: '2px 0 9px',
  borderBottom: '1px solid #e8e4dc',
}

const checkboxStyle: CSSProperties = {
  width: 15,
  height: 15,
  accentColor: '#0f2744',
  cursor: 'pointer',
  justifySelf: 'start',
}

const headLabelStyle: CSSProperties = {
  fontFamily: 'DM Mono, ui-monospace, monospace',
  fontSize: 10,
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  color: '#8a94a0',
}

const addressCellStyle: CSSProperties = {
  minWidth: 0,
  fontFamily: 'DM Mono, ui-monospace, monospace',
  fontSize: 11,
  color: '#4a5568',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  textDecoration: 'underline dotted',
  textDecorationColor: '#b5ad9e',
  textUnderlineOffset: 3,
}

const removeBtnStyle: CSSProperties = {
  width: 28,
  height: 28,
  background: 'none',
  border: 'none',
  borderRadius: 4,
  fontSize: 18,
  lineHeight: 1,
  color: '#8a94a0',
  cursor: 'pointer',
}

// --- Plan step ---

const planTopRowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 16,
  marginBottom: 16,
}

const backLinkStyle: CSSProperties = {
  background: 'none',
  border: 'none',
  padding: 0,
  fontFamily: 'Inter, system-ui, sans-serif',
  fontSize: 12,
  fontWeight: 500,
  color: '#4a5568',
  cursor: 'pointer',
}

// Segmented control: recessed cream track, raised navy pill for the active
// interval so the toggle reads at a glance.
const billingToggleWrapStyle: CSSProperties = {
  display: 'inline-flex',
  gap: 3,
  padding: 3,
  background: '#e8e4dc',
  borderRadius: 8,
  boxShadow: 'inset 0 1px 2px rgba(15, 39, 68, 0.12)',
}

const billingBtnBase: CSSProperties = {
  padding: '7px 14px',
  border: 'none',
  borderRadius: 6,
  fontFamily: 'Inter, system-ui, sans-serif',
  fontSize: 12,
  fontWeight: 600,
  cursor: 'pointer',
}

const billingOnStyle: CSSProperties = {
  ...billingBtnBase,
  background: '#0f2744',
  color: '#ffffff',
  boxShadow: '0 1px 3px rgba(15, 39, 68, 0.35)',
}

const billingOffStyle: CSSProperties = {
  ...billingBtnBase,
  background: 'transparent',
  color: '#4a5568',
}

const planRowStyle = (active: boolean): CSSProperties => ({
  display: 'flex',
  alignItems: 'flex-start',
  gap: 12,
  padding: '14px 16px',
  marginBottom: 10,
  border: active ? '1.5px solid #0f2744' : '1px solid #ddd9d0',
  borderRadius: 8,
  background: active ? '#ffffff' : '#fdfcfa',
  cursor: 'pointer',
})

const radioStyle: CSSProperties = {
  width: 15,
  height: 15,
  marginTop: 2,
  accentColor: '#0f2744',
  cursor: 'pointer',
  flexShrink: 0,
}

const planTagStyle: CSSProperties = {
  fontFamily: 'DM Mono, ui-monospace, monospace',
  fontSize: 10,
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  color: '#2d6a4f',
  marginBottom: 3,
}

const planTitleStyle: CSSProperties = {
  fontFamily: 'Inter, system-ui, sans-serif',
  fontSize: 14,
  fontWeight: 600,
  color: '#0f2744',
}

const planPriceStyle: CSSProperties = {
  fontFamily: 'Inter, system-ui, sans-serif',
  fontSize: 12,
  color: '#4a5568',
  marginTop: 2,
}

const subPlanListStyle: CSSProperties = {
  margin: '2px 0 6px 28px',
}

const subPlanRowStyle = (active: boolean): CSSProperties => ({
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  padding: '8px 12px',
  marginBottom: 6,
  border: active ? '1.5px solid #0f2744' : '1px solid #e8e4dc',
  borderRadius: 6,
  background: '#ffffff',
  cursor: 'pointer',
})

const subPlanLabelStyle: CSSProperties = {
  fontFamily: 'Inter, system-ui, sans-serif',
  fontSize: 13,
  fontWeight: 500,
  color: '#0f2744',
  flex: '0 0 130px',
}

const subPlanPriceStyle: CSSProperties = {
  fontFamily: 'DM Mono, ui-monospace, monospace',
  fontSize: 11,
  color: '#4a5568',
}

const planNoteStyle: CSSProperties = {
  marginTop: 4,
  fontSize: 11,
  color: '#b7791f',
  lineHeight: 1.4,
}

const maxPanelStyle: CSSProperties = {
  padding: '24px 20px',
  border: '1px solid #e8e4dc',
  borderRadius: 8,
  background: '#fdfcfa',
  textAlign: 'center',
}

const maxPanelTextStyle: CSSProperties = {
  fontSize: 13,
  color: '#4a5568',
  lineHeight: 1.5,
  margin: '8px auto 16px',
  maxWidth: 380,
}

const contactBtnStyle: CSSProperties = {
  display: 'inline-block',
  padding: '10px 20px',
  background: '#0f2744',
  color: '#ffffff',
  borderRadius: 6,
  fontFamily: 'Inter, system-ui, sans-serif',
  fontSize: 13,
  fontWeight: 600,
  textDecoration: 'none',
}

const emptyStyle: CSSProperties = {
  padding: '32px 8px',
  textAlign: 'center',
  fontSize: 13,
  color: '#4a5568',
}

const noticeStyle: CSSProperties = {
  marginTop: 12,
  padding: '8px 12px',
  background: '#fef3c7',
  border: '1px solid #d97706',
  borderRadius: 6,
  fontSize: 12,
  color: '#0f2744',
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
