import type { ComplaintRow, PermitRow, ViolationRow } from '@/lib/supabase-search'

export type PortfolioSaveStatsPayload = {
  open_complaints: number
  total_complaints_12mo: number
  open_violations: number
  total_violations_12mo: number
  total_permits_12mo: number
  shvr_count: number
  has_stop_work: boolean
  implied_value: number | null
  property_class: string | null
  year_built: number | string | null
  community_area: string | null
  stats_updated_at: string
}

const MS_365 = 365 * 86400000

function isComplaintOpen(status: string | null | undefined): boolean {
  return (status ?? '').toUpperCase() === 'OPEN'
}

function isViolationOpenOrFailed(v: ViolationRow): boolean {
  const s = (v.violation_status ?? v.inspection_status ?? '').toUpperCase()
  return s === 'OPEN' || s === 'FAILED'
}

function withinLast12Months(iso: string | null | undefined): boolean {
  if (!iso) return false
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return false
  return t >= Date.now() - MS_365
}

export function computePortfolioSaveStats(input: {
  complaints: ComplaintRow[]
  violations: ViolationRow[]
  permits: PermitRow[]
  impliedValue: number | null
  propertyClass: string | null
  yearBuilt: number | string | null
  communityArea: string | null
}): PortfolioSaveStatsPayload {
  const { complaints, violations, permits, impliedValue, propertyClass, yearBuilt, communityArea } = input

  return {
    open_complaints: complaints.filter((c) => isComplaintOpen(c.status)).length,
    total_complaints_12mo: complaints.filter((c) => withinLast12Months(c.created_date)).length,
    open_violations: violations.filter(isViolationOpenOrFailed).length,
    total_violations_12mo: violations.filter((v) => withinLast12Months(v.violation_date)).length,
    total_permits_12mo: permits.filter((p) => withinLast12Months(p.issue_date)).length,
    shvr_count: complaints.filter(
      (c) =>
        (c.sr_short_code ?? '').toUpperCase() === 'SHVR' && isComplaintOpen(c.status)
    ).length,
    has_stop_work: violations.some((v) => v.is_stop_work_order === true),
    implied_value: impliedValue,
    property_class: propertyClass,
    year_built: yearBuilt,
    community_area: communityArea,
    stats_updated_at: new Date().toISOString(),
  }
}
