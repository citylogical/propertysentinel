import Link from 'next/link'
import { slugToDisplayAddress, slugToNormalizedAddress, slugToZip } from '@/lib/address-slug'
import {
  fetchProperty,
  fetchParcelUniverse,
  fetchComplaints,
  fetchViolations,
  fetchPermits,
  fetchAssessedValue,
  fetchAssessedValuesByPins,
  fetchPropertyCharsResidential,
  fetchPropertyCharsCondo,
  normalizePin,
  normalizePinSilent,
  fetchCommercialChars,
  fetchExemptChars,
  fetchSiblingPins,
  fetchComplaintsByAddresses,
  fetchViolationsByAddresses,
  fetchPermitsByAddresses,
  fetchPinAddressMap,
} from '@/lib/supabase-search'
import type { PropertyCharsResidentialRow, PropertyCharsCondoRow } from '@/lib/supabase-search'
import { getCommunityAreaName } from '@/lib/chicago-community-areas'
import { getClassDescription } from '@/lib/class-codes'
import PropertySidebar from '@/components/PropertySidebar'
import PropertyFeed from './PropertyFeed'
import PropertyDetailsExpanded from './PropertyDetailsExpanded'
import type { SiblingPin } from './PropertyDetailsExpanded'
import AddressBarButtons from './AddressBarButtons'
import RecordSearch from './RecordSearch'
import React from 'react'

type PageProps = {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ building?: string }>
}

export async function generateMetadata({ params }: PageProps) {
  const { slug } = await params
  const display = slugToDisplayAddress(decodeURIComponent(slug))
  return {
    title: display ? `Property Sentinel — ${display}` : 'Property Sentinel — Address',
    description: '311 complaints, violations, and property details for this Chicago address.',
  }
}

function formatMonthYear(dateStr: string | null | undefined): string {
  if (!dateStr) return 'Unknown'
  const d = new Date(dateStr)
  if (Number.isNaN(d.getTime())) return 'Unknown'
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  return `${months[d.getUTCMonth()]} ${d.getUTCFullYear()}`
}

function detailVal(val: string | number | null | undefined): { text: string; isNa: boolean } {
  if (val === null || val === undefined) return { text: 'N/A', isNa: true }
  const s = String(val).trim()
  if (s === '') return { text: 'N/A', isNa: true }
  return { text: s, isNa: false }
}

/** For residential "additional" bool-like fields: Yes/No for 1/0/true/false; otherwise detailVal when meaningful. */
function formatResidentialBoolish(val: unknown): { text: string; skip: boolean } {
  if (val === null || val === undefined) return { text: '', skip: true }
  if (typeof val === 'boolean') return { text: val ? 'Yes' : 'No', skip: false }
  if (val === 1 || val === '1') return { text: 'Yes', skip: false }
  if (val === 0 || val === '0') return { text: 'No', skip: false }
  if (typeof val === 'string') {
    const t = val.trim()
    if (t === '') return { text: '', skip: true }
    const l = t.toLowerCase()
    if (l === 'true' || l === 'yes') return { text: 'Yes', skip: false }
    if (l === 'false' || l === 'no') return { text: 'No', skip: false }
  }
  const d = detailVal(val as string | number)
  return { text: d.text, skip: d.isNa }
}

function showResidentialNumericAdditional(val: unknown): boolean {
  if (val === null || val === undefined) return false
  const n = Number(val)
  return !Number.isNaN(n) && n > 0
}

type AdditionalResidentialField = { key: string; label: string; kind: 'numeric' | 'string' | 'boolish' }

