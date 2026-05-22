/**
 * Legacy Chicago Building Code (Chapter 13-60) construction-type labels.
 *
 * Source: Chicago Municipal Code Ch. 13-60, "Classification of Buildings by
 * Construction Type" — repealed by Coun. J. 4-10-19, p. 100029, Art. XXII, § 5,
 * effective with the 2019 Chicago Construction Codes (Title 14B, based on IBC
 * 2018, mandatory Aug 1, 2020).
 *
 * Archive: https://codelibrary.amlegal.com/codes/chicago/c7209359-81de-4059-a679f6a211f04dea/chicagobuilding_il/
 *
 * IMPORTANT: These are the LEGACY codes used in DOB building records (and
 * therefore in our hansen_buildings ingest). They do NOT map 1:1 to IBC.
 * In particular, legacy CBC Type IV = wood frame (= IBC Type V), and legacy
 * CBC Type III-A = heavy timber (= IBC Type IV). For modern permits filed
 * after Aug 2020, the building is classified under IBC types via Title 14B
 * Chapter 6 instead, but the Hansen scrape is pre-modernization stock.
 *
 * A/B subdivisions follow the fire-resistance pattern (A = more rated, B =
 * less rated) defined in the repealed Table 13-60-100. Hansen occasionally
 * stores the parent code with no suffix (e.g. "4") — treat as the type with
 * no further subdivision specified.
 */

export type ConstructionCode = string

type ConstructionLabel = {
  /** Short plain-English material/category, suitable for UI display. */
  short: string
  /** Full legacy CBC type designation including any subtype letter. */
  long: string
}

const CONSTRUCTION_CODE_LABELS: Record<string, ConstructionLabel> = {
  '1A': { short: 'Fire-resistive', long: 'Type I-A — Fire-Resistive Construction' },
  '1B': { short: 'Fire-resistive', long: 'Type I-B — Fire-Resistive Construction' },
  '2A': { short: 'Noncombustible', long: 'Type II-A — Noncombustible Construction' },
  '2B': { short: 'Noncombustible', long: 'Type II-B — Noncombustible Construction' },
  '3':  { short: 'Masonry, exterior protected', long: 'Type III — Exterior Protected Construction' },
  '3A': { short: 'Heavy timber', long: 'Type III-A — Heavy Timber (masonry exterior)' },
  '3B': { short: 'Masonry, ordinary', long: 'Type III-B — Ordinary (masonry exterior, wood interior)' },
  '3C': { short: 'Masonry, ordinary', long: 'Type III-C — Ordinary (masonry exterior, wood interior)' },
  '4':  { short: 'Wood frame', long: 'Type IV — Combustible Frame Construction' },
  '4A': { short: 'Wood frame', long: 'Type IV-A — Combustible Frame Construction' },
  '4B': { short: 'Wood frame', long: 'Type IV-B — Combustible Frame Construction' },
}

/**
 * Returns a short plain-English label for the construction code, with the
 * raw code appended in parens for the technical audience. Falls back to the
 * raw code alone when unknown. Pass `format: 'long'` for the full type
 * designation.
 *
 * Examples (default 'short'):
 *   '3B'  → 'Masonry, ordinary (3B)'
 *   '4A'  → 'Wood frame (4A)'
 *   '1A'  → 'Fire-resistive (1A)'
 *   '99'  → '99'                  (unknown — passes through)
 *
 * Examples ('long'):
 *   '3B'  → 'Type III-B — Ordinary (masonry exterior, wood interior)'
 */
export function getConstructionLabel(
  code: ConstructionCode | null | undefined,
  format: 'short' | 'long' = 'short'
): string | null {
  if (!code) return null
  const key = String(code).trim().toUpperCase()
  if (!key) return null
  const entry = CONSTRUCTION_CODE_LABELS[key]
  if (!entry) return key
  return format === 'long' ? entry.long : `${entry.short} (${key})`
}

/** Returns just the short material label without the code suffix. */
export function getConstructionShortLabel(
  code: ConstructionCode | null | undefined
): string | null {
  if (!code) return null
  const key = String(code).trim().toUpperCase()
  return CONSTRUCTION_CODE_LABELS[key]?.short ?? null
}
