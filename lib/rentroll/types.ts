// lib/rentroll/types.ts
//
// Shared types for the rent-roll parse layer (Phase 1 of the self-serve
// portfolio upload). The parse layer turns a spreadsheet — already read
// client-side by SheetJS into a string[][] grid — into structured unit rows
// ready for address resolution. JSONB shapes here mirror the documentation
// in docs/sql/rentroll_import_migration.sql.

/** Why a row needs (or got) special handling. Surfaced as badges in review. */
export type RowFlag =
  | 'junk_prefix'      // non-address text stripped from the front ("PMA Canceled *...")
  | 'summary_row'      // aggregate row ("Total, 593 Units, ...") — default-excluded in review
  | 'llm_rescued'      // deterministic extraction failed; Gemini recovered the row
  | 'unit_in_address'  // unit designation was embedded in the address cell
  | 'dual_range'       // address covers a street-number range ("1113 - 1115 W Patterson")
  | 'non_chicago'      // city/zip evidence says outside Chicago — default-excluded (no city data)
  | 'unparsed'         // no usable address found — needs manual attention in review

export type ParsedUnitRow = {
  /** 1-based row number in the source sheet, for review-screen traceability. */
  row_num: number
  /** Original address cell text, verbatim (sanitized). Shown in review. */
  raw_address: string
  /** Cleaned address candidate for resolution. Null when unparsed/summary. */
  address: string | null
  unit_label: string | null
  bd_ba: string | null
  rent: number | null
  /** Rent-roll occupancy status, verbatim ("Current", "Vacant-Unrented", ...). */
  status: string | null
  /** ISO yyyy-mm-dd, or null when missing/unparseable. */
  lease_from: string | null
  lease_to: string | null
  move_in: string | null
  move_out: string | null
  flags: RowFlag[]
  /**
   * Review-screen selection state, persisted into import_jobs.parsed_rows by
   * PATCH /api/dashboard/import/job so the review survives close/reopen.
   * Absent until the user first touches the row; defaults to true except for
   * summary rows.
   */
  included?: boolean
}

/** 0-based column indexes into the sheet; -1 = column not present. */
export type ColumnMap = {
  /** 0-based index of the header row in the sheet. */
  header_row: number
  address: number
  unit: number
  bd_ba: number
  rent: number
  status: number
  lease_from: number
  lease_to: number
  move_in: number
  move_out: number
  source: 'gemini' | 'heuristic'
}

export type ParseStats = {
  sheet_rows: number
  parsed_rows: number
  skipped_blank: number
  skipped_repeat_header: number
  flag_counts: Record<RowFlag, number>
  distinct_addresses: number
}

export type ParseResult = {
  columnMap: ColumnMap | null
  rows: ParsedUnitRow[]
  stats: ParseStats | null
  /** Human-readable failure ("couldn't find an address column"). Null on success. */
  error: string | null
}

/** Hard caps — enforced before any parsing work (zip-bomb / oversize guard). */
export const MAX_SHEET_ROWS = 5000
export const MAX_SHEET_COLS = 60
