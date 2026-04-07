import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import {
  checkCreditBackEligibility,
  getUnlockQuota,
  issueCreditBack,
} from '@/lib/unlock-credits'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ success: false, reason: 'unauthorized' }, { status: 401 })
  }

  let body: { sr_number?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ success: false, reason: 'invalid_body' }, { status: 400 })
  }

  const srNumber = body?.sr_number
  if (!srNumber) {
    return NextResponse.json(
      { success: false, reason: 'missing_sr_number' },
      { status: 400 }
    )
  }

  const eligibility = await checkCreditBackEligibility(userId, srNumber)
  if (!eligibility.eligible) {
    return NextResponse.json(
      { success: false, reason: eligibility.reason, message: eligibility.message },
      { status: 400 }
    )
  }

  await issueCreditBack(userId, srNumber)
  const quota = await getUnlockQuota(userId)

  return NextResponse.json({
    success: true,
    quota: {
      remaining: quota.unlimited ? null : quota.remaining,
      limit: quota.unlimited ? null : quota.limit,
      unlimited: quota.unlimited,
      used: quota.used,
    },
  })
}