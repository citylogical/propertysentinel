'use client'

import Link from 'next/link'
import { ClosedPill, StatusPill, formatDate, monoLabel } from './_shared'
import { DEPARTMENT_BY_CODE } from '@/lib/sr-codes'
import { SR_INTAKE_LABELS } from '@/lib/sr-catalog'

// Local date+time formatter for the header open date. created_date is Chicago
// local time stored without a tz marker (Supabase shows +00:00), so we slice
// the wall-clock value and display as-is — NO tz conversion (that would shift
// it -6h). Shared formatDate stays date-only and is still used for the compact
// workflow step nodes below.
function formatOpenDateTime(dateStr: string | null | undefined): string {
  if (!dateStr) return ''
  const m = String(dateStr).slice(0, 19).match(/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/)
  if (!m) return ''
  const [, y, mo, dd, hh, mi] = m
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  const base = `${months[parseInt(mo, 10) - 1] ?? mo} ${parseInt(dd, 10)}, ${y}`
  if (hh == null) return base
  let h = parseInt(hh, 10)
  const ampm = h >= 12 ? 'PM' : 'AM'
  h = h % 12; if (h === 0) h = 12
  return `${base} ${h}:${mi} ${ampm}`
}

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
  sr_short_code?: string | null
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
  /** Address the SR was filed at — surfaces in card header so a screenshot is self-contained. */
  address?: string | null
  /** Slug for the property-page link on the address line. */
  addressSlug?: string | null
}