const ADDITIONAL_RESIDENTIAL_FIELDS: AdditionalResidentialField[] = [
  { key: 'num_bedrooms', label: 'Bedrooms', kind: 'numeric' },
  { key: 'num_rooms', label: 'Rooms', kind: 'numeric' },
  { key: 'num_full_baths', label: 'Full Baths', kind: 'numeric' },
  { key: 'num_half_baths', label: 'Half Baths', kind: 'numeric' },
  { key: 'num_fireplaces', label: 'Fireplaces', kind: 'numeric' },
  { key: 'construction_quality', label: 'Construction Quality', kind: 'string' },
  { key: 'design_plan', label: 'Design Plan', kind: 'string' },
  { key: 'site_desirability', label: 'Site Desirability', kind: 'string' },
  { key: 'ext_wall_material', label: 'Exterior Wall', kind: 'string' },
  { key: 'roof_material', label: 'Roof Material', kind: 'string' },
  { key: 'repair_condition', label: 'Repair Condition', kind: 'string' },
  { key: 'basement_type', label: 'Basement Type', kind: 'string' },
  { key: 'basement_finish', label: 'Basement Finish', kind: 'string' },
  { key: 'attic_type', label: 'Attic Type', kind: 'string' },
  { key: 'attic_finish', label: 'Attic Finish', kind: 'string' },
  { key: 'garage_attached', label: 'Garage Attached', kind: 'boolish' },
  { key: 'garage_area_included', label: 'Garage Area Included', kind: 'numeric' },
  { key: 'garage_size', label: 'Garage Size', kind: 'string' },
  { key: 'garage_ext_wall_material', label: 'Garage Ext Wall', kind: 'string' },
  { key: 'central_heating', label: 'Central Heating', kind: 'boolish' },
  { key: 'central_air', label: 'Central Air', kind: 'boolish' },
  { key: 'renovation', label: 'Renovation', kind: 'boolish' },
  { key: 'porch', label: 'Porch', kind: 'string' },
]

function additionalResidentialDetailRows(chars: PropertyCharsResidentialRow): React.ReactNode {
  return ADDITIONAL_RESIDENTIAL_FIELDS.map((f) => {
    const raw = chars[f.key as keyof PropertyCharsResidentialRow]
    if (f.kind === 'numeric') {
      if (!showResidentialNumericAdditional(raw)) return null
      const d = detailVal(raw as string | number)
      if (d.isNa) return null
      return (
        <div key={f.key} className="detail-row">
          <span className="detail-key">{f.label}</span>
          <span className="detail-val">{d.text}</span>
        </div>
      )
    }
    if (f.kind === 'boolish') {
      const b = formatResidentialBoolish(raw)
      if (b.skip) return null
      return (
        <div key={f.key} className="detail-row">
          <span className="detail-key">{f.label}</span>
          <span className="detail-val">{b.text}</span>
        </div>
      )
    }
    const d = detailVal(raw as string | number | null | undefined)
    if (d.isNa) return null
    return (
      <div key={f.key} className="detail-row">
        <span className="detail-key">{f.label}</span>
        <span className="detail-val">{d.text}</span>
      </div>
    )
  })
}

function displayVal(val: string | number | boolean | null | undefined): string | number | null | undefined {
  if (val === null || val === undefined) return null
  if (typeof val === 'boolean') return val ? 'Yes' : 'No'
  return val
}

function getAssessmentLevelForImplied(assessedClass: string | null): number {
  if (!assessedClass) return 0.1
  const major = parseInt(assessedClass.toString()[0], 10)
  if (Number.isNaN(major)) return 0.1
  if (major === 4 || major === 5) return 0.25
  return 0.1
}

function formatRangeForDisplay(range: string): string {
  const DIRS = new Set(['N', 'S', 'E', 'W'])
  return range
    .split(' & ')
    .map(part =>
      part.split(' ').map((word, i) => {
        if (i === 0) return word
        if (DIRS.has(word)) return word
        return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
      }).join(' ')
    )
    .join(' & ')
}

const SECTION_LABEL: React.CSSProperties = {
  fontFamily: 'var(--mono)',
  fontSize: '8px',
  letterSpacing: '0.1em',
  textTransform: 'uppercase' as const,
  color: 'var(--text-dim)',
  padding: '8px 14px 3px',
  display: 'block',
  opacity: 0.7,
  borderBottom: '1px solid var(--border)',
}

const SECTION_SHADED: React.CSSProperties = {
  background: 'var(--cream-dark)',
}

