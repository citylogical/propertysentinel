// Single source of truth for the insights dashboard data contract.
// Shared between the API route and all client components.

export type LiabilityKind = 'stop_work' | 'owner_resp' | 'big_permit' | null

export type WhatChangedKind =
  | 'stop_work'
  | 'owner_resp'
  | 'transition'
  | 'new_complaint'
  | 'closure'
  | 'permit'

export type WhatChangedEvent = {
  kind: WhatChangedKind
  label: string                    // pre-rendered human-readable
  address: string | null
  property_slug: string | null
  timestamp: string                // ISO
  age_label: string                // "11h", "2d"
}

export type HotProperty = {
  id: string
  slug: string | null
  address: string
  community_area: string | null
  open: number
  overdue: number
  liability_kind: LiabilityKind
  liability_label: string | null   // "Stop-work", "Owner resp.", "$1.1M permit"
  last_event_age: string | null    // "11h ago"
}

export type ScopeCounts = {
  all_open: number
  building_property: number
  actionable: number
}

export type WorkflowBeads = {
  assign_inspector: number
  investigation: number
  case_review: number
  perform_work: number
  closed_30d: number
}

export type DailyActivityEntry = {
  date: string                     // YYYY-MM-DD
  complaints: number
  violations: number
  permits: number
}

export type ComplaintTypeEntry = {
  code: string                     // SR short code
  label: string                    // human label
  count: number
}

export type AgingBuckets = {
  days_0_7: number
  days_8_30: number
  days_31_60: number
  days_60_plus: number
}

export type ClosedOutcomes = {
  productive: number
  no_cause: number
  owner_responsibility: number
}

export type KpiBlock = {
  open_complaints: number
  open_complaints_delta_pct: number | null
  new_7d: number
  new_7d_delta_pct: number | null
  closed_7d: number
  closed_7d_outcomes: ClosedOutcomes
  overdue: number
  overdue_delta_24h: number
  permits_ytd_dollars: number
  permits_ytd_delta_pct_yoy: number | null
}

export type HeadlineBlock = {
  addresses_with_activity: number
  addresses_sample: string[]       // up to 2
  workflow_changes_count: number
  workflow_closures_count: number
  closure_sample_address: string | null
  overdue_count: number
}

export type InsightsMeta = {
  org_name: string | null
  portfolio_buildings: number
  portfolio_units: number
}

export type InsightsData = {
  generated_at: string
  meta: InsightsMeta
  scope: ScopeCounts
  headline: HeadlineBlock
  kpis: KpiBlock
  workflow_beads: WorkflowBeads
  daily_activity: DailyActivityEntry[]
  complaints_by_type: ComplaintTypeEntry[]
  aging_buckets: AgingBuckets
  what_changed: WhatChangedEvent[]
  hot_properties: HotProperty[]
}
