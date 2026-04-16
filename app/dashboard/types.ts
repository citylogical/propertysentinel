export type BuildingCharsRow = {
  year_built?: number | string | null
  building_sqft?: number | string | null
  num_apartments?: number | string | null
  type_of_residence?: string | null
  construction_quality?: string | null
  ext_wall_material?: string | null
  roof_material?: string | null
  repair_condition?: string | null
} | null

export type PortfolioProperty = {
  id: string
  user_id?: string
  canonical_address: string
  address_range: string | null
  additional_streets: string[] | null
  pins: string[] | null
  slug: string
  display_name: string | null
  units_override: number | null
  sqft_override: number | null
  notes: string | null
  alerts_enabled: boolean
  created_at: string
  open_violations: number
  open_complaints: number
  total_permits: number
  shvr_count: number
  is_pbl: boolean
  has_stop_work: boolean
  implied_value: number | null
  community_area: string | null
  property_class: string | null
  building_chars: BuildingCharsRow
  latest_violation_date: string | null
  latest_permit_date: string | null
  recent_complaints: Record<string, unknown>[]
  recent_violations: Record<string, unknown>[]
  recent_permits: Record<string, unknown>[]
}
