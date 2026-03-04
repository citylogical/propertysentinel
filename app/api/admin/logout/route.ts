import { NextResponse } from 'next/server'
import { getAdminCookieName } from '@/lib/admin-auth'

export async function POST() {
  const res = NextResponse.json({ ok: true })
  res.cookies.set(getAdminCookieName(), '', { maxAge: 0, path: '/' })
  return res
}
