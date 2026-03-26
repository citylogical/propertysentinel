import { Webhook } from 'svix'
import { headers } from 'next/headers'
import type { WebhookEvent } from '@clerk/nextjs/server'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

export async function POST(req: Request) {
  const WEBHOOK_SECRET = process.env.CLERK_WEBHOOK_SECRET
  if (!WEBHOOK_SECRET) {
    return new Response('Webhook secret not configured', { status: 500 })
  }

  const headerPayload = await headers()
  const svix_id = headerPayload.get('svix-id')
  const svix_timestamp = headerPayload.get('svix-timestamp')
  const svix_signature = headerPayload.get('svix-signature')

  if (!svix_id || !svix_timestamp || !svix_signature) {
    return new Response('Missing svix headers', { status: 400 })
  }

  const body = await req.text()

  let evt: WebhookEvent
  try {
    const wh = new Webhook(WEBHOOK_SECRET)
    evt = wh.verify(body, {
      'svix-id': svix_id,
      'svix-timestamp': svix_timestamp,
      'svix-signature': svix_signature,
    }) as WebhookEvent
  } catch {
    return new Response('Invalid signature', { status: 400 })
  }

  if (evt.type === 'user.created') {
    const { id, email_addresses } = evt.data
    const email = email_addresses[0]?.email_address
    if (email) {
      const { error } = await supabaseAdmin.from('subscribers').upsert(
        { clerk_id: id, email, role: 'default' },
        { onConflict: 'clerk_id' }
      )
      if (error) {
        console.error('Clerk webhook subscribers upsert:', error.message)
        return new Response('Database error', { status: 500 })
      }
    }
  }

  if (evt.type === 'user.updated') {
    const { id, email_addresses, phone_numbers, first_name, last_name, public_metadata } = evt.data
    const email = email_addresses[0]?.email_address ?? null
    const phone = phone_numbers?.[0]?.phone_number ?? null
    const organization = (public_metadata as Record<string, unknown>)?.organization as string | null ?? null

    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (email) updates.email = email
    if (first_name !== undefined) updates.first_name = first_name
    if (last_name !== undefined) updates.last_name = last_name
    if (phone !== undefined) updates.phone = phone
    if (organization !== undefined) updates.organization = organization

    const { error } = await supabaseAdmin
      .from('subscribers')
      .update(updates)
      .eq('clerk_id', id)

    if (error) {
      console.error('Clerk webhook user.updated:', error.message)
      return new Response('Database error', { status: 500 })
    }
  }

  if (evt.type === 'user.deleted') {
    const { id } = evt.data
    await supabaseAdmin.from('subscribers').delete().eq('clerk_id', id)
  }

  return new Response('ok', { status: 200 })
}
