'use client'

import { ClosedPill, StatusPill, formatDate, monoLabel } from './_shared'

type WOLIStep = {
  order?: number | null
  step?: string | null
  status?: string | null
  outcome?: string | null
  end_date?: string | null
}

export type ComplaintDetailRecord = {
  sr_number?: string | null
  sr_type?: string | null
  status?: string | null
  created_date?: string | null
  closed_date?: string | null
  standard_description?: string | null
  complaint_description?: string | null
  complainant_type?: string | null
  unit_number?: string | null
  danger_reported?: string | null
  owner_notified?: string | null
  owner_occupied?: string | null
  concern_category?: string | null
  problem_category?: string | null
  restaurant_name?: string | null
  business_name?: string | null
  sla_target_days?: number | null
  actual_mean_days?: number | null
  workflow_step?: string | null
  work_order_status?: string | null
  work_order_steps?: WOLIStep[] | null
  final_outcome?: string | null
}

type Props = {
  complaint: ComplaintDetailRecord
  isAdmin: boolean
}

// Outcome classifier — buckets WOLI step outcomes into semantic categories for coloring.
// Per OIG audit (Feb 2026), "No Cause" and "No Problem Found" frequently indicate
// duplicate-coupling rather than confirmed inspector findings, so we render them as
// neutral gray rather than productive green.
type OutcomeBucket = 'productive' | 'compliant' | 'no-finding' | 'admin' | 'jurisdiction' | 'unknown'
function classifyOutcome(outcome: string | null | undefined): OutcomeBucket {
  const o = String(outcome ?? '').toLowerCase().trim()
  if (!o) return 'unknown'
  if (/ticket|violation|enforcement|court|hearing|recommend|water restored|broken water main/.test(o)) return 'productive'
  if (/pass|compliance|in compliance|no permit required/.test(o)) return 'compliant'
  if (/no cause|no problem|unfounded|no action|noise on service/.test(o)) return 'no-finding'
  if (/duplicate|anonymous|insufficient|form not returned|cancelled by owner|out of business|no such address|address does not exist/.test(o)) return 'admin'
  if (/no jurisdiction|not cdph|owner.s responsibility|transfer to/.test(o)) return 'jurisdiction'
  return 'unknown'
}
const bucketColor: Record<OutcomeBucket, string> = {
  productive: '#166534',   // green
  compliant: '#166534',    // green
  'no-finding': '#888',    // gray (per OIG, often duplicates)
  admin: '#a05a20',        // amber
  jurisdiction: '#5a5044', // dark gray
  unknown: '#1e3a5f',      // navy
}

