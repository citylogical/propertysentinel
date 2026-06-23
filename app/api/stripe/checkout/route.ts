import { auth, currentUser } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { stripe, PRICE_MONTHLY } from '@/lib/stripe'

export async function POST(request: Request) {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: { quantity?: number; return_path?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const quantity = Math.max(1, Math.min(50, Math.floor(Number(body.quantity) || 1)))
  const returnPath =
    typeof body.return_path === 'string' && body.return_path.startsWith('/')
      ? body.return_path
      : '/dashboard'

  if (!PRICE_MONTHLY) {
    return NextResponse.json({ error: 'Price not configured' }, { status: 500 })
  }

  const supabase = getSupabaseAdmin()
  const { data: subscriber } = await supabase
    .from('subscribers')
    .select('id, email, stripe_customer_id, plan')
    .eq('clerk_id', userId)
    .maybeSingle()

  if (subscriber?.plan === 'enterprise') {
    return NextResponse.json(
      { error: 'This account is on an enterprise plan. Contact us to make changes.' },
      { status: 400 }
    )
  }

  let customerId = subscriber?.stripe_customer_id as string | null | undefined

  if (!customerId) {
    const user = await currentUser()
    const email =
      (subscriber?.email as string | null) ??
      user?.emailAddresses?.[0]?.emailAddress ??
      undefined
    const customer = await stripe.customers.create({
      email,
      metadata: { clerk_id: userId },
    })
    customerId = customer.id
    await supabase
      .from('subscribers')
      .update({ stripe_customer_id: customerId })
      .eq('clerk_id', userId)
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://propertysentinel.io'

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer: customerId,
    line_items: [{ price: PRICE_MONTHLY, quantity }],
    allow_promotion_codes: true,
    success_url: `${appUrl}${returnPath}${returnPath.includes('?') ? '&' : '?'}checkout=success`,
    cancel_url: `${appUrl}${returnPath}${returnPath.includes('?') ? '&' : '?'}checkout=cancelled`,
    metadata: { clerk_id: userId },
    subscription_data: { metadata: { clerk_id: userId } },
  })

  return NextResponse.json({ url: session.url })
}
