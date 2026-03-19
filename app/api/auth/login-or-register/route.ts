import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'

export async function POST(request: Request) {
  try {
    const { email } = (await request.json()) as { email?: string }
    const normalizedEmail = (email ?? '').trim().toLowerCase()
    if (!normalizedEmail || !normalizedEmail.includes('@')) {
      return NextResponse.json({ error: 'Valid email is required' }, { status: 400 })
    }

    const supabaseAdmin = getSupabaseAdmin()
    const { data, error } = await supabaseAdmin.auth.admin.listUsers()
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const existingUser = data.users?.find((u) => (u.email ?? '').toLowerCase() === normalizedEmail)

    if (!existingUser) {
      return NextResponse.json({ action: 'register' })
    }

    if (!existingUser.email_confirmed_at) {
      const tempPassword = `Tmp-${Math.random().toString(36).slice(2)}-${Date.now()}`
      const { error: linkError } = await supabaseAdmin.auth.admin.generateLink({
        type: 'signup',
        email: normalizedEmail,
        password: tempPassword,
      })
      if (linkError) {
        return NextResponse.json({ error: linkError.message }, { status: 500 })
      }
      return NextResponse.json({ action: 'verify_email' })
    }

    const hasPassword =
      existingUser.app_metadata?.provider === 'email' &&
      existingUser.identities?.some(
        (i: any) => i.provider === 'email' && Boolean(i.identity_data?.hashed_password)
      )

    if (hasPassword) {
      return NextResponse.json({ action: 'enter_password' })
    }

    const { error: recoveryError } = await supabaseAdmin.auth.resetPasswordForEmail(normalizedEmail, {
      redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/callback?next=/profile/set-password`,
    })
    if (recoveryError) {
      return NextResponse.json({ error: recoveryError.message }, { status: 500 })
    }
    return NextResponse.json({ action: 'set_password_email_sent' })
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }
}
