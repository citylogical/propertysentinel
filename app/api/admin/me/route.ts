import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { verifyAdminToken, getAdminCookieName } from '@/lib/admin-auth'

export async function GET() {
  const cookieStore = await cookies()
  const token = cookieStore.get(getAdminCookieName())?.value
  if (!verifyAdminToken(token)) {
    return NextResponse.json({ ok: false }, { status: 401 })
  }
  return NextResponse.json({ ok: true })
}
