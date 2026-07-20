// app/api/dashboard/import/start/route.ts
//
// Rent-roll upload, step 1: receive the sheet grid (parsed client-side by
// SheetJS — the file itself never reaches the server), run the parse layer
// (lib/rentroll/parse.ts: Gemini column map → deterministic extraction →
// Gemini rescue), and create an import_jobs row whose resolve_queue holds the
// distinct addresses awaiting resolution. The browser then drives
// /api/dashboard/import/process until the queue drains, mirroring the
// backfill_jobs pattern.
//
// Like /api/dashboard/stage, this requires only a signed-in user — importing
// is free and unlimited; entitlement is decided at commit time.

import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { parseRentRoll } from '@/lib/rentroll/parse'
import { sanitizeCell } from '@/lib/rentroll/extract'
import { MAX_SHEET_COLS, MAX_SHEET_ROWS } from '@/lib/rentroll/types'

export const runtime = 'nodejs'
export const maxDuration = 30

export async function POST(request: Request) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: { file_name?: unknown; file_kind?: unknown; sheet?: unknown }
  try {
    body = (await request.json()) as typeof body
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  // Never trust the browser: re-validate shape and size before any work.
  const sheet = body.sheet
  if (!Array.isArray(sheet) || sheet.length === 0 || !sheet.every(Array.isArray)) {
    return NextResponse.json({ error: 'Missing or malformed sheet' }, { status: 400 })
  }
  if (sheet.length > MAX_SHEET_ROWS) {
    return NextResponse.json(
      { error: `File has too many rows (limit ${MAX_SHEET_ROWS})` },
      { status: 413 }
    )
  }
  if (sheet.some((r: unknown[]) => r.length > MAX_SHEET_COLS)) {
    return NextResponse.json(
      { error: `File has too many columns (limit ${MAX_SHEET_COLS})` },
      { status: 413 }
    )
  }
  const grid: string[][] = (sheet as unknown[][]).map((r) => r.map(sanitizeCell))

  const fileKind = body.file_kind === 'xlsx' ? 'xlsx' : 'csv'
  const fileName = sanitizeCell(body.file_name).slice(0, 120) || null

  const result = await parseRentRoll(grid)
  if (result.error || !result.columnMap || !result.stats) {
    return NextResponse.json({ error: result.error ?? 'Parse failed' }, { status: 422 })
  }

  // Distinct addresses awaiting resolution (summary/unparsed rows have none;
  // non-Chicago rows are default-excluded and resolution only knows Chicago
  // parcels, so resolving them would waste ~2.5s each for guaranteed misses).
  const resolveQueue = [...new Set(
    result.rows
      .filter((r) => !r.flags.includes('non_chicago'))
      .map((r) => r.address)
      .filter((a): a is string => !!a)
  )]

  if (resolveQueue.length === 0) {
    return NextResponse.json(
      { error: 'No addresses found in the file. Check that it has a Property/Address column.' },
      { status: 422 }
    )
  }

  const supabase = getSupabaseAdmin()
  const { data: job, error: jobErr } = await supabase
    .from('import_jobs')
    .insert({
      clerk_id: userId,
      file_name: fileName,
      file_kind: fileKind,
      column_map: result.columnMap,
      parsed_rows: result.rows,
      resolve_queue: resolveQueue,
      results: [],
      total_count: resolveQueue.length,
      processed_count: 0,
      failed_count: 0,
      status: 'pending',
    })
    .select('id')
    .single()

  if (jobErr || !job) {
    return NextResponse.json({ error: jobErr?.message ?? 'Failed to create job' }, { status: 500 })
  }

  return NextResponse.json({
    job_id: (job as { id: string }).id,
    stats: result.stats,
    column_map_source: result.columnMap.source,
    total: resolveQueue.length,
    processed: 0,
    status: 'pending',
  })
}
