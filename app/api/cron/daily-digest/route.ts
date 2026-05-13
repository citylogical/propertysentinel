import { NextResponse } from 'next/server'
import { Resend } from 'resend'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { getAllAddresses } from '@/lib/portfolio-stats'
import { SR_CODES } from '@/lib/sr-codes'

const BUILDING_SR_CODES = new Set(SR_CODES.filter((e) => e.category === 'building').map((e) => e.code))

export const maxDuration = 300 // 5 min for Vercel Pro / Hobby Pro

type DigestEvent = {
  property_display: string
  property_id: string
  kind: 'complaint' | 'violation' | 'permit'
  label: string
  description: string | null
  date: string
  url_path?: string
}

export async function GET(request: Request) {
  // Protect with CRON_SECRET — Vercel cron calls authenticate via the header
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const resend = new Resend(process.env.RESEND_API_KEY)
  const supabase = getSupabaseAdmin()

  // Yesterday's window: midnight Chicago time to midnight Chicago time
  // Chicago is UTC-5 (CDT) or UTC-6 (CST). For simplicity, compute as last 24 hours
  // from the cron's actual fire time — UTC-based.
  const now = new Date()
  const endIso = now.toISOString()
  const startMs = now.getTime() - 24 * 60 * 60 * 1000
  const startIso = new Date(startMs).toISOString()
  const digestDate = new Date(startMs).toISOString().slice(0, 10)

  // Get all subscribers with email digest enabled
  const { data: enabledSubs } = await supabase
    .from('alert_settings')
    .select('subscriber_id, trigger_complaints, trigger_violations, trigger_permits, trigger_stop_work')
    .eq('email_digest_enabled', true)

  const results: Array<{ subscriber_id: string; status: string; count: number; error?: string }> = []

  for (const setting of (enabledSubs ?? []) as Array<{
    subscriber_id: string
    trigger_complaints: boolean
    trigger_violations: boolean
    trigger_permits: boolean
    trigger_stop_work: boolean
  }>) {
    try {
      // Skip if already sent today (idempotency)
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

      const emails = (recipients ?? []).map((r) => (r as { address: string }).address).filter(Boolean)
      if (emails.length === 0) {
        results.push({ subscriber_id: setting.subscriber_id, status: 'no_recipients', count: 0 })
        continue
      }

      // Get subscriber's portfolio
      const { data: props } = await supabase
        .from('portfolio_properties')
        .select('id, canonical_address, address_range, additional_streets, display_name')
        .eq('user_id', clerk_id)

      if (!props || props.length === 0) {
        results.push({ subscriber_id: setting.subscriber_id, status: 'empty_portfolio', count: 0 })
        continue
      }

      // Build address → property mapping
      const addressToProperty = new Map<string, { id: string; display: string }>()
      for (const p of props as Array<{
        id: string
        canonical_address: string
        address_range: string | null
        additional_streets: string[] | null
        display_name: string | null
      }>) {
        const display = p.display_name || p.canonical_address
        for (const addr of getAllAddresses(p.canonical_address, p.address_range, p.additional_streets)) {
          addressToProperty.set(addr, { id: p.id, display })
        }
      }
      const allAddresses = Array.from(addressToProperty.keys())

      // Fetch yesterday's events (parallel)
      const events: DigestEvent[] = []

      if (setting.trigger_complaints) {
        const { data: complaints } = await supabase
          .from('complaints_311')
          .select('sr_type, sr_short_code, created_date, address_normalized, standard_description')
          .in('address_normalized', allAddresses)
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
        }>) {
          if (!c.sr_short_code || !BUILDING_SR_CODES.has(c.sr_short_code)) continue
          if (!c.address_normalized || !c.created_date) continue
          const meta = addressToProperty.get(c.address_normalized)
          if (!meta) continue
          events.push({
            property_display: meta.display,
            property_id: meta.id,
            kind: 'complaint',
            label: c.sr_type ?? 'Building Complaint',
            description: c.standard_description?.trim() || null,
            date: c.created_date,
          })
        }
      }

      if (setting.trigger_violations) {
        const { data: violations } = await supabase
          .from('violations')
          .select('violation_description, violation_date, address_normalized, is_stop_work_order, inspection_number')
          .in('address_normalized', allAddresses)
          .gte('violation_date', startIso)
          .lt('violation_date', endIso)
          .order('violation_date', { ascending: false })
          .limit(500)

        const seenInspections = new Set<string>()
        for (const v of (violations ?? []) as Array<{
          violation_description: string | null
          violation_date: string | null
          address_normalized: string | null
          is_stop_work_order: boolean | null
          inspection_number: string | null
        }>) {
          if (v.inspection_number && seenInspections.has(v.inspection_number)) continue
          if (v.inspection_number) seenInspections.add(v.inspection_number)
          if (!v.address_normalized || !v.violation_date) continue
          const meta = addressToProperty.get(v.address_normalized)
          if (!meta) continue
          events.push({
            property_display: meta.display,
            property_id: meta.id,
            kind: 'violation',
            label: v.is_stop_work_order ? 'STOP-WORK ORDER' : 'Violation',
            description: v.violation_description?.trim() || null,
            date: v.violation_date,
          })
        }
      }

      if (setting.trigger_permits) {
        const { data: permits } = await supabase
          .from('permits')
          .select('permit_type, work_description, issue_date, address_normalized, permit_number')
          .in('address_normalized', allAddresses)
          .gte('issue_date', startIso)
          .lt('issue_date', endIso)
          .order('issue_date', { ascending: false })
          .limit(500)

        const seenPermits = new Set<string>()
        for (const p of (permits ?? []) as Array<{
          permit_type: string | null
          work_description: string | null
          issue_date: string | null
          address_normalized: string | null
          permit_number: string | null
        }>) {
          if (p.permit_number && seenPermits.has(p.permit_number)) continue
          if (p.permit_number) seenPermits.add(p.permit_number)
          if (!p.address_normalized || !p.issue_date) continue
          const meta = addressToProperty.get(p.address_normalized)
          if (!meta) continue
          events.push({
            property_display: meta.display,
            property_id: meta.id,
            kind: 'permit',
            label: p.permit_type ?? 'Permit',
            description: p.work_description?.trim() || null,
            date: p.issue_date,
          })
        }
      }

      // If no events, log and skip send
      if (events.length === 0) {
        await supabase.from('alert_digest_log').insert({
          subscriber_id: setting.subscriber_id,
          digest_date: digestDate,
          recipients: emails,
          events_count: 0,
          status: 'skipped_no_events',
        })
        results.push({ subscriber_id: setting.subscriber_id, status: 'skipped_no_events', count: 0 })
        continue
      }

      // Render email
      const orgName = organization || 'Your portfolio'
      const subject = renderSubject(events)
      const html = renderEmailHtml(orgName, events, digestDate)

      // Send via Resend
      const fromAddress = process.env.RESEND_FROM_EMAIL || 'Property Sentinel <noreply@updates.propertysentinel.io>'
      const { error: sendError } = await resend.emails.send({
        from: fromAddress,
        to: emails,
        replyTo: 'jim@propertysentinel.io',
        subject,
        html,
      })

      if (sendError) {
        await supabase.from('alert_digest_log').insert({
          subscriber_id: setting.subscriber_id,
          digest_date: digestDate,
          recipients: emails,
          events_count: events.length,
          status: 'failed',
          error_message: sendError.message,
        })
        results.push({
          subscriber_id: setting.subscriber_id,
          status: 'failed',
          count: events.length,
          error: sendError.message,
        })
        continue
      }

      // Log success
      const summary = {
        complaints: events.filter((e) => e.kind === 'complaint').length,
        violations: events.filter((e) => e.kind === 'violation').length,
        permits: events.filter((e) => e.kind === 'permit').length,
      }
      await supabase.from('alert_digest_log').insert({
        subscriber_id: setting.subscriber_id,
        digest_date: digestDate,
        recipients: emails,
        events_count: events.length,
        event_summary: summary,
        status: 'sent',
      })
      results.push({ subscriber_id: setting.subscriber_id, status: 'sent', count: events.length })
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
  const complaints = events.filter((e) => e.kind === 'complaint').length
  const violations = events.filter((e) => e.kind === 'violation' && e.label !== 'STOP-WORK ORDER').length
  const permits = events.filter((e) => e.kind === 'permit').length

  if (stopWorks > 0) {
    return `🚨 ${stopWorks} stop-work order${stopWorks === 1 ? '' : 's'} on your portfolio`
  }

  const parts: string[] = []
  if (complaints > 0) parts.push(`${complaints} new complaint${complaints === 1 ? '' : 's'}`)
  if (violations > 0) parts.push(`${violations} new violation${violations === 1 ? '' : 's'}`)
  if (permits > 0) parts.push(`${permits} new permit${permits === 1 ? '' : 's'}`)
  return parts.length > 0 ? `Property Sentinel — ${parts.join(', ')}` : 'Property Sentinel daily digest'
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

function renderEmailHtml(orgName: string, events: DigestEvent[], digestDate: string): string {
  const formattedDate = new Date(digestDate).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })

  // Group events by property
  const byProperty = new Map<string, { display: string; events: DigestEvent[] }>()
  for (const e of events) {
    if (!byProperty.has(e.property_id)) {
      byProperty.set(e.property_id, { display: e.property_display, events: [] })
    }
    byProperty.get(e.property_id)!.events.push(e)
  }

  const propertyBlocks = Array.from(byProperty.values())
    .sort((a, b) => b.events.length - a.events.length)
    .map(({ display, events: propEvents }) => {
      const eventRows = propEvents
        .map((e) => {
          const labelColor = e.label === 'STOP-WORK ORDER' ? '#b8302a' : '#1a1a1a'
          const labelWeight = e.label === 'STOP-WORK ORDER' ? '700' : '500'
          return `
            <tr>
              <td style="padding: 8px 0; border-bottom: 1px solid #f0ede5;">
                <div style="font-size: 13px; color: ${labelColor} !important; font-weight: ${labelWeight};">
                  ${escapeHtml(e.label)}
                </div>
                ${e.description ? `<div style="font-size: 12px; color: #666 !important; margin-top: 2px; font-style: italic;">${escapeHtml(e.description)}</div>` : ''}
                <div style="font-size: 11px; color: #999 !important; margin-top: 4px; font-family: 'DM Mono', ui-monospace, monospace;">
                  ${escapeHtml(formatChicagoTime(e.date))}
                </div>
              </td>
            </tr>
          `
        })
        .join('')

      return `
        <div style="margin-bottom: 24px;">
          <div style="font-family: 'Merriweather', Georgia, serif; font-size: 15px; font-weight: 600; color: #1a1a1a !important; margin-bottom: 8px;">
            ${escapeHtml(display)}
          </div>
          <table style="width: 100%; border-collapse: collapse;">
            ${eventRows}
          </table>
        </div>
      `
    })
    .join('')

  const totals = {
    complaints: events.filter((e) => e.kind === 'complaint').length,
    violations: events.filter((e) => e.kind === 'violation').length,
    permits: events.filter((e) => e.kind === 'permit').length,
  }

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="color-scheme" content="light only">
  <meta name="supported-color-schemes" content="light only">
  <title>Property Sentinel daily digest</title>
