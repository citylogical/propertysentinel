import { NextResponse } from 'next/server'
import { Resend } from 'resend'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { getAllAddresses } from '@/lib/portfolio-stats'
import { addressToSlug } from '@/lib/formatAddress'
import { getEnabledCodesForUsers } from '@/lib/sr-preferences'
import { SR_INTAKE_LABELS } from '@/lib/sr-catalog'
import { computeEntitlement } from '@/lib/entitlement'

// Street type tokens used to identify the end of an address proper (everything
// after one of these is treated as a unit suffix and stripped for matching).
const STREET_TYPES = new Set([
  'ST', 'AVE', 'BLVD', 'DR', 'CT', 'PL', 'LN', 'RD',
  'WAY', 'PKWY', 'TER', 'CIR', 'HWY',
])

// Per-SR-code labels for structured intake fields in the digest description.
// DUPLICATE of SR_INTAKE_LABELS in app/dashboard/details/ComplaintDetail.tsx —
// kept inline here to scope tonight's change to this file. TODO: extract to
// lib/sr-intake-labels.ts and import in both places (the QUESTION_MAP three-way
// sync is already a maintenance burden; don't grow it without consolidating).
// `concern` → concern_category, `problem` → problem_category, `description` →
// complaint_description (only promoted when it's a structured picklist answer,
// e.g. AAI surface type — never a freeform narrative).
// SR_INTAKE_LABELS imported from @/lib/sr-catalog — single source of truth.

/**
 * Build a labeled structured-intake description for the digest, e.g.
 * "Alley caved-in: No; Alley flooded: Yes; Surface: Paved".
 * Falls back to a bare "concern / problem" join for codes with no label entry,
 * preserving prior behavior. `rawDesc` (complaint_description) is only appended
 * when the code defines a `description` label — guarding against promoting a
 * freeform narrative field to the digest.
 */
function buildStructuredDescription(
  srShortCode: string | null,
  concern: string | null,
  problem: string | null,
  rawDesc: string | null,
): string | null {
  const code = String(srShortCode ?? '').toUpperCase()
  const labels = SR_INTAKE_LABELS[code]
  if (!labels) {
    // No label entry — preserve the original bare join.
    return concern && problem ? `${concern} / ${problem}` : (concern || problem)
  }
  const parts: string[] = []
  if (concern) parts.push(`${labels.concern ?? 'Category'}: ${concern}`)
  if (problem) parts.push(`${labels.problem ?? 'Detail'}: ${problem}`)
  if (labels.description && rawDesc) parts.push(`${labels.description}: ${rawDesc}`)
  return parts.length > 0 ? parts.join('; ') : null
}

type UserBuildingRange = {
  searched_address: string | null
  street1_low: string | null
  street1_high: string | null
  street2_low: string | null
  street2_high: string | null
  street3_low: string | null
  street3_high: string | null
  street4_low: string | null
  street4_high: string | null
}

/**
 * Strip a unit suffix from a normalized address. See activity/route.ts for
 * detailed rationale — duplicated inline here to keep edits scoped to the two
 * navigation endpoints.
 */
function stripUnitSuffix(normalizedAddress: string): string {
  const tokens = normalizedAddress.trim().toUpperCase().split(/\s+/)
  for (let i = tokens.length - 1; i >= 0; i--) {
    if (STREET_TYPES.has(tokens[i])) {
      return tokens.slice(0, i + 1).join(' ')
    }
  }
  return normalizedAddress.toUpperCase().trim()
}

function findCoveringRange(
  baseAddress: string,
  ranges: UserBuildingRange[]
): UserBuildingRange | null {
  const baseParts = baseAddress.split(/\s+/)
  const baseNum = parseInt(baseParts[0] ?? '', 10)
  const baseStreet = baseParts.slice(1).join(' ')
  if (Number.isNaN(baseNum) || !baseStreet) return null

  for (const r of ranges) {
    for (let i = 1; i <= 4; i++) {
      const low = r[`street${i}_low` as keyof UserBuildingRange] as string | null
      const high = r[`street${i}_high` as keyof UserBuildingRange] as string | null
      if (!low || !high) continue
      const lowParts = low.toUpperCase().split(/\s+/)
      const highParts = high.toUpperCase().split(/\s+/)
      const lowNum = parseInt(lowParts[0] ?? '', 10)
      const highNum = parseInt(highParts[0] ?? '', 10)
      const lowStreet = lowParts.slice(1).join(' ')
      const highStreet = highParts.slice(1).join(' ')
      if (Number.isNaN(lowNum) || Number.isNaN(highNum)) continue
      if (lowStreet !== baseStreet || highStreet !== baseStreet) continue
      if (baseNum >= Math.min(lowNum, highNum) && baseNum <= Math.max(lowNum, highNum)) {
        return r
      }
    }
  }
  return null
}

function buildNavSlug(
  canonical: string,
  storedSlug: string | null,
  ranges: UserBuildingRange[]
): string {
  const baseAddress = stripUnitSuffix(canonical)
  const match = findCoveringRange(baseAddress, ranges)
  if (!match?.searched_address) return storedSlug ?? ''

  const zipMatch = storedSlug?.match(/-(\d{5})$/)
  const zip = zipMatch?.[1] ?? null
  const baseSlug = addressToSlug(match.searched_address)
  return zip ? `${baseSlug}-chicago-${zip}` : baseSlug
}

export const maxDuration = 300 // 5 min for Vercel Pro / Hobby Pro

type DigestEvent = {
  property_display: string
  property_id: string
  property_slug: string | null
  kind: 'complaint' | 'violation' | 'permit'
  // Persisted dedupe identifier — sr_number for complaints, inspection_number
  // for violations, permit_number for permits. Written to alert_digest_log's
  // three sent_*_identifiers arrays on successful send, queried on next run
  // to filter SELECT results before rendering. Null when the source row had
  // no identifier (orphan violations); always-send behavior in that case.
  dedupe_id: string | null
  label: string
  description: string | null
  // Current city action on the work order (complaints only). For open cases:
  // workflow_step ("Investigation/Inspection", "Dispatch Crew", "Perform Work").
  // For closed cases: final_outcome ("Owner's Responsibility", "Alley Baited",
  // "No Problem Found"). Null when enrichment hasn't populated either field.
  woli_stage?: string | null
  // True when the underlying work order is closed in Aura (work_order_status
  // = 'Closed'). Drives the bold "CLOSED" prefix on the rendered stage line —
  // distinguishes "city is working on it" (Dispatch Crew) from "city has
  // disposed of it" (EMERGENCY RELIEVED, Need COMED). Complaints only.
  woli_is_closed?: boolean
  date: string
  // True when the city-recorded date is older than the digest's "yesterday" —
  // i.e., the row is appearing in this digest because it just landed in our
  // ingest pipe (created_at within window), not because the event happened
  // yesterday. Drives the asterisk + footnote disclosure on the rendered row.
  // Only set on violation/permit rows; complaints never trip this flag.
  is_backdated?: boolean
  // Permit-only display fields (carried from the permits SELECT). The render
  // layer uses these to compose a structured block (contact line + cost) in
  // place of the long work_description that used to occupy that slot. Null
  // skips the corresponding line in the rendered row.
  permit_reported_cost?: number | null
  permit_contact_type?: string | null
  permit_contact_name?: string | null
  url_path?: string
}

