# Property Sentinel — Claude Code Context

## Project

propertysentinel.io — Chicago property intelligence and monitoring SaaS built on a
proprietary Salesforce Aura enrichment pipeline (complaint narratives, intake Q&A,
workflow timelines, and dispositions not available in the public Socrata feed).
Live Stripe billing (30-day trial, card upfront), live Clerk auth, daily email
digest via Resend. Anchor customer in trial. Built and operated solo by James
(licensed CPA). Parent: City Logical LLC.

## Repos

- **`propertysentinel`** (this repo) — Next.js frontend, Vercel
- **`property-sentinel-workers`** — Python workers, Railway. Separate repo; Railway
  service `satisfied-reverence` (Worker A) is NEVER MODIFIED except by explicit
  instruction — it is the live ingest loop.

## Tech stack

- Next.js 16 (App Router) + TypeScript, deployed on Vercel
- Supabase (PostgreSQL + PostGIS), accessed via PostgREST client
- Clerk (auth) → `subscribers` table synced by webhook; Stripe (live mode);
  Resend (`propertysentinel.io`, root domain — replaced `updates.` subdomain
  2026-07-13); Gemini `gemini-2.5-flash-lite` paid
  tier (paraphrase)
- Styling: plain CSS with custom-property tokens in `app/globals.css` — no
  component libraries. Tailwind v4 is installed and imported
  (`@import "tailwindcss"` + `@tailwindcss/postcss`), but only its preflight
  plus a handful of utility classes in ~6 nav/admin files are in use — all real
  styling is the custom CSS, and several globals.css rules exist specifically
  to beat Tailwind preflight.

## Working conventions

- **Scope before implementation.** Talk through the problem and read the relevant
  source before writing code. James approves scope; do not expand it unilaterally.
- **Never reason from memory about schema, column names, or API behavior.** Read
  the actual source, type definition, or migration first.
- Deliver changes as exact find-and-replace edits — state which code to find and
  which code to replace it with. One file at a time. Compile between edits.
  Commit after every chunk that compiles.
- React components must be runtime-executed before delivery — an ad-hoc
  jsdom/node harness is fine (none is committed to the repo); `tsc` alone is
  insufficient. Watch apostrophe escaping, TDZ ordering, hydration mismatches.
- Any component that can render publicly takes an `isAdmin` prop, default false.
  Server-side admin check: Clerk userId → `subscribers.role`.

## Design system (sourced from globals.css — the CSS is ground truth)

- Navy `#0f2744` primary / `#1a3a5c` hover; page bg `#f0f0ed`; cards white with
  `#e5e1d6` or `#ddd9d0` borders. Borders are the entire elevation system — no
  shadows.
- Status triplet (text + 8% fill + 20% border): open `#c0392b`, completed
  `#2d6a4f`, warning `#b7791f`. Stop-work: solid `#c8102e` + white text.
- Save/bookmark is GREEN `#166534`, not red. Amber CTA `#e8a84a` on navy banners.
- Fonts: **Merriweather** (headings, brand — the canonical serif), **DM Sans**
  (`--sans`, the site-wide body default), **Inter** (scoped sans: `.address-page`,
  nav dropdown items, profile scope), **DM Mono** (labels, SR numbers, PINs,
  dates — uppercase, tracked). Playfair is legacy only — scoped `.address-page`
  rules and `--profile-serif`; never use it in new work.
- Charts are Tufte-aligned: gray by default, color only for encoding, no
  gridlines, no rounded corners, sparklines navy 1px with red endpoint dot.
- Grid background on homepage ONLY. `.property-identity-row` is the canonical
  page header pattern. Line icons only, never filled. Sentence case body text.

## Data model (Supabase)

Key tables (names verified against query code, Jul 2026):

- `complaints_311` — 13M+ rows. Enrichment columns incl. `enrich_attempts`,
  `last_enrich_attempt_at`. Worker A syncs on a 30-min cadence.
- `violations`, `permits` — DOB violations and permit history (incl.
  `is_roof_permit`, stop-work flags)
- `parcel_universe` — 1.86M parcels, lat/lng + ward/CA + class metadata,
  queried by PIN. `parcel_universe.lat/lng` is populated; `properties.lat/lng`
  is NULL — always use parcel_universe for geo lookups.
- `properties`, `portfolio_properties` (`canonical_address` often carries a unit
  suffix), `subscribers`, `staged_properties`
- `assessed_values` (no address fields), `property_chars_residential`,
  `property_chars_condo` (condo class 299: `year_built` lives here),
  `chicago_neighborhoods` (PostGIS, `lookup_chicago_neighborhood(lat,lng)`)
- `worker_a_runs`, `status_page_cache` (singleton id=1, JSONB)

Address resolution is lib-level server code, not an API route:
`lib/supabase-search.ts` (`fetchSiblingPins`) and `lib/address-resolution.ts`
match `properties.address_normalized` (exact + unit-suffix prefix
`LIKE '<addr> %'`) to PINs; all data queries fan out by PIN. `parcel_universe`
is never used for address→PIN.

`lib/sr-catalog.ts` is the TS source of truth for the ~40 enrichable SR codes;
the Python worker carries a parallel copy — keep in sync manually.

## Footguns (learned the hard way — do not relearn)

- PostgREST `.limit()` silently truncates below the requested value. Use
  `.range()` for every large-table selection. This has caused two production
  bugs.
- `complaints_311.created_date` is Chicago wall-clock stored with a FALSE
  `+00:00` suffix — it is NOT UTC. Slice to 19 chars; never timezone-convert it.
- Aura responses always include `"error": []`, which is truthy in JS. Check
  `Array.isArray(a.error) && a.error.length > 0`.
- `work_order_steps` (sorted JSONB) is the canonical workflow timeline;
  `workflow_step` text only when the array is empty. `final_outcome` can be
  null on closed complaints — a bare "Closed" node is correct.
- "Owner's Responsibility" outcome is `productive`, NOT `jurisdiction`.
- Google Maps loads ONLY through `lib/google-maps-loader.ts` and the shared
  `lib/use-address-autocomplete.ts` hook — independent loading breaks
  autocomplete.
- Bulk deletes: `DELETE FROM t WHERE id IS NOT NULL` — never TRUNCATE (service
  role doesn't own sequences).
- `CREATE INDEX CONCURRENTLY` always on large tables; one statement, never in a
  transaction; prefer partial indexes.
- Blog content rules are scoped under `.blog-post-content` in globals.css;
  `remarkGfm` is required for table rendering.
- Never use localStorage/sessionStorage.
- Socrata dataset IDs must be browser-verified before any backfill (311 is
  `v6vf-nfxy`).

## Never do

- Never modify Worker A (`satisfied-reverence`) or its imported modules without
  explicit instruction.
- Never run migrations against production Supabase without explicit instruction.
- Never touch Stripe checkout/webhook logic, trial_end computation, or the
  Clerk↔Supabase sync outside an explicitly approved task.
- Never expand Tailwind usage beyond the existing preflight + scattered
  utilities, and never add a component library — all new styling goes in the
  custom CSS token system.
- Always match the design system exactly — when in doubt, read globals.css.

## Extended context

- `docs/claude/technical.md` — architecture detail
- `docs/claude/products.md` — product and pricing detail
- `docs/sql/supabase-schema-2026-07-12.csv` and
  `docs/sql/supabase-indexes-2026-07-12.csv` — full public-schema dump
  (columns per table; indexes/unique constraints per table). Check these before
  reasoning about any table; re-dump and re-date after schema changes.

Read these when working on features that touch the database, workers, billing,
or the dashboard's insights compute model.