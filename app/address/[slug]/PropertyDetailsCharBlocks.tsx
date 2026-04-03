import type { ReactNode } from 'react'
import type { PropertyCharsCondoRow, PropertyCharsResidentialRow } from '@/lib/supabase-search'

function dv(val: unknown): { text: string; isNa: boolean } {
  if (val === null || val === undefined) return { text: 'N/A', isNa: true }
  const s = String(val).trim()
  if (s === '') return { text: 'N/A', isNa: true }
  return { text: s, isNa: false }
}

function dnum(val: unknown): { text: string; isNa: boolean } {
  if (val === null || val === undefined) return { text: 'N/A', isNa: true }
  const n = typeof val === 'number' ? val : Number(String(val).trim().replace(/,/g, ''))
  if (!Number.isFinite(n)) return dv(val)
  return { text: n.toLocaleString('en-US'), isNa: false }
}

function numGt0(val: unknown): boolean {
  if (val === null || val === undefined) return false
  const n = Number(val)
  return Number.isFinite(n) && n > 0
}

export function residentialPropertyTypeFromChars(chars: PropertyCharsResidentialRow): string | null {
  const tor = dv(chars.type_of_residence ?? null)
  const svmf = dv(chars.single_v_multi_family ?? null)
  if (!tor.isNa && !svmf.isNa) return `${tor.text}, ${svmf.text}`
  if (!tor.isNa) return tor.text
  if (!svmf.isNa) return svmf.text
  return null
}

export function formatBathroomsLine(chars: PropertyCharsResidentialRow): string | null {
  const full = chars.num_full_baths
  const half = chars.num_half_baths
  const fn = full != null && Number(full) > 0
  const hn = half != null && Number(half) > 0
  if (!fn && !hn) return null
  if (fn && hn) return `${full} full / ${half} half`
  if (fn) return `${full} full`
  return `${half} half`
}

function Row({ k, label, children }: { k: string; label: string; children: ReactNode }) {
  return (
    <div key={k} className="detail-row">
      <span className="detail-key">{label}</span>
      <span className="detail-val">{children}</span>
    </div>
  )
}

/** Main characteristic rows for a residential assessor row (single PIN or per-PIN). */
export function ResidentialCharacteristicRows({ chars }: { chars: PropertyCharsResidentialRow }) {
  const pt = residentialPropertyTypeFromChars(chars)
  const bath = formatBathroomsLine(chars)
  const apartmentsRaw = chars.num_apartments
  const showApartments =
    apartmentsRaw != null &&
    String(apartmentsRaw).trim() !== '' &&
    String(apartmentsRaw).trim().toLowerCase() !== 'none' &&
    Number(apartmentsRaw) > 0

  return (
    <>
      {dv(chars.year_built).isNa === false && <Row k="yb" label="Year Built">{dv(chars.year_built).text}</Row>}
      {numGt0(chars.building_sqft) && (
        <Row k="bsq" label="Building Sqft">
          {dnum(chars.building_sqft).text}
        </Row>
      )}
      {numGt0(chars.land_sqft) && (
        <Row k="lsq" label="Land Sqft">
          {dnum(chars.land_sqft).text}
        </Row>
      )}
      {pt != null && (
        <Row k="pt" label="Property Type">
          {pt}
        </Row>
      )}
      {numGt0(chars.num_rooms) && (
        <Row k="rm" label="Rooms">
          {dnum(chars.num_rooms).text}
        </Row>
      )}
      {numGt0(chars.num_bedrooms) && (
        <Row k="br" label="Bedrooms">
          {dnum(chars.num_bedrooms).text}
        </Row>
      )}
      {bath != null && <Row k="ba" label="Bathrooms">{bath}</Row>}
      {showApartments && (
        <Row k="apt" label="Apartments">
          {dnum(apartmentsRaw).text}
        </Row>
      )}
      {dv(chars.basement_type).isNa === false && <Row k="bsmt" label="Basement">{dv(chars.basement_type).text}</Row>}
      {dv(chars.central_heating).isNa === false && <Row k="heat" label="Heating">{dv(chars.central_heating).text}</Row>}
      {dv(chars.central_air).isNa === false && <Row k="ac" label="A/C">{dv(chars.central_air).text}</Row>}
      {dv(chars.ext_wall_material).isNa === false && <Row k="ext" label="Exterior">{dv(chars.ext_wall_material).text}</Row>}
      {dv(chars.roof_material).isNa === false && <Row k="roof" label="Roof">{dv(chars.roof_material).text}</Row>}
      {dv((chars as { repair_condition?: unknown }).repair_condition).isNa === false && (
        <Row k="cond" label="Condition">
          {dv((chars as { repair_condition?: string | null }).repair_condition).text}
        </Row>
      )}
      {dv(chars.construction_quality).isNa === false && (
        <Row k="cq" label="Construction Quality">
          {dv(chars.construction_quality).text}
        </Row>
      )}
      {dv(chars.garage_size).isNa === false && <Row k="gar" label="Garage">{dv(chars.garage_size).text}</Row>}
      {numGt0(chars.num_fireplaces) && (
        <Row k="fp" label="Fireplaces">
          {dnum(chars.num_fireplaces).text}
        </Row>
      )}
    </>
  )
}

