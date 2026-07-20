// lib/rentroll/parse.ts
//
// Orchestrator: sheet grid (string[][], already read by SheetJS client-side)
// → column map → deterministic extraction → Gemini rescue of stragglers →
// ParseResult. This is the whole Phase 1 parse layer; the import/start API
// route will call parseRentRoll and store result.rows as import_jobs.parsed_rows.

import type { ParseResult, ParseStats, RowFlag } from './types'
import { MAX_SHEET_COLS, MAX_SHEET_ROWS } from './types'
import { resolveColumnMap } from './column-map'
import { extractRows, isNonChicagoAddress, sanitizeCell } from './extract'
import { rescueUnparsedRows } from './rescue'

const COLUMN_MAP_SAMPLE_ROWS = 15

const EMPTY_FLAG_COUNTS: Record<RowFlag, number> = {
  junk_prefix: 0,
  summary_row: 0,
  llm_rescued: 0,
  unit_in_address: 0,
  dual_range: 0,
  non_chicago: 0,
  unparsed: 0,
}

export async function parseRentRoll(
  sheet: string[][],
  opts?: { skipGemini?: boolean }
): Promise<ParseResult> {
  if (!Array.isArray(sheet) || sheet.length === 0) {
    return { columnMap: null, rows: [], stats: null, error: 'The file appears to be empty.' }
  }
  if (sheet.length > MAX_SHEET_ROWS) {
    return {
      columnMap: null, rows: [], stats: null,
      error: `File has ${sheet.length} rows — the limit is ${MAX_SHEET_ROWS}. Contact us for larger portfolios.`,
    }
  }
  if (sheet.some((r) => Array.isArray(r) && r.length > MAX_SHEET_COLS)) {
    return {
      columnMap: null, rows: [], stats: null,
      error: `File has more than ${MAX_SHEET_COLS} columns — this doesn't look like a rent roll.`,
    }
  }

  const sample = sheet
    .slice(0, COLUMN_MAP_SAMPLE_ROWS)
    .map((r) => (r ?? []).map(sanitizeCell))

  const columnMap = await resolveColumnMap(sample, opts)
  if (!columnMap) {
    return {
      columnMap: null, rows: [], stats: null,
      error: "Couldn't find an address column. Make sure the file has a header row with a Property/Address column.",
    }
  }

  const { rows, skippedBlank, skippedRepeatHeader } = extractRows(sheet, columnMap)

  if (!opts?.skipGemini) {
    await rescueUnparsedRows(sheet, rows)
  }

  // City data covers Chicago only — rows whose raw cell carries suburb
  // city/zip evidence get flagged (default-excluded in review, skipped by
  // resolution and commit). Runs after the rescue pass so LLM-recovered rows
  // are checked too.
  for (const row of rows) {
    if (row.address && !row.flags.includes('non_chicago') && isNonChicagoAddress(row.raw_address)) {
      row.flags.push('non_chicago')
    }
  }

  const flagCounts = { ...EMPTY_FLAG_COUNTS }
  for (const row of rows) {
    for (const f of row.flags) flagCounts[f]++
  }

  const stats: ParseStats = {
    sheet_rows: sheet.length,
    parsed_rows: rows.length,
    skipped_blank: skippedBlank,
    skipped_repeat_header: skippedRepeatHeader,
    flag_counts: flagCounts,
    distinct_addresses: new Set(rows.map((r) => r.address).filter(Boolean)).size,
  }

  return { columnMap, rows, stats, error: null }
}
