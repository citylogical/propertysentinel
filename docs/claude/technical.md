# Technical Scope — Claude Code Reference
*Rewritten July 12, 2026. Read alongside CLAUDE.md; this file covers worker,
backfill, and dataset detail that CLAUDE.md summarizes or omits.*

<!-- Resolve [VERIFY] markers against source, then delete them. -->

## Worker architecture (repo: property-sentinel-workers, Railway)

- **Worker A** — 30-min cadence. Citywide 311 ingestion (Socrata), Aura
  enrichment (`.range()` selection, cap 400, bounded no-match retry: 5 attempts
  / 24h ceiling / 20-min spacing), paraphrase via Gemini `gemini-2.5-flash-lite`
  with transient-503 retry, plus a paraphrase-catchup pass (30/cycle,
  oldest-first) at the end of every cycle. Runs as Railway service
  `satisfied-reverence` — NEVER MODIFY except by explicit instruction.
  A pg_cron two-step PIN backfill runs at :02/:32.
- **Worker B** — [VERIFY: current role — old doc claimed health-score
  recomputation; confirm against worker source and whether it still runs]
- **Worker C** — nightly, 22:00 UTC. Three phases, in this order:
  Phase 2 (citywide status sync) → Phase 1 (WOLI refresh for open enriched
  portfolio complaints via `get_portfolio_complaint_ids` RPC) → Phase 3
  (portfolio stats refresh).
- Proxy segregation: Socrata traffic via `SOCRATA_PROXY_URL` (residential ISP);
  Aura enrichment via `AURA_PROXY_URL`. Never cross the streams.
- Railway crons run in UTC with no timezone setting. Vercel cron drift observed
  up to ~46 minutes — never assume punctual execution.
- Direct psycopg2 from Railway → Supabase is unreliable; use `supabase.rpc()`
  over PostgREST HTTP.
- Aura `fwuid` rotates on Salesforce deploys — auto-detected via `aura_state`.

## Backfill pattern (never deviate)

All backfills follow the `assessed_values.py` reference implementation:
keyset pagination, inline resume via MAX(), `upsert_with_retry(retries=3,
delay=15)`, 10,000-row fetch / 500-row upsert sub-batches, 0.5s throttle,
90s timeout.

## Supabase gotchas (supplementing CLAUDE.md's footgun list)

- Use `.is_("pin", None)` not `.is_("pin", "null")` for NULL filtering.
- `properties` table: column is `zip` not `zip_code`; there IS a `ward` column
  [VERIFY: old doc said no ward column; current schema notes say ward exists —
  check the actual table definition and correct this line]
- Portfolio-wide activity/summary queries fan out with
  `.in('address_normalized', …)`. Large address sets can exceed PostgREST URL
  limits; `chunkedIn` in `lib/portfolio-stats.ts` batches those `.in()` calls.
  **Deferred improvement:** replace with three stored functions
  (`get_portfolio_complaints`, `get_portfolio_violations`,
  `get_portfolio_permits`) taking `text[]` via `supabase.rpc` for fixed-size
  request bodies.

## Address resolution (corrected — the old doc described a route that does not exist)

There is no `/api/resolve-address` route. Resolution is lib-level server code:
`lib/supabase-search.ts` (`fetchSiblingPins`) and `lib/address-resolution.ts`
match `properties.address_normalized` (exact + unit-suffix prefix
`LIKE '<addr> %'`) to PINs; all data queries fan out by PIN. `parcel_universe`
is queried by PIN for geo/ward/class metadata — never for address→PIN.
Multi-address PINs exist (e.g. 5532-5540 S Hyde Park Blvd = one PIN, five rows).

## Key dataset IDs (browser-verify before any backfill)

- 311 complaints: `v6vf-nfxy`
- BACP Shared Housing registrations: `qfyy-956j`
- BACP Business Licenses: `r5kz-chrr`
- Property chars residential: `x54s-btds`
- Parcel universe: `nj4t-kc8j`
- Building Violations: `22u3-xenr`
- Prohibited Buildings List: `7bzs-jsyj`
- RRZ precincts: `8eww-pamb`
- Chicago neighborhoods (PostGIS polygons): `y6yq-dbs2`

## CRITICAL: dataset ID verification

Claude is explicitly overconfident with Socrata dataset IDs. ALWAYS
browser-verify dataset IDs before writing or running any backfill. The
parcel_universe incident (wrong dataset ID, all enrichment fields NULL,
required truncate + re-run) is the documented reason for this rule.