export function ResidentialCharacteristicTopRows({ chars }: { chars: PropertyCharsResidentialRow }) {
  const pt = residentialPropertyTypeFromChars(chars)
  return (
    <>
      {dv(chars.year_built).isNa === false && <Row k="yb" label="Year Built">{dv(chars.year_built).text}</Row>}
      {numGt0(chars.building_sqft) && (
        <Row k="bsq" label="Building Sqft">
          {dnum(chars.building_sqft).text}
        </Row>
      )}
      {numGt0(chars.land_sqft) && (
        <Row k="lsq" label="Land Sqft">
          {dnum(chars.land_sqft).text}
        </Row>
      )}
      {pt != null && (
        <Row k="pt" label="Property Type">
          {pt}
        </Row>
      )}
    </>
  )
}

export function ResidentialCharacteristicRemainderRows({ chars }: { chars: PropertyCharsResidentialRow }) {
  const bath = formatBathroomsLine(chars)
  const apartmentsRaw = chars.num_apartments
  const showApartments =
    apartmentsRaw != null &&
    String(apartmentsRaw).trim() !== '' &&
    String(apartmentsRaw).trim().toLowerCase() !== 'none' &&
    Number(apartmentsRaw) > 0

  return (
    <>
      {numGt0(chars.num_rooms) && (
        <Row k="rm" label="Rooms">
          {dnum(chars.num_rooms).text}
        </Row>
      )}
      {numGt0(chars.num_bedrooms) && (
        <Row k="br" label="Bedrooms">
          {dnum(chars.num_bedrooms).text}
        </Row>
      )}
      {bath != null && <Row k="ba" label="Bathrooms">{bath}</Row>}
      {showApartments && (
        <Row k="apt" label="Apartments">
          {dnum(apartmentsRaw).text}
        </Row>
      )}
      {dv(chars.basement_type).isNa === false && <Row k="bsmt" label="Basement">{dv(chars.basement_type).text}</Row>}
      {dv(chars.central_heating).isNa === false && <Row k="heat" label="Heating">{dv(chars.central_heating).text}</Row>}
      {dv(chars.central_air).isNa === false && <Row k="ac" label="A/C">{dv(chars.central_air).text}</Row>}
      {dv(chars.ext_wall_material).isNa === false && <Row k="ext" label="Exterior">{dv(chars.ext_wall_material).text}</Row>}
      {dv(chars.roof_material).isNa === false && <Row k="roof" label="Roof">{dv(chars.roof_material).text}</Row>}
      {dv((chars as { repair_condition?: unknown }).repair_condition).isNa === false && (
        <Row k="cond" label="Condition">
          {dv((chars as { repair_condition?: string | null }).repair_condition).text}
        </Row>
      )}
      {dv(chars.construction_quality).isNa === false && (
        <Row k="cq" label="Construction Quality">
          {dv(chars.construction_quality).text}
        </Row>
      )}
      {dv(chars.garage_size).isNa === false && <Row k="gar" label="Garage">{dv(chars.garage_size).text}</Row>}
      {numGt0(chars.num_fireplaces) && (
        <Row k="fp" label="Fireplaces">
          {dnum(chars.num_fireplaces).text}
        </Row>
      )}
    </>
  )
}

