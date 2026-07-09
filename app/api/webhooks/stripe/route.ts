import { NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { createClient } from '@supabase/supabase-js'
import { stripe } from '@/lib/stripe'
import { promoteStagedRowsForSession } from '@/lib/staged-promotion'
import { capForLookupKey } from '@/lib/pricing'
import type Stripe from 'stripe'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function syncSubscription(sub: Stripe.Subscription) {
  const clerkId = sub.metadata?.clerk_id
  const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer.id
  const item = sub.items.data[0]
  const quantity = item?.quantity ?? 1
  const active = sub.status === 'active' || sub.status === 'trialing'

  // Enterprise accounts are managed by hand in the Stripe Dashboard.
  // Never let a self-serve webhook downgrade or overwrite them.
  const { data: existing } = clerkId
    ? await supabaseAdmin.from('subscribers').select('plan').eq('clerk_id', clerkId).maybeSingle()
    : await supabaseAdmin.from('subscribers').select('plan').eq('stripe_customer_id', customerId).maybeSingle()
  if (existing?.plan === 'enterprise') return

  // Band ceiling from the price lookup_key (tierN_monthly/yearly). Null when
  // inactive or on a price outside the band catalog — consumers treat null as
  // "no known cap".
  const planUnitCap = active ? capForLookupKey(item?.price?.lookup_key) : null

  const updates = {
    plan: active ? 'premium' : 'free',
    stripe_customer_id: customerId,
    stripe_subscription_id: sub.id,
    subscription_status: sub.status,
    subscription_quantity: quantity,
    plan_unit_cap: planUnitCap,
    updated_at: new Date().toISOString(),
  }

  if (clerkId) {
    await supabaseAdmin.from('subscribers').update(updates).eq('clerk_id', clerkId)
  } else {
    await supabaseAdmin.from('subscribers').update(updates).eq('stripe_customer_id', customerId)
  }
}

export async function POST(req: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET
  if (!secret) {
    return new Response('Webhook secret not configured', { status: 500 })
  }

  const sig = (await headers()).get('stripe-signature')
  if (!sig) {
    return new Response('Missing signature', { status: 400 })
  }

  const body = await req.text()

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(body, sig, secret)
  } catch {
    return new Response('Invalid signature', { status: 400 })
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session
        if (session.subscription) {
          const subId =
            typeof session.subscription === 'string'
              ? session.subscription
              : session.subscription.id
          const sub = await stripe.subscriptions.retrieve(subId)
          if (session.metadata?.clerk_id && !sub.metadata?.clerk_id) {
            sub.metadata = { ...sub.metadata, clerk_id: session.metadata.clerk_id }
          }
          await syncSubscription(sub)
        }
        // Activation flow: promote the staged rows stamped with this session
        // into the portfolio. No-op for sessions that didn't come from the
        // queue (nothing is stamped with their id).
        await promoteStagedRowsForSession(supabaseAdmin, session.id)
        break
      }
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        await syncSubscription(event.data.object as Stripe.Subscription)
        break
      }
      default:
        break
    }
  } catch (e) {
    console.error('Stripe webhook handler error:', e)
    return new Response('Handler error', { status: 500 })
  }

  return new Response('ok', { status: 200 })
}
