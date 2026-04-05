export type LeadCategory = 'plumbing_water' | 'building_code' | 'property_maintenance'

export const LEAD_CATEGORIES: Record<
  LeadCategory,
  {
    label: string
    codes: string[]
    description: string
  }
> = {
  plumbing_water: {
    label: 'Plumbing & Water',
    codes: ['BBC', 'AAF', 'WBJ', 'WBK', 'WCA'],
    description: 'Plumbing violations, water in basement, water leaks, sewer issues',
  },
  building_code: {
    label: 'Building & Code',
    codes: ['BBA', 'BBD', 'BPI', 'FAC', 'HDF', 'NAC'],
    description: 'Building violations, unpermitted construction, fire safety, HVAC',
  },
  property_maintenance: {
    label: 'Property Maintenance',
    codes: ['SCB', 'SGA', 'SGG', 'EAB', 'EBD', 'BBK'],
    description: 'Sanitation, rodent baiting, abandoned buildings, junk and debris',
  },
}

/** Given an sr_short_code, return its category (or null if unmapped). */
export function getCategoryForCode(srShortCode: string | null | undefined): LeadCategory | null {
  if (srShortCode == null || srShortCode === '') return null
  for (const [category, config] of Object.entries(LEAD_CATEGORIES)) {
    if (config.codes.includes(srShortCode)) {
      return category as LeadCategory
    }
  }
  return null
}

/** All sr_short_codes for a category (for SQL WHERE IN clauses). */
export function getCodesForCategory(category: LeadCategory): string[] {
  return [...LEAD_CATEGORIES[category].codes]
}

/** All mapped codes across all categories (for the "All Categories" filter). */
export const ALL_MAPPED_CODES: string[] = Object.values(LEAD_CATEGORIES).flatMap((c) => c.codes)
