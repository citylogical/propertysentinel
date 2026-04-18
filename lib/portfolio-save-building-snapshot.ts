import { cache } from 'react'
import {
  fetchAssessedValue,
  fetchAssessedValuesByPins,
  fetchCommercialChars,
  fetchParcelUniverseClass,
  fetchPropertyCharsCondo,
  fetchPropertyCharsResidential,
} from '@/lib/supabase-search'

function getAssessmentLevelForImplied(assessedClass: string | null): number {
  if (!assessedClass) return 0.1
  const major = parseInt(String(assessedClass)[0], 10)
  if (Number.isNaN(major)) return 0.1
  if (major === 4 || major === 5) return 0.25
  return 0.1
}

export type PortfolioSaveBuildingSnapshot = {
  yearBuilt: string | null
  impliedValue: number | null
  propertyClass: string | null
  communityArea: string | null
}

async function pickRepresentativePin(
  normalizedPin: string,
  siblingPins: string[],
  byPins: { results: { pin: string; assessedClass?: string | null }[]; error: string | null }
): Promise<string> {
  const list = siblingPins.length > 0 ? siblingPins : [normalizedPin]

  if (!byPins.error && byPins.results.length > 0) {
    const non299 = byPins.results.find(
      (r) => r.assessedClass != null && String(r.assessedClass) !== '299'
    )
    if (non299?.pin) return non299.pin
  }

  for (const pin of list) {
    const cls = await fetchParcelUniverseClass(pin)
    if (cls && String(cls) !== '299') return pin
  }

  return list[0] ?? normalizedPin
}

/**
 * Building fields aligned with the property page assessor sidebar (representative non-299 PIN for chars).
 */
export const getPortfolioSaveBuildingSnapshot = cache(
  async (params: {
    normalizedPin: string | null
    siblingPins: string[]
    /** When true, sum implied values across PINs like expanded building view with `building=true`. */
    useMultiPinImplied: boolean
    propertyClassFallback: string | null
    communityArea: string | null
  }): Promise<PortfolioSaveBuildingSnapshot> => {
    const { normalizedPin, siblingPins, useMultiPinImplied, propertyClassFallback, communityArea } = params

    if (!normalizedPin) {
      return {
        yearBuilt: null,
        impliedValue: null,
        propertyClass: propertyClassFallback,
        communityArea,
      }
    }

    const pinsList = siblingPins.length > 0 ? siblingPins : [normalizedPin]
    const byPins = await fetchAssessedValuesByPins(pinsList)

    const representativePin = await pickRepresentativePin(normalizedPin, siblingPins, byPins)

    let propertyClass: string | null = propertyClassFallback
    let impliedValue: number | null = null

    if (useMultiPinImplied && pinsList.length > 1) {
      if (
        !byPins.error &&
        byPins.results.length > 0 &&
        byPins.results.every((r) => r.assessedValue != null && Number.isFinite(r.assessedValue))
      ) {
        impliedValue = byPins.results.reduce((sum, r) => {
          const lvl = getAssessmentLevelForImplied(r.assessedClass ?? null)
          return sum + (r.assessedValue as number) / lvl
        }, 0)
        impliedValue = Math.round(impliedValue)
      }
    } else {
      const { assessed } = await fetchAssessedValue(representativePin)
      if (assessed != null && Number.isFinite(assessed.displayValue) && assessed.class != null) {
        const lvl = getAssessmentLevelForImplied(assessed.class)
        if (lvl) impliedValue = Math.round(assessed.displayValue / lvl)
      }
    }

    const puClass = await fetchParcelUniverseClass(representativePin)
    if (puClass != null) propertyClass = puClass

    let yearBuilt: string | null = null
    const resChars = await fetchPropertyCharsResidential(representativePin)
    if (resChars?.chars?.year_built != null) {
      yearBuilt = String(resChars.chars.year_built)
    } else {
      const com = await fetchCommercialChars(representativePin)
      const yb = com.chars?.[0]?.year_built
      if (yb != null) {
        yearBuilt = String(yb)
      } else {
        const condo = await fetchPropertyCharsCondo(representativePin)
        if (condo?.chars?.year_built != null) {
          yearBuilt = String(condo.chars.year_built)
        }
      }
    }

    return {
      yearBuilt,
      impliedValue,
      propertyClass,
      communityArea,
    }
  }
)
