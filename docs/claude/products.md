# Product Context — Claude Code Reference
*Rewritten July 12, 2026. Supersedes the flat-building-fee STR pricing doc.*

<!-- Resolve [VERIFY] markers against source, then delete them. -->

## Property Sentinel

propertysentinel.io — Chicago property intelligence and compliance monitoring.
Segments: landlords and property managers (direct, self-serve), STR operators,
property tax attorneys, hard money lenders. Legal channel (attorney firms) is a
distinct buyer axis — flat-fee per-portfolio/firm plans, not per-unit. Anchor
customer: GC Realty & Development (~592 units, scattered-site).

## Pricing (current model — unit-based, self-reported)

Three tiers:

- **Basic** — free, search-only, no account required
- **Portfolio** — paid, unit-based. 7 unit bands × (monthly + annual) =
  14 Stripe prices. [VERIFY: pull actual band boundaries and price points from
  the Stripe price definitions / pricing page code and list them here]
- **Max** — custom, contact Jim

30-day trial anchored at Stripe Checkout, card captured upfront. Trial end is
computed from `trial_started_at` (day-30 Unix timestamp → `subscription_data.
trial_end` when ≥48h remain; lapsed users charged immediately).

Pricing-axis principle: per-unit for direct landlord/PM buyers; flat-fee for
the legal channel. Match the axis to the buyer's mental model.

## Chicago STR reference (figures as of early 2026 — recheck before citing)

- SHUOL: operator-level license, $250/year, required for 2+ units
- Unit registration: $125/unit/year, per listed unit
- Prohibited Buildings List: ~2,411 buildings where STR is prohibited
- RRZ: 52 precincts where STR density is capped
- ~8,660 active Inside Airbnb listings; ~660 buildings on the scofflaw list
- Airbnb deliberately scrambles listing coordinates up to ~200m

## Adjacent product surfaces (context only — none are build authorizations)

Realtor diligence reports, insurance underwriting data feed (Steadily-type
carriers), attorney vertical, contractor lookup, consumer browser extension.
Standing rule: validate with hand-built samples and real buyer conversations
before scoping any engineering work.