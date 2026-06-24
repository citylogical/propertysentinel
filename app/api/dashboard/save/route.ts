import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { fetchPortfolioActivity } from '@/lib/portfolio-stats'
import { OWNER_RELEVANT_CODES } from '@/lib/sr-codes'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { syncAlertQuantity } from '@/lib/sync-alert-quantity'
import { computeEntitlement } from '@/lib/entitlement'

function parseOptInt(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = typeof v === 'number' ? v : parseInt(String(v).replace(/,/g, ''), 10)
  return Number.isFinite(n) ? n : null
}

function parseImpliedFromBody(v: unknown): number | null {
  if (v === null || v === undefined) return null
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v.replace(/,/g, ''))
    return Number.isFinite(n) ? n : null
  }
  return null
}

function parseYearBuiltFromBody(v: unknown): string | null {
  if (v === null || v === undefined || v === '') return null
  const s = String(v).trim()
  return s !== '' ? s : null
}

function parseOptionalString(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const t = v.trim()
  return t !== '' ? t : null
}

export async function GET(request: Request) {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ saved: false })
  }

  const { searchParams } = new URL(request.url)
  const canonicalAddress = searchParams.get('canonical_address')

  if (!canonicalAddress) {
    return NextResponse.json({ saved: false })
  }

  const supabase = getSupabaseAdmin()

  // Match a saved property when EITHER the canonical_address matches exactly
  // (saved-from-the-same-page case) OR the saved property's address_range
  // covers this address (saved-from-different-address-in-same-building case).
  //
  // address_range is stored as "START-END N STREET NAME" (e.g. "536-548 N LAKE SHORE DR").
  // We need to determine if the searched address falls within START..END for the
  // same street. Doing this purely in SQL is awkward, so fetch candidates by
  // (1) exact canonical match (fast path), and (2) street-name-match where the
  // range covers the searched number, then filter in app code.

  // Parse "<number> <prefix> <street name>" from the searched address. The
  // canonical addresses we store are uppercase like "540 N LAKE SHORE DR".
  const upperAddr = canonicalAddress.toUpperCase().trim()
  const addrMatch = upperAddr.match(/^(\d+)\s+(.+?)(?:\s+(?:UNIT|APT|#)\s*[\w-]+)?$/)
  const searchedNumber = addrMatch ? parseInt(addrMatch[1], 10) : NaN
  const searchedStreet = addrMatch ? addrMatch[2].trim() : ''

  // Build candidate query: exact canonical OR any row on this street that has an
  // address_range. Filtering by street keeps the candidate set small per user.
  let query = supabase
    .from('portfolio_properties')
    .select('id, display_name, alerts_enabled, canonical_address, address_range, additional_streets')
    .eq('user_id', userId)

  if (Number.isFinite(searchedNumber) && searchedStreet) {
    // Match exact canonical OR street-name overlap (broad; filtered below)
    query = query.or(
      `canonical_address.eq.${upperAddr},canonical_address.ilike.%${searchedStreet}%,address_range.ilike.%${searchedStreet}%,additional_streets.cs.{${searchedStreet}}`
    )
  } else {
    query = query.eq('canonical_address', upperAddr)
  }

  const { data: candidates } = await query

  // If we got an exact canonical match, use it. Otherwise check ranges.
  let match: { id: string; display_name: string | null; alerts_enabled: boolean | null } | null =
    null

  if (candidates && candidates.length > 0) {
    // 1. Exact canonical match wins
    const exact = candidates.find((c) => c.canonical_address === upperAddr)
    if (exact) {
      match = exact
    } else if (Number.isFinite(searchedNumber)) {
      // 2. Range match: searched number falls within stored range on same street
      for (const c of candidates) {
        const range = c.address_range
        if (!range) continue
        // Parse "START-END PREFIX STREET" — e.g. "536-548 N LAKE SHORE DR"
        const m = range.match(/^(\d+)-(\d+)\s+(.+)$/)
        if (!m) continue
        const start = parseInt(m[1], 10)
        const end = parseInt(m[2], 10)
        const rangeStreet = m[3].trim().toUpperCase()
        if (
          Number.isFinite(start) &&
          Number.isFinite(end) &&
          rangeStreet === searchedStreet &&
          searchedNumber >= start &&
          searchedNumber <= end
        ) {
          match = c
          break
        }
        // 3. Also check additional_streets[] for the same coverage logic
        if (Array.isArray(c.additional_streets)) {
          for (const addl of c.additional_streets) {
            const am = String(addl).match(/^(\d+)-(\d+)\s+(.+)$/)
            if (!am) continue
            const aStart = parseInt(am[1], 10)
            const aEnd = parseInt(am[2], 10)
            const aStreet = am[3].trim().toUpperCase()
            if (
              Number.isFinite(aStart) &&
              Number.isFinite(aEnd) &&
              aStreet === searchedStreet &&
              searchedNumber >= aStart &&
              searchedNumber <= aEnd
            ) {
              match = c
              break
            }
          }
          if (match) break
        }
      }
    }
  }

  return NextResponse.json({
    saved: !!match,
    portfolio_id: match?.id ?? null,
    display_name: match?.display_name ?? null,
    alerts_enabled: match?.alerts_enabled ?? false,
  })
}

export async function POST(request: Request) {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const canonical_address =
    typeof body.canonical_address === 'string' ? body.canonical_address.trim() : ''
  const slug = typeof body.slug === 'string' ? body.slug.trim() : ''
  const display_name_raw = typeof body.display_name === 'string' ? body.display_name : ''

  if (!canonical_address || !slug) {
    return NextResponse.json(
      { error: 'Missing required fields: canonical_address and slug' },
      { status: 400 }
    )
  }

  if (!display_name_raw.trim()) {
    return NextResponse.json({ error: 'Property name is required' }, { status: 400 })
  }

  const address_range =
    typeof body.address_range === 'string' && body.address_range.trim() !== ''
      ? body.address_range.trim()
      : null

  const additional_streets = Array.isArray(body.additional_streets)
    ? body.additional_streets
        .filter((s): s is string => typeof s === 'string' && s.trim() !== '')
        .map((s) => s.trim())
    : []

  const pins = Array.isArray(body.pins)
    ? body.pins.filter((p): p is string => typeof p === 'string' && p.trim() !== '').map((p) => p.trim())
    : []

  const units_override = parseOptInt(body.units_override)
  const sqft_override = parseOptInt(body.sqft_override)

  const notes =
    typeof body.notes === 'string' && body.notes.trim() !== '' ? body.notes.trim() : null

  const alerts_enabled = body.alerts_enabled === true
  const alert_email = alerts_enabled
  const alert_sms = false

  const year_built = parseYearBuiltFromBody(body.year_built)
  const implied_value = parseImpliedFromBody(body.implied_value)
  const community_area = parseOptionalString(body.community_area)
  const property_class = parseOptionalString(body.property_class)

  const supabase = getSupabaseAdmin()

  // Determine whether this is a brand-new save or an update to an existing
  // saved property. Re-saving the same canonical_address is an update (editing
  // notes, units, etc.) and must NOT count against the lifetime cap or bump
  // the counter — only genuinely new properties do.
  const { data: existingProp } = await supabase
    .from('portfolio_properties')
    .select('id')
    .eq('user_id', userId)
    .eq('canonical_address', canonical_address)
    .maybeSingle()
  const isNewSave = !existingProp

  // Lifetime save cap: anyone not paying/enterprise (trial or lapsed) may save
  // at most 3 properties EVER — monotonic, never reset by deletes. Admins
  // bypass. Only enforced on a new save; updates to existing rows are free.
  if (isNewSave) {
    const { data: capSub } = await supabase
      .from('subscribers')
      .select('role, plan, subscription_status, trial_started_at, lifetime_saves')
      .eq('clerk_id', userId)
      .maybeSingle()
    const capRole = (capSub as { role?: string | null } | null)?.role ?? ''
    const capEnt = computeEntitlement(
      capSub
        ? {
            plan: (capSub as { plan?: string | null }).plan ?? null,
            subscription_status: (capSub as { subscription_status?: string | null }).subscription_status ?? null,
            trial_started_at: (capSub as { trial_started_at?: string | null }).trial_started_at ?? null,
          }
        : null
    )
    const lifetimeSaves = Number((capSub as { lifetime_saves?: number | null } | null)?.lifetime_saves ?? 0)
    const uncapped = capRole === 'admin' || capEnt.reason === 'paying' || capEnt.reason === 'enterprise'
    if (!uncapped && lifetimeSaves >= 3) {
      return NextResponse.json(
        {
          error: "You've used all 3 free property saves. Subscribe for unlimited properties.",
          reason: 'save_limit_reached',
        },
        { status: 403 }
      )
    }
  }

  // Stamp the trial clock on the user's first-ever save. The .is(null) guard
  // makes this idempotent: it fires once (when trial_started_at is still null)
  // and no-ops on every later save. Existing savers were backfilled to their
  // real first-save date in a one-time migration, so this only ever stamps
  // genuine first saves going forward. Non-fatal — must not block the save.
  try {
    await supabase
      .from('subscribers')
      .update({ trial_started_at: new Date().toISOString() })
      .eq('clerk_id', userId)
      .is('trial_started_at', null)
  } catch (trialErr) {
    console.error('Trial stamp failed (non-fatal):', trialErr)
  }

  const { data: insertedRow, error } = await supabase
    .from('portfolio_properties')
    .upsert(
      {
        user_id: userId,
        canonical_address,
        address_range,
        additional_streets: additional_streets.length > 0 ? additional_streets : null,
        pins: pins.length > 0 ? pins : null,
        slug,
        display_name: display_name_raw.trim(),
        units_override,
        sqft_override,
        notes,
        alerts_enabled,
        alert_email,
        alert_sms,
        updated_at: new Date().toISOString(),
        year_built,
        implied_value,
        community_area,
        property_class,
      },
      { onConflict: 'user_id,canonical_address' }
    )
    .select('id')
    .single()

  if (error) {
    console.error('Portfolio save error:', error)
    if (error.code === '23505') {
      return NextResponse.json({ error: 'This property is already in your dashboard' }, { status: 409 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Increment the monotonic lifetime-saves counter, but only for a genuinely
  // new property (not an update). Never decremented elsewhere — deleting a
  // property does not free up a save. Non-fatal: a counter miss must not break
  // the save itself.
  if (isNewSave) {
    try {
      const { data: cur } = await supabase
        .from('subscribers')
        .select('lifetime_saves')
        .eq('clerk_id', userId)
        .maybeSingle()
      const next = Number((cur as { lifetime_saves?: number | null } | null)?.lifetime_saves ?? 0) + 1
      await supabase
        .from('subscribers')
        .update({ lifetime_saves: next })
        .eq('clerk_id', userId)
    } catch (incErr) {
      console.error('lifetime_saves increment failed (non-fatal):', incErr)
    }
  }

  if (insertedRow?.id) {
    // Seed the user's SR preferences on their FIRST property add. Presence of
    // a row in user_sr_preferences = code enabled; the owner-relevant set in
    // sr-codes.ts is the seed default (not the live filter — the seam reads
    // the table after this). Gated on "user has zero prefs rows" so we don't
    // re-seed codes the user later turned off, and don't re-run 29 inserts on
    // every subsequent save. Idempotent via on_conflict regardless. Non-fatal.
    try {
      const { count: existingPrefsCount } = await supabase
        .from('user_sr_preferences')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
      if ((existingPrefsCount ?? 0) === 0) {
        const seedRows = Array.from(OWNER_RELEVANT_CODES).map((code) => ({
          user_id: userId,
          sr_short_code: code,
        }))
        await supabase
          .from('user_sr_preferences')
          .upsert(seedRows, { onConflict: 'user_id,sr_short_code', ignoreDuplicates: true })
      }
    } catch (seedErr) {
      console.error('SR preference seed failed (non-fatal):', seedErr)
    }

    try {
      const activity = await fetchPortfolioActivity(
        supabase,
        canonical_address,
        address_range,
        additional_streets.length > 0 ? additional_streets : null,
        pins.length > 0 ? pins : null
      )

      await supabase
        .from('portfolio_properties')
        .update({
          ...activity.stats,
          stats_updated_at: new Date().toISOString(),
        })
        .eq('id', insertedRow.id as string)
    } catch (statsErr) {
      console.error('Portfolio stats computation failed (non-fatal):', statsErr)
      console.error('Inputs were:', { canonical_address, address_range, additional_streets })
    }
  }

  let alertSync: Awaited<ReturnType<typeof syncAlertQuantity>> | null = null
  if (alerts_enabled) {
    try {
      alertSync = await syncAlertQuantity(supabase, userId)
    } catch (syncErr) {
      console.error('Alert quantity sync failed (non-fatal):', syncErr)
    }
  }

  return NextResponse.json({ success: true, id: insertedRow?.id, alert_sync: alertSync })
}
