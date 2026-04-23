import type { Metadata } from 'next'
import React, { Suspense, cache } from 'react'
import { auth } from '@clerk/nextjs/server'
import { slugToDisplayAddress, slugToNormalizedAddress, slugToZip } from '@/lib/address-slug'
import { formatAddressForDisplay } from '@/lib/formatAddress'
import { getCommunityAreaName } from '@/lib/chicago-community-areas'
import { formatNeighborhoodWithCommunityArea, lookupNeighborhood } from '@/lib/neighborhood-lookup'
import { additionalStreetSegmentsForPortfolio } from '@/lib/portfolio-address-expansion'
import { getPortfolioSaveBuildingSnapshot } from '@/lib/portfolio-save-building-snapshot'
import {
  fetchParcelUniverse,
  fetchProperty,
  fetchSiblingPins,
  findApprovedUserRange,
  buildAddressRange,
  collectPinsForUserRangeAddresses,
  normalizePin,
} from '@/lib/supabase-search'
import { getClassDescription } from '@/lib/class-codes'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import EnrichmentHealthCheck from '@/components/EnrichmentHealthCheck'
import { PortfolioSaveStatsProvider } from '@/components/PortfolioSaveStatsContext'
import AddressBarButtons from './AddressBarButtons'
import RecordSearch from './RecordSearch'
import PropertyDataSections from './PropertyDataSections'
import PropertySkeletonBody from './PropertySkeletonBody'

const cachedFetchProperty = cache(async (normalizedAddress: string) => fetchProperty(normalizedAddress))

type PageProps = {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ building?: string }>
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params
  const decodedSlug = decodeURIComponent(slug)
  const normalizedAddress = slugToNormalizedAddress(decodedSlug)
  const displayFromSlug = slugToDisplayAddress(decodedSlug) || decodedSlug.replace(/-/g, ' ')

  const { property } = await cachedFetchProperty(normalizedAddress)

  const displayAddress = formatAddressForDisplay(
    property?.address?.trim() ||
      property?.address_normalized?.trim() ||
      displayFromSlug ||
      decodedSlug
  )

  const details: string[] = []
  if (property) {
    const classDesc = getClassDescription(property.property_class)
    if (classDesc) details.push(classDesc)
  }

  const description =
    details.length > 0
      ? `${displayAddress} — ${details.join(' · ')}. View 311 complaints, violations, permits, and assessed values on Property Sentinel.`
      : `${displayAddress} — View 311 complaints, violations, permits, and assessed values on Property Sentinel.`

  const title = `${displayAddress} — Property Sentinel`
  const canonicalPath = `/address/${slug}`

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url: `https://propertysentinel.io${canonicalPath}`,
      siteName: 'Property Sentinel',
      type: 'website',
      locale: 'en_US',
    },
    twitter: {
      card: 'summary',
      title,
      description,
    },
    alternates: {
      canonical: canonicalPath,
    },
  }
}

function formatRangeForDisplay(range: string): string {
  return range
    .split(' & ')
    .map((part) => formatAddressForDisplay(part.trim()))
    .join(' & ')
}

