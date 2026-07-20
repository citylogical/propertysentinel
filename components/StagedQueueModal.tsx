'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { loadStripe } from '@stripe/stripe-js'
import type { StripeEmbeddedCheckout } from '@stripe/stripe-js'
import {
  bandForUnits,
  bandIndexForUnits,
  bandLabel,
  MAX_TIER_UNITS,
  PORTFOLIO_BANDS,
  type PortfolioBand,
} from '@/lib/pricing'

// The staging-queue review modal for the onboarding/activation flow.
// Opens from the dashboard ("Review added properties"), from the green
// check on an address page, and from the demo "Claim portfolio" flow
// (initialStep='plan' with its staged ids preselected). Rows live in
// staged_properties; units and property name are editable inline (saved on
// blur), rows are removable, and "Save to portfolio" stays disabled until
// every SELECTED row has a unit count. Commit promotes entitled accounts
// directly; everyone else goes plan step → embedded Stripe checkout.

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

type PlanContext = {
  kind: 'basic' | 'sentinel' | 'sentinel_trial' | 'enterprise'
  unit_cap: number | null
  portfolio_units: number
}

type Props = {
  isOpen: boolean
  onClose: () => void
  /** Fired whenever the queue size changes (remove), so triggers can update badges. */
  onQueueChange?: (count: number) => void
  /** Open directly on a later step — the demo "Claim portfolio" flow lands on
   *  'plan' after the claim route stages + commit says requires_checkout. */
  initialStep?: 'queue' | 'plan'
  /** Pre-select only these staged row ids (default: everything fetched).
   *  Lets a claim select just its own rows, leaving any pre-existing queue
   *  rows deselected. */
  initialSelectedIds?: string[]
}

function parseUnitsInput(raw: string): number | null {
  const t = raw.replace(/,/g, '').trim()
  if (t === '') return null
  const n = parseInt(t, 10)
  return Number.isFinite(n) && n > 0 ? n : null
}

