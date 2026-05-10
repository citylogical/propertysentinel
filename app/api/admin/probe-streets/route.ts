import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

export async function GET() {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (process.env.NODE_ENV !== 'development') {
    const supabase = getSupabaseAdmin()
    const { data: subscriber } = await supabase
      .from('subscribers')
      .select('role')
      .eq('clerk_id', userId)
      .maybeSingle()
    if (subscriber?.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
  }

  const supabase = getSupabaseAdmin()

  // 1. SAINT LOUIS — confirm 4221 and 4652 sit there
  const { data: saintLouisN } = await supabase
    .from('properties')
    .select('address_normalized, pin')
    .ilike('address_normalized', '% N SAINT LOUIS %')
    .order('address_normalized')
    .limit(20)

  const { data: saint4221 } = await supabase
    .from('properties')
    .select('address_normalized, pin, mailing_name')
    .ilike('address_normalized', '4221%SAINT LOUIS%')
    .limit(5)

  const { data: saint4652 } = await supabase
    .from('properties')
    .select('address_normalized, pin, mailing_name')
    .ilike('address_normalized', '4652%SAINT LOUIS%')
    .limit(5)

  // 2. What's at 11347 S — anything?
  const { data: any11347 } = await supabase
    .from('properties')
    .select('address_normalized, pin, mailing_name')
    .ilike('address_normalized', '11347%')
    .limit(20)

  // 3. Lituanica — does it exist anywhere?
  const { data: lituanica } = await supabase
    .from('properties')
    .select('address_normalized, pin')
    .ilike('address_normalized', '%LITUANICA%')
    .order('address_normalized')
    .limit(10)

  // 4. MLK convention check — what does "MARTIN LUTHER KING" look like?
  const { data: mlkSamples } = await supabase
    .from('properties')
    .select('address_normalized, pin')
    .ilike('address_normalized', '%MARTIN LUTHER KING%')
    .order('address_normalized')
    .limit(10)

  return NextResponse.json({
    n_saint_louis_first_20: saintLouisN,
    saint_4221_match: saint4221,
    saint_4652_match: saint4652,
    address_11347_anything: any11347,
    lituanica_anywhere: lituanica,
    mlk_format_samples: mlkSamples,
  })
}