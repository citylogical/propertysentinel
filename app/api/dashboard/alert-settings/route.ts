import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

const ALLOWED_TOGGLES = new Set([
  'email_digest_enabled',
  'email_digest_send_when_empty',
  'sms_realtime_enabled',
  'trigger_complaints',
  'trigger_violations',
  'trigger_permits',
  'trigger_stop_work',
])

export async function GET() {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = getSupabaseAdmin()
  const { data: subscriber } = await supabase
    .from('subscribers')
    .select('id, email')
    .eq('clerk_id', userId)
    .maybeSingle()

  if (!subscriber) return NextResponse.json({ error: 'Subscriber not found' }, { status: 404 })

  const subscriberId = (subscriber as { id: string; email: string | null }).id

  // Ensure alert_settings row exists (defensive — should have been seeded)
  const { data: existing } = await supabase
    .from('alert_settings')
    .select('*')
    .eq('subscriber_id', subscriberId)
    .maybeSingle()

  let settings = existing
  if (!settings) {
    const { data: inserted } = await supabase
      .from('alert_settings')
      .insert({ subscriber_id: subscriberId })
      .select('*')
      .maybeSingle()
    settings = inserted
  }

  const { data: recipients } = await supabase
    .from('alert_recipients')
    .select('id, channel, address, position, verified')
    .eq('subscriber_id', subscriberId)
    .order('channel', { ascending: true })
    .order('position', { ascending: true })

  return NextResponse.json({
    settings,
    recipients: recipients ?? [],
    primary_email: (subscriber as { email: string | null }).email,
  })
}

export async function POST(request: Request) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: Record<string, unknown>
  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const supabase = getSupabaseAdmin()
  const { data: subscriber } = await supabase
    .from('subscribers')
    .select('id')
    .eq('clerk_id', userId)
    .maybeSingle()
  if (!subscriber) return NextResponse.json({ error: 'Subscriber not found' }, { status: 404 })

  const subscriberId = (subscriber as { id: string }).id
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
  for (const [key, val] of Object.entries(body)) {
    if (ALLOWED_TOGGLES.has(key) && typeof val === 'boolean') {
      updates[key] = val
    }
  }

  const { data: updated, error } = await supabase
    .from('alert_settings')
    .upsert({ subscriber_id: subscriberId, ...updates }, { onConflict: 'subscriber_id' })
    .select('*')
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ settings: updated })
}
