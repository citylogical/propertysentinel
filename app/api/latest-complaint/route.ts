import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function GET() {
  const { data, error } = await supabase
    .from('complaints_311')
    .select('created_date')
    .order('created_date', { ascending: false })
    .limit(1)

  if (error || !data?.[0]) {
    return NextResponse.json({ timestamp: null })
  }

  return NextResponse.json({ timestamp: data[0].created_date })
}