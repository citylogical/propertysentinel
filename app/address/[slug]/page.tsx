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
import PropertyNav from './PropertyNav'
import PropertyFeed from './PropertyFeed'
import PropertyDetailsExpanded from './PropertyDetailsExpanded'
import type { SiblingPin } from './PropertyDetailsExpanded'
import BuildingBanner from '../../components/BuildingBanner'
import AddressAlertsButton from './AddressAlertsButton'
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

function displayVal(val: string | number | boolean | null | undefined): string | number | null | undefined {
  if (val === null || val === undefined) return null
  if (typeof val === 'boolean') return val ? 'Yes' : 'No'
  return val
}

/** Matches PropertyDetailsExpanded implied market level (10% vs 25%). */
function getAssessmentLevelForImplied(assessedClass: string | null): number {
  if (!assessedClass) return 0.1
  const major = parseInt(assessedClass.toString()[0], 10)
  if (Number.isNaN(major)) return 0.1
  if (major === 4 || major === 5) return 0.25
  return 0.1
}

export default async function AddressPage({ params, searchParams }: PageProps) {
  const { slug } = await params
  const { building } = await searchParams
  const isExpanded = building === 'true'
  const decodedSlug = decodeURIComponent(slug)
  const normalizedAddress = slugToNormalizedAddress(decodedSlug)
  const displayAddress = slugToDisplayAddress(decodedSlug)

  // STEP 1 — Address resolution
  const propertyResult = await fetchProperty(normalizedAddress)
  console.log('DEBUG normalizedAddress:', JSON.stringify(normalizedAddress))
  console.log('DEBUG propertyResult:', JSON.stringify(propertyResult))
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
  const commercialCharsByPin: Record<string, any[]> = {}
  let buildingParcelCountForAv = 0

  if (pin) {
    const normalizedPin = normalizePin(pin)
    if (normalizedPin) {
      const siblings = await fetchSiblingPins(normalizedPin, normalizedAddress)
      addressRange = siblings.addressRange
      siblingAddresses = siblings.siblingAddresses

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

      // Pre-fetch commercial chars for all commercial sibling PINs (expanded building view)
      if (isExpanded && expandedSiblings.length > 0) {
        const commercialSiblingPins = expandedSiblings
          .filter((s) => {
            const siblingClass = s.assessedClass
            const major = parseInt((siblingClass ?? '0').toString()[0], 10)
            return !Number.isNaN(major) && [5, 6, 7, 8].includes(major)
          })
          .map((s) => s.pin)

        await Promise.all(
          commercialSiblingPins.map(async (p) => {
            const { chars } = await fetchCommercialChars(p)
            if (chars.length > 0) commercialCharsByPin[p] = chars
          })
        )
      }

      const majorClass = parseInt(String(parcel?.class ?? assessed?.class ?? '0').substring(0, 1), 10)
      const isCommercial = [5, 6, 7, 8].includes(majorClass)
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
  const firstComplaint = complaints[0] ?? null

  const lastPermitDisplay =
    permits.length > 0 && permits[0].issue_date
      ? formatMonthYear(permits[0].issue_date)
      : 'Unknown'

  const displayPin = pin
  const propertyChars = (charsResidential ?? charsCondo) as Record<string, unknown> | null
  const charsSource = charsResidential != null ? 'residential' : charsCondo != null ? 'condo' : 'none'
  const currencyZero = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
    minimumFractionDigits: 0,
  })

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

  const avHit =
    impliedMarketValueTotal != null
      ? 'hit'
      : assessed != null
        ? 'hit'
        : 'miss'

  const assessedValueFormatted =
    impliedMarketValueTotal != null
      ? currencyZero.format(impliedMarketValueTotal)
      : assessed != null && Number.isFinite(assessed.displayValue)
        ? currencyZero.format(assessed.displayValue)
        : null

  const assessedSubtext =
    impliedMarketValueTotal != null && buildingParcelCountForAv > 1
      ? `Est. market value · ${buildingParcelCountForAv} ${buildingParcelCountForAv === 1 ? 'parcel' : 'parcels'}`
      : assessed != null
        ? `${assessed.taxYear} · ${assessed.valueType}`
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
    propertyTypeUse,
    displayCommunityAreaName ?? property?.community_area ?? null,
    displayWard != null ? `Ward ${displayWard}` : property?.ward != null ? `Ward ${property.ward}` : null,
    displayZip ? `CHICAGO, IL ${displayZip}` : 'CHICAGO, IL',
  ]
    .filter(Boolean)
    .join(' · ')

    function nearestParcelSlug(addr: string | null, zip: string | null): string {
      if (!addr) return ''
      const titleCase = addr
        .split(' ')
        .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
        .join('-')
      return `${titleCase}-Chicago-${zip ?? ''}`
    }
  
    return (
      <div className="address-page">
      <PropertyNav apiKey={process.env.NEXT_PUBLIC_GOOGLE_PLACES_KEY} />

      {addressRange && (
        <BuildingBanner
          addressRange={addressRange}
          currentSlug={slug}
          currentAddress={normalizedAddress}
          isExpanded={isExpanded}
        />
      )}

      <div className="address-bar">
        <div>
          <div className="address-bar-street">{displayAddress || slug}</div>
          <div className="address-bar-meta">{addressBarMeta || 'Chicago'}</div>
        </div>
        <AddressAlertsButton />
      </div>

      <div className="prop-page">
        <div className="profile">
          <div className="stat-row">
            <div className="stat stat-sub-bottom">
              <div className="stat-label">Complaints</div>
              <div className={`stat-val ${complaintsOpenCount > 0 ? 'red' : ''}`}>{complaintsOpenCount}</div>
              <div className="stat-fraction">open</div>
            </div>
            <div className="stat stat-sub-bottom">
              <div className="stat-label">Violations</div>
              <div className={`stat-val ${violationsOpenCount > 0 ? 'amber' : ''}`}>{violationsOpenCount}</div>
              <div className="stat-fraction">
                <span className="block">open</span>
                <span className="block">{violationsCompliedCount} complied</span>
              </div>
            </div>
            <div className="stat">
              <div className="stat-label">Last Permit</div>
              <span className="stat-val stat-val-muted">{lastPermitDisplay}</span>
            </div>
            <div className="stat">
              <div className="stat-label">Assessed Value</div>
              <div className="stat-val-wrap">
                <span className={`stat-val stat-val-muted ${assessedValueFormatted != null ? 'stat-val-amber' : ''}`}>
                  {assessedValueFormatted ?? 'Not available'}
                </span>
                {assessedSubtext != null && (
                  <span className="stat-val-sub">{assessedSubtext}</span>
                )}
              </div>
            </div>
          </div>

          <div className="profile-card">
          <div className="profile-card-header">Property Details</div>

{!property && nearestParcel && (
  <div className="nearest-parcel-note">
    <div className="nearest-parcel-heading">
      No Assessor record at this address
    </div>
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

{isExpanded && expandedSiblings.length > 0 ? (
              <PropertyDetailsExpanded
                key={expandedSiblings.map((s) => s.pin).join(',')}
                siblings={expandedSiblings}
                commercialCharsByPin={commercialCharsByPin}
              />
            ) : (
            <div className="detail-list">
              <div className="detail-row">
                <span className="detail-key">PIN</span>
                <span className={detailVal(displayPin ?? null).isNa ? 'detail-val na' : 'detail-val'}>{detailVal(displayPin ?? null).text}</span>
              </div>
              <div className="detail-row">
                <span className="detail-key">Class (property)</span>
                <span className={detailVal(displayClass ?? null).isNa ? 'detail-val na' : 'detail-val'}>{displayClass ?? 'N/A'}{classDescription ? ` — ${classDescription}` : ''}</span>
              </div>
              <div className="detail-row">
                <span className="detail-key">Zip</span>
                <span className={detailVal(property?.zip ?? null).isNa ? 'detail-val na' : 'detail-val'}>{detailVal(property?.zip ?? null).text}</span>
              </div>
              <div className="detail-row">
                <span className="detail-key">Address (normalized)</span>
                <span className={detailVal(property?.address_normalized ?? null).isNa ? 'detail-val na' : 'detail-val'}>{detailVal(property?.address_normalized ?? null).text}</span>
              </div>
              <div className="detail-row">
                <span className="detail-key">Community Area</span>
                <span className={detailVal(displayCommunityAreaName ?? null).isNa ? 'detail-val na' : 'detail-val'}>{detailVal(displayCommunityAreaName ?? null).text}</span>
              </div>
              <div className="detail-row">
                <span className="detail-key">Ward</span>
                <span className={detailVal(displayWard ?? null).isNa ? 'detail-val na' : 'detail-val'}>{detailVal(displayWard ?? null).text}</span>
              </div>
              <div className="detail-row">
                <span className="detail-key">AV Tax Year</span>
                <span className={detailVal(assessed?.taxYear ?? null).isNa ? 'detail-val na' : 'detail-val'}>{detailVal(assessed?.taxYear ?? null).text}</span>
              </div>
              <div className="detail-row">
                <span className="detail-key">AV Class</span>
                <span className={detailVal(assessed?.class ?? null).isNa ? 'detail-val na' : 'detail-val'}>{detailVal(assessed?.class ?? null).text}</span>
              </div>
              <div className="detail-row">
                <span className="detail-key">Township</span>
                <span className={detailVal(assessed?.township_name ?? null).isNa ? 'detail-val na' : 'detail-val'}>{detailVal(assessed?.township_name ?? null).text}</span>
              </div>
              <div className="detail-row">
                <span className="detail-key">Neighborhood Code</span>
                <span className={detailVal(assessed?.neighborhood_code ?? null).isNa ? 'detail-val na' : 'detail-val'}>{detailVal(assessed?.neighborhood_code ?? null).text}</span>
              </div>
              <div className="detail-row">
                <span className="detail-key">AV Value Source</span>
                <span className={detailVal(assessed?.valueType ?? null).isNa ? 'detail-val na' : 'detail-val'}>{detailVal(assessed?.valueType ?? null).text}</span>
              </div>

              {charsSource !== 'none' && (charsResidential != null ? (
                <>
                  <div className="detail-row"><span className="detail-key">Year Built</span><span className={detailVal(charsResidential.year_built ?? null).isNa ? 'detail-val na' : 'detail-val'}>{detailVal(charsResidential.year_built ?? null).text}</span></div>
                  <div className="detail-row"><span className="detail-key">Building Sqft</span><span className={detailVal(charsResidential.building_sqft ?? null).isNa ? 'detail-val na' : 'detail-val'}>{detailVal(charsResidential.building_sqft ?? null).text}</span></div>
                  <div className="detail-row"><span className="detail-key">Land Sqft</span><span className={detailVal(charsResidential.land_sqft ?? null).isNa ? 'detail-val na' : 'detail-val'}>{detailVal(charsResidential.land_sqft ?? null).text}</span></div>
                  <div className="detail-row"><span className="detail-key">Bedrooms</span><span className={detailVal(charsResidential.num_bedrooms ?? null).isNa ? 'detail-val na' : 'detail-val'}>{detailVal(charsResidential.num_bedrooms ?? null).text}</span></div>
                  <div className="detail-row"><span className="detail-key">Rooms</span><span className={detailVal(charsResidential.num_rooms ?? null).isNa ? 'detail-val na' : 'detail-val'}>{detailVal(charsResidential.num_rooms ?? null).text}</span></div>
                  <div className="detail-row"><span className="detail-key">Full Baths</span><span className={detailVal(charsResidential.num_full_baths ?? null).isNa ? 'detail-val na' : 'detail-val'}>{detailVal(charsResidential.num_full_baths ?? null).text}</span></div>
                  <div className="detail-row"><span className="detail-key">Half Baths</span><span className={detailVal(charsResidential.num_half_baths ?? null).isNa ? 'detail-val na' : 'detail-val'}>{detailVal(charsResidential.num_half_baths ?? null).text}</span></div>
                  <div className="detail-row"><span className="detail-key">Fireplaces</span><span className={detailVal(charsResidential.num_fireplaces ?? null).isNa ? 'detail-val na' : 'detail-val'}>{detailVal(charsResidential.num_fireplaces ?? null).text}</span></div>
                  <div className="detail-row"><span className="detail-key">Type of Residence</span><span className={detailVal(charsResidential.type_of_residence ?? null).isNa ? 'detail-val na' : 'detail-val'}>{detailVal(charsResidential.type_of_residence ?? null).text}</span></div>
                  <div className="detail-row"><span className="detail-key">Apartments</span><span className={detailVal(charsResidential.num_apartments ?? null).isNa ? 'detail-val na' : 'detail-val'}>{detailVal(charsResidential.num_apartments ?? null).text}</span></div>
                  <div className="detail-row"><span className="detail-key">Garage Size</span><span className={detailVal(charsResidential.garage_size ?? null).isNa ? 'detail-val na' : 'detail-val'}>{detailVal(charsResidential.garage_size ?? null).text}</span></div>
                  <div className="detail-row"><span className="detail-key">Garage Attached</span><span className={detailVal(displayVal(charsResidential.garage_attached ?? null)).isNa ? 'detail-val na' : 'detail-val'}>{detailVal(displayVal(charsResidential.garage_attached ?? null)).text}</span></div>
                  <div className="detail-row"><span className="detail-key">Basement Type</span><span className={detailVal(charsResidential.basement_type ?? null).isNa ? 'detail-val na' : 'detail-val'}>{detailVal(charsResidential.basement_type ?? null).text}</span></div>
                  <div className="detail-row"><span className="detail-key">Ext Wall Material</span><span className={detailVal(charsResidential.ext_wall_material ?? null).isNa ? 'detail-val na' : 'detail-val'}>{detailVal(charsResidential.ext_wall_material ?? null).text}</span></div>
                  <div className="detail-row"><span className="detail-key">Central Heating</span><span className={detailVal(charsResidential.central_heating ?? null).isNa ? 'detail-val na' : 'detail-val'}>{detailVal(charsResidential.central_heating ?? null).text}</span></div>
                  <div className="detail-row"><span className="detail-key">Central Air</span><span className={detailVal(displayVal(charsResidential.central_air ?? null)).isNa ? 'detail-val na' : 'detail-val'}>{detailVal(displayVal(charsResidential.central_air ?? null)).text}</span></div>
                  <div className="detail-row"><span className="detail-key">Attic Type</span><span className={detailVal(charsResidential.attic_type ?? null).isNa ? 'detail-val na' : 'detail-val'}>{detailVal(charsResidential.attic_type ?? null).text}</span></div>
                  <div className="detail-row"><span className="detail-key">Roof Material</span><span className={detailVal(charsResidential.roof_material ?? null).isNa ? 'detail-val na' : 'detail-val'}>{detailVal(charsResidential.roof_material ?? null).text}</span></div>
                  <div className="detail-row"><span className="detail-key">Construction Quality</span><span className={detailVal(charsResidential.construction_quality ?? null).isNa ? 'detail-val na' : 'detail-val'}>{detailVal(charsResidential.construction_quality ?? null).text}</span></div>
                  <div className="detail-row"><span className="detail-key">Single vs Multi Family</span><span className={detailVal(charsResidential.single_v_multi_family ?? null).isNa ? 'detail-val na' : 'detail-val'}>{detailVal(charsResidential.single_v_multi_family ?? null).text}</span></div>
                </>
              ) : charsCondo != null ? (
                <>
                  <div className="detail-row"><span className="detail-key">Year Built</span><span className={detailVal(charsCondo.year_built ?? null).isNa ? 'detail-val na' : 'detail-val'}>{detailVal(charsCondo.year_built ?? null).text}</span></div>
                  <div className="detail-row"><span className="detail-key">Building Sqft</span><span className={detailVal(charsCondo.building_sqft ?? null).isNa ? 'detail-val na' : 'detail-val'}>{detailVal(charsCondo.building_sqft ?? null).text}</span></div>
                  <div className="detail-row"><span className="detail-key">Unit Sqft</span><span className={detailVal(charsCondo.unit_sqft ?? null).isNa ? 'detail-val na' : 'detail-val'}>{detailVal(charsCondo.unit_sqft ?? null).text}</span></div>
                  <div className="detail-row"><span className="detail-key">Bedrooms</span><span className={detailVal(charsCondo.num_bedrooms ?? null).isNa ? 'detail-val na' : 'detail-val'}>{detailVal(charsCondo.num_bedrooms ?? null).text}</span></div>
                  <div className="detail-row"><span className="detail-key">Building Pins</span><span className={detailVal(charsCondo.building_pins ?? null).isNa ? 'detail-val na' : 'detail-val'}>{detailVal(charsCondo.building_pins ?? null).text}</span></div>
                  <div className="detail-row"><span className="detail-key">Building Non-Units</span><span className={detailVal(charsCondo.building_non_units ?? null).isNa ? 'detail-val na' : 'detail-val'}>{detailVal(charsCondo.building_non_units ?? null).text}</span></div>
                  <div className="detail-row"><span className="detail-key">Bldg Mixed Use</span><span className={detailVal(displayVal(charsCondo.bldg_is_mixed_use ?? null)).isNa ? 'detail-val na' : 'detail-val'}>{detailVal(displayVal(charsCondo.bldg_is_mixed_use ?? null)).text}</span></div>
                  <div className="detail-row"><span className="detail-key">Land Sqft</span><span className={detailVal(charsCondo.land_sqft ?? null).isNa ? 'detail-val na' : 'detail-val'}>{detailVal(charsCondo.land_sqft ?? null).text}</span></div>
                </>
              ) : null)}

              {commercialChars.length > 0 && (
                <>
                  <div className="detail-row section-header">
                    <span className="detail-key" style={{ fontWeight: 700, textTransform: 'uppercase', fontSize: '0.7rem', letterSpacing: '0.05em', opacity: 0.5 }}>Commercial Valuation</span>
                  </div>
                  {commercialChars.map((row, i) => (
                    <React.Fragment key={`comm-${i}`}>
                      <div className="detail-row"><span className="detail-key">Tax Year</span><span className="detail-val">{row.tax_year}</span></div>
                      {row.property_type_use && <div className="detail-row"><span className="detail-key">Property Type</span><span className="detail-val">{row.property_type_use}</span></div>}
                      {row.sheet && <div className="detail-row"><span className="detail-key">Sheet</span><span className="detail-val">{row.sheet}</span></div>}
                      {row.building_sqft && <div className="detail-row"><span className="detail-key">Building Sqft</span><span className="detail-val">{Number(row.building_sqft).toLocaleString()}</span></div>}
                      {row.noi && <div className="detail-row"><span className="detail-key">NOI</span><span className="detail-val">${Number(row.noi).toLocaleString()}</span></div>}
                      {row.caprate && <div className="detail-row"><span className="detail-key">Cap Rate</span><span className="detail-val">{(Number(row.caprate) * 100).toFixed(2)}%</span></div>}
                      {row.final_market_value && <div className="detail-row"><span className="detail-key">Final Market Value</span><span className="detail-val">${Number(row.final_market_value).toLocaleString()}</span></div>}
                      {i < commercialChars.length - 1 && <div className="detail-row" style={{ borderTop: '1px solid rgba(0,0,0,0.06)', margin: '4px 0' }} />}
                    </React.Fragment>
                  ))}
                </>
              )}

              {exemptChars && (
                <>
                  <div className="detail-row">
                    <span className="detail-key" style={{ fontWeight: 700, textTransform: 'uppercase', fontSize: '0.7rem', letterSpacing: '0.05em', opacity: 0.5 }}>Tax Exempt</span>
                  </div>
                  <div className="detail-row"><span className="detail-key">Owner</span><span className="detail-val">{exemptChars.owner_name}</span></div>
                  <div className="detail-row"><span className="detail-key">Township</span><span className="detail-val">{exemptChars.township_name}</span></div>
                </>
              )}

              {charsSource === 'none' && (
                <div className="detail-row">
                  <span className="detail-key">Property Chars (residential/condo)</span>
                  <span className="detail-val na">Not available</span>
                </div>
              )}

              {process.env.NODE_ENV === 'development' && (
                <div className="detail-row" style={{ marginTop: '0.75rem', paddingTop: '0.5rem', borderTop: '1px solid var(--border)', fontSize: '0.75rem', color: 'var(--muted)' }}>
                  <span className="detail-key">Debug</span>
                  <span className="detail-val">PIN: {detailVal(displayPin ?? null).text} | AV: {avHit} | Chars: {charsSource} | Range: {addressRange ?? 'none'}</span>
                </div>
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

        <div className="rail">
          <div className="rail-alert-card">
            <div className="rail-alert-title">Get alerted instantly</div>
            <div className="rail-alert-sub">SMS + email within 15 minutes of any new complaint, violation, or permit.</div>
            <div className="rail-alert-benefits">
              <div className="rail-alert-benefit"><span className="benefit-check">✓</span> Full complaint &amp; violation detail</div>
              <div className="rail-alert-benefit"><span className="benefit-check">✓</span> Inspector comments &amp; ordinance text</div>
              <div className="rail-alert-benefit"><span className="benefit-check">✓</span> First two properties included</div>
            </div>
          </div>
          <div className="rail-link-card">
            <div className="rail-link-title">Understand what you&apos;re seeing</div>
            <div className="rail-links">
              <Link className="rail-link" href="/#how">What happens after a complaint is filed <span className="rail-link-arrow">→</span></Link>
              <Link className="rail-link" href="/#how">What each SR code means <span className="rail-link-arrow">→</span></Link>
              <Link className="rail-link" href="/#how">Complaint vs. violation — what&apos;s the difference <span className="rail-link-arrow">→</span></Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}