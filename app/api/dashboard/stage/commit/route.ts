import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { computeEntitlement } from '@/lib/entitlement'
import { promoteStagedRowsForUser } from '@/lib/staged-promotion'

// "Save to portfolio" step 1: the server is the authority on entitlement.
// Admin / paying / enterprise accounts get their selected rows promoted
// directly (no Stripe). Everyone else gets { requires_checkout: true } and
// the queue modal advances to the plan-selection step.

export async function POST(request: Request) {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: { staged_ids?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const stagedIds = Array.isArray(body.staged_ids)
    ? body.staged_ids.filter((v): v is string => typeof v === 'string' && v.trim() !== '')
    : []
  if (stagedIds.length === 0) {
    return NextResponse.json({ error: 'No properties selected' }, { status: 400 })
  }

  const supabase = getSupabaseAdmin()

  // Every selected row must have a unit count — the client greys the button
  // out, but the server re-checks.
  const { data: selectedRows, error: rowsError } = await supabase
    .from('staged_properties')
    .select('id, units')
    .eq('clerk_id', userId)
    .in('id', stagedIds)
    .in('status', ['staged', 'pending_checkout'])
  if (rowsError) {
    return NextResponse.json({ error: rowsError.message }, { status: 500 })
  }
  if (!selectedRows || selectedRows.length === 0) {
    return NextResponse.json({ error: 'No matching properties in your queue' }, { status: 400 })
  }
  if (selectedRows.some((r) => r.units == null || r.units <= 0)) {
    return NextResponse.json(
      { error: 'Every selected property needs a unit count' },
      { status: 400 }
    )
  }

  const { data: sub } = await supabase
    .from('subscribers')
    .select('role, plan, subscription_status, trial_started_at')
    .eq('clerk_id', userId)
    .maybeSingle()

  const role = (sub as { role?: string | null } | null)?.role ?? ''
  const ent = computeEntitlement(
    sub
      ? {
          plan: (sub as { plan?: string | null }).plan ?? null,
          subscription_status:
            (sub as { subscription_status?: string | null }).subscription_status ?? null,
          trial_started_at:
            (sub as { trial_started_at?: string | null }).trial_started_at ?? null,
        }
      : null
  )
  const entitled = role === 'admin' || ent.reason === 'paying' || ent.reason === 'enterprise'

  if (!entitled) {
    const totalUnits = selectedRows.reduce((sum, r) => sum + (r.units ?? 0), 0)
    return NextResponse.json({ requires_checkout: true, total_units: totalUnits })
  }

  // skipStats: promotion must stay fast for 300+ property imports. The
  // client-driven build loop (/api/dashboard/build/stats) computes activity
  // stats right after; Worker C's nightly phase 3 is the backstop.
  const result = await promoteStagedRowsForUser(supabase, userId, stagedIds, { skipStats: true })
  if (result.promoted === 0) {
    return NextResponse.json(
      { error: 'Could not save your properties — try again' },
      { status: 500 }
    )
  }
  return NextResponse.json({ promoted: result.promoted, errors: result.errors })
}
