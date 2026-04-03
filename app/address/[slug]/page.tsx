import type { Metadata } from 'next'
import Link from 'next/link'
import { cache } from 'react'
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
  findApprovedUserRange,
  buildAddressRange,
  collectPinsForUserRangeAddresses,
  fetchComplaintsByAddresses,
  fetchViolationsByAddresses,
  fetchPermitsByAddresses,
  fetchPinAddressMap,
  JUNK_MAILING_NAMES,
} from '@/lib/supabase-search'
import type { PropertyCharsResidentialRow, PropertyCharsCondoRow } from '@/lib/supabase-search'
import { getCommunityAreaName } from '@/lib/chicago-community-areas'
import { getClassDescription } from '@/lib/class-codes'
import PropertyFeed from './PropertyFeed'
import PropertyDetailsExpanded from './PropertyDetailsExpanded'
import {
  CommercialCharacteristicRows,
  CondoCharacteristicRemainderRows,
  CondoCharacteristicTopRows,
  ResidentialCharacteristicRemainderRows,
  ResidentialCharacteristicTopRows,
} from './PropertyDetailsCharBlocks'
import type { SiblingPin } from './PropertyDetailsExpanded'
import AddressBarButtons from './AddressBarButtons'
import OwnerPortfolioCard from './OwnerPortfolioCard'
import RecordSearch from './RecordSearch'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import React from 'react'

const cachedFetchProperty = cache(async (normalizedAddress: string) => fetchProperty(normalizedAddress))

type PageProps = {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ building?: string }>
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params
  const decodedSlug = decodeURIComponent(slug)
  const normalizedAddress = slugToNormalizedAddress(decodedSlug)
  const displayAddress =
    slugToDisplayAddress(decodedSlug) || decodedSlug.replace(/-/g, ' ')

  const { property } = await cachedFetchProperty(normalizedAddress)

  const details: string[] = []
  if (property) {
    const classDesc = getClassDescription(property.property_class)
    if (classDesc) details.push(classDesc)
  }

  const supabase = getSupabaseAdmin()
  const [openViolations, openComplaints, permitCountResult] = await Promise.all([
    supabase
      .from('violations')
      .select('violation_id', { count: 'exact', head: true })
      .eq('address_normalized', normalizedAddress)
      .or('violation_status.eq.OPEN,violation_status.eq.FAILED,inspection_status.eq.OPEN,inspection_status.eq.FAILED'),
    supabase
      .from('complaints_311')
      .select('sr_number', { count: 'exact', head: true })
      .eq('address_normalized', normalizedAddress)
      .in('status', ['OPEN', 'Open', 'open']),
    supabase
      .from('permits')
      .select('permit_number', { count: 'exact', head: true })
      .ilike('address_normalized', `${normalizedAddress}%`),
  ])

  const vCount = openViolations.error ? null : openViolations.count
  const cCount = openComplaints.error ? null : openComplaints.count
  const pCount = permitCountResult.error ? null : permitCountResult.count

  if (vCount != null && vCount > 0) {
    details.push(`${vCount} open violation${vCount > 1 ? 's' : ''}`)
  }
  if (cCount != null && cCount > 0) {
    details.push(`${cCount} open 311 complaint${cCount > 1 ? 's' : ''}`)
  }
  if (pCount != null && pCount > 0) {
    details.push(`${pCount} permit${pCount > 1 ? 's' : ''} on record`)
  }

  const description =
    details.length > 0
      ? `${displayAddress} — ${details.join(' · ')}. View full property intelligence on Property Sentinel.`
      : `${displayAddress} — View 311 complaints, violations, permits, and assessed values on Property Sentinel.`

  const title = `${displayAddress} | Property Sentinel`
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

