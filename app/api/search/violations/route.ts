import { NextResponse } from 'next/server'

export async function GET() {
  return NextResponse.json({ violationsOpenCount: 0, recentViolation: null, error: null })
}