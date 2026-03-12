import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'

const PENDING_ZIP_COOKIE = 'ps_pending_zip'

export async function GET(request: Request) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')
  const next = requestUrl.searchParams.get('next') ?? '/'
  const error = requestUrl.searchParams.get('error')

  if (error) {
    const errorParam = error === 'access_denied' ? 'denied' : 'expired'
    return NextResponse.redirect(`${requestUrl.origin}/?auth_error=${errorParam}`)
  }

  if (code) {
    const supabase = await createClient()
    const { data, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)
    if (exchangeError) {
      return NextResponse.redirect(`${requestUrl.origin}/?auth_error=expired`)
    }
    if (data.session) {
      const cookieStore = await cookies()
      const zipCookie = cookieStore.get(PENDING_ZIP_COOKIE)?.value
      if (zipCookie) {
        const id = data.session.user.id
        const email = data.session.user.email ?? ''
        const now = new Date().toISOString()
        const { data: existing } = await supabase.from('subscribers').select('id, plan').eq('id', id).maybeSingle()
        if (existing?.plan === 'premium') {
          await supabase.from('subscribers').update({ zip: zipCookie, updated_at: now }).eq('id', id)
        } else {
          await supabase.from('subscribers').upsert(
            { id, email, zip: zipCookie, plan: 'free', email_alerts: true, created_at: now, updated_at: now },
            { onConflict: 'id' }
          )
        }
        const res = NextResponse.redirect(`${requestUrl.origin}${next}`)
        res.cookies.set(PENDING_ZIP_COOKIE, '', { path: '/', maxAge: 0 })
        return res
      }
    }
  }

  return NextResponse.redirect(`${requestUrl.origin}${next}`)
}
