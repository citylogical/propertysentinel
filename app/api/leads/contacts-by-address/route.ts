import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { resolveAddressToProperties } from '@/lib/address-resolution'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ contacts: [] }, { status: 401 })
  }

  const address = req.nextUrl.searchParams.get('address')?.trim()
  if (!address) {
    return NextResponse.json({ error: 'address is required' }, { status: 400 })
  }

  const supabase = getSupabaseAdmin()

  const resolvedProps = await resolveAddressToProperties(address)
  if (resolvedProps.length === 0) {
    return NextResponse.json({ address, total_pins: 0, total_contacts: 0, contacts: [] })
  }
  const pinList = [...new Set(resolvedProps.map((p) => p.pin).filter(Boolean))]

  const { data: rows, error } = await supabase
    .from('properties')
    .select('pin, mailing_name, mailing_address, mailing_city, mailing_state, mailing_zip, tax_year')
    .in('pin', pinList)
    .order('mailing_name', { ascending: true })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const latestByPin = new Map<
    string,
    {
      pin: string
      mailing_name: string | null
      mailing_address: string | null
      mailing_city: string | null
      mailing_state: string | null
      mailing_zip: string | null
      tax_year: number | null
    }
  >()
  for (const row of (rows ?? []) as Array<{
    pin: string | null
    mailing_name: string | null
    mailing_address: string | null
    mailing_city: string | null
    mailing_state: string | null
    mailing_zip: string | null
    tax_year: number | null
  }>) {
    if (!row.pin) continue
    const existing = latestByPin.get(row.pin)
    if (!existing || (row.tax_year ?? 0) > (existing.tax_year ?? 0)) {
      latestByPin.set(row.pin, {
        pin: row.pin,
        mailing_name: row.mailing_name,
        mailing_address: row.mailing_address,
        mailing_city: row.mailing_city,
        mailing_state: row.mailing_state,
        mailing_zip: row.mailing_zip,
        tax_year: row.tax_year,
      })
    }
  }

  type ContactGroup = {
    mailing_name: string | null
    mailing_address: string | null
    mailing_city: string | null
    mailing_state: string | null
    mailing_zip: string | null
    unit_count: number
    pins: string[]
  }
  const groupKey = (r: { mailing_name: string | null; mailing_address: string | null }) =>
    `${(r.mailing_name ?? '').toUpperCase().trim()}||${(r.mailing_address ?? '').toUpperCase().trim()}`

  const grouped = new Map<string, ContactGroup>()
  for (const row of latestByPin.values()) {
    const key = groupKey(row)
    if (!grouped.has(key)) {
      grouped.set(key, {
        mailing_name: row.mailing_name,
        mailing_address: row.mailing_address,
        mailing_city: row.mailing_city,
        mailing_state: row.mailing_state,
        mailing_zip: row.mailing_zip,
        unit_count: 0,
        pins: [],
      })
    }
    const group = grouped.get(key)!
    group.unit_count++
    group.pins.push(row.pin)
  }

  const contacts = [...grouped.values()].sort((a, b) => {
    if (b.unit_count !== a.unit_count) return b.unit_count - a.unit_count
    return (a.mailing_name ?? '').localeCompare(b.mailing_name ?? '')
  })

  return NextResponse.json({
    address,
    total_pins: latestByPin.size,
    total_contacts: contacts.length,
    contacts,
  })
}
