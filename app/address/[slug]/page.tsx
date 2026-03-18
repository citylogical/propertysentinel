import Link from 'next/link'
import { slugToDisplayAddress, slugToNormalizedAddress, slugToZip } from '@/lib/address-slug'
import {
  fetchProperty,
  fetchParcelUniverse,
  fetchComplaints,
  fetchViolations,
  fetchPermits,
  fetchAssessedValue,
  fetchComplaintsByPin,
  fetchViolationsByPin,
  fetchPermitsByPin,
  fetchPropertyCharsResidential,
  fetchPropertyCharsCondo,
  normalizePin,
} from '@/lib/supabase-search'
import type { PropertyCharsResidentialRow, PropertyCharsCondoRow } from '@/lib/supabase-search'
import { getCommunityAreaName } from '@/lib/chicago-community-areas'
import PropertyNav from './PropertyNav'
import PropertyFeed from './PropertyFeed'

type PageProps = { params: Promise<{ slug: string }> }

export async function generateMetadata({ params }: PageProps) {
  const { slug } = await params
  const display = slugToDisplayAddress(decodeURIComponent(slug))
  return {
    title: display ? `Property Sentinel — ${display}` : 'Property Sentinel — Address',
    description: '311 complaints, violations, and property details for this Chicago address.',
  }
}

function na(val: string | number | null | undefined): string {
  if (val === null || val === undefined || val === '') return 'N/A'
  return String(val)
}

/** Locale-independent date format for "Month YYYY" (e.g. Mar 2024). Avoids hydration mismatch. */
function formatMonthYear(dateStr: string | null | undefined): string {
  if (!dateStr) return 'Unknown'
  const d = new Date(dateStr)
  if (Number.isNaN(d.getTime())) return 'Unknown'
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  return `${months[d.getUTCMonth()]} ${d.getUTCFullYear()}`
}

function detailVal(
  val: string | number | null | undefined
): { text: string; isNa: boolean } {
  if (val === null || val === undefined) return { text: 'N/A', isNa: true }
  const s = String(val).trim()
  if (s === '') return { text: 'N/A', isNa: true }
  return { text: s, isNa: false }
}

/** Convert boolean (and string/number) to value safe for detailVal; booleans become 'Yes'/'No'. */
function displayVal(val: string | number | boolean | null | undefined): string | number | null | undefined {
  if (val === null || val === undefined) return null
  if (typeof val === 'boolean') return val ? 'Yes' : 'No'
  return val
}

