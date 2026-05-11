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

export type PortfolioUnit = {
  id: string
  portfolio_property_id: string
  unit_label: string | null
  bd_ba: string | null
  tag: string | null
  status: string | null
  rent: number | null
  lease_from: string | null
  lease_to: string | null
  move_in: string | null
  move_out: string | null
  ob_date: string | null
  source: string
  created_at: string
  updated_at: string
}

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
  units_total: number
  units_status_breakdown: Record<string, number>
  units_tag_breakdown: Record<string, number>
  sqft_override: number | null
  notes: string | null
  alerts_enabled: boolean
  created_at: string
  open_violations: number
  open_complaints: number
  total_complaints_12mo: number
  open_building_complaints: number | null
  total_building_complaints_12mo: number | null
  latest_building_complaint_date: string | null
  total_violations_12mo: number
  total_permits: number
  shvr_count: number
  is_pbl: boolean
  has_stop_work: boolean
  str_registrations?: number
  is_restricted_zone?: boolean
  nearby_listings?: number
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