/** Integers/decimals shown in Property Details (sqft, counts, etc.) — not for years, tax years, PINs, or codes. */
function detailNumericLocale(val: string | number | null | undefined): { text: string; isNa: boolean } {
  if (val === null || val === undefined) return { text: 'N/A', isNa: true }
  const n = typeof val === 'number' ? val : Number(String(val).trim().replace(/,/g, ''))
  if (!Number.isFinite(n)) return detailVal(val)
  return { text: n.toLocaleString('en-US'), isNa: false }
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
  { key: 'design_plan', label: 'Design Plan', kind: 'string' },
  { key: 'site_desirability', label: 'Site Desirability', kind: 'string' },
  { key: 'basement_finish', label: 'Basement Finish', kind: 'string' },
  { key: 'attic_type', label: 'Attic Type', kind: 'string' },
  { key: 'attic_finish', label: 'Attic Finish', kind: 'string' },
  { key: 'garage_attached', label: 'Garage Attached', kind: 'boolish' },
  { key: 'garage_area_included', label: 'Garage Area Included', kind: 'numeric' },
  { key: 'garage_ext_wall_material', label: 'Garage Ext Wall', kind: 'string' },
  { key: 'renovation', label: 'Renovation', kind: 'boolish' },
  { key: 'porch', label: 'Porch', kind: 'string' },
]

