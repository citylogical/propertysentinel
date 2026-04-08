import { resolveAddressesToProperties } from './address-resolution'

export type PropertyTypeLabel =
  | 'residential'
  | 'condo_unit'
  | 'condo_building'
  | 'apartment'
  | 'commercial'
  | 'exempt'
  | 'unknown'

/**
 * Pure label-from-class function — no DB calls. Used by callers that already
 * know the class and PIN count (e.g. batch enrichment on the leads query route).
 */
export function labelFromClass(
  cls: string | null | undefined,
  pinCountAtAddress: number
): PropertyTypeLabel {
  if (!cls || cls.trim() === '') return 'unknown'
  const c = cls.trim().toUpperCase()

  // 'EX' is the literal exempt code on parcel_universe (not 4xx).
  if (c === 'EX') return 'exempt'

  if (/^4/.test(c)) return 'exempt'
  if (/^[5678]/.test(c)) return 'commercial'
  if (/^3/.test(c)) return 'apartment'

  if (c === '299') {
    return pinCountAtAddress >= 7 ? 'condo_building' : 'condo_unit'
  }

  if (/^2/.test(c)) return 'residential'

  return 'unknown'
}

/** Latest class per PIN from parcel rows ordered by tax_year DESC. */
function classByPinFromParcelRows(
  parcelRows: { pin: string; class: string | null; tax_year: number | null }[]
): Map<string, string> {
  const classByPin = new Map<string, string>()
  for (const r of parcelRows) {
    if (r.pin && r.class && !classByPin.has(r.pin)) {
      classByPin.set(r.pin, r.class)
    }
  }
  return classByPin
}

/** Count dominant assessor class across PINs at an address; drop EX when other classes exist. */
function dominantClassForPins(pins: string[], classByPin: Map<string, string>): string | null {
  const classCounts = new Map<string, number>()
  for (const pin of pins) {
    const raw = classByPin.get(pin)
    if (!raw) continue
    const c = raw.trim().toUpperCase()
    classCounts.set(c, (classCounts.get(c) ?? 0) + 1)
  }
  if (classCounts.size === 0) return null
  if (classCounts.size > 1) classCounts.delete('EX')
  return [...classCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null
}

/**
 * Batch property type labels for many normalized addresses (Public Leads page, watchlist).
 * Two round-trips: properties → PINs, parcel_universe → class.
 */
export async function batchPropertyTypeLabelsForAddresses(
  addresses: string[]
): Promise<Map<string, PropertyTypeLabel>> {
  const labelByAddress = new Map<string, PropertyTypeLabel>()
  const unique = [...new Set(addresses.map((a) => a.trim()).filter((a) => a.length > 0))]
  if (unique.length === 0) return labelByAddress

  const { getSupabaseAdmin } = await import('@/lib/supabase-admin')
  const supabase = getSupabaseAdmin()

  const propsByAddress = await resolveAddressesToProperties(unique)

  const pinsByAddress = new Map<string, string[]>()
  for (const [addr, properties] of propsByAddress.entries()) {
    const pins = [...new Set(properties.map((p) => p.pin).filter((pin): pin is string => Boolean(pin)))]
    if (pins.length > 0) pinsByAddress.set(addr, pins)
  }

  const allPins = [...new Set([...pinsByAddress.values()].flat())]
  let classByPin = new Map<string, string>()
  if (allPins.length > 0) {
    const { data: parcels } = await supabase
      .from('parcel_universe')
      .select('pin, class, tax_year')
      .in('pin', allPins)
      .order('tax_year', { ascending: false })
    const parcelRows = (parcels ?? []) as { pin: string; class: string | null; tax_year: number | null }[]
    classByPin = classByPinFromParcelRows(parcelRows)
  }

  for (const addr of unique) {
    const pins = pinsByAddress.get(addr)
    if (!pins || pins.length === 0) {
      labelByAddress.set(addr, 'unknown')
      continue
    }
    const dominant = dominantClassForPins(pins, classByPin)
    labelByAddress.set(addr, labelFromClass(dominant, pins.length))
  }

  return labelByAddress
}

/**
 * Derives a human-readable property type for a single address.
 *
 * Uses parcel_universe (via properties.pin), not properties.property_class.
 * The first argument is ignored for backwards compatibility with the unlock route.
 */
export async function derivePropertyType(
  _unusedFirstArg: string | null | undefined,
  addressNormalized: string
): Promise<PropertyTypeLabel> {
  if (!addressNormalized?.trim()) return 'unknown'
  const map = await batchPropertyTypeLabelsForAddresses([addressNormalized])
  return map.get(addressNormalized.trim()) ?? 'unknown'
}

/**
 * Display label and color palette for each property type.
 * Colors picked to be readable on the cream page background and
 * visually distinct from each other at small badge size.
 */
export function getPropertyTypeStyle(label: PropertyTypeLabel): {
  text: string
  bg: string
  fg: string
  border: string
} {
  switch (label) {
    case 'residential':
      return { text: 'Residential', bg: '#dcfce7', fg: '#166534', border: '#86efac' }
    case 'condo_unit':
      return { text: 'Condo Unit', bg: '#dbeafe', fg: '#1e40af', border: '#93c5fd' }
    case 'condo_building':
      return { text: 'Condo Building', bg: '#e0e7ff', fg: '#3730a3', border: '#a5b4fc' }
    case 'apartment':
      return { text: 'Apartment', bg: '#fef3c7', fg: '#92400e', border: '#fcd34d' }
    case 'commercial':
      return { text: 'Commercial', bg: '#ffedd5', fg: '#9a3412', border: '#fdba74' }
    case 'exempt':
      return { text: 'Exempt', bg: '#f3e8ff', fg: '#6b21a8', border: '#d8b4fe' }
    case 'unknown':
    default:
      return { text: 'Unknown', bg: '#f3f4f6', fg: '#6b7280', border: '#d1d5db' }
  }
}
