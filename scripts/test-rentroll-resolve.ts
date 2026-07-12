// scripts/test-rentroll-resolve.ts
//
// Phase 2 harness: parse a real rent roll, then resolve every distinct
// address through lib/rentroll/resolve.ts against live Supabase. READ-ONLY —
// no job rows, no portfolio writes; just the same queries the /import/process
// route will run, so we can grade match quality before building the UI.
//
//   npx tsx scripts/test-rentroll-resolve.ts [path-to-file] [--limit=N] [--no-gemini]
//
// Requires SUPABASE_* env in .env.local. Defaults to the raw GC Realty file.

import * as fs from 'fs'
import * as path from 'path'
import * as XLSX from 'xlsx'
import { parseRentRoll } from '../lib/rentroll/parse'
import type { ImportResolution } from '../lib/rentroll/resolve'

function loadEnvLocal() {
  const envPath = path.join(process.cwd(), '.env.local')
  if (!fs.existsSync(envPath)) return
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/)
    if (!m) continue
    if (process.env[m[1]] !== undefined) continue
    process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
}

// unstable_cache requires Next's incrementalCache, which doesn't exist under
// tsx. Shim next/cache to a passthrough so the cached fetchers (parcel
// universe, assessed values, property chars) run their real queries here.
// Harness-only — production routes run inside Next where the cache is real.
function shimNextCache() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Module = require('module') as {
    _load: (request: string, ...rest: unknown[]) => unknown
  }
  const origLoad = Module._load
  Module._load = function (request: string, ...rest: unknown[]) {
    if (request === 'next/cache') {
      return {
        unstable_cache: (fn: unknown) => fn,
        revalidateTag: () => {},
        revalidatePath: () => {},
      }
    }
    return origLoad.call(this, request, ...rest)
  }
}

async function main() {
  loadEnvLocal()
  shimNextCache()
  // lib/supabase.ts constructs its client at module load, so the resolve
  // module (which imports it transitively) must be imported AFTER .env.local
  // is in process.env and the next/cache shim is installed.
  const { resolveImportAddress } = await import('../lib/rentroll/resolve')

  const args = process.argv.slice(2)
  const skipGemini = args.includes('--no-gemini')
  const limitArg = args.find((a) => a.startsWith('--limit='))
  const limit = limitArg ? parseInt(limitArg.split('=')[1], 10) : Infinity
  const filePath =
    args.find((a) => !a.startsWith('--')) ??
    'C:\\Users\\jrmcm\\Downloads\\rent_roll-20260508 (1).csv'

  if (!fs.existsSync(filePath)) {
    console.error(`File not found: ${filePath}`)
    process.exit(1)
  }

  const wb = XLSX.read(fs.readFileSync(filePath), { type: 'buffer', raw: false })
  const ws = wb.Sheets[wb.SheetNames[0]]
  const sheet = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1, raw: false, defval: '' })

  const parsed = await parseRentRoll(sheet, { skipGemini: skipGemini || !process.env.GEMINI_API_KEY })
  if (parsed.error) {
    console.error(`PARSE ERROR: ${parsed.error}`)
    process.exit(1)
  }

  const addresses = [...new Set(parsed.rows.map((r) => r.address).filter((a): a is string => !!a))]
    .slice(0, Number.isFinite(limit) ? limit : undefined)

  console.log(`File: ${filePath}`)
  console.log(`Resolving ${addresses.length} distinct addresses (sequential, read-only)...\n`)

  const results: ImportResolution[] = []
  const started = Date.now()
  let i = 0
  for (const addr of addresses) {
    i++
    const t0 = Date.now()
    const res = await resolveImportAddress(addr)
    results.push(res)
    if (i % 25 === 0 || i === addresses.length) {
      const perAddr = (Date.now() - started) / i
      console.log(
        `  ${i}/${addresses.length} (${Math.round(perAddr)} ms/addr, last: "${addr}" -> ${res.match} in ${Date.now() - t0} ms)`
      )
    }
  }
  const elapsed = Date.now() - started

  const byGrade: Record<string, ImportResolution[]> = {}
  for (const r of results) {
    ;(byGrade[r.match] ??= []).push(r)
  }

  console.log(`\n=== RESULTS (${elapsed} ms total, ${Math.round(elapsed / results.length)} ms/addr) ===`)
  for (const grade of ['verified', 'range', 'nearest', 'no_match']) {
    console.log(`  ${grade.padEnd(9)}: ${byGrade[grade]?.length ?? 0}`)
  }
  const withErrors = results.filter((r) => r.error)
  console.log(`  errors   : ${withErrors.length}`)

  const show = (grade: string, n: number) => {
    const list = byGrade[grade] ?? []
    if (list.length === 0) return
    console.log(`\n--- ${grade.toUpperCase()} (${list.length}) ---`)
    for (const r of list.slice(0, n)) {
      console.log(
        `  "${r.raw_address}" -> "${r.canonical_address}" pins=${r.pins.length}` +
        ` range="${r.address_range ?? ''}" class=${r.property_class} yr=${r.year_built}` +
        ` val=${r.implied_value}` +
        (r.nearest_distance !== null ? ` (nearest dist ${r.nearest_distance})` : '') +
        (r.nearest_suggestion && r.match === 'no_match' ? ` suggestion="${r.nearest_suggestion}"` : '') +
        (r.error ? ` ERROR: ${r.error}` : '')
      )
    }
    if (list.length > n) console.log(`  ... and ${list.length - n} more`)
  }

  show('range', 8)
  show('nearest', 20)
  show('no_match', 30)
  show('verified', 5)

  const outPath = path.join('scripts', 'test-rentroll-resolve.out.json')
  fs.writeFileSync(outPath, JSON.stringify(results, null, 2))
  console.log(`\nFull output written to ${outPath} (gitignored)`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
