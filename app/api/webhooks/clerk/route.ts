import { Webhook } from 'svix'
import { headers } from 'next/headers'
import type { WebhookEvent } from '@clerk/nextjs/server'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

// ── Welcome email (sent once, on first subscriber insert) ──────────────────
// Copy approved by Jim 2026-07-13. Kept deliberately plain (no digest-style
// branding): a short personal note from Jim reads as 1:1 mail, not marketing.
const WELCOME_SUBJECT = 'Welcome to Property Sentinel'

function welcomeHtml(): string {
  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; font-size: 14px; color: #1a1a1a; line-height: 1.6;">
      <p>Hello!</p>
      <p>Thank you for becoming an early member of Property Sentinel.</p>
      <p>Search your property, add it to your portfolio, and read the actual complaint description as the city records it. We&rsquo;ll watch your buildings and email you a daily digest when anything happens &mdash; so you hear about problems while there&rsquo;s still time to act. <strong>All free for 30 days, then starting at $25/mo.</strong></p>
      <p>Questions about our data or products? Reach out &mdash; I build custom data solutions for Chicago property owners, and I read every email.</p>
      <p>&mdash;Jim</p>
    </div>
  `
}

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

        // Welcome nudge to the new user. Inside the fresh-insert branch so a
        // svix retry (which finds the existing row) can never double-send.
        // Non-fatal: a Resend failure must not 500 the webhook, or svix
        // would retry against an already-inserted subscriber.
        //
        // scheduledAt delays delivery ~2.5 minutes so the note doesn't land
        // in the same instant as Clerk's verification email and get buried.
        // Resend holds the send server-side; the webhook returns immediately.
        try {
          const { Resend } = await import('resend')
          const resend = new Resend(process.env.RESEND_API_KEY)
          await resend.emails.send({
            from: 'Jim McMahon <jim@propertysentinel.io>',
            to: emailAddress,
            bcc: 'jim@propertysentinel.io',
            replyTo: 'jim@propertysentinel.io',
            subject: WELCOME_SUBJECT,
            html: welcomeHtml(),
            scheduledAt: new Date(Date.now() + 2.5 * 60 * 1000).toISOString(),
          })
        } catch (e) {
          console.error('Clerk webhook welcome email:', e)
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
