// app/api/dashboard/stage/reresolve/route.ts
//
// Queue-modal action: the user fixed the address on a staged row we couldn't
// match to city records ("1235 S Kolin" → "1235 S Kolin Ave") — re-resolve
// the corrected address through the production resolution stack and rewrite
// that staged_properties row's snapshot in place (canonical, pins, parcel
// chars). The sibling of app/api/dashboard/import/reresolve, but it targets a
// staged_properties row instead of an import_jobs result. Used by the claim
// flow's review step and any manual queue review.

import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { resolveImportAddress } from '@/lib/rentroll/resolve'
import { sanitizeCell } from '@/lib/rentroll/extract'
import { addressToSlug } from '@/lib/formatAddress'

export const runtime = 'nodejs'
export const maxDuration = 30

export async function POST(request: Request) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: { staged_id?: string; address?: string }
  try {
    body = (await request.json()) as typeof body
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const stagedId = (body.staged_id ?? '').trim()
  const address = sanitizeCell(body.address)
  if (!stagedId) return NextResponse.json({ error: 'Missing staged_id' }, { status: 400 })
  if (!address || address.length < 4) {
    return NextResponse.json({ error: 'Enter an address to check' }, { status: 400 })
  }

  const supabase = getSupabaseAdmin()
  const { data: row, error: rowErr } = await supabase
    .from('staged_properties')
    .select('id, status')
    .eq('id', stagedId)
    .eq('clerk_id', userId)
    .maybeSingle()
  if (rowErr) return NextResponse.json({ error: rowErr.message }, { status: 500 })
  if (!row) return NextResponse.json({ error: 'Row not found' }, { status: 404 })
  if ((row as { status: string }).status !== 'staged') {
    return NextResponse.json({ error: 'This row can no longer be edited' }, { status: 409 })
  }

  const resolution = await resolveImportAddress(address)
  const canonical = resolution.canonical_address.trim().toUpperCase()
  if (!canonical) {
    return NextResponse.json({ error: "Couldn't read that address — try again" }, { status: 422 })
  }

  // The (clerk_id, canonical_address) unique constraint: if the corrected
  // address collides with a DIFFERENT staged row the user already has, bail
  // rather than 500 on the update.
  const { data: clash } = await supabase
    .from('staged_properties')
    .select('id')
    .eq('clerk_id', userId)
    .eq('canonical_address', canonical)
    .neq('id', stagedId)
    .maybeSingle()
  if (clash) {
    return NextResponse.json(
      { error: 'That address is already in your queue' },
      { status: 409 }
    )
  }

  const siblings = resolution.sibling_addresses.filter((s) => s !== canonical)
  const { error: updateErr } = await supabase
    .from('staged_properties')
    .update({
      canonical_address: canonical,
      slug: addressToSlug(canonical),
      pins: resolution.pins.length > 0 ? resolution.pins : null,
      address_range: resolution.address_range,
      additional_streets: siblings.length > 0 ? siblings : null,
      sqft: resolution.sqft,
      year_built: resolution.year_built,
      implied_value: resolution.implied_value,
      community_area: resolution.community_area,
      property_class: resolution.property_class,
      updated_at: new Date().toISOString(),
    })
    .eq('id', stagedId)
    .eq('clerk_id', userId)
  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 })

  return NextResponse.json({
    resolution: {
      canonical_address: canonical,
      slug: addressToSlug(canonical),
      pins: resolution.pins,
      address_range: resolution.address_range,
      match: resolution.match,
    },
  })
}
