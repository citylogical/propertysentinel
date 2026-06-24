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
    const userId = id
    const emailAddress = email_addresses[0]?.email_address
    if (emailAddress) {
      // Insert only — don't overwrite existing rows (preserves role)
      const { data: existing } = await supabaseAdmin
        .from('subscribers')
        .select('id')
        .eq('clerk_id', userId)
        .single()

      if (!existing) {
        const { error } = await supabaseAdmin.from('subscribers').insert({
          clerk_id: userId,
          email: emailAddress,
          role: 'default',
        })
        if (error) {
          console.error('Clerk webhook subscribers insert:', error.message)
          return new Response('Database error', { status: 500 })
        }
      }

      try {
        const { Resend } = await import('resend')
        const resend = new Resend(process.env.RESEND_API_KEY)
        await resend.emails.send({
          from: 'Property Sentinel <jim@propertysentinel.io>',
          to: 'jim@propertysentinel.io',
          subject: 'New user signed up',
          html: `
    <p><strong>New user on Property Sentinel</strong></p>
    <p>Email: ${emailAddress}</p>
    <p>Clerk ID: ${userId}</p>
    <p>Signed up: ${new Date().toLocaleString('en-US', { timeZone: 'America/Chicago' })}</p>
  `,
        })
      } catch (e) {
        console.error('Clerk webhook Resend notify:', e)
      }
    }
  }

  if (evt.type === 'user.updated') {
    const { id, email_addresses } = evt.data
    const email = email_addresses[0]?.email_address ?? null

    // Only sync the email from Clerk. first_name, last_name, organization,
    // phone, and zip are owned by the profile page (stored in Supabase, never
    // written to Clerk), so they come through this event as null and would
    // WIPE the real values if we wrote them. Email is the only profile field
    // Clerk is the source of truth for, so it's the only thing we sync here.
    if (!email) {
      return new Response('ok', { status: 200 })
    }

    const { error } = await supabaseAdmin
      .from('subscribers')
      .update({ email, updated_at: new Date().toISOString() })
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