export default async function AddressPage({ params }: PageProps) {
  const { slug } = await params
  const decodedSlug = decodeURIComponent(slug)
  const normalizedAddress = slugToNormalizedAddress(decodedSlug)
  const displayAddress = slugToDisplayAddress(decodedSlug)

  // STEP 1 — Address resolution: properties table is canonical. Must fully resolve before any downstream queries.
  const propertyResult = await fetchProperty(normalizedAddress)
  const property = propertyResult.property
  const pin: string | null =
    property?.pin != null && String(property.pin).trim() !== ''
      ? String(property.pin).trim()
      : null

  console.log('Resolved PIN:', pin, typeof pin)

  // STEP 2 — Fan out from PIN only after PIN is confirmed non-null from properties. Do not run assessed_values, property_chars, complaints, violations, or permits until PIN is resolved.
  let complaints: Awaited<ReturnType<typeof fetchComplaints>>['complaints'] = []
  let violations: Awaited<ReturnType<typeof fetchViolations>>['violations'] = []
  let permits: Awaited<ReturnType<typeof fetchPermits>>['permits'] = []
  let charsResidential: PropertyCharsResidentialRow | null = null
  let charsCondo: PropertyCharsCondoRow | null = null
  let assessed: Awaited<ReturnType<typeof fetchAssessedValue>>['assessed'] = null
  let parcel: Awaited<ReturnType<typeof fetchParcelUniverse>>['parcel'] = null

  if (pin) {
    const normalizedPin = normalizePin(pin)
    if (!normalizedPin) {
      // Do not fire downstream queries with an empty PIN
    } else {
      const [assessedResult, complaintsResult, violationsResult, permitsResult, charsResResult, charsCondoResult] =
        await Promise.all([
          fetchAssessedValue(normalizedPin),
          fetchComplaintsByPin(normalizedPin),
          fetchViolationsByPin(normalizedPin),
          fetchPermitsByPin(normalizedPin),
          fetchPropertyCharsResidential(normalizedPin),
          fetchPropertyCharsCondo(normalizedPin),
        ])
      complaints = complaintsResult.complaints ?? []
      violations = violationsResult.violations ?? []
      permits = permitsResult.permits ?? []
      charsResidential = charsResResult.chars
      charsCondo = charsCondoResult.chars
      assessed = assessedResult.assessed
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
  const charsSource =
    charsResidential != null ? 'residential' : charsCondo != null ? 'condo' : 'none'
  const avHit = assessed != null ? 'hit' : 'miss'

  const assessedValueFormatted =
    assessed != null && Number.isFinite(assessed.displayValue)
      ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0, minimumFractionDigits: 0 }).format(assessed.displayValue)
      : null
  const assessedSubtext =
    assessed != null ? `${assessed.taxYear} · ${assessed.valueType}` : null

  const displayWard =
    firstComplaint?.ward != null && firstComplaint.ward !== ''
      ? String(firstComplaint.ward)
      : (property?.ward != null && String(property.ward).trim() !== '')
        ? String(property.ward).trim()
        : (propertyChars?.ward != null && String(propertyChars.ward).trim() !== '')
          ? String(propertyChars.ward).trim()
          : null

  const displayCommunityAreaName =
    getCommunityAreaName(firstComplaint?.community_area ?? null) ??
    (property?.community_area != null && String(property.community_area).trim() !== ''
      ? String(property.community_area).trim()
      : null) ??
    (propertyChars?.community_area != null && String(propertyChars.community_area).trim() !== ''
      ? String(propertyChars.community_area).trim()
      : null)

  const displayZip =
    (property?.zip != null && String(property.zip).trim() !== '')
      ? String(property.zip).trim()
      : slugToZip(decodedSlug)

    const displayClass = (parcel?.['class'] ?? assessed?.class) as string | null | undefined
    const displayUnits = (charsResidential?.num_apartments ?? null) as number | null | undefined
    const displayTaxYear = (charsResidential?.tax_year ?? charsCondo?.tax_year ?? null) as string | null | undefined
    const displayZoning = null

  const addressBarMeta = [
    displayCommunityAreaName ?? property?.community_area ?? null,
    displayWard != null ? `Ward ${displayWard}` : (property?.ward != null ? `Ward ${property.ward}` : null),
    displayZip ? `CHICAGO, IL ${displayZip}` : 'CHICAGO, IL',
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <div className="address-page">
      <PropertyNav apiKey={process.env.NEXT_PUBLIC_GOOGLE_PLACES_KEY} />

      <div className="address-bar">
        <div>
          <div className="address-bar-street">{displayAddress || slug}</div>
          <div className="address-bar-meta">
            {addressBarMeta || 'Chicago'}
          </div>
        </div>
        <button type="button" className="alert-btn">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
            <path d="M13.73 21a2 2 0 0 1-3.46 0" />
          </svg>
          Turn on Alerts
        </button>
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
            <div className="detail-list">
              {/* From properties */}
              <div className="detail-row">
                <span className="detail-key">PIN</span>
                <span className={detailVal(displayPin ?? null).isNa ? 'detail-val na' : 'detail-val'}>{detailVal(displayPin ?? null).text}</span>
              </div>
              <div className="detail-row">
                <span className="detail-key">Class (property)</span>
                <span className={detailVal(displayClass ?? null).isNa ? 'detail-val na' : 'detail-val'}>{detailVal(displayClass ?? null).text}</span>
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

              {/* From assessed_values */}
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

              {/* Property characteristics (residential or condo) — show every field attempted */}
              {charsSource !== 'none' && (charsResidential != null ? (
                <>
                  <div className="detail-row">
                    <span className="detail-key">Year Built</span>
                    <span className={detailVal(charsResidential.year_built ?? null).isNa ? 'detail-val na' : 'detail-val'}>{detailVal(charsResidential.year_built ?? null).text}</span>
                  </div>
                  <div className="detail-row">
                    <span className="detail-key">Building Sqft</span>
                    <span className={detailVal(charsResidential.building_sqft ?? null).isNa ? 'detail-val na' : 'detail-val'}>{detailVal(charsResidential.building_sqft ?? null).text}</span>
                  </div>
                  <div className="detail-row">
                    <span className="detail-key">Land Sqft</span>
                    <span className={detailVal(charsResidential.land_sqft ?? null).isNa ? 'detail-val na' : 'detail-val'}>{detailVal(charsResidential.land_sqft ?? null).text}</span>
                  </div>
                  <div className="detail-row">
                    <span className="detail-key">Bedrooms</span>
                    <span className={detailVal(charsResidential.num_bedrooms ?? null).isNa ? 'detail-val na' : 'detail-val'}>{detailVal(charsResidential.num_bedrooms ?? null).text}</span>
                  </div>
                  <div className="detail-row">
                    <span className="detail-key">Rooms</span>
                    <span className={detailVal(charsResidential.num_rooms ?? null).isNa ? 'detail-val na' : 'detail-val'}>{detailVal(charsResidential.num_rooms ?? null).text}</span>
                  </div>
                  <div className="detail-row">
                    <span className="detail-key">Full Baths</span>
                    <span className={detailVal(charsResidential.num_full_baths ?? null).isNa ? 'detail-val na' : 'detail-val'}>{detailVal(charsResidential.num_full_baths ?? null).text}</span>
                  </div>
                  <div className="detail-row">
                    <span className="detail-key">Half Baths</span>
                    <span className={detailVal(charsResidential.num_half_baths ?? null).isNa ? 'detail-val na' : 'detail-val'}>{detailVal(charsResidential.num_half_baths ?? null).text}</span>
                  </div>
                  <div className="detail-row">
                    <span className="detail-key">Fireplaces</span>
                    <span className={detailVal(charsResidential.num_fireplaces ?? null).isNa ? 'detail-val na' : 'detail-val'}>{detailVal(charsResidential.num_fireplaces ?? null).text}</span>
                  </div>
                  <div className="detail-row">
                    <span className="detail-key">Type of Residence</span>
                    <span className={detailVal(charsResidential.type_of_residence ?? null).isNa ? 'detail-val na' : 'detail-val'}>{detailVal(charsResidential.type_of_residence ?? null).text}</span>
                  </div>
                  <div className="detail-row">
                    <span className="detail-key">Apartments</span>
                    <span className={detailVal(charsResidential.num_apartments ?? null).isNa ? 'detail-val na' : 'detail-val'}>{detailVal(charsResidential.num_apartments ?? null).text}</span>
                  </div>
                  <div className="detail-row">
                    <span className="detail-key">Garage Size</span>
                    <span className={detailVal(charsResidential.garage_size ?? null).isNa ? 'detail-val na' : 'detail-val'}>{detailVal(charsResidential.garage_size ?? null).text}</span>
                  </div>
                  <div className="detail-row">
                    <span className="detail-key">Garage Attached</span>
                    <span className={detailVal(displayVal(charsResidential.garage_attached ?? null)).isNa ? 'detail-val na' : 'detail-val'}>{detailVal(displayVal(charsResidential.garage_attached ?? null)).text}</span>
                  </div>
                  <div className="detail-row">
                    <span className="detail-key">Basement Type</span>
                    <span className={detailVal(charsResidential.basement_type ?? null).isNa ? 'detail-val na' : 'detail-val'}>{detailVal(charsResidential.basement_type ?? null).text}</span>
                  </div>
                  <div className="detail-row">
                    <span className="detail-key">Ext Wall Material</span>
                    <span className={detailVal(charsResidential.ext_wall_material ?? null).isNa ? 'detail-val na' : 'detail-val'}>{detailVal(charsResidential.ext_wall_material ?? null).text}</span>
                  </div>
                  <div className="detail-row">
                    <span className="detail-key">Central Heating</span>
                    <span className={detailVal(charsResidential.central_heating ?? null).isNa ? 'detail-val na' : 'detail-val'}>{detailVal(charsResidential.central_heating ?? null).text}</span>
                  </div>
                  <div className="detail-row">
                    <span className="detail-key">Central Air</span>
                    <span className={detailVal(displayVal(charsResidential.central_air ?? null)).isNa ? 'detail-val na' : 'detail-val'}>{detailVal(displayVal(charsResidential.central_air ?? null)).text}</span>
                  </div>
                  <div className="detail-row">
                    <span className="detail-key">Attic Type</span>
                    <span className={detailVal(charsResidential.attic_type ?? null).isNa ? 'detail-val na' : 'detail-val'}>{detailVal(charsResidential.attic_type ?? null).text}</span>
                  </div>
                  <div className="detail-row">
                    <span className="detail-key">Roof Material</span>
                    <span className={detailVal(charsResidential.roof_material ?? null).isNa ? 'detail-val na' : 'detail-val'}>{detailVal(charsResidential.roof_material ?? null).text}</span>
                  </div>
                  <div className="detail-row">
                    <span className="detail-key">Construction Quality</span>
                    <span className={detailVal(charsResidential.construction_quality ?? null).isNa ? 'detail-val na' : 'detail-val'}>{detailVal(charsResidential.construction_quality ?? null).text}</span>
                  </div>
                  <div className="detail-row">
                    <span className="detail-key">Single vs Multi Family</span>
                    <span className={detailVal(charsResidential.single_v_multi_family ?? null).isNa ? 'detail-val na' : 'detail-val'}>{detailVal(charsResidential.single_v_multi_family ?? null).text}</span>
                  </div>
                </>
              ) : charsCondo != null ? (
                <>
                  <div className="detail-row">
                    <span className="detail-key">Year Built</span>
                    <span className={detailVal(charsCondo.year_built ?? null).isNa ? 'detail-val na' : 'detail-val'}>{detailVal(charsCondo.year_built ?? null).text}</span>
                  </div>
                  <div className="detail-row">
                    <span className="detail-key">Building Sqft</span>
                    <span className={detailVal(charsCondo.building_sqft ?? null).isNa ? 'detail-val na' : 'detail-val'}>{detailVal(charsCondo.building_sqft ?? null).text}</span>
                  </div>
                  <div className="detail-row">
                    <span className="detail-key">Unit Sqft</span>
                    <span className={detailVal(charsCondo.unit_sqft ?? null).isNa ? 'detail-val na' : 'detail-val'}>{detailVal(charsCondo.unit_sqft ?? null).text}</span>
                  </div>
                  <div className="detail-row">
                    <span className="detail-key">Bedrooms</span>
                    <span className={detailVal(charsCondo.num_bedrooms ?? null).isNa ? 'detail-val na' : 'detail-val'}>{detailVal(charsCondo.num_bedrooms ?? null).text}</span>
                  </div>
                  <div className="detail-row">
                    <span className="detail-key">Building Pins</span>
                    <span className={detailVal(charsCondo.building_pins ?? null).isNa ? 'detail-val na' : 'detail-val'}>{detailVal(charsCondo.building_pins ?? null).text}</span>
                  </div>
                  <div className="detail-row">
                    <span className="detail-key">Building Non-Units</span>
                    <span className={detailVal(charsCondo.building_non_units ?? null).isNa ? 'detail-val na' : 'detail-val'}>{detailVal(charsCondo.building_non_units ?? null).text}</span>
                  </div>
                  <div className="detail-row">
                    <span className="detail-key">Bldg Mixed Use</span>
                    <span className={detailVal(displayVal(charsCondo.bldg_is_mixed_use ?? null)).isNa ? 'detail-val na' : 'detail-val'}>{detailVal(displayVal(charsCondo.bldg_is_mixed_use ?? null)).text}</span>
                  </div>
                  <div className="detail-row">
                    <span className="detail-key">Land Sqft</span>
                    <span className={detailVal(charsCondo.land_sqft ?? null).isNa ? 'detail-val na' : 'detail-val'}>{detailVal(charsCondo.land_sqft ?? null).text}</span>
                  </div>
                </>
              ) : null)}

              {/* Show chars section as "Not available" when charsSource is none */}
              {charsSource === 'none' && (
                <>
                  <div className="detail-row">
                    <span className="detail-key">Property Chars (residential/condo)</span>
                    <span className="detail-val na">Not available</span>
                  </div>
                </>
              )}

              {process.env.NODE_ENV === 'development' && (
                <div className="detail-row" style={{ marginTop: '0.75rem', paddingTop: '0.5rem', borderTop: '1px solid var(--border)', fontSize: '0.75rem', color: 'var(--muted)' }}>
                  <span className="detail-key">Debug</span>
                  <span className="detail-val">PIN: {detailVal(displayPin ?? null).text} | AV: {avHit} | Chars: {charsSource}</span>
                </div>
              )}
            </div>
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
            <div className="rail-alert-sub">
              SMS + email within 15 minutes of any new complaint, violation, or permit.
            </div>
            <div className="rail-alert-benefits">
              <div className="rail-alert-benefit">
                <span className="benefit-check">✓</span> Full complaint &amp; violation detail
              </div>
              <div className="rail-alert-benefit">
                <span className="benefit-check">✓</span> Inspector comments &amp; ordinance text
              </div>
              <div className="rail-alert-benefit">
                <span className="benefit-check">✓</span> First two properties included
              </div>
            </div>
          </div>
          <div className="rail-link-card">
            <div className="rail-link-title">Understand what you&apos;re seeing</div>
            <div className="rail-links">
              <Link className="rail-link" href="/#how">
                What happens after a complaint is filed <span className="rail-link-arrow">→</span>
              </Link>
              <Link className="rail-link" href="/#how">
                What each SR code means <span className="rail-link-arrow">→</span>
              </Link>
              <Link className="rail-link" href="/#how">
                Complaint vs. violation — what&apos;s the difference <span className="rail-link-arrow">→</span>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