</head>
<body style="margin: 0; padding: 0; background: #faf8f3 !important; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">
  <table style="width: 100%; max-width: 600px; margin: 0 auto; background: #faf8f3 !important;">
    <tr>
      <td style="padding: 32px 24px;">
        <!-- Header -->
        <div style="background: #243f5e !important; color: #ffffff !important; padding: 20px 24px; border-radius: 8px 8px 0 0;">
          <table style="border-collapse: collapse; width: 100%;">
            <tr>
              <td style="vertical-align: middle;">
                <div style="font-family: 'Merriweather', Georgia, serif; font-size: 20px; font-weight: 600; line-height: 1.2; color: #ffffff !important;">
                  ${escapeHtml(orgName)} — Daily digest
                </div>
                <div style="font-size: 12px; color: rgba(255,255,255,0.7); margin-top: 4px;">
                  ${escapeHtml(formattedDate)}
                </div>
              </td>
              <td style="vertical-align: middle; text-align: right; width: 64px; padding-left: 14px;">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="247 249 529 529" width="36" height="36" fill="#ffffff" style="display: inline-block;">
                  <g transform="translate(0,1024) scale(0.1,-0.1)" stroke="none">
                    <path d="M5090 7395 l0 -155 -30 0 -30 0 0 -229 0 -230 -53 -24 c-29 -13 -69 -39 -90 -56 -48 -43 -97 -142 -104 -214 l-6 -57 337 0 336 0 0 33 c0 51 -26 128 -61 181 -33 49 -113 110 -161 122 l-28 6 0 234 0 234 -30 0 -30 0 0 155 0 155 -25 0 -25 0 0 -155z"/>
                    <path d="M4740 4510 l0 -1850 155 0 155 0 0 1505 0 1505 60 0 60 0 2 -1502 3 -1503 158 -3 157 -3 0 1851 0 1850 -375 0 -375 0 0 -1850z"/>
                    <path d="M4305 4318 c-3 -706 -5 -1366 -3 -1468 l3 -185 158 -3 157 -3 0 1471 0 1470 -154 0 -154 0 -7 -1282z"/>
                    <path d="M5610 4130 l0 -1470 155 0 155 0 0 1470 0 1470 -155 0 -155 0 0 -1470z"/>
                    <path d="M3600 3895 l0 -395 -280 0 -280 0 0 -420 0 -420 575 0 575 0 0 815 0 815 -295 0 -295 0 0 -395z"/>
                    <path d="M6030 3475 l0 -815 578 2 577 3 3 418 2 417 -280 0 -280 0 -2 253 c-2 138 -2 279 0 312 1 33 0 97 -4 143 l-6 82 -294 0 -294 0 0 -815z"/>
                  </g>
                </svg>
                <div style="font-family: 'Merriweather', Georgia, serif; font-size: 9px; line-height: 1.1; color: #ffffff !important; margin-top: 4px; font-weight: 500; letter-spacing: 0.02em;">
                  Property<br>Sentinel
                </div>
              </td>
            </tr>
          </table>
        </div>

        <!-- Stats bar -->
        <div style="background: #ffffff !important; padding: 16px 24px; border-bottom: 1px solid #ece8dd;">
          <table style="width: 100%; border-collapse: collapse;">
            <tr>
              <td style="text-align: center; padding: 8px;">
                <div style="font-family: monospace; font-size: 24px; font-weight: 700; color: #1a1a1a;">${totals.complaints}</div>
                <div style="font-size: 10px; color: #888; text-transform: uppercase; letter-spacing: 0.05em;">complaints</div>
              </td>
              <td style="text-align: center; padding: 8px;">
                <div style="font-family: monospace; font-size: 24px; font-weight: 700; color: #1a1a1a;">${totals.violations}</div>
                <div style="font-size: 10px; color: #888; text-transform: uppercase; letter-spacing: 0.05em;">violations</div>
              </td>
              <td style="text-align: center; padding: 8px;">
                <div style="font-family: monospace; font-size: 24px; font-weight: 700; color: #1a1a1a;">${totals.permits}</div>
                <div style="font-size: 10px; color: #888; text-transform: uppercase; letter-spacing: 0.05em;">permits</div>
              </td>
            </tr>
          </table>
        </div>

        <!-- Events by property -->
        <div style="background: #ffffff !important; padding: 24px; border-radius: 0 0 8px 8px;">
          ${propertyBlocks}
        </div>

        <!-- Footer -->
        <div style="padding: 24px; text-align: center; font-size: 12px; color: #888;">
          <a href="https://propertysentinel.io/dashboard/portfolio" style="color: #1e3a5f; text-decoration: none;">
            View full dashboard →
          </a>
          <div style="margin-top: 12px; color: #aaa;">
            Manage alert preferences in your <a href="https://propertysentinel.io/dashboard/settings" style="color: #888;">settings</a>
          </div>
        </div>
      </td>
    </tr>
  </table>
</body>
</html>`
}