export default function ComplaintDetail({ complaint: c, isAdmin }: Props) {
  const caseStatus = String(c.status ?? '').toLowerCase()
  const isOpen = caseStatus === 'open'
  const isCanceled = caseStatus === 'canceled' || caseStatus === 'cancelled'
  const desc = (c.standard_description ?? '').trim()
  const rawDesc = (c.complaint_description ?? '').trim()
  const venueName = (c.restaurant_name ?? c.business_name ?? '').trim()
  const steps = Array.isArray(c.work_order_steps) ? c.work_order_steps : []
  const hasSteps = steps.length > 0
  const finalOutcome = (c.final_outcome ?? '').trim()

  // Derive "stuck open" — parent SR is officially Open but inspector closed the workflow.
  // We compute days since last activity for the explanatory footnote.
  const lastStepEndDate = steps.length > 0
    ? steps.map((s) => s.end_date).filter(Boolean).sort().pop()
    : null
  const daysSinceLastStep = lastStepEndDate
    ? Math.floor((Date.now() - new Date(lastStepEndDate).getTime()) / 86_400_000)
    : null
  const isStuckOpen = isOpen && finalOutcome.length > 0 && daysSinceLastStep != null && daysSinceLastStep >= 14

  // Build "tags" row of structured intake fields (Yes/No flags + categories).
  // Tenant-identifying fields (Filed by, Unit, Danger, Owner notified, Owner occupied)
  // are only shown to admins. Concern/Problem stay public — they are categorical.
  type Tag = { label: string; value: string; color?: string }
  const tags: Tag[] = []
  if (isAdmin && c.complainant_type) tags.push({ label: 'Filed by', value: c.complainant_type })
  if (isAdmin && c.unit_number) tags.push({ label: 'Unit', value: c.unit_number })
  if (isAdmin && c.danger_reported && c.danger_reported.toLowerCase() === 'yes') {
    tags.push({ label: 'Danger', value: 'Yes', color: '#a82020' })
  }
  if (isAdmin && c.owner_notified) tags.push({ label: 'Owner notified', value: c.owner_notified })
  if (isAdmin && c.owner_occupied) tags.push({ label: 'Owner occupied', value: c.owner_occupied })
  if (c.concern_category) tags.push({ label: 'Concern', value: c.concern_category })
  if (c.problem_category) tags.push({ label: 'Problem', value: c.problem_category })

  return (
    <>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          marginBottom: 6,
        }}
      >
        <span style={monoLabel}>{formatDate(c.created_date)}</span>
        {isStuckOpen ? (
          <span
            title={`Service request remains OPEN in city records, but the inspector closed the workflow as "${finalOutcome}" on ${formatDate(lastStepEndDate)} — ${daysSinceLastStep} days ago.`}
            style={{
              fontFamily: 'var(--font-mono, ui-monospace, monospace)',
              fontSize: 10,
              fontWeight: 500,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              padding: '2px 8px',
              borderRadius: 3,
              whiteSpace: 'nowrap',
              background: '#fef3c7',
              color: '#a05a20',
              cursor: 'help',
            }}
          >
            Open*
          </span>
        ) : isOpen ? (
          <StatusPill kind="open" />
        ) : isCanceled ? (
          <span
            style={{
              fontFamily: 'var(--font-mono, ui-monospace, monospace)',
              fontSize: 10,
              fontWeight: 500,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              padding: '2px 8px',
              borderRadius: 3,
              whiteSpace: 'nowrap',
              background: '#f5e8e0',
              color: '#a05a20',
            }}
          >
            Canceled
          </span>
        ) : (
          <ClosedPill closedDate={c.closed_date} />
        )}
      </div>
      {c.sr_type ? (
        <div style={{ ...monoLabel, marginBottom: 4, letterSpacing: '0.04em' }}>{c.sr_type}</div>
      ) : null}
      {c.sr_number ? (
        <div
          style={{
            fontFamily: 'var(--font-mono, ui-monospace, monospace)',
            fontSize: 11,
            color: '#888',
            marginBottom: 10,
          }}
        >
          #{c.sr_number}
        </div>
      ) : null}
      {venueName ? (
        <div style={{ fontSize: 13, fontWeight: 600, color: '#1a1a1a', marginBottom: 4 }}>{venueName}</div>
      ) : null}
      <div
        style={{
          fontSize: 13,
          color: desc ? '#1a1a1a' : '#888',
          lineHeight: 1.4,
          marginBottom: rawDesc && rawDesc !== desc ? 6 : 12,
          fontStyle: desc ? 'normal' : 'italic',
        }}
      >
        {desc || 'No description available'}
      </div>
      {isAdmin && rawDesc && rawDesc !== desc ? (
        <div
          style={{
            fontSize: 11,
            color: '#666',
            lineHeight: 1.5,
            marginBottom: 12,
            fontStyle: 'italic',
            paddingLeft: 8,
            borderLeft: '2px solid #d6e4f3',
          }}
        >
          &quot;{rawDesc}&quot;
        </div>
      ) : null}

      {tags.length > 0 ? (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 12 }}>
          {tags.map((tag, idx) => (
            <span
              key={`tag-${idx}`}
              style={{
                fontSize: 11,
                padding: '3px 8px',
                background: '#fff',
                border: '1px solid #d6e4f3',
                borderRadius: 3,
                color: tag.color ?? '#1a1a1a',
                lineHeight: 1.4,
              }}
            >
              <span style={{ color: '#5a7898', marginRight: 4 }}>{tag.label}:</span>
              <span style={{ fontWeight: tag.color ? 600 : 500 }}>{tag.value}</span>
            </span>
          ))}
        </div>
      ) : null}

      {!isOpen && finalOutcome ? (
        <div
          style={{
            fontSize: 12,
            padding: '8px 10px',
            background: isCanceled ? '#f5e8e0' : '#eef4fb',
            border: `1px solid ${isCanceled ? '#e0c4a8' : '#d6e4f3'}`,
            borderRadius: 4,
            marginBottom: 12,
            lineHeight: 1.4,
          }}
        >
          <span
            style={{
              fontFamily: 'var(--font-mono, ui-monospace, monospace)',
              fontSize: 9,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              color: '#5a7898',
              marginRight: 6,
            }}
          >
            Outcome
          </span>
          <span style={{ color: '#1a1a1a', fontWeight: 500 }}>{finalOutcome}</span>
        </div>
      ) : null}

      {isOpen && (c.sla_target_days != null || c.actual_mean_days != null) ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginBottom: hasSteps ? 12 : 0 }}>
          {c.sla_target_days != null ? (
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
              <span style={{ color: '#5a7898' }}>Target</span>
              <span style={{ color: '#1a1a1a', fontWeight: 500 }}>{c.sla_target_days} days</span>
            </div>
          ) : null}
          {c.actual_mean_days != null ? (
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
              <span style={{ color: '#5a7898' }}>Avg</span>
              <span style={{ color: '#1a1a1a', fontWeight: 500 }}>{c.actual_mean_days} days</span>
            </div>
          ) : null}
        </div>
      ) : null}

