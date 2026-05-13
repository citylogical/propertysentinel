import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

const EMAIL_RX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const PHONE_RX = /^\+1\d{10}$/ // E.164 US format

function normalizePhone(input: string): string | null {
  const digits = input.replace(/\D/g, '')
  if (digits.length === 10) return `+1${digits}`
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`
  return null
}

export async function POST(request: Request) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: { channel?: string; address?: string; position?: number }
  try {
    body = (await request.json()) as typeof body
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const channel = body.channel
  let address = (body.address ?? '').trim()
  const position = body.position

  if (channel !== 'email' && channel !== 'sms') {
    return NextResponse.json({ error: 'Invalid channel' }, { status: 400 })
  }
  if (!address) return NextResponse.json({ error: 'Address required' }, { status: 400 })
  if (typeof position !== 'number' || position < 1 || position > 3) {
    return NextResponse.json({ error: 'Position must be 1, 2, or 3' }, { status: 400 })
  }

  // Validate + normalize per channel
  if (channel === 'email') {
    address = address.toLowerCase()
    if (!EMAIL_RX.test(address)) {
      return NextResponse.json({ error: 'Invalid email format' }, { status: 400 })
    }
  } else {
    const normalized = normalizePhone(address)
    if (!normalized || !PHONE_RX.test(normalized)) {
      return NextResponse.json({ error: 'Invalid phone — use US format' }, { status: 400 })
    }
    address = normalized
  }

  const supabase = getSupabaseAdmin()
  const { data: subscriber } = await supabase
    .from('subscribers')
    .select('id')
    .eq('clerk_id', userId)
    .maybeSingle()
  if (!subscriber) return NextResponse.json({ error: 'Subscriber not found' }, { status: 404 })

  const subscriberId = (subscriber as { id: string }).id

  // Upsert handles "replace existing at this position" cleanly
  const { data: created, error } = await supabase
    .from('alert_recipients')
    .upsert(
      {
        subscriber_id: subscriberId,
        channel,
        address,
        position,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'subscriber_id,channel,position' }
    )
    .select('*')
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ recipient: created })
}

export async function DELETE(request: Request) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: { id?: string }
  try {
    body = (await request.json()) as typeof body
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const recipientId = body.id
  if (!recipientId) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  const supabase = getSupabaseAdmin()
  const { data: subscriber } = await supabase
    .from('subscribers')
    .select('id')
    .eq('clerk_id', userId)
    .maybeSingle()
  if (!subscriber) return NextResponse.json({ error: 'Subscriber not found' }, { status: 404 })

  const subscriberId = (subscriber as { id: string }).id

  const { error } = await supabase
    .from('alert_recipients')
    .delete()
    .eq('id', recipientId)
    .eq('subscriber_id', subscriberId) // ownership guard

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ deleted: true })
}
