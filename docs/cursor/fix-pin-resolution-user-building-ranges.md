# Cursor Prompt: Fix PIN resolution to check sibling addresses from user_building_ranges

**Problem:** When a user searches an address that has no PIN in the `properties` table (e.g., 4753 N Monticello Ave), the property page shows "NO ASSESSOR RECORD AT THIS ADDRESS" even when the address has an approved building range in `user_building_ranges` and a sibling address in that range DOES have a PIN (e.g., 3623 W Lawrence Ave → PIN 13141060010000). Complaints fan out correctly through the range, but the property details panel (class, assessed value, implied market value) does not.

**Root cause:** The PIN resolution logic only checks the searched address for a PIN. It does not fall through to checking sibling addresses derived from `user_building_ranges`.

**Fix:** After the initial PIN lookup fails for the searched address, check if the address has an approved building range. If it does, generate the sibling addresses from all street ranges, query `properties` for any sibling that has a non-null PIN, and use the first match as the canonical PIN for the property details panel.

**Logic to add (pseudocode):**

```
// After initial PIN lookup returns null for searchedAddress:

// 1. Check user_building_ranges for this address
const range = await supabase
  .from('user_building_ranges')
  .select('*')
  .eq('status', 'approved')
  .eq('searched_address', normalizedAddress)
  .maybeSingle();

// 2. If range exists, generate sibling addresses from street1_low/high, street2_low/high, etc.
//    (reuse existing siblingAddresses resolution logic from the complaints fan-out code)

// 3. Query properties for any sibling with a PIN
const { data: pinMatch } = await supabase
  .from('properties')
  .select('pin, address_normalized')
  .in('address_normalized', siblingAddresses)
  .not('pin', 'is', null)
  .limit(1)
  .single();

// 4. If pinMatch found, use pinMatch.pin as the canonical PIN
//    Pass it to the property details panel, assessed values lookup,
//    parcel_universe join, and property_chars queries
```

**Where to apply this:** The property page data fetching logic — wherever the PIN is first resolved from the searched address. This is likely in the server component or data-fetching function for `/address/[slug]`. Look for the code path that produces the "NO ASSESSOR RECORD" state. The fix goes between "searched address has no PIN" and "render no-record message."

**Important constraints:**

- The sibling address generation logic already exists somewhere in the codebase for the complaints fan-out. Reuse it — don't duplicate it. Look for where `siblingAddresses` or `fetchComplaintsByAddresses` is called in the `PropertyDataSections` component or its data layer.
- `properties.lat` / `properties.lng` are NULL on every row — do NOT use these. Coordinates come from `parcel_universe` joined on PIN.
- `assessed_values` PINs are stored without dashes, zero-padded to 14 digits. The join from `properties.pin` may need `REPLACE(pin, '-', '')`.
- `parcel_universe.class` is the correct source for property class, not `properties.property_class` (which doesn't exist).
- For assessed values, use `COALESCE(board_tot, certified_tot, mailed_tot)` — `board_tot` is null for 2025 (BOR still open). Pull `tax_year = 2024` for Chicago properties since that's the last reassessment year.
- The fix should be invisible to the user — the property page should render identically to how it would if the user had searched 3623 W Lawrence Ave directly. Same class, same assessed value, same implied market value. The only difference is the page title still shows the searched address (4753 N Monticello Ave).

**Test cases:**

1. Search `4753 N Monticello Ave` → should show Class 318, assessed value from PIN 13141060010000, implied market value ~$4.1M (from `property_chars_commercial`)
2. Search `3623 W Lawrence Ave` directly → should show identical property details (this already works)
3. Search any address with a PIN → behavior unchanged (the fallback only fires when initial PIN lookup returns null)
4. Search an address with no PIN and no building range → still shows "NO ASSESSOR RECORD" (no regression)

---

**Scope note:** This covers the property details panel fix. The same pattern should eventually apply to the Violations and Permits tabs too — the PropertyDataSections bug in the tech scope where the else branch doesn't fan out for sibling addresses. This prompt only fixes the PIN/property-details side. The complaints fan-out fix is a separate Cursor prompt.
