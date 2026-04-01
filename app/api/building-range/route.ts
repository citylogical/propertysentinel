import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { createClient } from '@supabase/supabase-js'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

function parseAddressRange(input: string): { low: string; high: string } | null {
  const t = input.trim().toUpperCase()
  const m = t.match(/^(\d+)\s*[-–—]\s*(\d+)\s+(.+)$/)
  if (m) return { low: `${m[1]} ${m[3].trim()}`, high: `${m[2]} ${m[3].trim()}` }
  const m2 = t.match(/^(\d+\s+.+?)\s+to\s+(\d+\s+.+)$/i)
  if (m2) return { low: m2[1].trim(), high: m2[2].trim() }
  return null
}

export async function POST(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Sign in required' }, { status: 401 })

  const supabase = getSupabase()
  const body = await req.json()
  const { searched_address, street1_range, street2_range, street3_range, street4_range } = body

  if (!searched_address || !street1_range) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const p1 = parseAddressRange(street1_range)
  if (!p1) {
    return NextResponse.json(
      { error: 'Could not parse range. Use format: 1234–5678 S Street Name' },
      { status: 400 }
    )
  }
  const p2 = street2_range ? parseAddressRange(street2_range) : null
  const p3 = street3_range ? parseAddressRange(street3_range) : null
  const p4 = street4_range ? parseAddressRange(street4_range) : null

  if (street2_range && !p2) {
    return NextResponse.json({ error: 'Could not parse street 2 range' }, { status: 400 })
  }
  if (street3_range && !p3) {
    return NextResponse.json({ error: 'Could not parse street 3 range' }, { status: 400 })
  }
  if (street4_range && !p4) {
    return NextResponse.json({ error: 'Could not parse street 4 range' }, { status: 400 })
  }

  const { data: sub } = await supabase.from('subscribers').select('role, email').eq('clerk_id', userId).single()
  const isAdmin = sub?.role === 'admin'

  const { data, error } = await supabase
    .from('user_building_ranges')
    .insert({
      user_id: userId,
      user_email: sub?.email || null,
      searched_address: searched_address.toUpperCase().trim(),
      street1_range: street1_range.trim(),
      street1_low: p1.low.toUpperCase(),
      street1_high: p1.high.toUpperCase(),
      street2_range: street2_range?.trim() || null,
      street2_low: p2 ? p2.low.toUpperCase() : null,
      street2_high: p2 ? p2.high.toUpperCase() : null,
      street3_range: street3_range?.trim() || null,
      street3_low: p3 ? p3.low.toUpperCase() : null,
      street3_high: p3 ? p3.high.toUpperCase() : null,
      street4_range: street4_range?.trim() || null,
      street4_low: p4 ? p4.low.toUpperCase() : null,
      street4_high: p4 ? p4.high.toUpperCase() : null,
      status: isAdmin ? 'approved' : 'pending',
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ range: data, autoApproved: isAdmin })
}
