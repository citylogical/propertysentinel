import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

// All plausible string variants for each unmatched address.
// We're checking 311 / violations / permits to see which form they use,
// so we know the right alias mapping.
const TARGETS = [
  // 11347 S King Dr — modern, legacy, and full MLK forms
  '11347 S KING DR',
  '11347 S S PARK AVE',
  '11347 S MARTIN LUTHER KING JR DR',
  '11347 S DR MARTIN LUTHER KING JR DR',
  // 7648 S King Dr — same set
  '7648 S KING DR',
  '7648 S S PARK AVE',
  '7648 S MARTIN LUTHER KING JR DR',
  '7648 S DR MARTIN LUTHER KING JR DR',
  // 3515-17 S Lituanica — both ends of the range
  '3515 S LITUANICA AVE',
  '3517 S LITUANICA AVE',
]

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

  const results = await Promise.all(
    TARGETS.map(async (addr) => {
      const [complaintsCount, violationsCount, permitsCount, propRow] = await Promise.all([
        supabase
          .from('complaints_311')
          .select('sr_number', { count: 'exact', head: true })
          .eq('address_normalized', addr),
        supabase
          .from('violations')
          .select('violation_id', { count: 'exact', head: true })
          .eq('address_normalized', addr),
        supabase
          .from('permits')
          .select('permit_id', { count: 'exact', head: true })
          .eq('address_normalized', addr),
        supabase
          .from('properties')
          .select('pin, address_normalized, zip, property_class, mailing_name')
          .eq('address_normalized', addr)
          .limit(1)
          .maybeSingle(),
      ])

      // Get most recent complaint sample so we can eyeball whether the data is real
      const { data: recentComplaint } = await supabase
        .from('complaints_311')
        .select('sr_number, sr_short_code, sr_type, status, created_date')
        .eq('address_normalized', addr)
        .order('created_date', { ascending: false })
        .limit(1)
        .maybeSingle()

      return {
        address: addr,
        property: propRow.data,
        in_properties: propRow.data != null,
        counts: {
          complaints: complaintsCount.count ?? 0,
          violations: violationsCount.count ?? 0,
          permits: permitsCount.count ?? 0,
        },
        most_recent_complaint: recentComplaint,
      }
    })
  )

  return NextResponse.json({ results })
}