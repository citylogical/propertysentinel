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
import AddressBarButtons from './AddressBarButtons'
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
  const isExpanded = building === 'true'
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

  return (
    <div className="address-page">
      <PropertyNav apiKey={process.env.NEXT_PUBLIC_GOOGLE_PLACES_KEY} />

      <div className="address-bar">
        <div>
          <div
            className="address-bar-street"
            style={{ fontFamily: '"Merriweather", Georgia, serif', fontSize: '22px', fontWeight: 700, lineHeight: 1.1 }}
          >
            {addressBarHeadline}
          </div>
          <div className="address-bar-meta">{addressBarMeta || 'Chicago'}</div>
        </div>
        <AddressBarButtons addressRange={addressRange} slug={slug} isExpanded={isExpanded} />
      </div>

      {/* Wide left column: 420px */}
      <div className="prop-page">
        <div className="profile">

          {/* 4-card horizontal row — conditional logic kept dormant */}
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
                <span className={`stat-val stat-val-muted ${assessedValueFormatted != null ? 'stat-val-amber' : ''}`} style={{ fontSize: '11px' }}>
                  {assessedValueFormatted ?? 'N/A'}
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

            {isExpanded && expandedSiblings.length > 0 ? (
              <PropertyDetailsExpanded
                key={expandedSiblings.map((s) => s.pin).join(',')}
                siblings={expandedSiblings}
                commercialCharsByPin={commercialCharsByPin}
              />
            ) : (
              <div className="detail-list">

                {/* Flat row order: Year Built, Building Sqft, Land Sqft, Property Type, Class, PIN */}
                {charsResidential != null ? (
                  <>
                    {detailVal(charsResidential.year_built ?? null).text !== 'N/A' && <div className="detail-row"><span className="detail-key">Year Built</span><span className="detail-val">{detailVal(charsResidential.year_built ?? null).text}</span></div>}
                    {detailVal(charsResidential.building_sqft ?? null).text !== 'N/A' && <div className="detail-row"><span className="detail-key">Building Sqft</span><span className="detail-val">{detailVal(charsResidential.building_sqft ?? null).text}</span></div>}
                    {detailVal(charsResidential.land_sqft ?? null).text !== 'N/A' && <div className="detail-row"><span className="detail-key">Land Sqft</span><span className="detail-val">{detailVal(charsResidential.land_sqft ?? null).text}</span></div>}
                    {detailVal(charsResidential.type_of_residence ?? null).text !== 'N/A' && <div className="detail-row"><span className="detail-key">Property Type</span><span className="detail-val">{detailVal(charsResidential.type_of_residence ?? null).text}</span></div>}
                  </>
                ) : charsCondo != null ? (
                  <>
                    {detailVal(charsCondo.year_built ?? null).text !== 'N/A' && <div className="detail-row"><span className="detail-key">Year Built</span><span className="detail-val">{detailVal(charsCondo.year_built ?? null).text}</span></div>}
                    {detailVal(charsCondo.building_sqft ?? null).text !== 'N/A' && <div className="detail-row"><span className="detail-key">Building Sqft</span><span className="detail-val">{detailVal(charsCondo.building_sqft ?? null).text}</span></div>}
                    {detailVal(charsCondo.unit_sqft ?? null).text !== 'N/A' && <div className="detail-row"><span className="detail-key">Unit Sqft</span><span className="detail-val">{detailVal(charsCondo.unit_sqft ?? null).text}</span></div>}
                    {detailVal(charsCondo.land_sqft ?? null).text !== 'N/A' && <div className="detail-row"><span className="detail-key">Land Sqft</span><span className="detail-val">{detailVal(charsCondo.land_sqft ?? null).text}</span></div>}
                  </>
                ) : commercialChars.length > 0 ? (
                  <>
                    {commercialChars[0].year_built && <div className="detail-row"><span className="detail-key">Year Built</span><span className="detail-val">{commercialChars[0].year_built}</span></div>}
                    {commercialChars[0].building_sqft && <div className="detail-row"><span className="detail-key">Building Sqft</span><span className="detail-val">{Number(commercialChars[0].building_sqft).toLocaleString()}</span></div>}
                    {commercialChars[0].land_sqft && <div className="detail-row"><span className="detail-key">Land Sqft</span><span className="detail-val">{Number(commercialChars[0].land_sqft).toLocaleString()}</span></div>}
                    {commercialChars[0].property_type_use && <div className="detail-row"><span className="detail-key">Property Type</span><span className="detail-val">{commercialChars[0].property_type_use}</span></div>}
                  </>
                ) : null}

                {/* Class and PIN always last */}
                <div className="detail-row">
                  <span className="detail-key">Class</span>
                  <span className={detailVal(displayClass ?? null).isNa ? 'detail-val na' : 'detail-val'}>{displayClass ?? 'N/A'}{classDescription ? ` — ${classDescription}` : ''}</span>
                </div>
                <div className="detail-row">
                  <span className="detail-key">PIN</span>
                  <span className={detailVal(displayPin ?? null).isNa ? 'detail-val na' : 'detail-val'}>{detailVal(displayPin ?? null).text}</span>
                </div>

                <details>
                  <summary style={{ fontFamily: 'var(--mono)', fontSize: '8px', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-dim)', padding: '8px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', opacity: 0.7, borderBottom: '1px solid var(--border)', cursor: 'pointer', listStyle: 'none', userSelect: 'none' }}>
                    <span>Assessment</span>
                    <span style={{ fontSize: '10px', opacity: 0.6 }}>▾</span>
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