export async function GET(request: Request) {
  // Protect with CRON_SECRET — Vercel cron calls authenticate via the header
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Test mode: redirect all sends to a single override email and (optionally)
  // process only one specific subscriber. Skips both the idempotency check
  // and the alert_digest_log write, so a real cron run later in the day is
  // not blocked. Still gated behind CRON_SECRET — only callable by anyone
  // who already has the production cron token.
  const url = new URL(request.url)
  const testMode = url.searchParams.get('test') === '1'
  const testEmail = url.searchParams.get('test_email')
  const testSubscriberId = url.searchParams.get('test_subscriber_id')
  if (testMode && !testEmail) {
    return NextResponse.json(
      { error: 'test=1 requires test_email to prevent accidental sends to real recipients' },
      { status: 400 }
    )
  }

  const resend = new Resend(process.env.RESEND_API_KEY)
  const supabase = getSupabaseAdmin()

  // Fixed 40-hour lookback for all sends. The wider window absorbs Vercel
  // cron drift AND complaint/violation/permit ingest lag (Worker A's 30-min
  // poll occasionally takes 3-5 hours to surface a slow complaint; Worker B
  // runs once daily at 2 AM CT). Per-event identifier dedupe (see below)
  // handles cross-run uniqueness — the wider window can never cause a
  // duplicate send because we filter against the prior 3 digest sends'
  // event identifiers before rendering.
  //
  // Replaces the per-subscriber `sent_at` floor shipped May 23. That floor
  // closed one class of duplicate (Worker B ingesting at 2 AM CT inside the
  // 26h overlap), but exposed a new class: a complaint whose `created_date`
  // predates the floor but whose `created_at` postdates the floor would
  // slip the SQL filter entirely. Filed May 23, manifest May 24 — see SR26-
  // 00967028 at 1765 E 55th St (city-recorded 03:14 AM CT May 23, ingested
  // 08:31 AM CT May 23, missing from May 24 digest). Identifier dedupe is
  // bulletproof and supersedes timing-based filtering.
  const now = new Date()
  const endIso = now.toISOString()
  const LOOKBACK_MS = 40 * 60 * 60 * 1000
  const startIso = new Date(now.getTime() - LOOKBACK_MS).toISOString()

  // digest_date = today's Chicago calendar date — used for the idempotency
  // guard (alert_digest_log unique index), so each calendar day sends once.
  const digestDate = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Chicago',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)

  // activityDate = YESTERDAY's Chicago calendar date — the day the summarized
  // activity actually happened. This is what shows in the email header.
  const yesterdayMs = now.getTime() - 24 * 60 * 60 * 1000
  const activityDate = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Chicago',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(yesterdayMs))

  // Get all subscribers where:
  //   1. Their subscribers.email_alerts is true (account-level master toggle)
  //   2. Their alert_settings.email_digest_enabled is true (digest-specific toggle)
  // Both must be true for an email to send.
  let enabledSubsQuery = supabase
    .from('alert_settings')
    .select(
      `
      subscriber_id,
      trigger_complaints,
      trigger_violations,
      trigger_permits,
      trigger_stop_work,
      email_digest_send_when_empty,
      subscribers!inner(email_alerts)
    `
    )
    .eq('email_digest_enabled', true)
    .eq('subscribers.email_alerts', true)

  // Test mode subscriber filter: process only the named subscriber if given.
  if (testMode && testSubscriberId) {
    enabledSubsQuery = enabledSubsQuery.eq('subscriber_id', testSubscriberId)
  }

  const { data: enabledSubs } = await enabledSubsQuery

  // Resolve subscriber_id → clerk_id once for all enabled subscribers, then
  // batch-load every user's SR preferences in a single round-trip. The loop
  // below slices per-user from these maps instead of querying prefs per
  // subscriber (the N+1 the seam was designed to avoid). user_sr_preferences
  // is keyed on clerk_id (matches portfolio_properties.user_id).
  const subscriberIds = ((enabledSubs ?? []) as Array<{ subscriber_id: string }>).map(
    (s) => s.subscriber_id
  )
  const clerkIdBySubscriber = new Map<string, string>()
  if (subscriberIds.length > 0) {
    const { data: subRows } = await supabase
      .from('subscribers')
      .select('id, clerk_id')
      .in('id', subscriberIds)
    for (const row of (subRows ?? []) as Array<{ id: string; clerk_id: string | null }>) {
      if (row.clerk_id) clerkIdBySubscriber.set(row.id, row.clerk_id)
    }
  }
  const enabledCodesByClerkId = await getEnabledCodesForUsers(
    supabase,
    Array.from(clerkIdBySubscriber.values())
  )

  const results: Array<{ subscriber_id: string; status: string; count: number; error?: string }> = []

  for (const setting of (enabledSubs ?? []) as unknown as Array<{
    subscriber_id: string
    trigger_complaints: boolean
    trigger_violations: boolean
    trigger_permits: boolean
    trigger_stop_work: boolean
    email_digest_send_when_empty: boolean
    subscribers?: { email_alerts: boolean }
  }>) {
    try {
      // Skip if already sent today (same-day idempotency guard).
      // Bypassed in test mode so the test can be re-run any number of times.
      if (!testMode) {
        const { data: alreadySent } = await supabase
          .from('alert_digest_log')
          .select('id')
          .eq('subscriber_id', setting.subscriber_id)
          .eq('digest_date', digestDate)
          .eq('status', 'sent')
          .maybeSingle()
        if (alreadySent) {
          results.push({ subscriber_id: setting.subscriber_id, status: 'already_sent', count: 0 })
          continue
        }
      }

      // Cross-run identifier dedupe. Pull the last 3 successful sends for
      // this subscriber, union their event-identifier arrays into three
      // Sets, filter SELECT results against them before queueing events.
      // Three rows is enough — the 40h lookback window means anything older
      // than ~3 days can't appear in this run's SQL fetch, so older
      // identifiers are dead weight.
      //
      // Test mode skips the dedupe lookup so re-runnable tests aren't
      // pinned to stale prior-send state.
      const sentComplaints = new Set<string>()
      const sentViolations = new Set<string>()
      const sentPermitsCross = new Set<string>()
      if (!testMode) {
        const { data: priorSends } = await supabase
          .from('alert_digest_log')
          .select('sent_complaint_sr_numbers, sent_violation_inspection_ids, sent_permit_numbers')
          .eq('subscriber_id', setting.subscriber_id)
          .eq('status', 'sent')
          .order('sent_at', { ascending: false })
          .limit(3)
        for (const row of (priorSends ?? []) as Array<{
          sent_complaint_sr_numbers: string[] | null
          sent_violation_inspection_ids: string[] | null
          sent_permit_numbers: string[] | null
        }>) {
          for (const sr of row.sent_complaint_sr_numbers ?? []) sentComplaints.add(sr)
          for (const id of row.sent_violation_inspection_ids ?? []) sentViolations.add(id)
          for (const pn of row.sent_permit_numbers ?? []) sentPermitsCross.add(pn)
        }
      }

      // Get subscriber's clerk_id and email recipients
      const { data: subscriber } = await supabase
        .from('subscribers')
        .select('clerk_id, organization, role, plan, subscription_status, trial_started_at')
        .eq('id', setting.subscriber_id)
        .maybeSingle()
      if (!subscriber) continue
      const { clerk_id, organization } = subscriber as { clerk_id: string; organization: string | null }

      // Entitlement gate: only entitled accounts receive the digest. Admins
      // always pass (so test sends to your own account work). Lapsed trials
      // and never-paid users are skipped — alerts stop when entitlement ends.
      // Test mode bypasses this so you can send a test digest to any account.
      if (!testMode) {
        const digestRole = (subscriber as { role?: string | null }).role ?? ''
        const digestEnt = computeEntitlement({
          plan: (subscriber as { plan?: string | null }).plan ?? null,
          subscription_status: (subscriber as { subscription_status?: string | null }).subscription_status ?? null,
          trial_started_at: (subscriber as { trial_started_at?: string | null }).trial_started_at ?? null,
        })
        if (digestRole !== 'admin' && !digestEnt.entitled) {
          results.push({ subscriber_id: setting.subscriber_id, status: 'skipped_not_entitled', count: 0 })
          continue
        }
      }

      // Per-subscriber enabled SR codes from the batch pre-load. Empty set =
      // nothing enabled (un-seeded or read failure) → no complaints surface,
      // which is the safe-quiet behavior. Seeded users always have a full set.
      const enabledCodes = enabledCodesByClerkId.get(clerk_id) ?? new Set<string>()

      const { data: recipients } = await supabase
        .from('alert_recipients')
        .select('address')
        .eq('subscriber_id', setting.subscriber_id)
        .eq('channel', 'email')
        .order('position', { ascending: true })

      // In test mode every send is redirected to the test_email regardless of
      // the subscriber's configured recipients. testEmail is guaranteed
      // non-null here by the 400-guard at the top of GET.
      const emails = testMode
        ? [testEmail as string]
        : (recipients ?? []).map((r) => (r as { address: string }).address).filter(Boolean)
      if (emails.length === 0) {
        results.push({ subscriber_id: setting.subscriber_id, status: 'no_recipients', count: 0 })
        continue
      }

      // Get subscriber's portfolio + approved building ranges in parallel.
      // The ranges are joined in-memory below to derive nav slugs that decode
      // to addresses findApprovedUserRange direct-matches on the property
      // page — recipients clicking through from the email land on full-
      // building view, not single-unit view.
      const [propsResult, rangesResult] = await Promise.all([
        supabase
          .from('portfolio_properties')
          .select('id, canonical_address, address_range, additional_streets, display_name, slug')
          .eq('user_id', clerk_id),
        supabase
          .from('user_building_ranges')
          .select('searched_address, street1_low, street1_high, street2_low, street2_high, street3_low, street3_high, street4_low, street4_high')
          .eq('status', 'approved'),
      ])

      const props = propsResult.data
      const userRanges = (rangesResult.data ?? []) as UserBuildingRange[]

      if (!props || props.length === 0) {
        results.push({ subscriber_id: setting.subscriber_id, status: 'empty_portfolio', count: 0 })
        continue
      }

      // Build address → property mapping
      const addressToProperty = new Map<string, { id: string; display: string; slug: string | null }>()
      for (const p of props as Array<{
        id: string
        canonical_address: string
        address_range: string | null
        additional_streets: string[] | null
        display_name: string | null
        slug: string | null
      }>) {
        const display = p.display_name || p.canonical_address
        // Slug derived from the matching user_building_ranges row's
        // searched_address. See lib/formatAddress.ts addressToSlug + the
        // local buildNavSlug above for details — same approach used by
        // /api/dashboard/activity.
        const slug = buildNavSlug(p.canonical_address, p.slug, userRanges)
        for (const addr of getAllAddresses(p.canonical_address, p.address_range, p.additional_streets)) {
          addressToProperty.set(addr, { id: p.id, display, slug })
        }
      }
      const allAddresses = Array.from(addressToProperty.keys())

      // Fetch yesterday's events (parallel)
      const events: DigestEvent[] = []

      if (setting.trigger_complaints) {
        // Filter by created_at (our ingestion timestamp), NOT created_date
        // (city's official record time). Mirrors the violations/permits
        // approach shipped May 17. Without this, complaints created BEFORE
        // the prior cron fired but ingested AFTER it slip through the SQL
        // filter forever (e.g. SR26-00967028 at 1765 E 55th, city-recorded
        // 03:14 AM CT but Worker A took 5h to ingest, missing from the
        // May 24 digest under the prior `sent_at` floor logic).
        //
        // Need sr_number on the SELECT now for cross-run dedupe identifier.
        // Exclude duplicate complaints. Salesforce auto-couples duplicates by
        // address+type; the parent SR carries the workflow, the child adds
        // noise without information for the digest reader. Surface them in
        // the dashboard (with badge) but skip in the email entirely.
        // .or() form keeps legacy null rows (pre-duplicate-column ingest).
        const { data: complaints } = await supabase
          .from('complaints_311')
          .select('sr_number, sr_type, sr_short_code, created_date, created_at, address_normalized, standard_description, complaint_description, concern_category, problem_category, status, work_order_status, final_outcome, workflow_step')
          .in('address_normalized', allAddresses)
          .in('sr_short_code', Array.from(enabledCodes))
          .gte('created_at', startIso)
          .lt('created_at', endIso)
          .or('duplicate.is.null,duplicate.is.false')
          .order('created_at', { ascending: false })
          .limit(500)

        for (const c of (complaints ?? []) as Array<{
          sr_number: string | null
          sr_type: string | null
          sr_short_code: string | null
          created_date: string | null
          created_at: string | null
          address_normalized: string | null
          standard_description: string | null
          complaint_description: string | null
          concern_category: string | null
          problem_category: string | null
          status: string | null
          work_order_status: string | null
          final_outcome: string | null
          workflow_step: string | null
        }>) {
          if (!c.address_normalized || !c.created_date) continue
          const meta = addressToProperty.get(c.address_normalized)
          if (!meta) continue
          // Cross-run dedupe: skip if this SR was in a prior digest send.
          if (c.sr_number && sentComplaints.has(c.sr_number)) continue

          // Build description from standard_description + structured intake.
          // For structured-intake codes (SGA, WM3, AAD, AAI) standard_description
          // is null but concern_category/problem_category carry the signal.
          // Join the two structured fields with " / " when both present.
          const desc = c.standard_description?.trim() || null
          const concern = c.concern_category?.trim() || null
          const problem = c.problem_category?.trim() || null
          const rawDesc = c.complaint_description?.trim() || null
          // Labeled structured description (e.g. "Alley caved-in: No; Alley
          // flooded: Yes; Surface: Paved" for AAI). Falls back to a bare
          // "concern / problem" join for codes with no label entry.
          const structured = buildStructuredDescription(
            c.sr_short_code, concern, problem, rawDesc,
          )
          let description: string | null = null
          if (desc && structured) {
            description = `${desc} — ${structured}`
          } else if (desc) {
            description = desc
          } else if (structured) {
            description = structured
          }

          // Surface WOLI state. Prefer final_outcome whenever the Aura work
          // order is closed and an outcome is populated — that's the city's
          // actual disposition ("EMERGENCY RELIEVED", "Need COMED", "Alley
          // Baited", "No Problem Found"). Worker A's incremental cursor lags
          // on closing parent SRs, so complaints_311.status often still reads
          // Open after the city has finished work; work_order_status is the
          // authoritative signal. Fall through to workflow_step ("Dispatch
          // Crew", "Investigation/Inspection") only when no outcome is recorded.
          const isWorkOrderClosed =
            String(c.work_order_status ?? '').toLowerCase() === 'closed'
          const outcome = c.final_outcome?.trim() || null
          const woliStage = isWorkOrderClosed && outcome
            ? outcome
            : (c.workflow_step?.trim() || null)
          const woliIsClosed = isWorkOrderClosed && Boolean(outcome)

          // Backdated flag now applies to complaints too: created_date (city
          // record date) older than the digest's "yesterday" → the row is here
          // because it just landed in our ingest pipe, not because it happened
          // yesterday. Compare the YYYY-MM-DD prefix, same as violations/permits.
          const complaintBackdated = c.created_date.slice(0, 10) !== activityDate

          events.push({
            property_display: meta.display,
            property_id: meta.id,
            property_slug: meta.slug,
            kind: 'complaint',
            dedupe_id: c.sr_number ?? null,
            label: c.sr_type ?? 'Building Complaint',
            description,
            woli_stage: woliStage,
            woli_is_closed: woliIsClosed,
            date: c.created_date,
            is_backdated: complaintBackdated,
          })
        }
      }

      // Query violations if either trigger_violations OR trigger_stop_work is on.
      //
      // FILTER NOTE (changed May 17): we filter by `created_at` (our ingestion
      // timestamp), NOT by `violation_date` (the city's official record date).
      // Per the May 17 lag analysis, 95%+ of violations land in Chicago's
      // Socrata feed 3-7+ days after the city-recorded date — filtering on
      // violation_date inside the lookback window produced a near-zero
      // capture rate. is_backdated flags rows whose violation_date is older
      // than the digest's "yesterday" so the email can surface an asterisk
      // + footnote disclosure.
      //
      // GROUPING NOTE (added May 17): rows are grouped by inspection_number
      // into a single digest event per inspection, mirroring the dashboard's
      // activity feed treatment. Label uses category · bureau · count;
      // description lists the individual violation codes.
      if (setting.trigger_violations || setting.trigger_stop_work) {
        const { data: violations } = await supabase
          .from('violations')
          .select('violation_description, violation_date, address_normalized, is_stop_work_order, inspection_number, inspection_category, department_bureau, created_at')
          .in('address_normalized', allAddresses)
          .gte('created_at', startIso)
          .lt('created_at', endIso)
          .order('created_at', { ascending: false })
          .limit(500)

        type ViolationRow = {
          violation_description: string | null
          violation_date: string | null
          address_normalized: string | null
          is_stop_work_order: boolean | null
          inspection_number: string | null
          inspection_category: string | null
          department_bureau: string | null
          created_at: string | null
        }

        // Group by inspection_number. Rows missing it get a synthetic
        // unique key (preserves the prior null-inspection per-row behavior).
        const violationGroups = new Map<string, ViolationRow[]>()
        let _orphanCounter = 0
        for (const v of (violations ?? []) as ViolationRow[]) {
          const key = v.inspection_number || `__orphan_${++_orphanCounter}`
          const arr = violationGroups.get(key)
          if (arr) arr.push(v)
          else violationGroups.set(key, [v])
        }

        for (const [groupKey, rows] of violationGroups) {
          const first = rows[0]
          if (!first.address_normalized || !first.violation_date) continue
          const meta = addressToProperty.get(first.address_normalized)
          if (!meta) continue

          // Stop-work fires per-inspection if any row in the group has it set.
          const isStopWork = rows.some((r) => Boolean(r.is_stop_work_order))
          if (isStopWork && !setting.trigger_stop_work) continue
          if (!isStopWork && !setting.trigger_violations) continue

          // Cross-run dedupe: skip if this inspection was in a prior send.
          // Orphan rows (no inspection_number) use the synthetic counter key
          // which resets each run — they can't be persisted meaningfully, so
          // they're always sent. Acceptable since orphans are rare and a
          // false re-send is preferable to silently dropping a violation.
          if (
            first.inspection_number &&
            sentViolations.has(first.inspection_number)
          ) continue
          // groupKey is intentionally unused for dedupe — same reasoning.
          void groupKey

          // Compare YYYY-MM-DD prefix against activityDate (yesterday-CT).
          const isBackdated = first.violation_date.slice(0, 10) !== activityDate

          // Label carries the inspection identifier (or STOP-WORK ORDER
          // override). Render-time logic in renderEmailHtml prepends the
          // "Violation" kind word in red for non-stop-work rows.
          let label: string
          if (isStopWork) {
            label = 'STOP-WORK ORDER'
          } else {
            label = first.inspection_number
              ? `Inspection #${first.inspection_number}`
              : 'Violation'
          }

          // Description: "Complaint - Conservation • 10 violations".
          // Hyphen pairs the compound title (category + bureau, treated as
          // one field). Bullet separates that title from the violation
          // count (a distinct field). Stop-work skips the description —
          // the label already conveys what happened.
          const category = toTitleCase((first.inspection_category || 'Violation').trim())
          const bureau = first.department_bureau?.trim()
            ? toTitleCase(first.department_bureau.trim())
            : null
          const count = rows.length
          const countSuffix = `${count} violation${count === 1 ? '' : 's'}`
          const compoundTitle = bureau ? `${category} - ${bureau}` : category
          const description = isStopWork ? null : `${compoundTitle} • ${countSuffix}`

          events.push({
            property_display: meta.display,
            property_id: meta.id,
            property_slug: meta.slug,
            kind: 'violation',
            dedupe_id: first.inspection_number ?? null,
            label,
            description,
            date: first.violation_date,
            is_backdated: isBackdated,
          })
        }
      }

      // Filter permits by `created_at` (our ingestion timestamp), NOT by
      // `issue_date`. Same rationale as violations above — ~89% of permits
      // publish 3-7+ days backdated relative to the city's recorded issue date.
      // is_backdated flags rows whose issue_date is older than the digest's
      // "yesterday".
      if (setting.trigger_permits) {
        const { data: permits } = await supabase
          .from('permits')
          .select('permit_type, work_description, issue_date, address_normalized, permit_number, reported_cost, contact_1_name, contact_1_type, created_at')
          .in('address_normalized', allAddresses)
          .gte('created_at', startIso)
          .lt('created_at', endIso)
          .order('created_at', { ascending: false })
          .limit(500)

          const seenPermits = new Set<string>()
          for (const p of (permits ?? []) as Array<{
            permit_type: string | null
            work_description: string | null
            issue_date: string | null
            address_normalized: string | null
            permit_number: string | null
            reported_cost: number | string | null
            contact_1_name: string | null
            contact_1_type: string | null
            created_at: string | null
          }>) {
            // In-run dedupe: same permit_number returned twice by the SELECT.
            if (p.permit_number && seenPermits.has(p.permit_number)) continue
            if (p.permit_number) seenPermits.add(p.permit_number)
            // Cross-run dedupe: skip if this permit was in a prior send.
            if (p.permit_number && sentPermitsCross.has(p.permit_number)) continue
            if (!p.address_normalized || !p.issue_date) continue
            const meta = addressToProperty.get(p.address_normalized)
            if (!meta) continue

          const isBackdated = p.issue_date.slice(0, 10) !== activityDate

          // Permit description on the digest is a structured block: contact
          // line ("CONTRACTOR-ELEVATOR — Urban Elevator Service") and cost
          // ($1,149,719). work_description is dropped — too long, often
          // boilerplate. The render layer assembles these from the fields
          // stuffed onto DigestEvent below.
          const reportedCostNum =
            p.reported_cost != null && Number(p.reported_cost) > 0
              ? Number(p.reported_cost)
              : null
          const contactType = p.contact_1_type?.trim() || null
          const contactName = p.contact_1_name?.trim() || null

          events.push({
            property_display: meta.display,
            property_id: meta.id,
            property_slug: meta.slug,
            kind: 'permit',
            dedupe_id: p.permit_number ?? null,
            label: p.permit_type ?? 'Permit',
            description: null,
            date: p.issue_date,
            is_backdated: isBackdated,
            permit_reported_cost: reportedCostNum,
            permit_contact_type: contactType,
            permit_contact_name: contactName,
          })
        }
      }

      // Empty-event digests: skip if user has opted out.
      // In test mode we always send through so the test can verify the
      // empty-state render path too — and we never write to the log.
      if (events.length === 0 && !setting.email_digest_send_when_empty && !testMode) {
        await supabase.from('alert_digest_log').insert({
          subscriber_id: setting.subscriber_id,
          digest_date: digestDate,
          recipients: emails,
          events_count: 0,
          status: 'skipped_no_events',
        })
        results.push({ subscriber_id: setting.subscriber_id, status: 'skipped_no_events_by_preference', count: 0 })
        continue
      }

      // Render email
      const orgName = organization || 'Your portfolio'
      const subject = renderSubject(events)
      const html = renderEmailHtml(orgName, events, digestDate, activityDate)

      // Send via Resend
      const fromAddress = process.env.RESEND_FROM_EMAIL || 'Property Sentinel <noreply@updates.propertysentinel.io>'
      // BCC delivery: each recipient sees the email as if they're the only one on it.
      // "To" is set to a noreply sender address (most email clients flag empty-To as spam).
      const { error: sendError } = await resend.emails.send({
        from: fromAddress,
        to: 'support@propertysentinel.io',
        bcc: emails,
        replyTo: 'jim@propertysentinel.io',
        subject,
        html,
      })

      if (sendError) {
        if (!testMode) {
          await supabase.from('alert_digest_log').insert({
            subscriber_id: setting.subscriber_id,
            digest_date: digestDate,
            recipients: emails,
            events_count: events.length,
            status: 'failed',
            error_message: sendError.message,
          })
        }
        results.push({
          subscriber_id: setting.subscriber_id,
          status: testMode ? 'test_failed' : 'failed',
          count: events.length,
          error: sendError.message,
        })
        continue
      }

      // Log success — skipped in test mode so the real cron later today
      // (if any) still has a clean idempotency slate for this subscriber.
      const summary = {
        complaints: events.filter((e) => e.kind === 'complaint').length,
        violations: events.filter((e) => e.kind === 'violation').length,
        permits: events.filter((e) => e.kind === 'permit').length,
      }
      // Collect dedupe identifiers from events that were actually sent. Drop
      // nulls (orphan violations have no inspection_number — they're sent
      // every time they appear in the SQL window, which is acceptable).
      const sentComplaintIds = events
        .filter((e) => e.kind === 'complaint' && e.dedupe_id != null)
        .map((e) => e.dedupe_id as string)
      const sentViolationIds = events
        .filter((e) => e.kind === 'violation' && e.dedupe_id != null)
        .map((e) => e.dedupe_id as string)
      const sentPermitIds = events
        .filter((e) => e.kind === 'permit' && e.dedupe_id != null)
        .map((e) => e.dedupe_id as string)

      if (!testMode) {
        await supabase.from('alert_digest_log').insert({
          subscriber_id: setting.subscriber_id,
          digest_date: digestDate,
          recipients: emails,
          events_count: events.length,
          event_summary: summary,
          status: 'sent',
          sent_complaint_sr_numbers: sentComplaintIds,
          sent_violation_inspection_ids: sentViolationIds,
          sent_permit_numbers: sentPermitIds,
        })
      }
      results.push({
        subscriber_id: setting.subscriber_id,
        status: testMode ? 'test_sent' : 'sent',
        count: events.length,
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      results.push({ subscriber_id: setting.subscriber_id, status: 'error', count: 0, error: msg })
    }
  }

  return NextResponse.json({
    digest_date: digestDate,
    processed: results.length,
    results,
  })
}

function renderSubject(events: DigestEvent[]): string {
  const stopWorks = events.filter((e) => e.kind === 'violation' && e.label === 'STOP-WORK ORDER').length

  if (stopWorks > 0) {
    return `Daily Digest — 🚨 Stop-Work Order Issued`
  }
  if (events.length === 0) {
    return 'Daily Digest — All Clear'
  }
  return 'Daily Digest — Activity Reported'
}

function escapeHtml(s: string): string {
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }
  return s.replace(/[&<>"']/g, (m) => map[m] ?? m)
}

// created_date is Chicago local time stored with a FALSE +00:00 marker (verified
// against Socrata's created_hour: a 7 PM CT complaint stores as "19:38:02+00").
// It is NOT true UTC despite the suffix. To display correctly: slice off the
// false offset, re-append 'Z' to force UTC parsing, then format with
// timeZone: 'UTC' so the stored wall-clock digits render unchanged — no
// double-offset. Mirrors formatSocrataTimeCT on /status and the slice-based
// formatOpenDateTime in ComplaintDetail/_shared.
function formatChicagoTime(iso: string): string {
  try {
    const clean = String(iso).slice(0, 19)
    const d = new Date(clean + 'Z')
    if (Number.isNaN(d.getTime())) return iso
    return new Intl.DateTimeFormat('en-US', {
      timeZone: 'UTC',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    }).format(d) + ' CDT'
  } catch {
    return iso
  }
}

// Date-only formatter for Postgres DATE columns (violation_date, issue_date).
// JS parses 'YYYY-MM-DD' as UTC midnight, which becomes the previous day in
// Chicago (UTC-5/-6). Pinning to noon UTC sidesteps the timezone-shift bug
// that surfaced May 17 with the Washtenaw violation showing as May 13 7pm
// instead of May 14.
function formatChicagoDateOnly(dateStr: string): string {
  try {
    const iso = `${dateStr.slice(0, 10)}T12:00:00.000Z`
    return new Date(iso).toLocaleDateString('en-US', {
      timeZone: 'America/Chicago',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
  } catch {
    return dateStr
  }
}

// Pick the right date formatter per event kind: complaints carry real
// timestamps on created_date; violations/permits carry DATE columns and
// must skip TZ-conversion of the implicit midnight.
function formatEventDate(e: DigestEvent): string {
  if (e.kind === 'complaint') return formatChicagoTime(e.date)
  return formatChicagoDateOnly(e.date)
}

// Title-case the city's all-caps source data. "COMPLAINT" → "Complaint",
// "BUILDING ENFORCEMENT" → "Building Enforcement", "STOP-WORK" → "Stop-Work".
function toTitleCase(s: string): string {
  return s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())
}

function buildPreheader(events: DigestEvent[]): string {
  const complaints = events.filter((e) => e.kind === 'complaint').length
  const violations = events.filter((e) => e.kind === 'violation').length
  const permits = events.filter((e) => e.kind === 'permit').length
  const parts: string[] = []
  if (complaints > 0) parts.push(`${complaints} complaint${complaints === 1 ? '' : 's'}`)
  if (violations > 0) parts.push(`${violations} violation${violations === 1 ? '' : 's'}`)
  if (permits > 0) parts.push(`${permits} permit${permits === 1 ? '' : 's'}`)
  return parts.length > 0 ? parts.join(' · ') : 'Your portfolio was monitored — nothing new to report'
}

function renderEmailHtml(orgName: string, events: DigestEvent[], digestDate: string, activityDate: string): string {
  // activityDate is yesterday's Chicago calendar date — the day the summarized
  // activity happened. This is what the header displays.
  // Adding T12:00:00Z avoids timezone parsing edge cases at midnight.
  const formattedDate = new Date(`${activityDate}T12:00:00.000Z`).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })

  // Group events by property. slug is captured from whichever event landed
  // first for each property (all events on the same property share the same
  // slug via the addressToProperty map, so any event suffices).
  const byProperty = new Map<string, { display: string; slug: string | null; events: DigestEvent[] }>()
  for (const e of events) {
    if (!byProperty.has(e.property_id)) {
      byProperty.set(e.property_id, { display: e.property_display, slug: e.property_slug, events: [] })
    }
    byProperty.get(e.property_id)!.events.push(e)
  }

  const propertyBlocks =
    events.length === 0
      ? `
    <div style="text-align: center; padding: 24px 12px;">
      <div style="font-family: 'Merriweather', Georgia, serif; font-size: 16px; font-weight: 600; color: #3e7d4e; margin-bottom: 8px;">
        ✓ All quiet today
      </div>
      <div style="font-size: 13px; color: #666; line-height: 1.5;">
        Your portfolio was monitored — nothing new to report.
      </div>
    </div>
  `
      : Array.from(byProperty.values())
          .map((p) => {
            // Sort events within this property: earliest first.
            const propEventsSorted = [...p.events].sort((a, b) => {
              const ta = new Date(a.date).getTime()
              const tb = new Date(b.date).getTime()
              return ta - tb
            })
            // Compute the earliest event timestamp for cross-property sorting.
            const earliestMs = propEventsSorted.length > 0
              ? new Date(propEventsSorted[0].date).getTime()
              : Number.MAX_SAFE_INTEGER
            return { ...p, propEventsSorted, earliestMs }
          })
          .sort((a, b) => a.earliestMs - b.earliestMs)
          .map(({ display, slug, propEventsSorted }) => {

            // Group by kind within this property. Complaints first, then
            // violations, then permits. Oldest-first within each group.
            // Dotted divider between groups that both have rows.
            const KIND_ORDER: Record<DigestEvent['kind'], number> = {
              complaint: 0,
              violation: 1,
              permit: 2,
            }
            const grouped: Record<DigestEvent['kind'], DigestEvent[]> = {
              complaint: [],
              violation: [],
              permit: [],
            }
            for (const e of propEventsSorted) grouped[e.kind].push(e)
            const sortAsc = (a: DigestEvent, b: DigestEvent) =>
              new Date(a.date).getTime() - new Date(b.date).getTime()
            grouped.complaint.sort(sortAsc)
            grouped.violation.sort(sortAsc)
            grouped.permit.sort(sortAsc)

            // Flatten into a single array, recording for each row whether it's
            // first within its kind (for top padding) and last within its kind
            // (for divider placement). Row-level flags drive the render below.
            type FlatRow = {
              event: DigestEvent
              isFirstInKind: boolean
              isLastInKind: boolean
              isFirstOverall: boolean
              isLastOverall: boolean
              isLastInKindBeforeAnotherKind: boolean
            }
            const orderedKinds = (['complaint', 'violation', 'permit'] as const).filter(
              (k) => grouped[k].length > 0
            )
            const flat: FlatRow[] = []
            let overallIdx = 0
            const totalRows = orderedKinds.reduce((sum, k) => sum + grouped[k].length, 0)
            for (let ki = 0; ki < orderedKinds.length; ki++) {
              const kind = orderedKinds[ki]
              const rows = grouped[kind]
              for (let i = 0; i < rows.length; i++) {
                const isLastInKind = i === rows.length - 1
                const hasNextKind = ki < orderedKinds.length - 1
                flat.push({
                  event: rows[i],
                  isFirstInKind: i === 0,
                  isLastInKind,
                  isFirstOverall: overallIdx === 0,
                  isLastOverall: overallIdx === totalRows - 1,
                  isLastInKindBeforeAnotherKind: isLastInKind && hasNextKind,
                })
                overallIdx++
              }
            }

            const eventRows = flat
              .map((row) => {
                const e = row.event
                const isStopWorkRow = e.label === 'STOP-WORK ORDER'
                // Kind prefix:
                //   complaint  → "311 •" in blue (the sr_type doesn't always
                //                say "311" so this clarifies the source)
                //   violation  → "Violation •" in red
                //   permit     → no prefix; permit_type labels (e.g.
                //                "PERMIT - ELEVATOR EQUIPMENT") already
                //                carry the kind word, so prepending
                //                "Permit •" duplicates it
                //   stop-work  → skip; the label dominates the row
                let kindPrefix = ''
                if (e.kind === 'complaint') {
                  kindPrefix = `<span style="color: #1e3a5f; font-weight: 600;">311</span> <span style="color: #999;">&bull;</span> `
                } else if (e.kind === 'violation' && !isStopWorkRow) {
                  kindPrefix = `<span style="color: #b8302a; font-weight: 600;">Violation</span> <span style="color: #999;">&bull;</span> `
                }
                // Label color by kind:
                //   stop-work        → red (#b8302a)
                //   violation        → black (#1a1a1a); kind word on the prefix
                //   complaint        → blue (#1e3a5f); sr_type itself is the kind
                //   permit           → green (#166534); kind word also on the prefix
                let labelColor: string
                if (isStopWorkRow) labelColor = '#b8302a'
                else if (e.kind === 'complaint') labelColor = '#1e3a5f'
                else if (e.kind === 'permit') labelColor = '#166534'
                else labelColor = '#1a1a1a'
                const labelWeight = isStopWorkRow ? '700' : '500'

                // Permit-only: structured block in place of work_description.
                // Contact line ("CONTRACTOR-ELEVATOR — Urban Elevator Service, LLC")
                // appears only when BOTH type and name are present. Cost
                // ($1,149,719) appears only when reported_cost > 0.
                let permitContactLine = ''
                let permitCostLine = ''
                if (e.kind === 'permit') {
                  if (e.permit_contact_type && e.permit_contact_name) {
                    permitContactLine = `<div style="font-size: 12px; color: #666; margin-top: 2px;">${escapeHtml(e.permit_contact_type)} — ${escapeHtml(e.permit_contact_name)}</div>`
                  }
                  if (e.permit_reported_cost != null && e.permit_reported_cost > 0) {
                    permitCostLine = `<div style="font-size: 12px; color: #666; margin-top: 2px;">$${e.permit_reported_cost.toLocaleString()}</div>`
                  }
                }

                // Vertical spacing rules:
                //   First row in property: no top padding
                //   Last row in property: no bottom padding
                //   Otherwise: 6px gap between events
                const paddingTop = row.isFirstOverall ? 0 : 6
                const paddingBottom = row.isLastOverall ? 0 : 6

                // Divider row appended after this event when this row is the
                // last in its kind AND there's another kind coming after.
                // Dotted top border, modest vertical breathing room.
                const dividerRow = row.isLastInKindBeforeAnotherKind
                  ? `
            <tr>
              <td style="padding: 8px 0 0 0;">
                <div style="border-top: 1px dotted #d9d3c2; height: 1px; line-height: 1px; font-size: 1px;">&nbsp;</div>
              </td>
            </tr>
          `
                  : ''

                return `
            <tr>
              <td style="padding: ${paddingTop}px 0 ${paddingBottom}px 0;">
                <div style="font-size: 13px; color: ${labelColor}; font-weight: ${labelWeight};">
                  ${kindPrefix}${escapeHtml(e.label)}
                </div>
                ${e.description ? `<div style="font-size: 12px; color: #666; margin-top: 2px; font-style: italic;">${escapeHtml(e.description)}</div>` : ''}
                ${permitContactLine}
                ${permitCostLine}
                ${e.woli_stage ? `<div style="font-size: 11px; margin-top: 3px;"><span style="color: #4a4a4a; font-weight: 700;">${e.woli_is_closed ? 'CLOSED' : 'OPEN'}</span> <span style="color: #888; font-weight: 500;">— ${escapeHtml(e.woli_stage)}</span></div>` : ''}
                <div style="font-size: 11px; color: #999; margin-top: 4px; font-family: 'DM Mono', ui-monospace, monospace;">
                  ${e.is_backdated ? '<sup style="font-size: 10px; line-height: 0;">*</sup>' : ''}${escapeHtml(formatEventDate(e))}
                </div>
              </td>
            </tr>
          ${dividerRow}`
              })
              .join('')

            // Property heading: real <a> link when slug is available, plain
            // text fallback otherwise. ?building=true expands the address
            // page directly to the full building range, suppressing the
            // BuildingDetectionModal interstitial (same pattern as the
            // dashboard "Full property page →" link). Navy + underline gives
            // an unambiguous link affordance that survives iOS Mail's
            // auto-linking quirks, which were the original motivation for
            // the (now removed) format-detection meta tag.
            const propertyHeading = slug
              ? `<a href="https://propertysentinel.io/address/${encodeURIComponent(slug)}?building=true" style="font-family: 'Merriweather', Georgia, serif; font-size: 15px; font-weight: 600; color: #1e3a5f; text-decoration: underline; margin-bottom: 0; display: inline-block;">${escapeHtml(display)}</a>`
              : `<div style="font-family: 'Merriweather', Georgia, serif; font-size: 15px; font-weight: 600; color: #1a1a1a; margin-bottom: 0;">${escapeHtml(display)}</div>`
            return `
        <div style="margin-bottom: 14px;">
          ${propertyHeading}
          <div style="padding-left: 12px; margin-top: 2px;">
            <table style="width: 100%; border-collapse: collapse;">
              ${eventRows}
            </table>
          </div>
        </div>
      `
          })
          .join('')

  const totals = {
    complaints: events.filter((e) => e.kind === 'complaint').length,
    violations: events.filter((e) => e.kind === 'violation').length,
    permits: events.filter((e) => e.kind === 'permit').length,
  }

  // Backdating disclosure: rendered only when at least one violation or permit
  // row has a city-recorded date older than the digest's "yesterday". Quiet
  // days (no events) and same-day-only days emit nothing.
  const hasBackdated = events.some((e) => e.is_backdated === true)
  const backdatedFootnote = hasBackdated
    ? `
          <div style="padding-top: 14px; margin-top: 6px;">
            <div style="font-size: 11px; color: #888; line-height: 1.5; font-style: italic;">
              *Reflects the city&rsquo;s official record &mdash; violations and permits are typically published to Chicago&rsquo;s open data feed on a 2&ndash;7 day lag; similar lags are atypical for 311 complaints, although they do occur.
            </div>
          </div>`
    : ''

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="x-apple-disable-message-reformatting">
  <title>Property Sentinel Daily Digest</title>
</head>
<body style="margin: 0; padding: 0; background: #faf8f3; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">
  <!-- Preheader: invisible to readers, used by clients for preview text -->
  <div style="display: none !important; max-height: 0; overflow: hidden; mso-hide: all; visibility: hidden; font-size: 1px; line-height: 1px; color: transparent; opacity: 0; height: 0; width: 0;">
    ${escapeHtml(buildPreheader(events))} — ${escapeHtml(new Date(`${activityDate}T12:00:00.000Z`).toLocaleDateString('en-US', { month: 'long', day: 'numeric' }))}
  </div>
  <!-- Preheader blocker: zero-width chars to push trailing content out of preview window -->
  <div style="display: none !important; max-height: 0; overflow: hidden; mso-hide: all; visibility: hidden; font-size: 1px; line-height: 1px; color: transparent; opacity: 0; height: 0; width: 0;">
    &zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;
  </div>
  <table style="width: 100%; max-width: 600px; margin: 0 auto;">
    <tr>
      <td style="padding: 24px 0;">
        <!-- Header -->
        <div style="background: #243f5e; color: #ffffff; padding: 20px 24px; border-radius: 8px 8px 0 0;">
          <div style="font-family: 'Merriweather', Georgia, serif; font-size: 20px; font-weight: 600; line-height: 1.2; color: #ffffff;">
            ${escapeHtml(orgName)} — Daily Digest
          </div>
          <div style="font-family: 'Merriweather', Georgia, serif; font-size: 11px; font-style: italic; color: rgba(255,255,255,0.6); margin-top: 4px;">
            by Property Sentinel
          </div>
          <div style="font-size: 12px; color: rgba(255,255,255,0.7); margin-top: 6px;">
            Yesterday's activity — ${escapeHtml(formattedDate)}
          </div>
        </div>

        <!-- Stats bar -->
        <div style="background: #ffffff; padding: 16px 24px; border-bottom: 1px solid #ece8dd;">
          <table style="width: 100%; border-collapse: collapse; table-layout: fixed;">
            <tr>
              <td style="width: 33.33%; text-align: center; padding: 8px; vertical-align: top;">
                <div style="font-family: monospace; font-size: 24px; font-weight: 700; color: #1e3a5f;">${totals.complaints}</div>
                <div style="font-size: 10px; color: #888; text-transform: uppercase; letter-spacing: 0.05em;">complaints</div>
              </td>
              <td style="width: 33.33%; text-align: center; padding: 8px; vertical-align: top;">
                <div style="font-family: monospace; font-size: 24px; font-weight: 700; color: #b8302a;">${totals.violations}</div>
                <div style="font-size: 10px; color: #888; text-transform: uppercase; letter-spacing: 0.05em;">violations</div>
              </td>
              <td style="width: 33.33%; text-align: center; padding: 8px; vertical-align: top;">
                <div style="font-family: monospace; font-size: 24px; font-weight: 700; color: #166534;">${totals.permits}</div>
                <div style="font-size: 10px; color: #888; text-transform: uppercase; letter-spacing: 0.05em;">permits</div>
              </td>
            </tr>
          </table>
        </div>

        <!-- Events by property -->
        <div style="background: #ffffff; padding: 24px; border-radius: 0 0 8px 8px;">
          ${propertyBlocks}
          ${backdatedFootnote}
          <!-- Inline dashboard link at end of events -->
          <div style="text-align: center; padding-top: 20px; margin-top: 12px; border-top: 1px solid #ece8dd;">
            <a href="https://propertysentinel.io/dashboard/portfolio" style="color: #1e3a5f; text-decoration: none; font-size: 13px; font-weight: 500;">
              View full dashboard →
            </a>
            <div style="font-size: 11px; color: #aaa; margin-top: 8px;">
              Manage alert preferences in your <a href="https://propertysentinel.io/dashboard/settings" style="color: #888;">settings</a>
            </div>
          </div>
        </div>
      </td>
    </tr>
  </table>
</body>
</html>`
}
