Context for Claude Code:
The property page correctly fetches and displays 311 complaints, building violations, and permits — all of which are looked up by address string against the Chicago Data Portal / our ingested tables.
The problem is with property characteristics — assessed values, property class, unit count, building characteristics, taxpayer of record — which require a PIN (Cook County parcel identification number) to query. The PIN lookup is broken or returning no results, so the property characteristics section of the page is empty or not rendering.
The core architectural issue is address-to-PIN resolution.
The resolution chain is supposed to work like this:

User enters an address (e.g. "2847 N Kedzie Ave")
/api/resolve-address queries parcel_universe.address_normalized to find the matching PIN
The PIN is returned along with any sibling addresses (for multi-address buildings where one PIN spans multiple address rows)
All downstream data queries — assessed values, property characteristics, taxpayer of record — fan out using that PIN

What's likely broken:
The address normalization matching between what the user enters and what's stored in parcel_universe.address_normalized is probably failing silently. The parcel_universe table was truncated and re-run after an initial dataset ID error — during that incident all enrichment fields came back NULL, and it's possible the address normalization or PIN population didn't complete correctly.
Specific things to investigate:

Query parcel_universe directly for a known address — e.g. SELECT * FROM parcel_universe WHERE address_normalized ILIKE '%2847%KEDZIE%' LIMIT 10 — and check whether rows exist, whether pin is populated or NULL, and whether address_normalized is in the format the resolver expects
Check the /api/resolve-address route — look at what format it expects the input address, how it's normalizing the query string before hitting the database, and what it returns when no match is found. Is it failing silently with an empty response, or throwing an error?
Check whether the PIN returned by resolve-address is being correctly passed to the property characteristics queries downstream. It's possible the resolver is working but the PIN isn't being threaded through to the right fetch calls on the property page
Check property_chars_residential — query it directly with a known Chicago PIN and confirm rows exist with non-NULL values. If that table is empty or PINs are formatted differently (with vs without dashes, leading zeros, etc.) the join will fail even if address resolution is working
PIN format mismatch is a common culprit — Cook County PINs appear as 13-25-418-012-0000 with dashes in some datasets and 1325418012 without dashes in others. Confirm that the PIN format returned by parcel_universe matches exactly what property_chars_residential expects
Check assessed_values with the same PIN — if assessed values also aren't showing, the PIN resolution is the problem. If assessed values show but property chars don't, the problem is downstream in the property chars query specifically

The known history:

parcel_universe dataset nj4t-kc8j was truncated and re-run after an initial load used the wrong dataset ID — verify the current row count is ~3.7M rows and that pin is populated on a sample of rows
property_chars_residential dataset x54s-btds covers 2022–2025, ~5–6M rows, keyset on pin — verify row count and PIN population
assessed_values covers 2017–2025, ~14M rows — this is the canonical reference table and should definitely have PIN data

What success looks like:
A single address entered by the user correctly resolves to a PIN, and that PIN successfully pulls property class, unit count, assessed value history, building characteristics, and taxpayer of record from the relevant tables. Right now none of that is rendering on the property page.