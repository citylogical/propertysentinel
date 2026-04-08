import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import {
  enrichTracerfyResponse,
  rankOneEmail,
  rankOnePhone,
  tracerfyInstantLookup,
  type TracerfyEnrichedPerson,
} from '@/lib/tracerfy'
import { evaluateBusinessTrace, isMultiOwnerBuilding } from '@/lib/business-trace-rules'
import { derivePropertyType } from '@/lib/property-type'
import {
  consumeCreditForUnlock,
  getUnlockQuota,
} from '@/lib/unlock-credits'
import { resolveAddressToProperties, uniquePinCount } from '@/lib/address-resolution'

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

  // Quota gate: check before calling Tracerfy.
  // Admin users (subscribers.unlimited_unlocks = true) bypass this check.
  // New users get their initial grant of credits via getUnlockQuota's lazy-init.
  const quota = await getUnlockQuota(userId)
  if (!quota.unlimited && quota.remaining <= 0) {
    return NextResponse.json(
      {
        success: false,
        reason: 'no_credits',
        message: 'You have used all your free unlocks.',
        quota: {
          remaining: 0,
          limit: quota.limit,
          unlimited: false,
          used: quota.used,
        },
      },
      { status: 402 }
    )
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

  // Multi-owner skip path: if there's no cached data AND the address is a
  // multi-owner building (7+ PINs with 2+ distinct mailing names), skip the
  // Tracerfy call entirely. The Unlocked Leads modal will surface every
  // taxpayer mailing name from the properties table — that's the actual
  // product the user wants for these addresses, and Tracerfy would just
  // return one or two random unit owners that mislead the user.
  //
  // This consumes a credit and counts as a successful unlock. The lead_unlocks
  // row is written with no Tracerfy data; the multi_owner_skip flag distinguishes
  // it from a normal unlock so the UI can render the modal trigger correctly.
  let isMultiOwnerSkip = false
  if (!cacheRow) {
    const skipMultiOwner = await isMultiOwnerBuilding(addressNormalized)
    if (skipMultiOwner) {
      isMultiOwnerSkip = true
    }
  }

  if (!cacheRow && !isMultiOwnerSkip) {
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

    // Enrich the raw Tracerfy response: filter deceased persons, rank mailing-matched
    // owners first, flatten phones/emails across all living persons. This becomes the
    // canonical structure for the Unlocked Leads UI in Phase 2.
    const enriched = enrichTracerfyResponse(tracerfyResponse, addressNormalized)
    const primary = enriched.primary_person
    const primaryPhone = rankOnePhone(primary?.phones ?? [])
    const primaryEmail = rankOneEmail(primary?.emails ?? [])

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
      // Primary flat columns — populated from the enriched primary_person so the
      // backwards-compat surface agrees with the new ranking (mailing-match first,
      // living persons only). Deceased primary → primary is null → hit becomes miss.
      primary_owner_first_name: primary?.first_name || null,
      primary_owner_last_name: primary?.last_name || null,
      primary_owner_full_name: primary?.full_name || null,
      primary_owner_age: primary?.age || null,
      primary_owner_dob: primary?.dob || null,
      primary_owner_deceased: false, // enriched filtered deceased out
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
      // NEW: full enriched data. Phase 2 UI reads from here.
      all_persons: enriched.all_persons,
      all_phones: enriched.all_phones,
      all_emails: enriched.all_emails,
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

  if (!cacheRow && !isMultiOwnerSkip) {
    return NextResponse.json({ success: false, reason: 'db_error', message: 'Cache unavailable' }, { status: 500 })
  }

  // Skip the rest of the Tracerfy-result handling for multi-owner buildings.
  // We jump straight to the lead_unlocks insert with no person/phone data.
  if (isMultiOwnerSkip) {
    let propertyClass: string | null = null
    if (c.pin) {
      const { data: byPin } = await supabase
        .from('properties')
        .select('property_class')
        .eq('pin', c.pin)
        .maybeSingle()
      if (byPin) {
        propertyClass = (byPin as { property_class: string | null }).property_class
      }
    }
    if (!propertyClass) {
      const resolved = await resolveAddressToProperties(addressNormalized)
      const pins = [...new Set(resolved.map((r) => r.pin).filter(Boolean))]
      if (pins.length > 0) {
        const { data: byAddr } = await supabase
          .from('properties')
          .select('property_class')
          .in('pin', pins)
          .limit(1)
          .maybeSingle()
        if (byAddr) {
          propertyClass = propertyClass ?? (byAddr as { property_class: string | null }).property_class
        }
      }
    }
    const propertyTypeLabelMO = await derivePropertyType(propertyClass, addressNormalized)

    const { data: unlockMO, error: unlockErrMO } = await supabase
      .from('lead_unlocks')
      .insert({
        user_id: userId,
        sr_number: srNumber,
        address_normalized: addressNormalized,
        pin: c.pin || null,
        tracerfy_contact_id: null,
        owner_name: null,
        owner_phone: null,
        owner_address: null,
        owner_email: null,
        owner_mailing_street: null,
        owner_mailing_city: null,
        owner_mailing_state: null,
        owner_mailing_zip: null,
        owner_deceased: false,
        owner_litigator: false,
        phone_type: null,
        phone_dnc: false,
        phone_carrier: null,
        tracerfy_hit: false,
        tracerfy_persons_count: 0,
        unlocked_from_cache: false,
        unlock_source: 'multi_owner_skip',
        all_persons: null,
        all_phones: null,
        all_emails: null,
        business_trace_recommended: true,
        business_trace_reason: 'multi_owner_building',
        property_type_label: propertyTypeLabelMO,
      })
      .select('*')
      .single()

    if (unlockErrMO) {
      console.error('[unlock] multi-owner lead_unlocks insert failed:', unlockErrMO)
      return NextResponse.json({ success: false, reason: 'db_error' }, { status: 500 })
    }

    if (!quota.unlimited) {
      await consumeCreditForUnlock(userId, srNumber).catch((err) => {
        console.error('[unlock] credit consume failed (multi-owner):', err)
      })
    }

    const { data: existingCountMO } = await supabase
      .from('lead_unlock_counts')
      .select('unlock_count')
      .eq('sr_number', srNumber)
      .maybeSingle()
    const ecMO = existingCountMO as { unlock_count?: number } | null
    if (ecMO && typeof ecMO.unlock_count === 'number') {
      await supabase
        .from('lead_unlock_counts')
        .update({ unlock_count: ecMO.unlock_count + 1 })
        .eq('sr_number', srNumber)
    } else {
      await supabase.from('lead_unlock_counts').insert({ sr_number: srNumber, unlock_count: 1 })
    }

    await supabase
      .from('lead_watchlist')
      .delete()
      .eq('user_id', userId)
      .eq('sr_number', srNumber)

    let dossierUnitCount: number | null = null
    let dossierTaxpayerCount: number | null = null
    let dossierAssociationName: string | null = null
    {
      const properties = await resolveAddressToProperties(addressNormalized)
      const rows = properties.map((p) => ({ mailing_name: p.mailing_name }))
      dossierUnitCount = uniquePinCount(properties)
      const nameCounts = new Map<string, number>()
      for (const r of rows) {
        const n = (r.mailing_name ?? '').trim().toUpperCase()
        if (!n) continue
        nameCounts.set(n, (nameCounts.get(n) ?? 0) + 1)
      }
      dossierTaxpayerCount = nameCounts.size
      const sorted = [...nameCounts.entries()].sort((a, b) => b[1] - a[1])
      if (sorted.length > 0) {
        const dominantKey = sorted[0][0]
        const sample = rows.find((r) => (r.mailing_name ?? '').trim().toUpperCase() === dominantKey)
        dossierAssociationName = sample?.mailing_name?.trim() ?? dominantKey
      }
    }

    const updatedQuotaMO = await getUnlockQuota(userId)

    return NextResponse.json({
      success: true,
      unlock: unlockMO,
      contact_cache: null,
      from_cache: false,
      multi_owner_skip: true,
      multi_owner_unit_count: dossierUnitCount,
      multi_owner_taxpayer_count: dossierTaxpayerCount,
      multi_owner_association_name: dossierAssociationName,
      quota: {
        remaining: updatedQuotaMO.unlimited ? null : updatedQuotaMO.remaining,
        limit: updatedQuotaMO.unlimited ? null : updatedQuotaMO.limit,
        unlimited: updatedQuotaMO.unlimited,
        used: updatedQuotaMO.used,
      },
    })
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
  // No-phone = failed unlock. Do not write lead_unlocks, do not consume a credit.
  // Even if an email or mailing address exists, we return nothing — the unlock
  // is only considered successful when we can deliver a phone number.
  if (!cacheRow.primary_phone) {
    return NextResponse.json({
      success: false,
      reason: 'no_phone',
      message: 'No phone number available for the owner of this property.',
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

  // Look up property class + mailing name to evaluate the business trace recommendation.
  // Prefer PIN match (more reliable), fall back to address. If neither hits, the
  // recommendation falls through to the multi-owner building check, which queries
  // properties by address_normalized directly.
  let propertyClass: string | null = null
  let propertyMailingName: string | null = null
  if (c.pin) {
    const { data: byPin } = await supabase
      .from('properties')
      .select('property_class, mailing_name')
      .eq('pin', c.pin)
      .maybeSingle()
    if (byPin) {
      const r = byPin as { property_class: string | null; mailing_name: string | null }
      propertyClass = r.property_class
      propertyMailingName = r.mailing_name
    }
  }
  if (!propertyClass) {
    const resolved = await resolveAddressToProperties(addressNormalized)
    const pins = [...new Set(resolved.map((r) => r.pin).filter(Boolean))]
    if (pins.length > 0) {
      const { data: byAddr } = await supabase
        .from('properties')
        .select('property_class, mailing_name')
        .in('pin', pins)
        .limit(1)
        .maybeSingle()
      if (byAddr) {
        const r = byAddr as { property_class: string | null; mailing_name: string | null }
        propertyClass = propertyClass ?? r.property_class
        propertyMailingName = propertyMailingName ?? r.mailing_name
      }
    }
  }
  const enrichedPersons =
    (cacheRow.all_persons as TracerfyEnrichedPerson[] | null | undefined) ?? []
  const businessTrace = await evaluateBusinessTrace(
    propertyClass,
    propertyMailingName,
    addressNormalized,
    enrichedPersons
  )
  const propertyTypeLabel = await derivePropertyType(propertyClass, addressNormalized)

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
      // Copy enriched data from the cache row so /api/leads/unlock/my can
      // serve the Unlocked Leads table without a cache join.
      all_persons: cacheRow.all_persons ?? null,
      all_phones: cacheRow.all_phones ?? null,
      all_emails: cacheRow.all_emails ?? null,
      // Business trace recommendation computed from property class, mailing name,
      // and multi-owner building check. Drives the CTA banner on the Unlocked Leads row.
      business_trace_recommended: businessTrace.recommended,
      business_trace_reason: businessTrace.reason,
      // Property type label derived from class + PIN count. Drives the colored
      // tag under the location on the Unlocked Leads row.
      property_type_label: propertyTypeLabel,
    })
    .select('*')
    .single()

  if (unlockErr) {
    console.error('[unlock] lead_unlocks insert failed:', unlockErr)
    return NextResponse.json({ success: false, reason: 'db_error' }, { status: 500 })
  }
  
   // Consume one credit for this unlock. Admin users (unlimited_unlocks) skip this.
   // The ledger write is fire-and-forget — if it fails the unlock still succeeds
   // and the user gets a free one. This is intentional: we never want the ledger
   // to block a successful data delivery.
   if (!quota.unlimited) {
     await consumeCreditForUnlock(userId, srNumber).catch((err) => {
       console.error('[unlock] credit consume failed:', err)
     })
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

  const updatedQuota = await getUnlockQuota(userId)

  return NextResponse.json({
    success: true,
    unlock,
    contact_cache: cacheRow,
    from_cache: unlockedFromCache,
    quota: {
      remaining: updatedQuota.unlimited ? null : updatedQuota.remaining,
      limit: updatedQuota.unlimited ? null : updatedQuota.limit,
      unlimited: updatedQuota.unlimited,
      used: updatedQuota.used,
    },
  })
}