export default async function AddressPage({ params, searchParams }: PageProps) {
  const { slug } = await params
  const { building } = await searchParams
  let isExpanded = building === 'true'
  const decodedSlug = decodeURIComponent(slug)
  const normalizedAddress = slugToNormalizedAddress(decodedSlug)
  const displayAddress = slugToDisplayAddress(decodedSlug)

  const propertyResult = await fetchProperty(normalizedAddress)
  const property = propertyResult.property
  const nearestParcel = propertyResult.nearestParcel
  const pin: string | null =
    property?.pin != null && String(property.pin).trim() !== ''
      ? String(property.pin).trim()
      : null

  let complaints: Awaited<ReturnType<typeof fetchComplaints>>['complaints'] = []
  let violations: Awaited<ReturnType<typeof fetchViolations>>['violations'] = []
  let permits: Awaited<ReturnType<typeof fetchPermits>>['permits'] = []
  let charsResidential: PropertyCharsResidentialRow | null = null
  let charsCondo: PropertyCharsCondoRow | null = null
  let assessed: Awaited<ReturnType<typeof fetchAssessedValue>>['assessed'] = null
  let assessedByPins: Awaited<ReturnType<typeof fetchAssessedValuesByPins>> | null = null
  let parcel: Awaited<ReturnType<typeof fetchParcelUniverse>>['parcel'] = null
  let commercialChars: any[] = []
  let exemptChars: any | null = null
  let addressRange: string | null = null
  let siblingAddresses: string[] = [normalizedAddress]
  let expandedSiblings: SiblingPin[] = []
  let buildingParcelCountForAv = 0

  if (pin) {
    const normalizedPin = normalizePin(pin)
    if (normalizedPin) {
      const siblings = await fetchSiblingPins(normalizedPin, normalizedAddress)
      addressRange = siblings.addressRange
      siblingAddresses = siblings.siblingAddresses

      // Auto-expand for unit-suffix condos (all PINs share same base address)
      if (!isExpanded && siblings.siblingPins.length > 1 && siblings.addressRange === normalizedAddress) {
        isExpanded = true
      }

      const useBuildingAssessedSum = isExpanded && siblings.siblingPins.length > 1

      type AssessedUnion =
        | { mode: 'byPins'; result: Awaited<ReturnType<typeof fetchAssessedValuesByPins>> }
        | { mode: 'single'; result: Awaited<ReturnType<typeof fetchAssessedValue>> }

      const assessedPromise: Promise<AssessedUnion> = useBuildingAssessedSum
        ? fetchAssessedValuesByPins(siblings.siblingPins).then((result) => ({ mode: 'byPins' as const, result }))
        : fetchAssessedValue(normalizedPin).then((result) => ({ mode: 'single' as const, result }))

      const [assessedUnion, complaintsResult, violationsResult, permitsResult, charsResResult, charsCondoResult, parcelResult] =
        await Promise.all([
          assessedPromise,
          isExpanded && siblings.siblingAddresses.length > 1
            ? fetchComplaintsByAddresses(siblings.siblingAddresses)
            : fetchComplaints(normalizedAddress),
          isExpanded && siblings.siblingAddresses.length > 1
            ? fetchViolationsByAddresses(siblings.siblingAddresses)
            : fetchViolations(normalizedAddress),
          isExpanded && siblings.siblingAddresses.length > 1
            ? fetchPermitsByAddresses(siblings.siblingAddresses)
            : fetchPermits(normalizedAddress),
          fetchPropertyCharsResidential(normalizedPin),
          fetchPropertyCharsCondo(normalizedPin),
          fetchParcelUniverse(normalizedPin),
        ])

      complaints = complaintsResult.complaints ?? []
      violations = violationsResult.violations ?? []
      permits = permitsResult.permits ?? []
      charsResidential = charsResResult.chars
      charsCondo = charsCondoResult.chars
      parcel = parcelResult.parcel

      if (assessedUnion.mode === 'byPins') {
        assessedByPins = assessedUnion.result
        assessed = null
        buildingParcelCountForAv = siblings.siblingPins.length
      } else {
        assessed = assessedUnion.result.assessed
        assessedByPins = null
        buildingParcelCountForAv = 0
      }

      if (isExpanded && siblings.siblingPins.length > 0) {
        const pinMap = await fetchPinAddressMap(siblings.siblingPins)
        if (assessedByPins && !assessedByPins.error) {
          expandedSiblings = siblings.siblingPins.map((p, i) => {
            const r = assessedByPins!.results[i]
            const key = normalizePinSilent(p)
            return {
              pin: p,
              address: pinMap[key] ?? siblings.siblingAddresses[i] ?? '',
              assessedClass: r?.assessedClass ?? null,
              assessedValue: r?.assessedValue ?? null,
              taxYear: r?.taxYear ?? null,
              valueType: r?.valueType ?? null,
            }
          })
        } else {
          const assessedPerPin = await Promise.all(siblings.siblingPins.map((p) => fetchAssessedValue(p)))
          expandedSiblings = siblings.siblingPins.map((p, i) => {
            const key = normalizePinSilent(p)
            const av = assessedPerPin[i].assessed
            return {
              pin: p,
              address: pinMap[key] ?? siblings.siblingAddresses[i] ?? '',
              assessedClass: av?.class ?? null,
              assessedValue: av?.displayValue ?? null,
              taxYear: av?.taxYear ?? null,
              valueType: av?.valueType ?? null,
            }
          })
        }
      }

      const majorClass = parseInt(String(parcel?.class ?? assessed?.class ?? '0').substring(0, 1), 10)
      const isCommercial = [3, 5, 6, 7, 8].includes(majorClass)
      const isExempt = majorClass === 4

      if (isCommercial) {
        const { chars } = await fetchCommercialChars(normalizedPin)
        commercialChars = chars
      }
      if (isExempt) {
        const { exempt } = await fetchExemptChars(normalizedPin)
        exemptChars = exempt
      }
    }
  } else {
    const [complaintsResult, violationsResult, permitsResult] = await Promise.all([
      fetchComplaints(normalizedAddress),
      fetchViolations(normalizedAddress),
      fetchPermits(normalizedAddress),
    ])
    complaints = complaintsResult.complaints ?? []
    violations = violationsResult.violations ?? []
    permits = permitsResult.permits ?? []
  }

  const complaintsOpenCount = complaints.filter((c) => (c.status ?? '').toUpperCase() === 'OPEN').length
  const violationsOpenCount = violations.filter((v) => {
    const vs = (v.violation_status ?? v.inspection_status ?? '').toUpperCase()
    return vs === 'OPEN' || vs === 'FAILED'
  }).length
  const violationsCompliedCount = violations.filter((v) => {
    const vs = (v.violation_status ?? v.inspection_status ?? '').toUpperCase()
    return vs === 'COMPLIED' || vs === 'PASSED' || vs === 'CLOSED'
  }).length
  const lastViolation = violations.length > 0 ? violations[0] : null
  const lastViolationDate = lastViolation?.violation_date
    ? (() => {
        const d = new Date(lastViolation.violation_date)
        if (Number.isNaN(d.getTime())) return 'Unknown'
        const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
        return `${months[d.getUTCMonth()]} ${d.getUTCFullYear()}`
      })()
    : 'None'
  const lastViolationCategory = lastViolation?.department_bureau ?? null
  const firstComplaint = complaints[0] ?? null

  const lastPermitDisplay =
    permits.length > 0 && permits[0].issue_date
      ? formatMonthYear(permits[0].issue_date)
      : 'Unknown'

  const displayPin = pin
  const propertyChars = (charsResidential ?? charsCondo) as Record<string, unknown> | null
  const currencyZero = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
    minimumFractionDigits: 0,
  })

  const lastPermitCost = (() => {
    if (permits.length === 0) return null
    const p = permits[0]
    const cost = Number(p.reported_cost) || 0
    const fee = Number(p.total_fee) || 0
    const total = cost + fee
    if (total <= 0) return null
    return currencyZero.format(total)
  })()

  const impliedMarketValueTotal: number | null =
    assessedByPins &&
    !assessedByPins.error &&
    buildingParcelCountForAv > 1 &&
    assessedByPins.results.length > 0 &&
    assessedByPins.results.every((r) => r.assessedValue != null && Number.isFinite(r.assessedValue))
      ? assessedByPins.results.reduce(
          (sum, r) => sum + (r.assessedValue as number) / getAssessmentLevelForImplied(r.assessedClass),
          0
        )
      : null

  const singleImpliedValue =
    assessed != null && Number.isFinite(assessed.displayValue) && assessed.class != null
      ? assessed.displayValue / getAssessmentLevelForImplied(assessed.class)
      : null

  const assessedValueFormatted =
    impliedMarketValueTotal != null
      ? currencyZero.format(impliedMarketValueTotal)
      : singleImpliedValue != null
        ? currencyZero.format(singleImpliedValue)
        : null

  const displayWard =
    firstComplaint?.ward != null && firstComplaint.ward !== ''
      ? String(firstComplaint.ward)
      : property?.ward != null && String(property.ward).trim() !== ''
        ? String(property.ward).trim()
        : propertyChars?.ward != null && String(propertyChars.ward).trim() !== ''
          ? String(propertyChars.ward).trim()
          : null

  const propertyTypeUse = commercialChars.length > 0 ? commercialChars[0].property_type_use : null

  const displayCommunityAreaName =
    getCommunityAreaName(firstComplaint?.community_area ?? null) ??
    (property?.community_area != null && String(property.community_area).trim() !== ''
      ? String(property.community_area).trim()
      : null) ??
    (propertyChars?.community_area != null && String(propertyChars.community_area).trim() !== ''
      ? String(propertyChars.community_area).trim()
      : null)

  const displayZip =
    property?.zip != null && String(property.zip).trim() !== ''
      ? String(property.zip).trim()
      : slugToZip(decodedSlug)

  const displayClass = (parcel?.['class'] ?? assessed?.class) as string | null | undefined
  const classDescription = getClassDescription(displayClass)

  const addressBarMeta = [
    displayCommunityAreaName ?? property?.community_area ?? null,
    displayWard != null ? `Ward ${displayWard}` : property?.ward != null ? `Ward ${property.ward}` : null,
    displayZip ? `CHICAGO, IL ${displayZip}` : 'CHICAGO, IL',
  ]
    .filter(Boolean)
    .join(' · ')

  const addressBarHeadline =
    isExpanded && addressRange
      ? formatRangeForDisplay(addressRange)
      : displayAddress || slug

  // Card logic:
  // - If open complaints: show Complaints, Violations, Assessed Value
  // - If no open complaints: show Violations, Last Permit, Assessed Value
  const showComplaintsCard = complaintsOpenCount > 0
  const showLastPermitCard = !showComplaintsCard

  function nearestParcelSlug(addr: string | null, zip: string | null): string {
    if (!addr) return ''
    const titleCase = addr
      .split(' ')
      .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join('-')
    return `${titleCase}-Chicago-${zip ?? ''}`
  }

  const residentialPropertyTypeLine =
    charsResidential != null
      ? (() => {
          const tor = detailVal(charsResidential.type_of_residence ?? null)
          const svmf = detailVal(charsResidential.single_v_multi_family ?? null)
          if (!tor.isNa && !svmf.isNa) return `${tor.text}, ${svmf.text}`
          if (!tor.isNa) return tor.text
          if (!svmf.isNa) return svmf.text
          return null
        })()
      : null

  return (
    <div className="address-page">
      <RecordSearch address={addressBarHeadline} slug={decodedSlug} />
      <div className="prop-page-shell">
        <PropertySidebar />
        <div className="prop-main-content">
          <div className="address-header">
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="address-header-street">{addressBarHeadline}</div>
              <div className="address-header-meta">{addressBarMeta || 'Chicago'}</div>
            </div>
            <AddressBarButtons
              addressRange={addressRange}
              slug={slug}
              isExpanded={isExpanded}
              apiKey={process.env.NEXT_PUBLIC_GOOGLE_PLACES_KEY}
            />
          </div>

          {/* Wide left column: 420px */}
          <div className="prop-page">
            <div className="profile">

          {/* 4-card horizontal row — conditional logic kept dormant */}
          <div className="stat-row">

            <div className="stat stat-sub-bottom" id="complaints-stat-slot" />

            <div className="stat stat-sub-bottom">
              <div className="stat-label">Last Violation</div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginTop: 4, gap: 1 }}>
                <span className="stat-val stat-val-muted" style={{ textAlign: 'center' }}>{lastViolationDate}</span>
                {lastViolationCategory && (
                  <div className="stat-fraction" style={{ textAlign: 'center' }}>{lastViolationCategory}</div>
                )}
              </div>
            </div>

            <div className="stat stat-sub-bottom">
              <div className="stat-label">Last Permit</div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginTop: 4, gap: 1 }}>
                <span className="stat-val stat-val-muted" style={{ whiteSpace: 'nowrap', textAlign: 'center' }}>{lastPermitDisplay}</span>
                <div className="stat-fraction" style={{ textAlign: 'center' }}>{lastPermitCost ?? ''}</div>
              </div>
            </div>

            <div className="stat stat-sub-bottom">
              <div className="stat-label">Implied Value</div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginTop: 4, gap: 1 }}>
                <span className={`stat-val stat-val-muted ${assessedValueFormatted != null ? 'stat-val-amber' : ''}`} style={{ fontSize: '11px', whiteSpace: 'nowrap', textAlign: 'center' }}>
                  {assessedValueFormatted ?? 'N/A'}
                </span>
                <div className="stat-fraction" style={{ textAlign: 'center' }}>
                  {buildingParcelCountForAv > 0
                    ? `${buildingParcelCountForAv} ${buildingParcelCountForAv === 1 ? 'parcel' : 'parcels'}`
                    : '1 parcel'}
                </div>
              </div>
            </div>

          </div>

          <div className="profile-card">
            {!(isExpanded && expandedSiblings.length > 0) && (
              <div className="profile-card-header">Property Details</div>
            )}

            {!property && nearestParcel && (
              <div className="nearest-parcel-note">
                <div className="nearest-parcel-heading">No Assessor record at this address</div>
                <div className="nearest-parcel-sub">
                  The Cook County Assessor does not have a parcel at this exact address —
                  likely part of a building range. Nearest parcel on record:{' '}
                  <Link
                    href={`/address/${nearestParcelSlug(nearestParcel.address_normalized, nearestParcel.zip)}`}
                    className="nearest-parcel-link"
                  >
                    {nearestParcel.address_normalized ?? nearestParcel.address}
                    {nearestParcel.pin ? ` · PIN ${nearestParcel.pin}` : ''}
                    {' →'}
                  </Link>
                </div>
              </div>
            )}
            {!property && !nearestParcel && (
              <div className="nearest-parcel-note">
                <div className="nearest-parcel-heading">No Assessor record at this address</div>
                <div className="nearest-parcel-sub">
                  The Cook County Assessor does not have a parcel record for this address. This may be a unit within a larger building or a non-standard address. Try searching for the building&apos;s primary street address.
                </div>
              </div>
            )}

