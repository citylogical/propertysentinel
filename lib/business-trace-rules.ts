import type { TracerfyEnrichedPerson } from './tracerfy'
import {
  resolveAddressToProperties,
  countDistinctMailingNames,
  uniquePinCount,
} from './address-resolution'

/**
 * Word-boundary regex matching common business entity suffixes/keywords.
 * Hits on "ACME LLC" but not on "TRUSTAN SMITH". Word boundaries matter.
 */
const ENTITY_PATTERN_REGEX = new RegExp(
  '\\b(' +
    [
      'LLC',
      'L\\.L\\.C\\.',
      'LP',
      'LLP',
      'LTD',
      'INC',
      'INCORPORATED',
      'CORP',
      'CORPORATION',
      'CO',
      'COMPANY',
      'TRUST',
      'TRUSTEE',
      'TRUSTEES',
      'ASSOCIATION',
      'ASSN',
      'CONDOMINIUM',
      'CONDO',
      'HOA',
      'COOP',
      'COOPERATIVE',
      'MANAGEMENT',
      'MGMT',
      'PROPERTIES',
      'REALTY',
      'HOLDINGS',
      'PARTNERS',
      'PARTNERSHIP',
      'FUND',
      'GROUP',
      'SERVICES',
      'ENTERPRISES',
      'BANK',
      'CHURCH',
      'PARISH',
      'MINISTRIES',
      'ARCHDIOCESE',
      'DIOCESE',
      'FOUNDATION',
      'INSTITUTE',
      'UNIVERSITY',
      'COLLEGE',
      'SCHOOL',
      'HOSPITAL',
      'AUTHORITY',
    ].join('|') +
    ')\\b',
  'i'
)

export function looksLikeEntity(name: string | null | undefined): boolean {
  if (!name) return false
  return ENTITY_PATTERN_REGEX.test(name.trim())
}

export type BusinessTraceRecommendation = {
  recommended: boolean
  reason:
    | 'commercial_class'
    | 'exempt_class'
    | 'entity_mailing_name'
    | 'multi_owner_building'
    | null
}

/**
 * Determines whether a property warrants a business trace recommendation.
 * Rules (first match wins, in priority order):
 *   1. Property class starts with 4 → exempt_class (institutional/church/school)
 *   2. Property class starts with 3, 5, 6, 7, 8 → commercial_class
 *   3. mailing_name matches entity-pattern regex → entity_mailing_name
 *   4. 7+ PINs at same address AND 2+ distinct mailing_names → multi_owner_building
 *
 * Rule 4 specifically catches real condo/coop associations while excluding
 * single-owner small apartment buildings (7-flats, 8-flats, etc).
 *
 * The class checks (rules 1+2) come first because they're authoritative when
 * present. The mailing_name check (rule 3) catches LLCs that own residential
 * properties. The multi-owner check (rule 4) is the most expensive and runs
 * last as a final fallback.
 */
export async function evaluateBusinessTrace(
  propertyClass: string | null | undefined,
  mailingName: string | null | undefined,
  addressNormalized: string,
  enrichedPersons: TracerfyEnrichedPerson[]
): Promise<BusinessTraceRecommendation> {
  // Rule 1: tax-exempt class
  if (propertyClass && /^4/.test(propertyClass.trim())) {
    return { recommended: true, reason: 'exempt_class' }
  }

  // Rule 2: commercial / industrial / multi-family rental
  if (propertyClass && /^[35678]/.test(propertyClass.trim())) {
    return { recommended: true, reason: 'commercial_class' }
  }

  // Rule 3: entity-pattern mailing name
  // SUPPRESSION: if Tracerfy returned a person whose mailing address matches the
  // property, the residential skip-trace already nailed the real beneficial owner
  // (e.g. an Illinois land trust where the bank is just the trustee on paper but
  // the actual owner lives at the property). The CTA would be misleading here —
  // there's no management company to look up, just an individual hiding behind
  // a trustee. Skip the rule and fall through.
  if (looksLikeEntity(mailingName)) {
    const hasCleanResidentialMatch = enrichedPersons.some(
      (p) => p.mailing_matches_property
    )
    if (!hasCleanResidentialMatch) {
      return { recommended: true, reason: 'entity_mailing_name' }
    }
  }

  // Rule 4: multi-owner building check (7+ PINs AND 2+ distinct mailing names)
  // Only run if address is non-empty.
  if (addressNormalized) {
    const properties = await resolveAddressToProperties(addressNormalized)
    if (uniquePinCount(properties) >= 7) {
      const distinctNames = countDistinctMailingNames(properties)
      if (distinctNames >= 2) {
        return { recommended: true, reason: 'multi_owner_building' }
      }
    }
  }

  return { recommended: false, reason: null }
}

/**
 * Human-readable label for the business trace reason. Used in the UI banner.
 */
export function businessTraceReasonLabel(
  reason: BusinessTraceRecommendation['reason']
): string {
  switch (reason) {
    case 'commercial_class':
      return 'a commercial property'
    case 'exempt_class':
      return 'a tax-exempt institutional property'
    case 'entity_mailing_name':
      return 'owned by a business entity'
    case 'multi_owner_building':
      return 'a condo or association building'
    default:
      return ''
  }
}

/**
 * Standalone multi-owner building check used as a pre-Tracerfy gate.
 * Mirrors rule 4 from evaluateBusinessTrace exactly: 7+ PINs at the address
 * AND 2+ distinct mailing names. Returns true when we should skip Tracerfy
 * and serve the contacts modal instead.
 *
 * Note: this duplicates the rule 4 query in evaluateBusinessTrace. We accept
 * the duplication because the unlock route needs to make the skip decision
 * before knowing anything else, and merging the two checks would require a
 * more invasive refactor of evaluateBusinessTrace.
 */
export async function isMultiOwnerBuilding(addressNormalized: string): Promise<boolean> {
  if (!addressNormalized) return false
  const properties = await resolveAddressToProperties(addressNormalized)
  if (uniquePinCount(properties) < 7) return false
  const distinctNames = countDistinctMailingNames(properties)
  return distinctNames >= 2
}
