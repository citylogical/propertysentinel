// scripts/test-rentroll-parse.ts
//
// Phase 1 harness: run the full rent-roll parse pipeline against a real file
// and print the evidence. No database writes, no side effects beyond one or
// two Gemini calls (column map + rescue, fractions of a cent).
//
//   npx tsx scripts/test-rentroll-parse.ts [path-to-file] [--no-gemini]
//
// Defaults to data/GCRD_rentroll.csv (Mark's 593-unit rent roll). Reads
// GEMINI_API_KEY from .env.local if not already in the environment.

import * as fs from 'fs'
import * as path from 'path'
import * as XLSX from 'xlsx'
import { parseRentRoll } from '../lib/rentroll/parse'
import type { ParsedUnitRow, RowFlag } from '../lib/rentroll/types'

// Minimal .env.local loader (KEY=VALUE lines; no dependency).
function loadEnvLocal() {
  const envPath = path.join(process.cwd(), '.env.local')
  if (!fs.existsSync(envPath)) return
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/)
    if (!m) continue
    const key = m[1]
    if (process.env[key] !== undefined) continue
    process.env[key] = m[2].replace(/^["']|["']$/g, '')
  }
}

async function main() {
  loadEnvLocal()

  const args = process.argv.slice(2)
  const skipGemini = args.includes('--no-gemini')
  const filePath = args.find((a) => !a.startsWith('--')) ?? 'data/GCRD_rentroll.csv'

  if (!fs.existsSync(filePath)) {
    console.error(`File not found: ${filePath}`)
    process.exit(1)
  }
  if (!skipGemini && !process.env.GEMINI_API_KEY) {
    console.warn('GEMINI_API_KEY not set — running heuristic-only (--no-gemini implied)\n')
  }

  // Same read path the browser will use: workbook → first sheet → string grid.
  const wb = XLSX.read(fs.readFileSync(filePath), { type: 'buffer', raw: false })
  const ws = wb.Sheets[wb.SheetNames[0]]
  const sheet = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1, raw: false, defval: '' })

  console.log(`File: ${filePath}`)
  console.log(`Sheet "${wb.SheetNames[0]}": ${sheet.length} rows\n`)

  const started = Date.now()
  const result = await parseRentRoll(sheet, {
    skipGemini: skipGemini || !process.env.GEMINI_API_KEY,
  })
  const elapsed = Date.now() - started

  if (result.error) {
    console.error(`PARSE ERROR: ${result.error}`)
    process.exit(1)
  }

  console.log(`Column map (source: ${result.columnMap!.source}):`)
  console.log(JSON.stringify(result.columnMap, null, 2))
  console.log(`\nStats (${elapsed} ms):`)
  console.log(JSON.stringify(result.stats, null, 2))

  const rows = result.rows
  const withRent = rows.filter((r) => r.rent !== null).length
  const withUnit = rows.filter((r) => r.unit_label !== null).length
  const withAddress = rows.filter((r) => r.address !== null).length
  console.log(`\nRows with address: ${withAddress} / ${rows.length}`)
  console.log(`Rows with unit_label: ${withUnit}`)
  console.log(`Rows with rent: ${withRent}`)

  const show = (label: string, flag: RowFlag, n = 5) => {
    const flagged = rows.filter((r) => r.flags.includes(flag))
    if (flagged.length === 0) return
    console.log(`\n--- ${label} (${flagged.length}) ---`)
    for (const r of flagged.slice(0, n)) printRow(r)
    if (flagged.length > n) console.log(`  ... and ${flagged.length - n} more`)
  }

  show('JUNK PREFIX', 'junk_prefix')
  show('DUAL RANGE', 'dual_range')
  show('UNIT IN ADDRESS', 'unit_in_address')
  show('SUMMARY ROWS', 'summary_row')
  show('LLM RESCUED', 'llm_rescued', 10)
  show('STILL UNPARSED', 'unparsed', 20)

  console.log('\n--- FIRST 5 CLEAN ROWS ---')
  for (const r of rows.filter((x) => x.flags.length === 0).slice(0, 5)) printRow(r)

  const outPath = path.join('scripts', 'test-rentroll-parse.out.json')
  fs.writeFileSync(outPath, JSON.stringify({ columnMap: result.columnMap, stats: result.stats, rows }, null, 2))
  console.log(`\nFull output written to ${outPath} (gitignored? verify before committing)`)
}

function printRow(r: ParsedUnitRow) {
  console.log(
    `  row ${String(r.row_num).padStart(4)}: "${r.raw_address}" -> addr="${r.address}" unit="${r.unit_label}" ` +
    `rent=${r.rent} status="${r.status}" [${r.flags.join(',')}]`
  )
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
