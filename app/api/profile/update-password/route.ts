import { auth, clerkClient } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'

export async function POST(req: Request) {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: { password?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const password = body.password
  if (!password || typeof password !== 'string' || password.length < 8) {
    return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 })
  }

  try {
    const client = await clerkClient()
    await client.users.updateUser(userId, { password })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to update password'
    return NextResponse.json({ error: message }, { status: 400 })
  }

  return NextResponse.json({ ok: true })
}