export default function StagedQueueModal({
  isOpen,
  onClose,
  onQueueChange,
  initialStep,
  initialSelectedIds,
}: Props) {
  const [rows, setRows] = useState<StagedRow[]>([])
  const [plan, setPlan] = useState<PlanContext | null>(null)
  const [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  // Local text state for units inputs so typing isn't fought by row state.
  const [unitsDraft, setUnitsDraft] = useState<Record<string, string>>({})
  const [notice, setNotice] = useState<string | null>(null)
  // Wizard: 'queue' (review/edit rows) → 'plan' (pick a band) → 'checkout'
  // (Stripe embedded checkout mounted in place — the user never leaves).
  // Entitled accounts never see 'plan' — the commit route promotes directly.
  const [step, setStep] = useState<'queue' | 'plan' | 'checkout'>('queue')
  const [billing, setBilling] = useState<'yearly' | 'monthly'>('yearly')
  const [planChoice, setPlanChoice] = useState<'recommended' | 'custom'>('recommended')
  const [customTierIdx, setCustomTierIdx] = useState(0)
  const [committing, setCommitting] = useState(false)
  const [checkoutSecret, setCheckoutSecret] = useState<string | null>(null)
  // Queue pagination — imports can stage hundreds of properties at once.
  const [qPage, setQPage] = useState(1)
  const [qPerPage, setQPerPage] = useState(10)
  // A rent-roll import in review/committed state — the queue links back to it.
  const [hasImportJob, setHasImportJob] = useState(false)
  const checkoutMountRef = useRef<HTMLDivElement | null>(null)
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
    setStep(initialStep ?? 'queue')
    setBilling('yearly')
    setPlanChoice('recommended')
    setCommitting(false)
    setCheckoutSecret(null)
    setQPage(1)
    fetch('/api/dashboard/import/job')
      .then((res) => res.json())
      .then((data: { job?: { status?: string } | null }) => {
        // Only an ACTIVE import review earns the back link — a queue built by
        // hand (or after an import is committed) shouldn't advertise a review
        // that isn't there.
        if (!cancelled) setHasImportJob(data.job?.status === 'review')
      })
      .catch(() => {})
    fetch('/api/dashboard/stage?list=1')
      .then((res) => res.json())
      .then((data: { rows?: StagedRow[]; staged_count?: number; plan?: PlanContext }) => {
        if (cancelled) return
        const fetched = data.rows ?? []
        setRows(fetched)
        setPlan(data.plan ?? null)
        // Default: everything selected — committing the whole queue is the
        // common case; deselecting is the exception. A caller-supplied id list
        // narrows the selection to its own rows (claim flow).
        setSelected(
          initialSelectedIds
            ? new Set(fetched.filter((r) => initialSelectedIds.includes(r.id)).map((r) => r.id))
            : new Set(fetched.map((r) => r.id))
        )
        setUnitsDraft(
          Object.fromEntries(fetched.map((r) => [r.id, r.units != null ? String(r.units) : '']))
        )
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
    // onQueueChange/initialStep/initialSelectedIds deliberately omitted:
    // refetch only on open.
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

  const qTotalPages = Math.max(1, Math.ceil(rows.length / qPerPage))
  const qPageClamped = Math.min(qPage, qTotalPages)
  const pagedRows = rows.slice((qPageClamped - 1) * qPerPage, qPageClamped * qPerPage)

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

  const removeRow = async (row: StagedRow) => {
    try {
      const res = await fetch(`/api/dashboard/stage?id=${encodeURIComponent(row.id)}`, {
        method: 'DELETE',
      })
      if (!res.ok) throw new Error()
      // Compute outside the setState updaters — notifying the parent from
      // inside an updater is a setState-during-render violation.
      const next = rows.filter((r) => r.id !== row.id)
      setRows(next)
      setSelected((prev) => {
        const nextSel = new Set(prev)
        nextSel.delete(row.id)
        return nextSel
      })
      onQueueChange?.(next.length)
    } catch {
      showNotice('Could not remove — try again')
    }
  }

  // Two-step clear: first click arms the button, second click (within 3s)
  // wipes the whole queue.
  const [clearArmed, setClearArmed] = useState(false)
  const clearTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    return () => {
      if (clearTimer.current) clearTimeout(clearTimer.current)
    }
  }, [])

  const handleClearQueue = async () => {
    if (!clearArmed) {
      setClearArmed(true)
      if (clearTimer.current) clearTimeout(clearTimer.current)
      clearTimer.current = setTimeout(() => setClearArmed(false), 3000)
      return
    }
    if (clearTimer.current) clearTimeout(clearTimer.current)
    setClearArmed(false)
    try {
      const res = await fetch('/api/dashboard/stage?all=1', { method: 'DELETE' })
      if (!res.ok) throw new Error()
      setRows([])
      setSelected(new Set())
      onQueueChange?.(0)
    } catch {
      showNotice('Could not clear the queue — try again')
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
        window.location.assign('/dashboard/portfolio?build=1')
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
        }),
      })
      const data = (await res.json()) as { client_secret?: string; error?: string }
      if (data.client_secret) {
        setCheckoutSecret(data.client_secret)
        setStep('checkout')
        return
      }
      showNotice(data.error || 'Could not open checkout — try again')
    } catch {
      showNotice('Could not open checkout — try again')
    } finally {
      setCommitting(false)
    }
  }

  // Mount Stripe's embedded checkout when the step opens; destroy it when the
  // user backs out or the modal closes (Stripe allows one instance per page).
  useEffect(() => {
    if (step !== 'checkout' || !checkoutSecret) return
    let disposed = false
    let embedded: StripeEmbeddedCheckout | null = null
    ;(async () => {
      const pk = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
      if (!pk) throw new Error('missing publishable key')
      const stripeJs = await loadStripe(pk)
      if (!stripeJs) throw new Error('stripe-js failed to load')
      const instance = await stripeJs.createEmbeddedCheckoutPage({
        clientSecret: checkoutSecret,
        onComplete: () => {
          // Give the webhook a beat to promote the rows before landing on
          // the portfolio.
          setTimeout(() => {
            window.location.assign('/dashboard/portfolio?checkout=success')
          }, 1600)
        },
      })
      if (disposed) {
        instance.destroy()
        return
      }
      embedded = instance
      if (checkoutMountRef.current) instance.mount(checkoutMountRef.current)
    })().catch((err) => {
      console.error('Embedded checkout failed to load:', err)
      if (!disposed) {
        showNotice('Could not load checkout — try again')
        setStep('plan')
      }
    })
    return () => {
      disposed = true
      embedded?.destroy()
    }
  }, [step, checkoutSecret, showNotice])

  if (!isOpen) return null
  if (typeof window === 'undefined') return null

  return createPortal(
    <div className="save-modal-backdrop sq-backdrop" onClick={onClose} role="presentation">
      <div
        className="sq-modal"
        style={{ ...modalStyle, maxWidth: step === 'queue' ? 920 : 720 }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-labelledby="staged-queue-title"
        aria-modal="true"
      >
        <div style={headerStyle}>
          <div>
            <div id="staged-queue-title" style={titleStyle}>
              {step === 'checkout'
                ? 'Start your free trial'
                : step === 'plan'
                  ? 'Choose your plan'
                  : 'Review added properties'}
            </div>
            <div style={headerSubStyle}>
              {step === 'checkout' && chosenBand ? (
                <>
                  {bandLabel(chosenBand)} · {priceText(chosenBand)} · $0 due today
                </>
              ) : step === 'plan' || step === 'checkout' ? (
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
          <button type="button" className="ir-close" onClick={onClose} aria-label="Close">
            &times;
          </button>
        </div>

        <div style={step === 'queue' && !loading && rows.length > 0 ? queueSplitBodyStyle : bodyStyle}>
          {step === 'checkout' ? (
            <div>
              <button
                type="button"
                style={{ ...backLinkStyle, marginBottom: 12 }}
                onClick={() => {
                  setCheckoutSecret(null)
                  setStep('plan')
                }}
              >
                &larr; Back to plan
              </button>
              {/* Stripe embedded checkout mounts here. */}
              <div ref={checkoutMountRef} style={{ minHeight: 460 }} />
            </div>
          ) : loading ? (
            <div style={emptyStyle}>Loading your queue…</div>
          ) : step === 'plan' ? (
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
          ) : rows.length === 0 ? (
            <div style={emptyStyle}>
              Nothing in your queue. Search any Chicago address and click the + button to add it.
            </div>
          ) : (
            <div className="imq-split">
              <div className="imq-list">
                <div className="imq-toolbar">
                  <input
                    type="checkbox"
                    className="imq-check"
                    checked={allSelected}
                    onChange={toggleAll}
                    aria-label={allSelected ? 'Deselect all' : 'Select all'}
                  />
                  <span>Select all</span>
                  <span className="imq-toolbar-count">
                    {(qPageClamped - 1) * qPerPage + 1}–
                    {Math.min(qPageClamped * qPerPage, rows.length)} of {rows.length}
                  </span>
                </div>
                <div className="imq-list-scroll">
                  {pagedRows.map((row) => {
                    const isRowSelected = selected.has(row.id)
                    // Faint red on the units box until a valid count (> 0) is
                    // entered — selection-independent, so the queue reads at a
                    // glance which rows still need input.
                    const rowMissingUnits = parseUnitsInput(unitsDraft[row.id] ?? '') == null
                    return (
                      <div key={row.id} className="imq-row">
                        <input
                          type="checkbox"
                          className="imq-check"
                          checked={isRowSelected}
                          onChange={() => toggleRow(row.id)}
                          aria-label={`Select ${row.property_name || row.canonical_address}`}
                        />
                        <div className="imq-row-addr">
                          <a
                            href={`/address/${row.slug}?building=true`}
                            target="_blank"
                            rel="noopener noreferrer"
                            title={row.property_name ?? row.canonical_address}
                          >
                            {row.property_name || row.canonical_address}
                          </a>
                          {row.address_range && row.address_range !== row.canonical_address ? (
                            <span className="imq-row-range">{row.address_range}</span>
                          ) : null}
                        </div>
                        <input
                          className={`imq-units-input${rowMissingUnits ? ' imq-units-invalid' : ''}`}
                          type="text"
                          inputMode="numeric"
                          value={unitsDraft[row.id] ?? ''}
                          onChange={(e) =>
                            setUnitsDraft((prev) => ({ ...prev, [row.id]: e.target.value }))
                          }
                          onBlur={() => handleUnitsBlur(row)}
                          placeholder="—"
                          aria-label="Unit count"
                        />
                        <button
                          type="button"
                          className="sq-remove"
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

                {rows.length > qPerPage || qTotalPages > 1 ? (
                  <div className="ir-pager" style={{ borderTop: '1px solid #eeeae1', flexShrink: 0 }}>
                    <button
                      type="button"
                      className="ir-pager-btn"
                      disabled={qPageClamped <= 1}
                      onClick={() => setQPage(qPageClamped - 1)}
                    >
                      &lsaquo; Prev
                    </button>
                    <span className="ir-pager-info">
                      {(qPageClamped - 1) * qPerPage + 1}–
                      {Math.min(qPageClamped * qPerPage, rows.length)} of {rows.length}
                    </span>
                    <button
                      type="button"
                      className="ir-pager-btn"
                      disabled={qPageClamped >= qTotalPages}
                      onClick={() => setQPage(qPageClamped + 1)}
                    >
                      Next &rsaquo;
                    </button>
                    <select
                      className="ir-pager-select"
                      value={qPerPage}
                      onChange={(e) => {
                        setQPerPage(Number(e.target.value))
                        setQPage(1)
                      }}
                      aria-label="Properties per page"
                    >
                      {[10, 25, 50].map((n) => (
                        <option key={n} value={n}>
                          {n} / page
                        </option>
                      ))}
                    </select>
                  </div>
                ) : null}
              </div>

              <div className="imq-rail">
                <div className="imq-rail-stats">
                  <div>
                    <div className="imq-stat-value">{selectedRows.length}</div>
                    <div className="imq-stat-label">Properties</div>
                  </div>
                  <div>
                    <div className="imq-stat-value">{totalUnits.toLocaleString()}</div>
                    <div className="imq-stat-label">Units</div>
                  </div>
                </div>

                <div className="imq-rail-card">
                  {plan?.kind === 'enterprise' ? (
                    <>
                      <div className="imq-rail-card-tag">Your plan</div>
                      <div className="imq-rail-card-name">Enterprise</div>
                      <div className="imq-rail-card-price">
                        Monitored as soon as you save.
                      </div>
                    </>
                  ) : plan?.kind === 'sentinel' || plan?.kind === 'sentinel_trial' ? (
                    <>
                      <div className="imq-rail-card-tag">Your plan</div>
                      <div className="imq-rail-card-name">
                        Sentinel{plan.unit_cap ? ` · up to ${plan.unit_cap} units` : ''}
                      </div>
                      <div className="imq-rail-card-price">
                        {plan.unit_cap ? (
                          plan.portfolio_units + totalUnits <= plan.unit_cap ? (
                            <>
                              {plan.portfolio_units.toLocaleString()} in your portfolio — room for{' '}
                              {(plan.unit_cap - plan.portfolio_units - totalUnits).toLocaleString()}{' '}
                              more after this save.
                            </>
                          ) : (
                            <span style={{ color: '#b7791f' }}>
                              This save brings you to{' '}
                              {(plan.portfolio_units + totalUnits).toLocaleString()} of{' '}
                              {plan.unit_cap} units — we&apos;ll follow up about the next tier.
                            </span>
                          )
                        ) : (
                          'Monitored as soon as you save.'
                        )}
                      </div>
                    </>
                  ) : isMaxTier ? (
                    <>
                      <div className="imq-rail-card-tag">Custom plan</div>
                      <div className="imq-rail-card-name">Over {MAX_TIER_UNITS} units</div>
                      <div className="imq-rail-card-price">
                        We&apos;ll set you up on a custom plan.
                      </div>
                    </>
                  ) : band ? (
                    <>
                      <div className="imq-rail-card-tag">Recommended plan</div>
                      <div className="imq-rail-card-name">{bandLabel(band)}</div>
                      <div className="imq-rail-card-price">
                        ${band.monthly}/mo · ${band.annualMonthly}/mo billed annually
                      </div>
                      <div className="imq-rail-card-trial">30-day free trial, $0 due today</div>
                    </>
                  ) : null}
                </div>

                <button
                  type="button"
                  onClick={() => void handleCommit()}
                  disabled={!canCommit || committing}
                  style={{
                    ...commitBtnStyle,
                    width: '100%',
                    opacity: canCommit && !committing ? 1 : 0.45,
                    cursor: canCommit && !committing ? 'pointer' : 'not-allowed',
                  }}
                >
                  {committing ? 'Saving…' : 'Save to portfolio'}
                </button>

                {!canCommit ? (
                  <div className="imq-rail-note">
                    {selectedRows.length === 0
                      ? 'Select the properties you want to monitor.'
                      : `Enter a unit count for ${missingUnits.length === 1 ? 'the highlighted property' : `all ${missingUnits.length} highlighted properties`} to continue.`}
                  </div>
                ) : null}

                {notice ? (
                  <div role="status" className="imq-rail-note" style={{ color: '#b7791f' }}>
                    {notice}
                  </div>
                ) : null}

                <div className="imq-rail-actions">
                  {hasImportJob ? (
                    <button
                      type="button"
                      className="imq-rail-action"
                      onClick={() => {
                        onClose()
                        // Defer so this modal unmounts before the review opens.
                        setTimeout(() => {
                          window.dispatchEvent(new CustomEvent('ps:open-import', { detail: {} }))
                        }, 0)
                      }}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                        <line x1="19" y1="12" x2="5" y2="12" />
                        <polyline points="12 19 5 12 12 5" />
                      </svg>
                      Back to import review
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="imq-rail-action imq-rail-action-danger"
                    onClick={() => void handleClearQueue()}
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                    {clearArmed ? `Click again to remove all ${rows.length}` : 'Clear queue'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {notice && step !== 'queue' && (
            <div role="status" style={noticeStyle}>
              {notice}
            </div>
          )}
        </div>

        {step === 'checkout' ? null : step === 'plan' ? (
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
  maxWidth: 720,
  maxHeight: '84vh',
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
  boxShadow: '0 16px 48px rgba(15, 39, 68, 0.28)',
}

// Header matches the site contact modal: white card, serif navy title,
// circular light close button (.ir-close) — no dark banner.
const headerStyle: CSSProperties = {
  background: '#ffffff',
  padding: '22px 26px 14px',
  borderBottom: '1px solid #e5e1d6',
  display: 'flex',
  alignItems: 'flex-start',
  justifyContent: 'space-between',
  gap: 16,
  flexShrink: 0,
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

// Queue step: the split layout (list + rail) owns its own scrolling.
const queueSplitBodyStyle: CSSProperties = {
  display: 'flex',
  flex: 1,
  minHeight: 0,
  padding: 0,
  overflow: 'hidden',
}

const bodyStyle: CSSProperties = {
  padding: '16px 22px 18px',
  overflowY: 'auto',
  flex: '1 1 auto',
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
