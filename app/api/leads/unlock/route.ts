import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { rankOneEmail, rankOnePhone, tracerfyInstantLookup } from '@/lib/tracerfy'

export const dynamic = 'force-dynamic'

const CACHE_DAYS = 90

export async function POST(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ success: false, reason: 'unauthorized' }, { status: 401 })
  }

  let body: { sr_number?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ success: false, reason: 'invalid_body' }, { status: 400 })
  }

  const srNumber = body?.sr_number
  if (!srNumber) {
    return NextResponse.json({ success: false, reason: 'missing_sr_number' }, { status: 400 })
  }

  const supabase = getSupabaseAdmin()

  const { data: complaint, error: complaintErr } = await supabase
    .from('complaints_311')
    .select('sr_number, sr_short_code, address, address_normalized, zip_code, pin')
    .eq('sr_number', srNumber)
    .single()

  if (complaintErr || !complaint) {
    return NextResponse.json({ success: false, reason: 'complaint_not_found' }, { status: 404 })
  }

  const c = complaint as {
    address?: string | null
    address_normalized?: string | null
    zip_code?: string | null
    pin?: string | null
  }

  if (!c.address_normalized || !c.address) {
    return NextResponse.json({ success: false, reason: 'missing_address' }, { status: 400 })
  }

  const addressNormalized = c.address_normalized

  const { data: existingUnlock } = await supabase.from('lead_unlocks').select('*').eq('user_id', userId).eq('sr_number', srNumber).maybeSingle()

  if (existingUnlock) {
    const eu = existingUnlock as { tracerfy_contact_id?: string | null }
    let contactCache: Record<string, unknown> | null = null
    if (eu.tracerfy_contact_id) {
      const { data: cr } = await supabase
        .from('tracerfy_contact_cache')
        .select('*')
        .eq('id', eu.tracerfy_contact_id)
        .maybeSingle()
      contactCache = cr as Record<string, unknown> | null
    }
    return NextResponse.json({
      success: true,
      reason: 'already_unlocked',
      unlock: existingUnlock,
      contact_cache: contactCache,
    })
  }

  const nowIso = new Date().toISOString()
  const { data: cached } = await supabase
    .from('tracerfy_contact_cache')
    .select('*')
    .eq('address_normalized', addressNormalized)
    .gt('expires_at', nowIso)
    .maybeSingle()

  let cacheRow = cached as Record<string, unknown> | null
  let unlockedFromCache = Boolean(cached)

  if (!cacheRow) {
    let tracerfyResponse
    try {
      tracerfyResponse = await tracerfyInstantLookup({
        address: c.address,
        city: 'Chicago',
        state: 'IL',
        zip: c.zip_code || undefined,
        find_owner: true,
      })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error('[unlock] Tracerfy lookup failed:', msg)
      return NextResponse.json(
        { success: false, reason: 'tracerfy_error', message: msg || 'Lookup failed' },
        { status: 502 }
      )
    }

    const persons = tracerfyResponse.persons || []
    const primary = persons[0]
    const primaryPhone = primary ? rankOnePhone(primary.phones ?? []) : null
    const primaryEmail = primary ? rankOneEmail(primary.emails ?? []) : null

    const expiresAt = new Date(Date.now() + CACHE_DAYS * 86400000).toISOString()

    const insertPayload = {
      address_normalized: addressNormalized,
      tracerfy_hit: tracerfyResponse.hit,
      tracerfy_persons_count: tracerfyResponse.persons_count || 0,
      tracerfy_credits_deducted: tracerfyResponse.credits_deducted || 0,
      tracerfy_raw_response: tracerfyResponse,
      request_address: c.address,
      request_city: 'Chicago',
      request_state: 'IL',
      request_zip: c.zip_code || null,
      primary_owner_first_name: primary?.first_name || null,
      primary_owner_last_name: primary?.last_name || null,
      primary_owner_full_name: primary?.full_name || null,
      primary_owner_age: primary?.age || null,
      primary_owner_dob: primary?.dob || null,
      primary_owner_deceased: primary?.deceased ?? false,
      primary_owner_litigator: primary?.litigator ?? false,
      primary_phone: primaryPhone?.number || null,
      primary_phone_type: primaryPhone?.type || null,
      primary_phone_dnc: primaryPhone?.dnc ?? false,
      primary_phone_carrier: primaryPhone?.carrier || null,
      primary_email: primaryEmail?.email || null,
      mailing_street: primary?.mailing_address?.street || null,
      mailing_city: primary?.mailing_address?.city || null,
      mailing_state: primary?.mailing_address?.state || null,
      mailing_zip: primary?.mailing_address?.zip || null,
      expires_at: expiresAt,
    }

    const { data: inserted, error: insertErr } = await supabase
      .from('tracerfy_contact_cache')
      .insert(insertPayload)
      .select('*')
      .single()

    if (insertErr) {
      if (insertErr.code === '23505') {
        const { data: retry } = await supabase
          .from('tracerfy_contact_cache')
          .select('*')
          .eq('address_normalized', addressNormalized)
          .gt('expires_at', nowIso)
          .maybeSingle()
        if (retry) {
          cacheRow = retry as Record<string, unknown>
          unlockedFromCache = true
        } else {
          console.error('[unlock] Cache insert conflict but no row:', insertErr)
          return NextResponse.json({ success: false, reason: 'db_error' }, { status: 500 })
        }
      } else {
        console.error('[unlock] Cache insert failed:', insertErr)
        return NextResponse.json({ success: false, reason: 'db_error' }, { status: 500 })
      }
    } else if (inserted) {
      cacheRow = inserted as Record<string, unknown>
      unlockedFromCache = false
    }
  }

  if (!cacheRow) {
    return NextResponse.json({ success: false, reason: 'db_error', message: 'Cache unavailable' }, { status: 500 })
  }

  if (!cacheRow.tracerfy_hit) {
    return NextResponse.json({
      success: false,
      reason: 'miss',
      message: 'No owner information available for this address.',
    })
  }

  if (cacheRow.primary_owner_deceased) {
    return NextResponse.json({
      success: false,
      reason: 'deceased_owner',
      message: 'Owner of record is deceased. This lead is not available.',
    })
  }

  // ---------- TCPA Litigator Credit (Stripe integration pending) ----------
  // When billing is wired up, this is where we skip the Stripe charge entirely
  // if cacheRow.primary_owner_litigator === true. The user still gets the
  // unlock (we've already paid Tracerfy for it — the data is sunk cost), but
  // they're not billed. Return an extra flag in the response so the client
  // can show the LitigatorCreditModal:
  //
  //   const isLitigator = cacheRow.primary_owner_litigator === true;
  //   if (!isLitigator) {
  //     // Fire Stripe PaymentIntent here
  //   }
  //   return NextResponse.json({
  //     success: true,
  //     unlock,
  //     contact_cache: cacheRow,
  //     litigator_credit: isLitigator,
  //   });
  //
  // Do NOT implement a refund flow — the charge should never fire on
  // litigator-flagged unlocks. Checking the flag pre-charge is free and clean.

  const ownerAddress = [cacheRow.mailing_street, cacheRow.mailing_city, cacheRow.mailing_state, cacheRow.mailing_zip]
    .filter(Boolean)
    .join(', ')

  const cacheId = cacheRow.id

  const { data: unlock, error: unlockErr } = await supabase
    .from('lead_unlocks')
    .insert({
      user_id: userId,
      sr_number: srNumber,
      address_normalized: addressNormalized,
      pin: c.pin || null,
      tracerfy_contact_id: cacheId as string,
      owner_name: cacheRow.primary_owner_full_name,
      owner_phone: cacheRow.primary_phone,
      owner_address: ownerAddress || null,
      owner_email: cacheRow.primary_email,
      owner_mailing_street: cacheRow.mailing_street,
      owner_mailing_city: cacheRow.mailing_city,
      owner_mailing_state: cacheRow.mailing_state,
      owner_mailing_zip: cacheRow.mailing_zip,
      owner_deceased: cacheRow.primary_owner_deceased,
      owner_litigator: cacheRow.primary_owner_litigator,
      phone_type: cacheRow.primary_phone_type,
      phone_dnc: cacheRow.primary_phone_dnc,
      phone_carrier: cacheRow.primary_phone_carrier,
      tracerfy_hit: cacheRow.tracerfy_hit,
      tracerfy_persons_count: cacheRow.tracerfy_persons_count,
      unlocked_from_cache: unlockedFromCache,
      unlock_source: 'tracerfy_instant',
    })
    .select('*')
    .single()

  if (unlockErr) {
    console.error('[unlock] lead_unlocks insert failed:', unlockErr)
    return NextResponse.json({ success: false, reason: 'db_error' }, { status: 500 })
  }

  const { data: existingCount } = await supabase
    .from('lead_unlock_counts')
    .select('unlock_count')
    .eq('sr_number', srNumber)
    .maybeSingle()

  const ec = existingCount as { unlock_count?: number } | null
  if (ec && typeof ec.unlock_count === 'number') {
    await supabase
      .from('lead_unlock_counts')
      .update({ unlock_count: ec.unlock_count + 1 })
      .eq('sr_number', srNumber)
  } else {
    await supabase.from('lead_unlock_counts').insert({ sr_number: srNumber, unlock_count: 1 })
  }

  return NextResponse.json({
    success: true,
    unlock,
    contact_cache: cacheRow,
    from_cache: unlockedFromCache,
  })
}
