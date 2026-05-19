import { NextResponse } from 'next/server'
import { Resend } from 'resend'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { getAllAddresses } from '@/lib/portfolio-stats'
import { getPortfolioBuildingSlug } from '@/lib/portfolio-address-expansion'
import { DEFAULT_VISIBLE_CODES } from '@/lib/sr-codes'

export const maxDuration = 300 // 5 min for Vercel Pro / Hobby Pro

type DigestEvent = {
  property_display: string
  property_id: string
  property_slug: string | null
  kind: 'complaint' | 'violation' | 'permit'
  label: string
  description: string | null
  // Current city action on the work order (complaints only). For open cases:
  // workflow_step ("Investigation/Inspection", "Dispatch Crew", "Perform Work").
  // For closed cases: final_outcome ("Owner's Responsibility", "Alley Baited",
  // "No Problem Found"). Null when enrichment hasn't populated either field.
  woli_stage?: string | null
  date: string
  // True when the city-recorded date is older than the digest's "yesterday" —
  // i.e., the row is appearing in this digest because it just landed in our
  // ingest pipe (created_at within window), not because the event happened
  // yesterday. Drives the asterisk + footnote disclosure on the rendered row.
  // Only set on violation/permit rows; complaints never trip this flag.
  is_backdated?: boolean
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

  // 26-hour lookback. Absorbs Vercel's documented cron-scheduler drift
  // (~46m max observed) on top of a 24h calendar day. Idempotency guard
  // (alert_digest_log unique partial index on subscriber_id + digest_date
  // WHERE status='sent') prevents same-day double-sends from the 2h
  // overlap.
  const now = new Date()
  const endIso = now.toISOString()
  const startMs = now.getTime() - 26 * 60 * 60 * 1000
  const startIso = new Date(startMs).toISOString()

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
      // Skip if already sent today (idempotency).
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

      // Get subscriber's clerk_id and email recipients
      const { data: subscriber } = await supabase
        .from('subscribers')
        .select('clerk_id, organization')
        .eq('id', setting.subscriber_id)
        .maybeSingle()
      if (!subscriber) continue
      const { clerk_id, organization } = subscriber as { clerk_id: string; organization: string | null }

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

      // Get subscriber's portfolio. slug is selected so the rendered digest
      // can link each property heading to its address page with the
      // ?building=true expansion flag (mirrors the dashboard navigation
      // pattern — see PortfolioDetail.tsx).
      const { data: props } = await supabase
        .from('portfolio_properties')
        .select('id, canonical_address, address_range, additional_streets, display_name, slug')
        .eq('user_id', clerk_id)

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
        // Building-range-anchored slug — see getPortfolioBuildingSlug docs.
        // Email property headings link to the full building view via
        // ?building=true; the helper guarantees the underlying address
        // is in user_building_ranges so the page expands correctly
        // (same fix as PortfolioDetail.tsx and the activity API route).
        const slug = getPortfolioBuildingSlug(p.canonical_address, p.address_range, p.slug)
        for (const addr of getAllAddresses(p.canonical_address, p.address_range, p.additional_streets)) {
          addressToProperty.set(addr, { id: p.id, display, slug })
        }
      }
      const allAddresses = Array.from(addressToProperty.keys())

      // Fetch yesterday's events (parallel)
      const events: DigestEvent[] = []

      if (setting.trigger_complaints) {
        // Filter by DEFAULT_VISIBLE_CODES at the SQL layer — drops the JS
        // post-filter that used to drop non-visible codes after the round trip.
        // Now also selects concern_category, problem_category, status,
        // final_outcome, and workflow_step so the rendered description can
        // include structured intake metadata + the current WOLI stage.
        const { data: complaints } = await supabase
          .from('complaints_311')
          .select('sr_type, sr_short_code, created_date, address_normalized, standard_description, complaint_description, concern_category, problem_category, status, final_outcome, workflow_step')
          .in('address_normalized', allAddresses)
          .in('sr_short_code', Array.from(DEFAULT_VISIBLE_CODES))
          .gte('created_date', startIso)
          .lt('created_date', endIso)
          .order('created_date', { ascending: false })
          .limit(500)

        for (const c of (complaints ?? []) as Array<{
          sr_type: string | null
          sr_short_code: string | null
          created_date: string | null
          address_normalized: string | null
          standard_description: string | null
          complaint_description: string | null
          concern_category: string | null
          problem_category: string | null
          status: string | null
          final_outcome: string | null
          workflow_step: string | null
        }>) {
          if (!c.address_normalized || !c.created_date) continue
          const meta = addressToProperty.get(c.address_normalized)
          if (!meta) continue

          // Build description from standard_description + structured intake.
          // For structured-intake codes (SGA, WM3, AAD, AAI) standard_description
          // is null but concern_category/problem_category carry the signal.
          // Join the two structured fields with " / " when both present.
          //
          // SEC (Tree Emergency) is an exception: the picklist fields are
          // restatements of the freeform complaint_description, not adding
          // signal. For SEC, prefer the freeform field directly so the
          // digest reads "Limb hanging on power lines. blocking the alley"
          // instead of "Power line / Alley".
          const isSecCode = String(c.sr_short_code ?? '').toUpperCase() === 'SEC'
          const desc = c.standard_description?.trim() || null
          const concern = c.concern_category?.trim() || null
          const problem = c.problem_category?.trim() || null
          const structured = concern && problem ? `${concern} / ${problem}` : (concern || problem)
          const rawDesc = c.complaint_description?.trim() || null
          let description: string | null = null
          if (isSecCode && rawDesc) {
            description = rawDesc
          } else if (desc && structured) {
            description = `${desc} — ${structured}`
          } else if (desc) {
            description = desc
          } else if (structured) {
            description = structured
          }

          // Surface WOLI state. For closed cases, final_outcome ("Owner's
          // Responsibility", "Alley Baited", "No Problem Found") is the signal.
          // For open cases — almost always the case in a 25-hour window —
          // workflow_step shows the current city action ("Investigation/
          // Inspection", "Dispatch Crew", "Perform Work").
          const isClosed = String(c.status ?? '').toLowerCase() === 'completed' ||
                           String(c.status ?? '').toLowerCase() === 'closed'
          const woliStage = isClosed && c.final_outcome?.trim()
            ? c.final_outcome.trim()
            : (c.workflow_step?.trim() || null)

          events.push({
            property_display: meta.display,
            property_id: meta.id,
            property_slug: meta.slug,
            kind: 'complaint',
            label: c.sr_type ?? 'Building Complaint',
            description,
            woli_stage: woliStage,
            date: c.created_date,
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

        for (const [, rows] of violationGroups) {
          const first = rows[0]
          if (!first.address_normalized || !first.violation_date) continue
          const meta = addressToProperty.get(first.address_normalized)
          if (!meta) continue

          // Stop-work fires per-inspection if any row in the group has it set.
          const isStopWork = rows.some((r) => Boolean(r.is_stop_work_order))
          if (isStopWork && !setting.trigger_stop_work) continue
          if (!isStopWork && !setting.trigger_violations) continue

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
          .select('permit_type, work_description, issue_date, address_normalized, permit_number, created_at')
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
          created_at: string | null
        }>) {
          if (p.permit_number && seenPermits.has(p.permit_number)) continue
          if (p.permit_number) seenPermits.add(p.permit_number)
          if (!p.address_normalized || !p.issue_date) continue
          const meta = addressToProperty.get(p.address_normalized)
          if (!meta) continue

          const isBackdated = p.issue_date.slice(0, 10) !== activityDate

          events.push({
            property_display: meta.display,
            property_id: meta.id,
            property_slug: meta.slug,
            kind: 'permit',
            label: p.permit_type ?? 'Permit',
            description: p.work_description?.trim() || null,
            date: p.issue_date,
            is_backdated: isBackdated,
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
      if (!testMode) {
        await supabase.from('alert_digest_log').insert({
          subscriber_id: setting.subscriber_id,
          digest_date: digestDate,
          recipients: emails,
          events_count: events.length,
          event_summary: summary,
          status: 'sent',
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

function formatChicagoTime(iso: string): string {
  try {
    const d = new Date(iso)
    return d.toLocaleString('en-US', {
      timeZone: 'America/Chicago',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      timeZoneName: 'short',
    })
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
          .sort((a, b) => b.events.length - a.events.length)
          .map(({ display, slug, events: propEvents }) => {
            const eventRows = propEvents
              .map((e, idx) => {
              const isStopWorkRow = e.label === 'STOP-WORK ORDER'
              // Kind prefix: "Violation" in red for non-stop-work violation
              // rows, paired with a gray bullet separator before the
              // inspection-number label. Stop-work skips the prefix since
              // the label already dominates. Complaints don't get a prefix —
              // their sr_type ("Sanitation Code Violation", "Plumbing
              // Violation", etc.) carries the kind signal directly, so the
              // color is applied to the label itself.
              const kindPrefix = (e.kind === 'violation' && !isStopWorkRow)
                ? `<span style="color: #b8302a; font-weight: 600;">Violation</span> <span style="color: #999;">&bull;</span> `
                : ''
              // Label color by kind:
              //   stop-work        → red (#b8302a) — kind word IS the label
              //   violation        → black (#1a1a1a) — kind word lives on the prefix
              //   complaint        → blue (#1e3a5f) — sr_type itself is the kind
              //   permit (default) → black for now
              let labelColor: string
              if (isStopWorkRow) labelColor = '#b8302a'
              else if (e.kind === 'complaint') labelColor = '#1e3a5f'
              else labelColor = '#1a1a1a'
              const labelWeight = isStopWorkRow ? '700' : '500'
                // First row: no top padding. Last row: no bottom padding.
                // Middle rows: 6px vertical gap between events (no hairline).
                const isFirst = idx === 0
                const isLast = idx === propEvents.length - 1
                const paddingTop = isFirst ? 0 : 6
                const paddingBottom = isLast ? 0 : 6
                return `
            <tr>
              <td style="padding: ${paddingTop}px 0 ${paddingBottom}px 0;">
                <div style="font-size: 13px; color: ${labelColor}; font-weight: ${labelWeight};">
                  ${kindPrefix}${escapeHtml(e.label)}
                </div>
                ${e.description ? `<div style="font-size: 12px; color: #666; margin-top: 2px; font-style: italic;">${escapeHtml(e.description)}</div>` : ''}
                ${e.woli_stage ? `<div style="font-size: 11px; color: #888; margin-top: 3px; font-weight: 500;">${escapeHtml(e.woli_stage)}</div>` : ''}
                <div style="font-size: 11px; color: #999; margin-top: 4px; font-family: 'DM Mono', ui-monospace, monospace;">
                  ${e.is_backdated ? '<sup style="font-size: 10px; line-height: 0;">*</sup>' : ''}${escapeHtml(formatEventDate(e))}
                </div>
              </td>
            </tr>
          `
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
              ? `<a href="https://propertysentinel.io/address/${encodeURIComponent(slug)}?building=true" style="font-family: 'Merriweather', Georgia, serif; font-size: 15px; font-weight: 600; color: #1e3a5f; text-decoration: underline; margin-bottom: 8px; display: inline-block;">${escapeHtml(display)}</a>`
              : `<div style="font-family: 'Merriweather', Georgia, serif; font-size: 15px; font-weight: 600; color: #1a1a1a; margin-bottom: 8px;">${escapeHtml(display)}</div>`
            return `
        <div style="margin-bottom: 20px;">
          ${propertyHeading}
          <div style="padding-left: 12px; margin-top: 8px;">
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
              *Reflects the city&rsquo;s official record; violations and permits are typically published to Chicago&rsquo;s open data feed 3-7 days after the recorded date.
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
