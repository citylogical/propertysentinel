/**
 * PM Lead Intel "hot" complaint set — the 12 high-ticket SR short codes the
 * pm_lead_intel view aggregates, expanded per Jim 2026-07-23.
 *
 * SOURCE OF TRUTH for the TypeScript side. The Postgres view carries the same
 * list inline (workers repo, sql/pm_lead_intel.sql) — keep the two in sync
 * manually, same convention as lib/sr-catalog.ts vs the Python worker.
 *
 * "Open" in pm_lead_intel means complaints_311.status = 'Open' (the view
 * filters on status, not closed_date) — any consumer that wants its numbers
 * to reconcile with the explore table must use the same predicate.
 *
 * DEPLOYED-VIEW DRIFT (verified against live data 2026-07-24): the deployed
 * pm_lead_intel additionally restricts the hot CTE to complaints filed in the
 * last 90 days — BOTH hot_total ("Hot 90d") and hot_open ("Open Hot") count
 * only complaints with created_date >= now() - 90 days. The workers-repo
 * sql/pm_lead_intel.sql predates that filter. Reconciled for Oak River
 * (id 731): all-time 797/28 vs windowed 37/14 = the view's exact numbers.
 */

export const PM_HOT_SR_CODES = [
  'BBA', // Building Violation
  'BBC', // Plumbing Violation
  'SCB', // Sanitation Code Violation
  'SDR', // Fly Dumping
  'SGA', // Rodent Baiting / Rat Complaint
  'BBK', // Vacant/Abandoned Building
  'BBD', // Construction & Demolition (No Permit)
  'BPI', // Porch Inspection
  'AAF', // Water in Basement
  'NAC', // No Air Conditioning
  'SCT', // Clean Vacant Lot
  'SCP', // Weed Removal
] as const

export type PmHotSrCode = (typeof PM_HOT_SR_CODES)[number]

/** status value that pm_lead_intel's hot_open counts. */
export const PM_HOT_OPEN_STATUS = 'Open'

/** Recency window (days) applied by the DEPLOYED pm_lead_intel hot CTE. */
export const PM_HOT_WINDOW_DAYS = 90
