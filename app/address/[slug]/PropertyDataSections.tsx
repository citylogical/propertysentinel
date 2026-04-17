import Link from 'next/link'
import { slugToZip } from '@/lib/address-slug'
import { formatAddressForDisplay } from '@/lib/formatAddress'
import {
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
  fetchComplaintsByAddresses,
  fetchViolationsByAddresses,
  fetchPermitsByAddresses,
  fetchPinAddressMap,
  JUNK_MAILING_NAMES,
} from '@/lib/supabase-search'
import type {
  PropertyCharsResidentialRow,
  PropertyCharsCondoRow,
  PropertyRow,
} from '@/lib/supabase-search'
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
import OwnerPortfolioCard from './OwnerPortfolioCard'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import React from 'react'

export type PropertyDataSectionsProps = {
  normalizedAddress: string
  slug: string
  decodedSlug: string
  property: PropertyRow | null
  nearestParcel: (PropertyRow & { _nearestDist: number }) | null
  pin: string | null
  hasDirectPropertyMatch: boolean
  isExpandedFromQuery: boolean
  /** `searchParams.building === 'true'` — used for owner-portfolio exclude logic */
  buildingParamTrue: boolean
  siblingPins: string[]
  siblingAddresses: string[]
  addressRange: string | null
  displayZip: string | null
  /** Shell slug display; reserved for parity with the old page layout */
  displayAddressFromSlug: string | null
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

function getAssessmentLevelForImplied(assessedClass: string | null): number {
  if (!assessedClass) return 0.1
  const major = parseInt(assessedClass.toString()[0], 10)
  if (Number.isNaN(major)) return 0.1
  if (major === 4 || major === 5) return 0.25
  return 0.1
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

export default async function PropertyDataSections(props: PropertyDataSectionsProps) {
  const {
    normalizedAddress,
    slug,
    decodedSlug,
    property,
    nearestParcel,
    pin,
    hasDirectPropertyMatch,
    isExpandedFromQuery,
    buildingParamTrue,
    displayZip: displayZipProp,
    displayAddressFromSlug: _displayAddressFromSlug,
  } = props

  let isExpanded = isExpandedFromQuery
  let isLocalCondoExpand = false
  let siblingAddresses = [...props.siblingAddresses]
  let siblingPinsForPortfolio = [...props.siblingPins]
  let addressRange = props.addressRange

  if (!pin && siblingAddresses.length > 1) {
    isExpanded = true
  }

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
  let expandedSiblings: SiblingPin[] = []
  let buildingParcelCountForAv = 0
  let ownerOtherProperties: { address: string; address_normalized: string; pin: string; neighborhood: string | null }[] = []
  let ownerMailingName: string | null = null
  let isJunkMailingName = false
  let localCondoPins: string[] | null = null
  let mailingRowsEarly: { mailing_name: string | null; pin: string | null }[] = []

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
    const siblings = {
      siblingPins: siblingPinsForPortfolio,
      siblingAddresses,
      addressRange,
      resolvedVia: 'shell' as const,
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

    const canEarlyFetchMailing = hasDirectPropertyMatch && !isExpanded && !!pin
    const earlyMailingPromise: Promise<{ mailing_name: string | null; pin: string | null }[]> = canEarlyFetchMailing
      ? (async () => {
          const pinKey = normalizePinSilent(String(pin))
          const keys = pinKey && pinKey !== pin ? [pin as string, pinKey] : [pin as string]
          const { data } = await getSupabaseAdmin()
            .from('properties')
            .select('mailing_name, pin')
            .in('pin', keys)
          return data ?? []
        })()
      : Promise.resolve([])

    const [assessedUnion, complaintsResult, violationsResult, permitsResult, charsResResult, charsCondoResult, parcelResult, earlyMailingRows] =
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
        earlyMailingPromise,
      ])

    if (canEarlyFetchMailing && earlyMailingRows.length > 0) {
      mailingRowsEarly = earlyMailingRows
    }

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
    const useFanOut = siblingAddresses.length > 1
    const [complaintsResult, violationsResult, permitsResult] = await Promise.all([
      useFanOut
        ? fetchComplaintsByAddresses(siblingAddresses)
        : fetchComplaints(normalizedAddress),
      useFanOut
        ? fetchViolationsByAddresses(siblingAddresses)
        : fetchViolations(normalizedAddress),
      useFanOut
        ? fetchPermitsByAddresses(siblingAddresses)
        : fetchPermits(normalizedAddress),
    ])
    complaints = complaintsResult.complaints ?? []
    violations = violationsResult.violations ?? []
    permits = permitsResult.permits ?? []

    // When fanning out across a user-submitted range with no PIN,
    // also force isExpanded so the page header range stays consistent
    // with the aggregated data being displayed.
    if (useFanOut) {
      isExpanded = true
    }
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
  if (mailingRowsEarly.length > 0) {
    mailingRows = mailingRowsEarly
  } else if (pinKeysForMailing.length > 0) {
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
    const { data: ownerPropsRaw } = await supabaseAdmin
      .from('properties')
      .select('address, address_normalized, pin')
      .eq('mailing_name', ownerMailingName)
      .order('address_normalized', { ascending: true })
      .limit(501)

    if (ownerPropsRaw && ownerPropsRaw.length <= 500) {
      const ownerProps = ownerPropsRaw.slice(0, 200)

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
          isExpanded && buildingParamTrue
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

  const lastPermitDisplay =
    permits.length > 0 && permits[0].issue_date
      ? formatMonthYear(permits[0].issue_date)
      : 'Unknown'

  const displayPin = pin
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

  const displayZip =
    displayZipProp ??
    (property?.zip != null && String(property.zip).trim() !== ''
      ? String(property.zip).trim()
      : slugToZip(decodedSlug))

  const displayClass = (parcel?.['class'] ?? assessed?.class) as string | null | undefined
  const classDescription = getClassDescription(displayClass)
  const isExemptParcel =
    displayClass != null &&
    (() => {
      const s = String(displayClass).trim().toUpperCase()
      return s.startsWith('4') || s.startsWith('EX')
    })()

  function nearestParcelSlug(addr: string | null, zip: string | null): string {
    if (!addr) return ''
    const titleCase = addr
      .split(' ')
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
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
    <>
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
                  {formatAddressForDisplay(
                    nearestParcel.address_normalized ?? nearestParcel.address ?? ''
                  )}
                  {nearestParcel.pin ? ` · PIN ${nearestParcel.pin}` : ''}
                  {' →'}
                </Link>
                <br />
                <a
                  href="https://webapps1.chicago.gov/buildingrecords/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="nearest-parcel-link nearest-parcel-city-verify-link"
                >
                  Or verify address on City website →
                </a>
              </div>
            </div>
          )}
          {!property && !nearestParcel && !isExpanded && (
            <div className="nearest-parcel-note">
              <div className="nearest-parcel-heading">No Assessor record at this address</div>
              <div className="nearest-parcel-sub">
                The Cook County Assessor does not have a parcel record for this address. This may be a unit within a larger building or a non-standard address. Try searching for the building&apos;s primary street address:{' '}
                <a
                  href="https://webapps1.chicago.gov/buildingrecords/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="nearest-parcel-link nearest-parcel-city-verify-link"
                >
                  Look up on city website →
                </a>
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
    </>
  )
}
