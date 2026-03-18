import { NextRequest, NextResponse } from 'next/server'
import { fetchPropertiesByAddress } from '@/lib/supabase-search'

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q')?.trim()
  if (!q || q.length < 3) {
    return NextResponse.json({ error: 'Query too short' }, { status: 400 })
  }

  const { pin10Groups, error } = await fetchPropertiesByAddress(q)

  if (error) {
    return NextResponse.json({ error }, { status: 500 })
  }

  return NextResponse.json({ pin10Groups })
}
