import type { Metadata } from 'next'
import React, { Suspense, cache } from 'react'
import { slugToDisplayAddress, slugToNormalizedAddress, slugToZip } from '@/lib/address-slug'
import { formatAddressForDisplay } from '@/lib/formatAddress'
import {
  fetchProperty,
  fetchSiblingPins,
  findApprovedUserRange,
  buildAddressRange,
  collectPinsForUserRangeAddresses,
  normalizePin,
} from '@/lib/supabase-search'
import { getClassDescription } from '@/lib/class-codes'
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
  const url = `https://www.propertysentinel.io/address/${encodeURIComponent(slug)}`

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url,
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
      canonical: url,
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
  if (hasDirectPropertyMatch && pin) {
    const np = normalizePin(pin)
    if (np) normalizedDataPin = np
  } else if (!hasDirectPropertyMatch && isExpandedFromQuery && siblingPinsForPortfolio.length > 0) {
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

  const cityStateDisplay = displayZip ? `CHICAGO, IL ${displayZip}` : 'CHICAGO, IL'

  const addressBarHeadline =
    isExpandedFromQuery && addressRange
      ? formatRangeForDisplay(addressRange)
      : displayAddressFormatted

  const stubPortfolioSaveData = {
    currentAddress: addressBarHeadline,
    canonicalAddress: normalizedAddress,
    isPartOfBuilding: !!(addressRange && (addressRange !== displayAddressFromSlug || !pin)),
    buildingAddressRange: addressRange
      ? formatRangeForDisplay(addressRange)
      : addressBarHeadline || null,
    additionalStreets:
      addressBarHeadline.includes(' & ') ? addressBarHeadline.split(' & ').slice(1).map((s) => s.trim()).filter(Boolean) : [],
    allPins: siblingPinsForPortfolio.length > 0 ? siblingPinsForPortfolio : pin ? [pin] : [],
    assessorSqft: null,
    assessorUnits: null,
  }

  return (
    <div className="address-page">
      <RecordSearch address={addressBarHeadline} slug={decodedSlug} />
      <div className="prop-page-shell">
        <div className="prop-main-content">
          <div className="property-identity-row">
            <div className="property-identity-left">
              <h1 className="property-identity-address">{addressBarHeadline}</h1>
              <div className="property-identity-citystate">{cityStateDisplay}</div>
            </div>
            <AddressBarButtons
              addressRange={addressRange}
              slug={decodedSlug}
              isExpanded={isExpandedFromQuery}
              isFullBuildingView={isExpandedFromQuery}
              saveData={stubPortfolioSaveData}
            />
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
      </div>
    </div>
  )
}
