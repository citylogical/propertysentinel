// app/api/hansen/lookup/route.ts
//
// Admin-gated "Query Hansen" endpoint. Runs the buildingrecords handshake,
// parses the results, returns the address range to the caller IMMEDIATELY,
// and defers the five-table Supabase upsert to after() so a slow/failed DB
// write never blocks the user seeing their range.
//
// Why the split: the range address only exists in the doSearch results HTML,
// so the ~3-8s handshake is unavoidable and on the critical path. But once we
// have that HTML, parsing it is milliseconds and the DB upsert is the only
// remaining deferrable work — so we defer exactly that.
//
// after() note: on Vercel you CANNOT fire-and-forget a bare promise after
// returning a Response — the function freezes and the work is killed. after()
// from next/server is the supported primitive; the upsert runs post-response
// but still counts toward this function's execution budget (hence maxDuration).

import { NextResponse, after } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { fetchHansenRecords, HansenFetchError } from '@/lib/hansen/fetch'
import { parseHansenResults } from '@/lib/hansen/parse'
import { upsertHansenData } from '@/lib/hansen/upsert'

// Node runtime — the fetch module's cookie jar relies on Response.getSetCookie()
// (undici), which is not available on the edge runtime.
export const runtime = 'nodejs'
// Budget covers the handshake (~3-8s) + parse (ms) + the deferred upsert (~1s).
export const maxDuration = 60

export async function POST(request: Request) {
  // ── Auth — admin only (matches the other /api/admin and import routes) ───
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = getSupabaseAdmin()
  if (process.env.NODE_ENV !== 'development') {
    const { data: caller } = await supabase
      .from('subscribers')
      .select('role, is_admin')
      .eq('clerk_id', userId)
      .maybeSingle()
    if (caller?.role !== 'admin' && !caller?.is_admin) {
      return NextResponse.json({ error: 'Forbidden — admin only' }, { status: 403 })
    }
  }

  // ── Body ─────────────────────────────────────────────────────────────────
  let body: { address?: string }
  try {
    body = (await request.json()) as typeof body
  } catch {
    body = {}
  }
  const address = body.address?.trim()
  if (!address) {
    return NextResponse.json({ error: 'Missing address' }, { status: 400 })
  }

  // ── Fetch + parse (synchronous — this is the critical path) ──────────────
  let parsed
  try {
    const { html } = await fetchHansenRecords(address)
    parsed = parseHansenResults(html)
  } catch (e) {
    if (e instanceof HansenFetchError) {
      // "address did not resolve" at the validateaddress step is a genuine
      // not-found (404). Every other failure — landing, agreement, search
      // form, transport errors, an unrecognizable doSearch page — is an
      // upstream problem with the city site (502).
      const isNotFound =
        e.step === 'validateaddress' && /did not resolve/i.test(e.message)
      return NextResponse.json(
        { error: e.message, step: e.step },
        { status: isNotFound ? 404 : 502 }
      )
    }
    // parseHansenResults throws on a structurally unrecognizable page.
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Hansen lookup failed' },
      { status: 502 }
    )
  }

  // ── Defer the five-table upsert — runs AFTER the response is sent ────────
  // If this throws, the caller already has a 200 + the range, so the failure
  // is invisible except in logs. A console.error is enough for now; a
  // persisted status/retry is a later hardening step.
  after(async () => {
    try {
      const result = await upsertHansenData(parsed)
      console.log('[hansen/lookup] persisted', JSON.stringify(result))
    } catch (e) {
      console.error(
        '[hansen/lookup] upsert failed (response already sent):',
        e instanceof Error ? e.message : String(e)
      )
    }
  })

  // ── Respond immediately with the range + a summary ───────────────────────
  return NextResponse.json({
    input_address: parsed.input_address,
    range_address: parsed.range_addresses[0] ?? null,
    range_addresses: parsed.range_addresses,
    bldg_id: parsed.building?.bldg_id ?? null,
    dwelling_units: parsed.building?.dwelling_units ?? null,
    is_empty: parsed.is_empty,
    counts: {
      permits: parsed.permits.length,
      enforcement_cases: parsed.enforcement_cases.length,
      inspections: parsed.inspections.length,
      violations: parsed.violations.length,
    },
  })
}