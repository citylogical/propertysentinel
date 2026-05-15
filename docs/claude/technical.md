# Technical Scope — Claude Code Reference

## Worker Architecture
- Worker A: 15-min cron, ingests 311 complaints, two-step PIN backfill
- Worker B: Health score recomputation
- The "satisfied-reverence" Railway worker must NEVER be modified

## Backfill Pattern (never deviate)
All backfills follow assessed_values.py reference implementation:
keyset pagination, inline resume via MAX(), upsert_with_retry(retries=3, delay=15),
10,000-row fetch / 500-row upsert sub-batches, 0.5s throttle, 90s timeout

## Supabase Gotchas
- Use .is_("pin", None) not .is_("pin", "null") for NULL filtering
- Socrata timestamps: slice to 19 chars before parsing
- properties table: column is zip not zip_code, no ward column
- Never run migrations against production without explicit instruction
- **Deferred:** Portfolio-wide activity/summary queries fan out with `.in('address_normalized', …)`. Large address sets can exceed PostgREST URL limits; `chunkedIn` in `lib/portfolio-stats.ts` batches those `.in()` calls. Long-term, replace with three stored functions (`get_portfolio_complaints`, `get_portfolio_violations`, `get_portfolio_permits`) taking `text[]` and invoked via `supabase.rpc` for fixed-size request bodies.

## Address Resolution
- /api/resolve-address queries parcel_universe.address_normalized
- Returns PIN + sibling addresses for multi-address buildings
- All data queries fan out by PIN after resolution
- Multi-address PINs exist (e.g. 5532-5540 S Hyde Park Blvd = one PIN, five rows)

## Key Dataset IDs (verify before any backfill)
- 311 complaints: v6vf-nfxy
- BACP Shared Housing registrations: qfyy-956j
- BACP Business Licenses: r5kz-chrr
- Property chars residential: x54s-btds
- Parcel universe: nj4t-kc8j
- Building Violations: 22u3-xenr
- Prohibited Buildings List: 7bzs-jsyj
- RRZ precincts: 8eww-pamb

## CRITICAL: Dataset ID Verification
Claude is explicitly overconfident with Socrata dataset IDs.
ALWAYS browser-verify dataset IDs before writing or running any backfill.
The parcel_universe incident (wrong dataset, all enrichment fields NULL,
required truncate + re-run) is the documented reason for this rule.