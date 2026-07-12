-- Rent-roll upload feature — Phase 1 migration (scoped 2026-07-12).
-- Two tables: import_jobs (the upload/parse/resolve job) and
-- staged_property_units (real unit detail parked through checkout).
--
-- ============================================================================
-- import_jobs: one row per rent-roll upload.
--
-- The file is parsed CLIENT-SIDE (SheetJS); only extracted JSON rows reach the
-- server — the file itself is never stored. Mirrors the backfill_jobs chunked
-- pattern: /api/dashboard/import/start creates the job, the browser drives
-- /api/dashboard/import/process which resolves a chunk of addresses per call
-- through the existing fetchProperty/fetchSiblingPins stack and moves them
-- from resolve_queue into results.
--
-- Lifecycle:
--   pending   → job created, parsed_rows stored, resolve_queue built
--   resolving → browser loop is processing chunks
--   review    → all addresses resolved; user is on the review screen
--   committed → user confirmed; rows written to staged_properties +
--               staged_property_units, job is done
--   error     → unrecoverable failure (error_message set)
-- Abandoned jobs just stop advancing; a fresh upload creates a new job.
--
-- JSONB shapes (enforced in TypeScript, documented here):
--   column_map  — Gemini's header mapping, e.g.
--                 {"address":"Property Name","unit":"Unit","rent":"Rent", ...}
--   parsed_rows — array of extracted unit rows:
--                 {row_num, raw_address, unit_label, bd_ba, rent, status,
--                  lease_from, lease_to, move_in, move_out, flags[]}
--                 flags: 'junk_prefix' | 'summary_row' | 'llm_rescued' |
--                        'unit_in_address' | 'dual_range' | 'unparsed'
--   resolve_queue — distinct raw addresses not yet resolved
--   results     — one entry per resolved address:
--                 {raw_address, match: 'verified'|'range'|'nearest'|'no_match',
--                  canonical_address, slug, pins[], address_range,
--                  additional_streets[], sqft, year_built, implied_value,
--                  community_area, property_class}
--                 (the staged_properties snapshot payload, so commit = row copy)
--
-- Access: service-role only via API routes (RLS enabled, zero policies),
-- matching staged_properties.

create table public.import_jobs (
  id uuid primary key default gen_random_uuid(),
  clerk_id text not null,

  -- upload provenance (metadata only — the file itself is never stored)
  file_name text,
  file_kind text check (file_kind in ('csv', 'xlsx')),

  -- parse output
  column_map jsonb,
  parsed_rows jsonb not null default '[]'::jsonb,

  -- chunked resolution state
  resolve_queue jsonb not null default '[]'::jsonb,
  results jsonb not null default '[]'::jsonb,
  total_count integer not null default 0,
  processed_count integer not null default 0,
  failed_count integer not null default 0,

  status text not null default 'pending'
    check (status in ('pending', 'resolving', 'review', 'committed', 'error')),
  error_message text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

create index import_jobs_clerk_status_idx
  on public.import_jobs (clerk_id, status, created_at desc);

create index import_jobs_active_idx
  on public.import_jobs (status, created_at)
  where status in ('pending', 'resolving', 'review');

alter table public.import_jobs enable row level security;
-- No policies on purpose: service-role-only access via API routes.

-- ============================================================================
-- staged_property_units: real unit detail from a rent roll, parked alongside
-- its staged_properties row so it survives the Stripe checkout round-trip.
--
-- Written at import commit (one row per confirmed unit). Consumed by
-- promoteRows() in lib/staged-promotion.ts: when a staged row promotes and
-- staged_property_units rows exist for it, they are copied into
-- portfolio_property_units (source 'rent_roll') INSTEAD of the synthetic
-- "Unit 1..N" self_reported rows. Columns mirror portfolio_property_units
-- (minus tag/ob_date, which a rent roll does not provide).
--
-- on delete cascade: removing a property from the staging queue deletes its
-- parked units with it.
--
-- Access: service-role only via API routes (RLS enabled, zero policies).

create table public.staged_property_units (
  id uuid primary key default gen_random_uuid(),
  staged_property_id uuid not null
    references public.staged_properties(id) on delete cascade,

  unit_label text,
  bd_ba text,
  status text,                        -- rent-roll occupancy status, verbatim ("Current", "Vacant-Unrented", ...)
  rent numeric,
  lease_from date,
  lease_to date,
  move_in date,
  move_out date,

  source text not null default 'rent_roll',
  created_at timestamptz not null default now()
);

create index staged_property_units_staged_idx
  on public.staged_property_units (staged_property_id);

alter table public.staged_property_units enable row level security;
-- No policies on purpose: service-role-only access via API routes.