function additionalResidentialDetailRows(chars: PropertyCharsResidentialRow): React.ReactNode {
  return ADDITIONAL_RESIDENTIAL_FIELDS.map((f) => {
    const raw = chars[f.key as keyof PropertyCharsResidentialRow]
    if (f.kind === 'numeric') {
      if (!showResidentialNumericAdditional(raw)) return null
      const d = detailNumericLocale(raw as string | number)
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
  let isLocalCondoExpand = false
  const decodedSlug = decodeURIComponent(slug)
  const normalizedAddress = slugToNormalizedAddress(decodedSlug)
  const displayAddress = slugToDisplayAddress(decodedSlug)

  const propertyResult = await cachedFetchProperty(normalizedAddress)
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
  let exemptOwnerName: string | null = null
  let addressRange: string | null = null
  let siblingAddresses: string[] = [normalizedAddress]
  let siblingPinsForPortfolio: string[] = []
  let expandedSiblings: SiblingPin[] = []
  let buildingParcelCountForAv = 0
  let ownerOtherProperties: { address: string; address_normalized: string; pin: string; neighborhood: string | null }[] = []
  let ownerMailingName: string | null = null
  let isJunkMailingName = false
  let localCondoPins: string[] | null = null

  if (!pin) {
    const userRange = await findApprovedUserRange(normalizedAddress)
    if (userRange) {
      siblingAddresses = userRange.allAddresses
      addressRange = buildAddressRange(userRange.allAddresses)
      siblingPinsForPortfolio = await collectPinsForUserRangeAddresses(userRange.allAddresses)
    }
  }

  /** Tier 1/2/2.5 only — never Tier 3 nearestParcel placeholder. */
  const hasDirectPropertyMatch = !!property

  let normalizedDataPin: string | null = null
  if (hasDirectPropertyMatch && pin) {
    const np = normalizePin(pin)
    if (np) normalizedDataPin = np
  } else if (!hasDirectPropertyMatch && isExpanded && siblingPinsForPortfolio.length > 0) {
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

      // Auto-expand for unit-suffix condos (all PINs share same base address)
      if (!isExpanded && siblings.siblingPins.length > 1 && siblings.addressRange === normalizedAddress) {
        isExpanded = true
      }

      // Also auto-expand when multiple PINs share the exact searched address
      // (e.g. 6 condo units at "1120 N LA SALLE ST" inside a larger 16-PIN building)
      if (!isExpanded && siblings.siblingPins.length > 1 && siblings.addressRange !== normalizedAddress) {
        const supabaseAdmin = getSupabaseAdmin()
        // Try the searched address first
        let { data: sameAddrPins } = await supabaseAdmin
          .from('properties')
          .select('pin')
          .eq('address_normalized', normalizedAddress)

        // If no results, try the canonical address from the manual building table
        // (handles DR vs ST, LASALLE vs LA SALLE mismatches)
        if ((!sameAddrPins || sameAddrPins.length <= 1) && property?.address) {
          const canonicalAddr = property.address.toUpperCase().trim()
          if (canonicalAddr !== normalizedAddress) {
            const { data: canonicalPins } = await supabaseAdmin
              .from('properties')
              .select('pin')
              .eq('address_normalized', canonicalAddr)
            if (canonicalPins && canonicalPins.length > 1) {
              sameAddrPins = canonicalPins
            }
          }
        }

        // Also try prefix match for unit-suffixed addresses
        if (!sameAddrPins || sameAddrPins.length <= 1) {
          const { data: prefixPins } = await supabaseAdmin
            .from('properties')
            .select('pin')
            .like('address_normalized', `${property?.address ?? normalizedAddress} %`)
          if (prefixPins && prefixPins.length > 1) {
            sameAddrPins = prefixPins
          }
        }

        if (sameAddrPins && sameAddrPins.length > 1) {
          localCondoPins = sameAddrPins.map((r: { pin?: string | null }) => r.pin).filter(Boolean) as string[]
          isExpanded = true
          isLocalCondoExpand = true
        }
      }

      const pinsForAssessment = localCondoPins ?? siblings.siblingPins
      const useBuildingAssessedSum = isExpanded && pinsForAssessment.length > 1

      type AssessedUnion =
        | { mode: 'byPins'; result: Awaited<ReturnType<typeof fetchAssessedValuesByPins>> }
        | { mode: 'single'; result: Awaited<ReturnType<typeof fetchAssessedValue>> }

      const assessedPromise: Promise<AssessedUnion> = useBuildingAssessedSum
        ? fetchAssessedValuesByPins(pinsForAssessment).then((result) => ({ mode: 'byPins' as const, result }))
        : fetchAssessedValue(normalizedPin).then((result) => ({ mode: 'single' as const, result }))

      const [assessedUnion, complaintsResult, violationsResult, permitsResult, charsResResult, charsCondoResult, parcelResult] =
        await Promise.all([
          assessedPromise,
          isExpanded && siblings.siblingAddresses.length > 1 && !isLocalCondoExpand
            ? fetchComplaintsByAddresses(siblings.siblingAddresses)
            : fetchComplaints(normalizedAddress),
          isExpanded && siblings.siblingAddresses.length > 1 && !isLocalCondoExpand
            ? fetchViolationsByAddresses(siblings.siblingAddresses)
            : fetchViolations(normalizedAddress),
          isExpanded && siblings.siblingAddresses.length > 1 && !isLocalCondoExpand
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
        buildingParcelCountForAv = isLocalCondoExpand ? pinsForAssessment.length : siblingPinsForPortfolio.length
      } else {
        assessed = assessedUnion.result.assessed
        assessedByPins = null
        buildingParcelCountForAv = 0
      }

      const pinsForExpansion = localCondoPins ?? (isExpanded ? siblings.siblingPins : [])
      if (isExpanded && pinsForExpansion.length > 0) {
        const pinMap = await fetchPinAddressMap(pinsForExpansion)
        if (assessedByPins && !assessedByPins.error) {
          expandedSiblings = pinsForExpansion.map((p, i) => {
            const r = assessedByPins!.results[i]
            const key = normalizePinSilent(p)
            return {
              pin: p,
              address: pinMap[key] ?? siblings.siblingAddresses[i] ?? normalizedAddress,
              assessedClass: r?.assessedClass ?? null,
              assessedValue: r?.assessedValue ?? null,
              taxYear: r?.taxYear ?? null,
              valueType: r?.valueType ?? null,
            }
          })
        } else {
          const assessedPerPin = await Promise.all(pinsForExpansion.map((p) => fetchAssessedValue(p)))
          expandedSiblings = pinsForExpansion.map((p, i) => {
            const key = normalizePinSilent(p)
            const av = assessedPerPin[i].assessed
            return {
              pin: p,
              address: pinMap[key] ?? siblings.siblingAddresses[i] ?? normalizedAddress,
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
        if (exempt?.owner_name != null && String(exempt.owner_name).trim() !== '') {
          exemptOwnerName = String(exempt.owner_name).trim()
        }

        // Exempt parcels can still have characteristics in residential / commercial / condo tables.
        // Residential and condo are already loaded in parallel above; commercial only runs for commercial classes.
        if (charsResidential == null) {
          const { chars: comChars } = await fetchCommercialChars(normalizedPin)
          if (comChars && comChars.length > 0) {
            commercialChars = comChars
          }
        }
        if (charsResidential == null && commercialChars.length === 0 && charsCondo == null) {
          const { chars: condChars } = await fetchPropertyCharsCondo(normalizedPin)
          if (condChars != null) {
            charsCondo = condChars
          }
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

  const pinsForMailingScan: string[] =
    expandedSiblings.length > 0
      ? expandedSiblings.map((s) => s.pin)
      : siblingPinsForPortfolio.length > 0
        ? [...siblingPinsForPortfolio]
        : pin
          ? [pin]
          : []

  const pinKeysForMailing = [
    ...new Set(
      pinsForMailingScan
        .flatMap((p) => {
          const s = String(p).trim()
          const n = normalizePinSilent(s)
          return n && n !== s ? [s, n] : [s]
        })
        .filter(Boolean)
    ),
  ]

  let mailingRows: { mailing_name: string | null; pin: string | null }[] = []
  if (pinKeysForMailing.length > 0) {
    const { data } = await getSupabaseAdmin()
      .from('properties')
      .select('mailing_name, pin')
      .in('pin', pinKeysForMailing)
    mailingRows = data ?? []
  }

  const firstNonJunkMailingForPins = (() => {
    for (const p of pinsForMailingScan) {
      const pk = normalizePinSilent(String(p))
      const row = mailingRows.find((r) => normalizePinSilent(String(r.pin ?? '')) === pk)
      const m = row?.mailing_name?.trim()
      if (m && !JUNK_MAILING_NAMES.has(m.toUpperCase())) return m
    }
    return null
  })()

  const firstAnyMailingForPins = (() => {
    for (const p of pinsForMailingScan) {
      const pk = normalizePinSilent(String(p))
      const row = mailingRows.find((r) => normalizePinSilent(String(r.pin ?? '')) === pk)
      const m = row?.mailing_name?.trim()
      if (m) return m
    }
    return null
  })()

  const mProp = property?.mailing_name?.trim() ?? null
  if (mProp && !JUNK_MAILING_NAMES.has(mProp.toUpperCase())) {
    ownerMailingName = mProp
    isJunkMailingName = false
  } else if (firstNonJunkMailingForPins) {
    ownerMailingName = firstNonJunkMailingForPins
    isJunkMailingName = false
  } else if (mProp) {
    ownerMailingName = mProp
    isJunkMailingName = true
  } else if (firstAnyMailingForPins) {
    ownerMailingName = firstAnyMailingForPins
    isJunkMailingName = JUNK_MAILING_NAMES.has(firstAnyMailingForPins.toUpperCase())
  }

  if (ownerMailingName && !isJunkMailingName) {
    const supabaseAdmin = getSupabaseAdmin()
    const { count: ownerMailingPinCount } = await supabaseAdmin
      .from('properties')
      .select('pin', { count: 'exact', head: true })
      .eq('mailing_name', ownerMailingName)

    if (ownerMailingPinCount != null && ownerMailingPinCount <= 500) {
      const { data: ownerProps } = await supabaseAdmin
        .from('properties')
        .select('address, address_normalized, pin')
        .eq('mailing_name', ownerMailingName)
        .order('address_normalized', { ascending: true })
        .limit(200)

      const ownerPins = (ownerProps ?? [])
        .map((p: { pin?: string | null }) => normalizePinSilent(String(p.pin ?? '')))
        .filter(Boolean) as string[]
      const { data: ownerParcels } =
        ownerPins.length > 0
          ? await supabaseAdmin
              .from('parcel_universe')
              .select('pin, community_area_name, municipality_name')
              .in('pin', ownerPins)
              .order('tax_year', { ascending: false })
          : { data: [] as { pin: string; community_area_name: string | null; municipality_name: string | null }[] }
      const pinToNeighborhood: Record<string, string> = {}
      for (const row of ownerParcels ?? []) {
        const pk = row.pin ? normalizePinSilent(String(row.pin)) : ''
        if (!pk) continue
        const label = row.community_area_name || row.municipality_name || null
        if (label && pinToNeighborhood[pk] === undefined) {
          pinToNeighborhood[pk] = label
        }
      }

      if (ownerProps && ownerProps.length > 0) {
        const excludePins =
          isExpanded && building === 'true'
            ? siblingPinsForPortfolio.map((p) => p.replace(/-/g, '').padStart(14, '0'))
            : isLocalCondoExpand && localCondoPins && localCondoPins.length > 0
              ? localCondoPins.map((p) => p.replace(/-/g, '').padStart(14, '0'))
              : pin
                ? [pin.replace(/-/g, '').padStart(14, '0')]
                : []
        const excludePinSet = new Set(excludePins)
        ownerOtherProperties = ownerProps
          .filter((p: { pin?: string | null }) => {
            const pPin = (p.pin || '').replace(/-/g, '').padStart(14, '0')
            return !excludePinSet.has(pPin)
          })
          .map((p: { address?: string | null; address_normalized?: string | null; pin?: string | null }) => {
            const pPin = normalizePinSilent(String(p.pin ?? ''))
            return {
              address: (p.address || p.address_normalized) as string,
              address_normalized: (p.address_normalized || p.address) as string,
              pin: String(p.pin ?? ''),
              neighborhood: (pPin && pinToNeighborhood[pPin]) || null,
            }
          })
      }
    }
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
  const isExemptParcel =
    displayClass != null &&
    (() => {
      const s = String(displayClass).trim().toUpperCase()
      return s.startsWith('4') || s.startsWith('EX')
    })()

  const municipalityName = parcel?.municipality_name ?? null
  const isChicago =
    !municipalityName ||
    municipalityName.toUpperCase() === 'CHICAGO' ||
    municipalityName.toUpperCase() === 'CITY OF CHICAGO' ||
    displayCommunityAreaName != null

  const cityStateDisplay = isChicago
    ? displayZip
      ? `CHICAGO, IL ${displayZip}`
      : 'CHICAGO, IL'
    : displayZip
      ? `${municipalityName!.toUpperCase()}, IL ${displayZip}`
      : `${municipalityName!.toUpperCase()}, IL`

  const addressBarMeta = [
    displayCommunityAreaName ?? (isChicago ? property?.community_area ?? null : null),
    displayWard != null ? `Ward ${displayWard}` : property?.ward != null ? `Ward ${property.ward}` : null,
    cityStateDisplay,
  ]
    .filter(Boolean)
    .join(' · ')

  const addressBarHeadline =
    isExpanded && addressRange && !isLocalCondoExpand
      ? formatRangeForDisplay(addressRange)
      : displayAddress || slug

  const portfolioPins =
    expandedSiblings.length > 0
      ? expandedSiblings.map((s) => s.pin)
      : pin
        ? siblingPinsForPortfolio.length > 0
          ? siblingPinsForPortfolio
          : [pin]
        : []

  const assessorBuildingSqft = (() => {
    const r = charsResidential?.building_sqft
    if (r != null && Number(r) > 0) return Number(r)
    const c = charsCondo?.building_sqft
    if (c != null && Number(c) > 0) return Number(c)
    const com = commercialChars[0]?.building_sqft
    if (com != null && Number(com) > 0) return Number(com)
    return null
  })()

  const assessorUnitsFromChars = (() => {
    const na = charsResidential?.num_apartments
    if (na != null) {
      const n = Number(na)
      if (Number.isFinite(n) && n > 0) return n
    }
    const bnu = charsCondo?.building_non_units
    if (bnu != null) {
      const n = Number(bnu)
      if (Number.isFinite(n) && n > 0) return n
    }
    return null
  })()

  const portfolioSaveData = {
    currentAddress: displayAddress || addressBarHeadline,
    canonicalAddress: normalizedAddress,
    isPartOfBuilding: !!(addressRange && (addressRange !== displayAddress || !pin)),
    buildingAddressRange: addressRange
      ? formatRangeForDisplay(addressRange)
      : addressBarHeadline || null,
    additionalStreets:
      addressBarHeadline.includes(' & ') ? addressBarHeadline.split(' & ').slice(1).map((s) => s.trim()).filter(Boolean) : [],
    allPins: portfolioPins,
    assessorSqft: assessorBuildingSqft,
    assessorUnits: assessorUnitsFromChars,
  }

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
      <RecordSearch address={displayAddress || addressBarHeadline} slug={decodedSlug} />
      <div className="prop-page-shell">
        <div className="prop-main-content">
          <div className="address-header">
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="address-header-street">{addressBarHeadline}</div>
              <div className="address-header-meta">{addressBarMeta || 'Chicago'}</div>
            </div>
            <AddressBarButtons
              addressRange={addressRange}
              slug={decodedSlug}
              isExpanded={isExpanded}
              isFullBuildingView={isExpanded && !isLocalCondoExpand}
              apiKey={process.env.NEXT_PUBLIC_GOOGLE_PLACES_KEY}
              saveData={portfolioSaveData}
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
              <div className="profile-card-header">
                <span style={{ flex: 1 }}>Property Details</span>
              </div>
            )}

            {!property && nearestParcel && !isExpanded && (
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
            {!property && !nearestParcel && !isExpanded && (
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
                  year_built:
                    commercialChars.length > 0
                      ? commercialChars[0].year_built
                      : charsResidential?.year_built ?? charsCondo?.year_built ?? null,
                  building_sqft:
                    commercialChars.length > 0
                      ? commercialChars[0].building_sqft
                      : charsResidential?.building_sqft ?? charsCondo?.building_sqft ?? null,
                  land_sqft:
                    commercialChars.length > 0
                      ? commercialChars[0].land_sqft
                      : charsResidential?.land_sqft ?? charsCondo?.land_sqft ?? null,
                  property_type:
                    (commercialChars.length > 0 ? commercialChars[0].property_type_use : null) ??
                    residentialPropertyTypeLine ??
                    null,
                }}
              />
            ) : (
              <div className="detail-list">
                {charsResidential != null ? (
                  <ResidentialCharacteristicTopRows chars={charsResidential} />
                ) : charsCondo != null ? (
                  <CondoCharacteristicTopRows chars={charsCondo} />
                ) : commercialChars.length > 0 ? (
                  <CommercialCharacteristicRows row={commercialChars[0] as Record<string, unknown>} />
                ) : null}

                <div className="detail-row">
                  <span className="detail-key">Class</span>
                  <span className={detailVal(displayClass ?? null).isNa ? 'detail-val na' : 'detail-val'}>
                    {isExemptParcel ? 'EX — Tax-Exempt Property' : `${displayClass ?? 'N/A'}${classDescription ? ` — ${classDescription}` : ''}`}
                  </span>
                </div>

                <details>
                  <summary
                    style={{
                      fontFamily: 'var(--mono)',
                      fontSize: '11px',
                      fontWeight: 600,
                      letterSpacing: '0.1em',
                      textTransform: 'uppercase' as const,
                      color: 'var(--text-dim)',
                      padding: '8px 14px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      borderBottom: '1px solid var(--border)',
                      cursor: 'pointer',
                      listStyle: 'none',
                      userSelect: 'none' as const,
                    }}
                  >
                    {'Additional Characteristics'}
                    <span style={{ fontSize: '16px' }}>{'▾'}</span>
                  </summary>

                  {exemptOwnerName && (
                    <div className="detail-row">
                      <span className="detail-key">Owner</span>
                      <span className="detail-val">{exemptOwnerName}</span>
                    </div>
                  )}

                  {charsResidential != null && (
                    <ResidentialCharacteristicRemainderRows chars={charsResidential} />
                  )}
                  {charsCondo != null && <CondoCharacteristicRemainderRows chars={charsCondo} />}

                  {assessed?.displayValue != null &&
                    assessed.displayValue > 0 &&
                    assessed?.class != null &&
                    assessed?.taxYear != null && (
                      <div className="detail-row">
                        <span className="detail-key">Implied Value ({assessed.taxYear})</span>
                        <span className="detail-val">
                          $
                          {Math.round(
                            assessed.displayValue / getAssessmentLevelForImplied(assessed.class)
                          ).toLocaleString('en-US')}
                        </span>
                      </div>
                    )}

                  <div className="detail-row">
                    <span className="detail-key">PIN</span>
                    <span className={detailVal(displayPin ?? null).isNa ? 'detail-val na' : 'detail-val'}>
                      {detailVal(displayPin ?? null).text}
                    </span>
                  </div>

                  {charsResidential != null && additionalResidentialDetailRows(charsResidential)}
                </details>

                {exemptChars && (
                  <>
                    <span style={SECTION_LABEL}>Tax Exempt</span>
                    <div className="detail-row">
                      <span className="detail-key">Township</span>
                      <span className="detail-val">{exemptChars.township_name}</span>
                    </div>
                  </>
                )}

              </div>
            )}
          </div>

          {ownerMailingName && (
            <OwnerPortfolioCard
              mailingName={ownerMailingName}
              isJunkName={isJunkMailingName}
              parcelsAtAddress={
                expandedSiblings.length > 0
                  ? expandedSiblings.length
                  : siblingPinsForPortfolio.length > 0
                    ? siblingPinsForPortfolio.length
                    : pin
                      ? 1
                      : 0
              }
              otherParcelsCount={ownerOtherProperties.length}
            />
          )}
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