{isExpanded && expandedSiblings.length > 0 ? (
              <PropertyDetailsExpanded
                key={expandedSiblings.map((s) => s.pin).join(',')}
                siblings={expandedSiblings}
                serverSharedChars={{
                  year_built: charsResidential?.year_built ?? charsCondo?.year_built ?? (commercialChars.length > 0 ? commercialChars[0].year_built : null),
                  building_sqft: charsResidential?.building_sqft ?? charsCondo?.building_sqft ?? (commercialChars.length > 0 ? commercialChars[0].building_sqft : null),
                  land_sqft: charsResidential?.land_sqft ?? charsCondo?.land_sqft ?? (commercialChars.length > 0 ? commercialChars[0].land_sqft : null),
                  property_type: residentialPropertyTypeLine ?? (commercialChars.length > 0 ? commercialChars[0].property_type_use : null) ?? null,
                }}
              />
            ) : (
              <div className="detail-list">

                {/* Flat row order: Year Built, Building Sqft, Land Sqft, Property Type, Class, PIN */}
                {charsResidential != null ? (
                  <>
                    {detailVal(charsResidential.year_built ?? null).text !== 'N/A' && <div className="detail-row"><span className="detail-key">Year Built</span><span className="detail-val">{detailVal(charsResidential.year_built ?? null).text}</span></div>}
                    {detailVal(charsResidential.building_sqft ?? null).text !== 'N/A' && <div className="detail-row"><span className="detail-key">Building Sqft</span><span className="detail-val">{detailVal(charsResidential.building_sqft ?? null).text}</span></div>}
                    {detailVal(charsResidential.land_sqft ?? null).text !== 'N/A' && Number(charsResidential.land_sqft) > 0 && (
                      <div className="detail-row">
                        <span className="detail-key">Land Sqft</span>
                        <span className="detail-val">{detailVal(charsResidential.land_sqft ?? null).text}</span>
                      </div>
                    )}
                    {residentialPropertyTypeLine != null && (
                      <div className="detail-row">
                        <span className="detail-key">Property Type</span>
                        <span className="detail-val">{residentialPropertyTypeLine}</span>
                      </div>
                    )}
                  </>
                ) : charsCondo != null ? (
                  <>
                    {detailVal(charsCondo.year_built ?? null).text !== 'N/A' && <div className="detail-row"><span className="detail-key">Year Built</span><span className="detail-val">{detailVal(charsCondo.year_built ?? null).text}</span></div>}
                    {detailVal(charsCondo.building_sqft ?? null).text !== 'N/A' && <div className="detail-row"><span className="detail-key">Building Sqft</span><span className="detail-val">{detailVal(charsCondo.building_sqft ?? null).text}</span></div>}
                    {detailVal(charsCondo.unit_sqft ?? null).text !== 'N/A' && <div className="detail-row"><span className="detail-key">Unit Sqft</span><span className="detail-val">{detailVal(charsCondo.unit_sqft ?? null).text}</span></div>}
                    {detailVal(charsCondo.land_sqft ?? null).text !== 'N/A' && Number(charsCondo.land_sqft) > 0 && <div className="detail-row"><span className="detail-key">Land Sqft</span><span className="detail-val">{detailVal(charsCondo.land_sqft ?? null).text}</span></div>}
                  </>
                ) : commercialChars.length > 0 ? (
                  <>
                    {commercialChars[0].year_built != null && Number(commercialChars[0].year_built) > 0 && <div className="detail-row"><span className="detail-key">Year Built</span><span className="detail-val">{commercialChars[0].year_built}</span></div>}
                    {commercialChars[0].building_sqft != null && Number(commercialChars[0].building_sqft) > 0 && <div className="detail-row"><span className="detail-key">Building Sqft</span><span className="detail-val">{Number(commercialChars[0].building_sqft).toLocaleString()}</span></div>}
                    {commercialChars[0].land_sqft != null && Number(commercialChars[0].land_sqft) > 0 && <div className="detail-row"><span className="detail-key">Land Sqft</span><span className="detail-val">{Number(commercialChars[0].land_sqft).toLocaleString()}</span></div>}
                    {commercialChars[0].property_type_use && <div className="detail-row"><span className="detail-key">Property Type</span><span className="detail-val">{commercialChars[0].property_type_use}</span></div>}
                  </>
                ) : null}

                {/* Class and PIN always last */}
                <div className="detail-row">
                  <span className="detail-key">Class</span>
                  <span className={detailVal(displayClass ?? null).isNa ? 'detail-val na' : 'detail-val'}>{displayClass ?? 'N/A'}{classDescription ? ` — ${classDescription}` : ''}</span>
                </div>
                {charsResidential != null &&
                  charsResidential.num_apartments != null &&
                  Number(charsResidential.num_apartments) > 0 && (
                    <div className="detail-row">
                      <span className="detail-key">Apartments</span>
                      <span className="detail-val">{detailVal(charsResidential.num_apartments).text}</span>
                    </div>
                  )}
                <div className="detail-row">
                  <span className="detail-key">PIN</span>
                  <span className={detailVal(displayPin ?? null).isNa ? 'detail-val na' : 'detail-val'}>{detailVal(displayPin ?? null).text}</span>
                </div>

                {charsResidential != null && (
                  <details>
                    <summary style={{ fontFamily: 'var(--mono)', fontSize: '11px', fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase' as const, color: 'var(--text-dim)', padding: '8px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border)', cursor: 'pointer', listStyle: 'none', userSelect: 'none' as const }}>
                      {'Additional Characteristics'}
                      <span style={{ fontSize: '16px' }}>{'▾'}</span>
                    </summary>
                    {additionalResidentialDetailRows(charsResidential)}
                  </details>
                )}

                  <details>
                  <summary style={{ fontFamily: 'var(--mono)', fontSize: '8px', fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase' as const, color: '#2d6a4f', padding: '7px 14px 3px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '0.5px solid rgba(45,106,79,0.15)', cursor: 'pointer', listStyle: 'none', userSelect: 'none' as const }}>
                    {'Assessment'}
                    <span style={{ fontSize: '14px', color: '#2d6a4f' }}>{'▾'}</span>
                  </summary>
                  <div className="detail-row">
                    <span className="detail-key">AV Tax Year</span>
                    <span className={detailVal(assessed?.taxYear ?? null).isNa ? 'detail-val na' : 'detail-val'}>{detailVal(assessed?.taxYear ?? null).text}</span>
                  </div>
                  <div className="detail-row">
                    <span className="detail-key">AV Class</span>
                    <span className={detailVal(assessed?.class ?? null).isNa ? 'detail-val na' : 'detail-val'}>{detailVal(assessed?.class ?? null).text}</span>
                  </div>
                  <div className="detail-row">
                    <span className="detail-key">AV Value Source</span>
                    <span className={detailVal(assessed?.valueType ?? null).isNa ? 'detail-val na' : 'detail-val'}>{detailVal(assessed?.valueType ?? null).text}</span>
                  </div>
                  {assessed?.displayValue != null && (
                    <div className="detail-row">
                      <span className="detail-key">Assessed Value</span>
                      <span className="detail-val">{currencyZero.format(assessed.displayValue)}</span>
                    </div>
                  )}
                  {assessed?.class != null && (
                    <div className="detail-row">
                      <span className="detail-key">Assessment Level</span>
                      <span className="detail-val">{getAssessmentLevelForImplied(assessed.class) === 0.25 ? '25%' : '10%'}</span>
                    </div>
                  )}
                  {assessed?.displayValue != null && assessed?.class != null && (
                    <div className="detail-row">
                      <span className="detail-key">Implied Market Value</span>
                      <span className="detail-val">{currencyZero.format(assessed.displayValue / getAssessmentLevelForImplied(assessed.class))}</span>
                    </div>
                  )}
                </details>

                {exemptChars && (
                  <>
                    <span style={SECTION_LABEL}>Tax Exempt</span>
                    <div className="detail-row"><span className="detail-key">Owner</span><span className="detail-val">{exemptChars.owner_name}</span></div>
                    <div className="detail-row"><span className="detail-key">Township</span><span className="detail-val">{exemptChars.township_name}</span></div>
                  </>
                )}

              </div>
            )}
          </div>
        </div>

            <PropertyFeed
              complaints={complaints}
              complaintsOpenCount={complaintsOpenCount}
              violations={violations}
              violationsOpenCount={violationsOpenCount}
              violationsCompliedCount={violationsCompliedCount}
              permits={permits}
              propertyZip={displayZip}
              currentSlug={slug}
              serverTime={Date.now()}
            />
          </div>
        </div>
      </div>
    </div>
  )
}