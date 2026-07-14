export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { Resend } from 'resend'

function escapeHtml(s: string): string {
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }
  return s.replace(/[&<>"']/g, (m) => map[m] ?? m)
}

export async function POST(request: Request) {
  let body: {
    name?: unknown
    email?: unknown
    org?: unknown
    units?: unknown
    message?: unknown
  }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const name = String(body.name ?? '').trim()
  const email = String(body.email ?? '').trim()
  const org = String(body.org ?? '').trim()
  const units = String(body.units ?? '').trim()
  const message = String(body.message ?? '').trim()

  if (!name || !email.includes('@')) {
    return NextResponse.json(
      { error: 'Name and a valid email are required.' },
      { status: 400 },
    )
  }

  const fromAddress =
    process.env.RESEND_FROM_EMAIL ||
    'Property Sentinel <noreply@propertysentinel.io>'

  const eName = escapeHtml(name)
  const eEmail = escapeHtml(email)
  const eOrg = escapeHtml(org)
  const eUnits = escapeHtml(units)
  const eMessage = escapeHtml(message).replace(/\n/g, '<br>')

  const html = `
<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #1a1a1a; max-width: 600px; line-height: 1.5;">
  <h2 style="color: #1e3a5f; font-size: 20px; font-weight: 600; margin: 0 0 20px;">New portfolio inquiry</h2>
  <p style="margin: 0 0 10px;"><strong style="color: #1e3a5f;">Name:</strong> ${eName}</p>
  <p style="margin: 0 0 10px;"><strong style="color: #1e3a5f;">Email:</strong> ${eEmail}</p>
  <p style="margin: 0 0 10px;"><strong style="color: #1e3a5f;">Organization:</strong> ${eOrg}</p>
  <p style="margin: 0 0 10px;"><strong style="color: #1e3a5f;">Units:</strong> ${eUnits}</p>
  <p style="margin: 16px 0 0;"><strong style="color: #1e3a5f;">Message:</strong></p>
  <p style="margin: 4px 0 0;">${eMessage}</p>
</div>`.trim()

  const text = [
    `Name: ${name}`,
    `Email: ${email}`,
    `Organization: ${org}`,
    `Units: ${units}`,
    '',
    message,
  ].join('\n')

  const resend = new Resend(process.env.RESEND_API_KEY)
  const { error: sendError } = await resend.emails.send({
    from: fromAddress,
    to: 'jim@propertysentinel.io',
    replyTo: email,
    subject: `New portfolio inquiry from ${name}`,
    html,
    text,
  })

  if (sendError) {
    console.error('Contact form Resend error:', sendError)
    return NextResponse.json({ error: 'Could not send message.' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