export function CommercialCharacteristicRows({ row }: { row: Record<string, unknown> }) {
  return (
    <>
      {row.year_built != null && Number(row.year_built) > 0 && (
        <Row k="cyb" label="Year Built">
          {String(row.year_built)}
        </Row>
      )}
      {row.building_sqft != null && Number(row.building_sqft) > 0 && (
        <Row k="cbsq" label="Building Sqft">
          {Number(row.building_sqft).toLocaleString('en-US')}
        </Row>
      )}
      {row.land_sqft != null && Number(row.land_sqft) > 0 && (
        <Row k="clsq" label="Land Sqft">
          {Number(row.land_sqft).toLocaleString('en-US')}
        </Row>
      )}
      {row.property_type_use != null && String(row.property_type_use).trim() !== '' && (
        <Row k="cpt" label="Property Type">
          {String(row.property_type_use)}
        </Row>
      )}
    </>
  )
}

export function CondoCharacteristicRows({ chars }: { chars: PropertyCharsCondoRow }) {
  const yb = dv(chars.year_built ?? null)
  return (
    <>
      {!yb.isNa && (
        <Row k="kyb" label="Year Built">
          {yb.text}
        </Row>
      )}
      {numGt0(chars.building_sqft) && (
        <Row k="kbsq" label="Building Sqft">
          {dnum(chars.building_sqft).text}
        </Row>
      )}
      {numGt0(chars.unit_sqft) && (
        <Row k="kusq" label="Unit Sqft">
          {dnum(chars.unit_sqft).text}
        </Row>
      )}
      {numGt0(chars.land_sqft) && (
        <Row k="klsq" label="Land Sqft">
          {dnum(chars.land_sqft).text}
        </Row>
      )}
      {chars.num_bedrooms != null && String(chars.num_bedrooms).trim() !== '' && (
        <Row k="kbr" label="Bedrooms">
          {dnum(chars.num_bedrooms).text}
        </Row>
      )}
    </>
  )
}

export function CondoCharacteristicTopRows({ chars }: { chars: PropertyCharsCondoRow }) {
  const yb = dv(chars.year_built ?? null)
  return (
    <>
      {!yb.isNa && (
        <Row k="kyb" label="Year Built">
          {yb.text}
        </Row>
      )}
      {numGt0(chars.building_sqft) && (
        <Row k="kbsq" label="Building Sqft">
          {dnum(chars.building_sqft).text}
        </Row>
      )}
      {numGt0(chars.land_sqft) && (
        <Row k="klsq" label="Land Sqft">
          {dnum(chars.land_sqft).text}
        </Row>
      )}
    </>
  )
}

export function CondoCharacteristicRemainderRows({ chars }: { chars: PropertyCharsCondoRow }) {
  return (
    <>
      {numGt0(chars.unit_sqft) && (
        <Row k="kusq" label="Unit Sqft">
          {dnum(chars.unit_sqft).text}
        </Row>
      )}
      {chars.num_bedrooms != null && String(chars.num_bedrooms).trim() !== '' && (
        <Row k="kbr" label="Bedrooms">
          {dnum(chars.num_bedrooms).text}
        </Row>
      )}
    </>
  )
}

/** Pick display source per user priority: residential → commercial → condo. */
export function pickPinCharacteristicsSource(
  res: PropertyCharsResidentialRow | null,
  com: Record<string, unknown> | null,
  condo: PropertyCharsCondoRow | null
): { kind: 'residential' | 'commercial' | 'condo'; data: unknown } | null {
  if (res) return { kind: 'residential', data: res }
  if (com) return { kind: 'commercial', data: com }
  if (condo) return { kind: 'condo', data: condo }
  return null
}

export function renderPickedPinCharacteristics(picked: { kind: 'residential' | 'commercial' | 'condo'; data: unknown }) {
  if (picked.kind === 'residential') {
    return <ResidentialCharacteristicRows chars={picked.data as PropertyCharsResidentialRow} />
  }
  if (picked.kind === 'commercial') {
    return <CommercialCharacteristicRows row={picked.data as Record<string, unknown>} />
  }
  return <CondoCharacteristicRows chars={picked.data as PropertyCharsCondoRow} />
}