{hasSteps ? (
        <div style={{ borderTop: '1px solid #d6e4f3', paddingTop: 10, marginTop: 4 }}>
          <div
            style={{
              fontFamily: 'var(--font-mono, ui-monospace, monospace)',
              fontSize: 9,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              color: '#5a7898',
              marginBottom: 8,
            }}
          >
            Workflow ({steps.length} step{steps.length !== 1 ? 's' : ''}{isStuckOpen ? ' + city status' : ''})
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0, position: 'relative' }}>

            {/* Synthetic "Complaint Filed" top node — anchors the timeline to the filing event. */}
            <div style={{ display: 'flex', gap: 10, paddingBottom: 10, position: 'relative' }}>
              <div style={{ width: 14, flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 2 }}>
                <div style={{ width: 9, height: 9, borderRadius: '50%', background: '#1e3a5f', border: '2px solid #1e3a5f', flexShrink: 0 }} />
                <div style={{ width: 1, flex: 1, background: '#d6e4f3', marginTop: 2 }} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                  <span style={{ fontSize: 12, color: '#1a1a1a', fontWeight: 500 }}>Complaint Filed</span>
                  <span style={{ fontFamily: 'var(--font-mono, ui-monospace, monospace)', fontSize: 9, color: '#1e3a5f', letterSpacing: '0.04em', textTransform: 'uppercase', flexShrink: 0 }}>Filed</span>
                </div>
                {c.created_date ? (
                  <div style={{ fontFamily: 'var(--font-mono, ui-monospace, monospace)', fontSize: 9, color: '#999', marginTop: 2, letterSpacing: '0.04em' }}>
                    {formatDate(c.created_date)}
                  </div>
                ) : null}
              </div>
            </div>

            {steps.map((step, idx) => {
              const status = String(step.status ?? '').toLowerCase()
              const isClosed = status === 'closed'
              const isCanceledStep = status === 'canceled' || status === 'cancelled'
              const isInProgress = status === 'in progress'
              const isNew = status === 'new'
              const isCurrent =
                !isClosed && !isCanceledStep &&
                (isInProgress || (isNew && !steps.slice(0, idx).some((s) => {
                  const ss = String(s.status ?? '').toLowerCase()
                  return ss === 'new' || ss === 'in progress'
                })))
              const isFuture = isNew && !isCurrent
              const isLast = idx === steps.length - 1 && !isStuckOpen

              // Color the dot based on outcome bucket when closed (so "No Cause" reads as gray,
              // "Ticket Issued" as green, etc.). Fall back to status-based color otherwise.
              const outcomeText = (step.outcome ?? '').trim()
              const bucket = classifyOutcome(outcomeText)
              const dotColor = isClosed
                ? bucketColor[bucket]
                : isCanceledStep
                  ? '#c4c0b4'  // hollow-feeling gray for canceled
                  : isCurrent
                    ? '#1e3a5f'
                    : '#c4c0b4'

              const stepColor = isFuture || isCanceledStep ? '#999' : '#1a1a1a'
              const stepDecoration = isCanceledStep ? 'line-through' : 'none'

              return (
                <div
                  key={`step-${idx}`}
                  style={{ display: 'flex', gap: 10, paddingBottom: isLast ? 0 : 10, position: 'relative' }}
                >
                  <div
                    style={{
                      width: 14,
                      flexShrink: 0,
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      paddingTop: 2,
                    }}
                  >
                    <div
                      style={{
                        width: 9,
                        height: 9,
                        borderRadius: '50%',
                        background: isCurrent || isCanceledStep ? '#fff' : dotColor,
                        border: `2px solid ${dotColor}`,
                        flexShrink: 0,
                        animation: isCurrent ? 'pulse 2s ease-in-out infinite' : undefined,
                      }}
                    />
                    {!isLast ? (
                      <div style={{ width: 1, flex: 1, background: '#d6e4f3', marginTop: 2 }} />
                    ) : null}
                  </div>
                  <div style={{ flex: 1, minWidth: 0, paddingTop: 0 }}>
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'baseline',
                        gap: 8,
                      }}
                    >
                      <span
                        style={{
                          fontSize: 12,
                          color: stepColor,
                          fontWeight: isCurrent ? 600 : 500,
                          textDecoration: stepDecoration,
                        }}
                      >
                        {step.step ?? '(unnamed step)'}
                      </span>
                      <span
                        style={{
                          fontFamily: 'var(--font-mono, ui-monospace, monospace)',
                          fontSize: 9,
                          color: dotColor,
                          letterSpacing: '0.04em',
                          textTransform: 'uppercase',
                          flexShrink: 0,
                        }}
                      >
                        {isCurrent ? 'Current' : step.status ?? ''}
                      </span>
                    </div>
                    {outcomeText ? (
                      <div
                        style={{
                          fontSize: 11,
                          color: '#5a7898',
                          marginTop: 2,
                          lineHeight: 1.4,
                          fontStyle: 'italic',
                        }}
                      >
                        &quot;{outcomeText}&quot;
                      </div>
                    ) : null}
                    {step.end_date ? (
                      <div
                        style={{
                          fontFamily: 'var(--font-mono, ui-monospace, monospace)',
                          fontSize: 9,
                          color: '#999',
                          marginTop: 2,
                          letterSpacing: '0.04em',
                        }}
                      >
                        {formatDate(step.end_date)}
                      </div>
                    ) : null}
                  </div>
                </div>
              )
            })}

            {/* Stuck-open derived node — surfaces the SR/WOLI status discrepancy. */}
            {isStuckOpen ? (
              <div
                style={{
                  display: 'flex',
                  gap: 10,
                  paddingTop: 10,
                  marginTop: 4,
                  borderTop: '1px dashed rgba(160, 90, 32, 0.3)',
                  background: 'linear-gradient(to bottom, transparent, #fef3c7 30%)',
                  marginLeft: -8,
                  paddingLeft: 8,
                  paddingRight: 8,
                  paddingBottom: 10,
                }}
              >
                <div style={{ width: 14, flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 2 }}>
                  <div style={{ width: 9, height: 9, borderRadius: '50%', background: '#a05a20', border: '2px solid #a05a20', flexShrink: 0 }} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                    <span style={{ fontSize: 12, color: '#a05a20', fontWeight: 600, fontStyle: 'italic' }}>
                      Officially still open in city records
                    </span>
                    <span style={{ fontFamily: 'var(--font-mono, ui-monospace, monospace)', fontSize: 9, color: '#a05a20', letterSpacing: '0.04em', textTransform: 'uppercase', flexShrink: 0 }}>
                      Stuck
                    </span>
                  </div>
                  <div style={{ fontSize: 11, color: '#1a1a1a', marginTop: 4, lineHeight: 1.5 }}>
                    Inspector dispositioned this complaint as &quot;{finalOutcome}&quot; but DOB has not closed the parent service request. {daysSinceLastStep} days since the last activity.
                  </div>
                </div>
              </div>
            ) : null}

          </div>
        </div>
      ) : c.workflow_step ? (
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, gap: 8 }}>
          <span style={{ color: '#5a7898', flexShrink: 0 }}>Step</span>
          <span style={{ color: '#1a1a1a', fontWeight: 500, textAlign: 'right' }}>{c.workflow_step}</span>
        </div>
      ) : null}
    </>
  )
}