export default async function AddressPage({ params, searchParams }: PageProps) {
  const { slug } = await params
  const { building } = await searchParams
  const isExpandedFromQuery = building === 'true'
  const buildingParamTrue = building === 'true'
  const decodedSlug = decodeURIComponent(slug)
  const normalizedAddress = slugToNormalizedAddress(decodedSlug)
  const displayAddressFromSlug = slugToDisplayAddress(decodedSlug)

  const propertyResult = await cachedFetchProperty(normalizedAddress)
  const property = propertyResult.property

  const displayAddressFormatted = formatAddressForDisplay(
    property?.address?.trim() ||
      property?.address_normalized?.trim() ||
      displayAddressFromSlug ||
      decodedSlug
  )
  const nearestParcel = propertyResult.nearestParcel
  const pin: string | null =
    property?.pin != null && String(property.pin).trim() !== ''
      ? String(property.pin).trim()
      : null

  let siblingAddresses: string[] = [normalizedAddress]
  let siblingPinsForPortfolio: string[] = []
  let addressRange: string | null = null

  if (!pin) {
    const userRange = await findApprovedUserRange(normalizedAddress)
    if (userRange) {
      siblingAddresses = userRange.allAddresses
      addressRange = buildAddressRange(userRange.allAddresses)
      siblingPinsForPortfolio = await collectPinsForUserRangeAddresses(userRange.allAddresses)
    }
  }

  const hasDirectPropertyMatch = !!property

  let normalizedDataPin: string | null = null
  if (pin) {
    const np = normalizePin(pin)
    if (np) normalizedDataPin = np
  } else if (siblingPinsForPortfolio.length > 0) {
    const np = normalizePin(String(siblingPinsForPortfolio[0]))
    if (np) normalizedDataPin = np
  }

  if (normalizedDataPin) {
    const normalizedPin = normalizedDataPin
    const siblings = hasDirectPropertyMatch
      ? await fetchSiblingPins(normalizedPin, normalizedAddress)
      : {
          siblingPins: siblingPinsForPortfolio,
          siblingAddresses,
          addressRange,
          resolvedVia: 'user_range' as const,
        }
    if (hasDirectPropertyMatch) {
      addressRange = siblings.addressRange
      siblingAddresses = siblings.siblingAddresses
      siblingPinsForPortfolio = siblings.siblingPins
    }
  }

  const displayZip =
    property?.zip != null && String(property.zip).trim() !== ''
      ? String(property.zip).trim()
      : slugToZip(decodedSlug)

  const pinForParcelMeta =
    property?.pin != null && String(property.pin).trim() !== ''
      ? String(property.pin).trim()
      : siblingPinsForPortfolio.length > 0
        ? String(siblingPinsForPortfolio[0]).trim()
        : nearestParcel?.pin != null && String(nearestParcel.pin).trim() !== ''
          ? String(nearestParcel.pin).trim()
          : null

  const { parcel: parcelMeta } = pinForParcelMeta ? await fetchParcelUniverse(pinForParcelMeta) : { parcel: null }

  const municipalityName = parcelMeta?.municipality_name?.trim() ?? null

  const caNameFromLookup = getCommunityAreaName(property?.community_area ?? nearestParcel?.community_area)
  const caFromParcel = parcelMeta?.community_area_name?.trim() ?? null
  /** Title-case community area for polygon label pairing; header uses uppercase via formatter. */
  const communityAreaLabel = caFromParcel ?? caNameFromLookup ?? null

  const wardRaw = parcelMeta?.ward ?? property?.ward ?? nearestParcel?.ward ?? null
  const wardPart =
    wardRaw != null && String(wardRaw).trim() !== ''
      ? (() => {
          const n = parseInt(String(wardRaw), 10)
          return !Number.isNaN(n) ? `Ward ${n}` : `Ward ${String(wardRaw).trim()}`
        })()
      : null

  /** Suburban Cook is determined by `parcel_universe.municipality_name`; missing parcel defaults to Chicago-style line. */
  const isChicago =
    municipalityName != null
      ? ['CHICAGO', 'CITY OF CHICAGO'].includes(municipalityName.toUpperCase())
      : true

  const cityStateDisplay = isChicago
    ? displayZip
      ? `CHICAGO, IL ${displayZip}`
      : 'CHICAGO, IL'
    : municipalityName
      ? displayZip
        ? `${municipalityName.toUpperCase()}, IL ${displayZip}`
        : `${municipalityName.toUpperCase()}, IL`
      : displayZip
        ? `IL ${displayZip}`
        : 'IL'

  const neighborhoodLookup =
    isChicago &&
    parcelMeta?.lat != null &&
    parcelMeta?.lng != null &&
    !Number.isNaN(Number(parcelMeta.lat)) &&
    !Number.isNaN(Number(parcelMeta.lng))
      ? await lookupNeighborhood(Number(parcelMeta.lat), Number(parcelMeta.lng))
      : null

  const neighborhoodDisplay = isChicago
    ? formatNeighborhoodWithCommunityArea(neighborhoodLookup, communityAreaLabel)
    : null

  const addressBarMeta = [neighborhoodDisplay, isChicago ? wardPart : null, cityStateDisplay]
    .filter(Boolean)
    .join(' · ')

  const saveContextHeadline =
    isExpandedFromQuery && addressRange
      ? formatRangeForDisplay(addressRange)
      : displayAddressFormatted

  const titularDisplay = formatAddressForDisplay(normalizedAddress)
  const rangeFormatted = addressRange ? formatRangeForDisplay(addressRange) : null
  const showRangeSubtitle =
    isExpandedFromQuery && rangeFormatted != null && rangeFormatted !== titularDisplay

  let portfolioDisplayName: string | null = null
  const { userId } = await auth()
  if (userId) {
    const supabase = getSupabaseAdmin()
    const { data } = await supabase
      .from('portfolio_properties')
      .select('display_name')
      .eq('user_id', userId)
      .eq('canonical_address', normalizedAddress)
      .maybeSingle()
    const dn = data?.display_name
    portfolioDisplayName = typeof dn === 'string' && dn.trim() !== '' ? dn.trim() : null
  }

  const identityHeadline = portfolioDisplayName ?? titularDisplay

  const saveBuildingSnapshot = await getPortfolioSaveBuildingSnapshot({
    normalizedPin: normalizedDataPin,
    siblingPins: siblingPinsForPortfolio,
    useMultiPinImplied:
      siblingPinsForPortfolio.length > 1 && (isExpandedFromQuery || addressRange != null),
    propertyClassFallback:
      property?.property_class != null
        ? String(property.property_class)
        : parcelMeta?.class != null
          ? String(parcelMeta.class)
          : null,
    communityArea: communityAreaLabel,
  })

  const stubPortfolioSaveData = {
    currentAddress: saveContextHeadline,
    canonicalAddress: normalizedAddress,
    isPartOfBuilding: !!(addressRange && (addressRange !== displayAddressFromSlug || !pin)),
    buildingAddressRange: addressRange
      ? formatRangeForDisplay(addressRange)
      : saveContextHeadline || null,
    additionalStreets: additionalStreetSegmentsForPortfolio(addressRange, normalizedAddress).map((seg) =>
      formatAddressForDisplay(seg)
    ),
    portfolioAddressRangeRaw: addressRange,
    allPins: siblingPinsForPortfolio.length > 0 ? siblingPinsForPortfolio : pin ? [pin] : [],
    assessorSqft: null,
    assessorUnits: null,
    yearBuilt: saveBuildingSnapshot.yearBuilt,
    impliedValue: saveBuildingSnapshot.impliedValue,
    communityArea: saveBuildingSnapshot.communityArea ?? neighborhoodDisplay,
    propertyClass: saveBuildingSnapshot.propertyClass,
  }

  return (
    <div className="address-page">
      <RecordSearch address={titularDisplay} slug={decodedSlug} />
      <div className="prop-page-shell">
        <PortfolioSaveStatsProvider>
        <div className="prop-main-content">
          <div className="property-identity-row">
            <div className="property-identity-left">
              <div className="property-identity-head-block">
                <h1 className="property-identity-address">{identityHeadline}</h1>
                {portfolioDisplayName ? (
                  <div className="property-address-canonical">{titularDisplay}</div>
                ) : null}
                {showRangeSubtitle ? (
                  <div className="property-address-range">{rangeFormatted}</div>
                ) : null}
              </div>
              <div className="property-identity-citystate">{addressBarMeta}</div>
            </div>
            <div
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 12,
                flexShrink: 0,
              }}
            >
              <AddressBarButtons
                addressRange={addressRange}
                slug={decodedSlug}
                isExpanded={isExpandedFromQuery}
                isFullBuildingView={isExpandedFromQuery}
                saveData={stubPortfolioSaveData}
              />
              <EnrichmentHealthCheck />
            </div>
          </div>

          <div className="prop-page">
            <Suspense fallback={<PropertySkeletonBody />}>
              <PropertyDataSections
                normalizedAddress={normalizedAddress}
                slug={slug}
                decodedSlug={decodedSlug}
                property={property}
                nearestParcel={nearestParcel}
                pin={pin}
                hasDirectPropertyMatch={hasDirectPropertyMatch}
                isExpandedFromQuery={isExpandedFromQuery}
                buildingParamTrue={buildingParamTrue}
                siblingPins={siblingPinsForPortfolio}
                siblingAddresses={siblingAddresses}
                addressRange={addressRange}
                displayZip={displayZip}
                displayAddressFromSlug={displayAddressFromSlug}
              />
            </Suspense>
          </div>
        </div>
        </PortfolioSaveStatsProvider>
      </div>
    </div>
  )
}