// Outcome classifier — buckets WOLI step outcomes into semantic categories for coloring.
// Per OIG audit (Feb 2026), "No Cause" and "No Problem Found" frequently indicate
// duplicate-coupling rather than confirmed inspector findings, so we render them as
// neutral gray rather than productive green.
type OutcomeBucket = 'productive' | 'compliant' | 'no-finding' | 'admin' | 'jurisdiction' | 'unknown'
function classifyOutcome(outcome: string | null | undefined): OutcomeBucket {
  const o = String(outcome ?? '').toLowerCase().trim()
  if (!o) return 'unknown'
  // "baited" / "services" / "treated" are SGA Rodent Baiting outcomes — the city
  // did the requested work. Productive = work delivered. Observed values include
  // "Alley Baited", "Backyard Services", "Backyard Inspected and Baited".
  // "owner's responsibility" → productive (NOT jurisdiction) — for DWM codes
  // (WM3, AAD) this means inspector visited and verdict is private-side repair.
  // The city delivered the answer; that's productive work for Mark's purposes
  // (the answer determines whether he's on the hook for the repair).
  if (/ticket|violation|enforcement|court|hearing|recommend|water restored|broken water main|baited|backyard services|treated|burrows|owner.s responsibility/.test(o)) return 'productive'
  if (/pass|compliance|in compliance|no permit required/.test(o)) return 'compliant'
  if (/no cause|no problem|unfounded|no action|noise on service/.test(o)) return 'no-finding'
  if (/duplicate|anonymous|insufficient|form not returned|cancelled by owner|out of business|no such address|address does not exist|inaccessible|refused/.test(o)) return 'admin'
  if (/no jurisdiction|not cdph|transfer to/.test(o)) return 'jurisdiction'
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

// Per-SR-code labels for the structured intake tags. Keyed by SR short code,
// then by which enrichment column the value lives in. The Aura intake question
// text (e.g. "Is alley caved-in?") is the real meaning of the Yes/No / picklist
// value — without it, "Category: No" is unreadable. Falls back to the generic
// 'Category' / 'Detail' / 'Surface' labels below when a code has no entry.
// Question text mirrors the QUESTION_MAP comments in enrich_complaints.py.
// Generic fallbacks when a code is absent from SR_INTAKE_LABELS (imported from
// @/lib/sr-catalog — the single source of truth for intake labels).
const GENERIC_INTAKE_LABELS = { concern: 'Category', problem: 'Detail', description: 'Surface' }

export default function ComplaintDetail({ complaint: c, isAdmin, address, addressSlug }: Props) {
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
  // Complaint is closed in city records (status Completed/Closed, not open, not
  // canceled) but the WOLI steps may not reflect it — Phase 2 sets status +
  // closed_date without refreshing work_order_steps, so the timeline can freeze
  // mid-workflow. Always append a synthetic Closed node when closed_date exists
  // and the complaint isn't open/canceled, regardless of step state.
  const isClosedComplaint = !isOpen && !isCanceled && Boolean(c.closed_date)

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
  // Categorical intake fields are public — they describe the complaint shape, not the
  // complainant. For structured-intake SR types (e.g. SGA Rodent Baiting) these are
  // the primary signal in the absence of a free-text description.
  const codeKey = String(c.sr_short_code ?? '').toUpperCase()
  const intakeLabels = SR_INTAKE_LABELS[codeKey] ?? {}
  if (c.concern_category) {
    tags.push({ label: intakeLabels.concern ?? GENERIC_INTAKE_LABELS.concern, value: c.concern_category })
  }
  if (c.problem_category && intakeLabels.problem) {
    tags.push({ label: intakeLabels.problem, value: c.problem_category })
  }
  // For structured-intake codes with no standard_description (SKIP_PARAPHRASE),
  // the surface-type / freeform answer lives in complaint_description and would
  // otherwise only surface to admins as the raw blockquote. When the code has a
  // description label defined (e.g. AAI "Surface"), promote it to a public tag
  // so GC sees "Surface: Paved" instead of nothing. Only when there's no
  // standard_description (desc) — paraphrased codes already render desc.
  if (!desc && intakeLabels.description && rawDesc) {
    tags.push({ label: intakeLabels.description, value: rawDesc })
  }
  // Owner-occupied "Yes" for EAF Vicious Animal means animal resides at address
  // (tenant dog, landlord liability). The admin-only above renders for building-
  // type SRs; this public version is for animal-residence cases only. Both
  // branches can fire, since the underlying semantic is different per SR type.
  if (
    String(c.sr_short_code ?? '').toUpperCase() === 'EAF' &&
    String(c.owner_occupied ?? '').trim().toLowerCase() === 'yes'
  ) {
    tags.push({ label: 'Animal resides at address', value: 'Yes' })
  }

  return (
    <>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 8,
          marginBottom: 4,
        }}
      >
        <span style={{ ...monoLabel, letterSpacing: '0.04em' }}>
          {c.sr_type ?? 'Complaint'}{c.sr_number ? <span style={{ color: '#888' }}> · #{c.sr_number}</span> : null}
        </span>
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
          (c as { duplicate?: boolean | null }).duplicate === true ? (
            <StatusPill kind="duplicate" />
          ) : (
            <StatusPill kind="open" />
          )
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
      {address ? (
        <div style={{ fontSize: 12, color: '#5a5044', marginBottom: 6 }}>
          <span style={{ color: '#5a7898' }}>Complaint address: </span>
          {addressSlug ? (
            <Link
              href={`/address/${encodeURIComponent(addressSlug)}?building=true`}
              style={{ color: '#1e3a5f', fontWeight: 600, textDecoration: 'none', borderBottom: '1px dotted #c4c0b4' }}
            >
              {address}
            </Link>
          ) : (
            <span style={{ color: '#1a1a1a', fontWeight: 600 }}>{address}</span>
          )}
        </div>
      ) : null}
      {(c as { duplicate?: boolean | null }).duplicate === true &&
       (c as { parent_sr_number?: string | null }).parent_sr_number ? (
        <div style={{
          fontSize: 12,
          color: '#6a6258',
          fontStyle: 'italic',
          marginTop: 4,
        }}>
          Duplicate of {(c as { parent_sr_number?: string | null }).parent_sr_number}
        </div>
      ) : null}
      {venueName ? (
        <div style={{ fontSize: 13, fontWeight: 600, color: '#1a1a1a', marginBottom: 4 }}>{venueName}</div>
      ) : null}
      {/* Description block — hidden entirely for structured-intake SR types where
          the intake captures categorical metadata (concern_category / problem_category /
          final_outcome) rather than free-text submitter narrative. SGA Rodent Baiting
          is the canonical example; future structured-intake types follow the same
          pattern. The "No description available" placeholder would be misleading
          there — there isn't a missing description, there's no description field by
          design. */}
      {desc ? (
        <div
          style={{
            fontSize: 13,
            color: '#1a1a1a',
            lineHeight: 1.4,
            marginBottom: rawDesc && rawDesc !== desc ? 6 : 12,
          }}
        >
          {desc}
        </div>
      ) : !c.concern_category && !c.problem_category && !c.final_outcome ? (
        <div
          style={{
            fontSize: 13,
            color: '#888',
            lineHeight: 1.4,
            marginBottom: 12,
            fontStyle: 'italic',
          }}
        >
          No description available
        </div>
      ) : null}
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
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 4, marginBottom: 12 }}>
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

      {(() => {
        const dept = c.sr_short_code ? DEPARTMENT_BY_CODE[c.sr_short_code.toUpperCase()] : null
        if (!dept) return null
        return (
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, gap: 8, marginBottom: 5 }}>
            <span style={{ color: '#5a7898', flexShrink: 0 }}>Handled by</span>
            <span style={{ color: '#1a1a1a', fontWeight: 500, textAlign: 'right' }}>{dept}</span>
          </div>
        )
      })()}
      {isOpen && (c.sla_target_days != null || c.actual_mean_days != null) ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginBottom: hasSteps ? 12 : 0 }}>
          {c.sla_target_days != null ? (
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
              <span style={{ color: '#5a7898' }}>Target Resolution</span>
              <span style={{ color: '#1a1a1a', fontWeight: 500 }}>{c.sla_target_days} days</span>
            </div>
          ) : null}
          {c.actual_mean_days != null ? (
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
              <span style={{ color: '#5a7898' }}>Avg Resolution</span>
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
            Workflow
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
                  {c.created_date ? (
                    <span style={{ fontFamily: 'var(--font-mono, ui-monospace, monospace)', fontSize: 9, color: '#888', letterSpacing: '0.04em', textTransform: 'uppercase', flexShrink: 0 }}>
                      {formatDate(c.created_date)}
                    </span>
                  ) : null}
                </div>
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
              // "Last" (no connecting line below) only when nothing follows. A
              // synthetic stuck-open OR closed node follows the final real step,
              // so the real last step must still draw its connector into it.
              const isLast = idx === steps.length - 1 && !isStuckOpen && !isClosedComplaint

              // Color the dot based on outcome bucket when closed (so "No Cause" reads as gray,
              // "Ticket Issued" as green, etc.). Fall back to status-based color otherwise.
              const outcomeText = (step.outcome ?? '').trim()
              const bucket = classifyOutcome(outcomeText)
              // "Perform Work" is always amber regardless of status — it's the
              // stage where city action / owner-relevant work happens.
              const isPerformWork = String(step.step ?? '').toLowerCase().includes('perform work')
              const dotColor = isPerformWork
                ? '#a05a20'
                : isClosed
                  ? bucketColor[bucket]
                  : isCanceledStep
                    ? '#c4c0b4'
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
                        {isClosedComplaint ? '' : isCurrent ? 'Current' : step.status ?? ''}
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

            {/* Synthetic Closed node — always shown when the complaint is closed,
                even if work_order_steps froze mid-workflow (Phase 2 closes status
                without refreshing WOLI). Dated from closed_date. */}
            {isClosedComplaint ? (
              <div style={{ display: 'flex', gap: 10, paddingTop: 0, position: 'relative' }}>
                <div style={{ width: 14, flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 2 }}>
                  <div style={{ width: 9, height: 9, borderRadius: '50%', background: '#888', border: '2px solid #888', flexShrink: 0 }} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                    <span style={{ fontSize: 12, color: '#1a1a1a', fontWeight: 500 }}>
                      {finalOutcome ? `Closed — ${finalOutcome}` : 'Closed'}
                    </span>
                    {c.closed_date ? (
                      <span style={{ fontFamily: 'var(--font-mono, ui-monospace, monospace)', fontSize: 9, color: '#888', letterSpacing: '0.04em', textTransform: 'uppercase', flexShrink: 0 }}>
                        {formatDate(c.closed_date)}
                      </span>
                    ) : null}
                  </div>
                </div>
              </div>
            ) : null}

          </div>
        </div>
      ) : isCanceled ? (
        <div
          style={{
            borderTop: '1px solid #e5e1d6',
            paddingTop: 10,
            marginTop: 4,
            display: 'flex',
            gap: 10,
          }}
        >
          <div style={{ width: 14, flexShrink: 0, display: 'flex', justifyContent: 'center', paddingTop: 4 }}>
            <div
              style={{
                width: 9,
                height: 9,
                borderRadius: '50%',
                background: '#fff',
                border: '2px solid #c4c0b4',
                flexShrink: 0,
              }}
            />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontSize: 12,
                color: '#999',
                fontStyle: 'italic',
                lineHeight: 1.5,
              }}
            >
              No workflow recorded — service request was canceled before an inspector was assigned.
            </div>
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
