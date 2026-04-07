import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { getUnlockQuota, INITIAL_CREDIT_GRANT } from '@/lib/unlock-credits'

export const dynamic = 'force-dynamic'

export async function GET() {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({
      signed_in: false,
      remaining: 0,
      limit: INITIAL_CREDIT_GRANT,
      unlimited: false,
      used: 0,
    })
  }

  const quota = await getUnlockQuota(userId)
  return NextResponse.json({
    signed_in: true,
    remaining: quota.unlimited ? null : quota.remaining,
    limit: quota.unlimited ? null : quota.limit,
    unlimited: quota.unlimited,
    used: quota.used,
  })
}