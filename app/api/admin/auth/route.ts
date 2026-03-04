import { NextResponse } from 'next/server'
import { getAdminToken, getAdminCookieName } from '@/lib/admin-auth'

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const password = typeof body?.password === 'string' ? body.password : ''
    const expected = process.env.ADMIN_PASSWORD

    if (!expected || password !== expected) {
      return NextResponse.json({ ok: false }, { status: 401 })
    }

    const token = getAdminToken()
    const res = NextResponse.json({ ok: true })
    res.cookies.set(getAdminCookieName(), token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7, // 7 days
      path: '/',
    })
    return res
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 })
  }
}
