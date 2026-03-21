/**
 * manual-building-addresses.ts
 *
 * Manual building definitions for large address-range buildings where:
 *   (a) The Cook County Assessor stores only one address per parcel (the low address),
 *       so any other entrance address fails the Assessor lookup entirely.
 *   (b) The building has multiple street entrances on different streets (e.g. La Salle + Elm St),
 *       which Path C (mailing name + same street) can never resolve since it only searches one street.
 *
 * HOW THIS IS USED
 *   fetchProperty Tier 2.5 — if the searched address matches any address in allAddresses,
 *   the property is fetched using canonicalAddress to get a valid PIN.
 *
 *   fetchSiblingPins Path D — if the searched address matches any address in allAddresses:
 *     - Uses allAddresses as siblingAddresses for fan-out queries (complaints/violations/permits)
 *     - Uses displayAddresses for buildAddressRange (the banner text)
 *     - ALSO runs mailing name lookup to collect all sibling PINs (e.g. all condo unit PINs)
 *
 * HOW TO ADD AN ENTRY
 *   1. Find canonical address: search cookcountyassessor.com, confirm in properties:
 *        SELECT pin, address FROM properties WHERE address = 'CANONICAL ADDRESS';
 *   2. Get all entrances: search webapps1.chicago.gov/buildingrecords (RANGE ADDRESS section).
 *   3. allAddresses — every known address variant for matching and fan-out queries.
 *      Include all spelling variants (LA SALLE vs LASALLE, ST vs DR).
 *   4. displayAddresses — canonical-form addresses only, used for the banner.
 *      One form per street, no spelling duplicates. buildAddressRange groups these into
 *      "1112–1134 N LA SALLE ST & 153–163 W ELM ST".
 *   5. canonicalAddress must exactly match properties.address — verify with SQL first.
 */

export type ManualBuildingEntry = {
    /** Exact address string as stored in properties.address — used for PIN lookup */
    canonicalAddress: string
    /**
     * ALL known entrance addresses including spelling variants.
     * Used for: (a) matching any searched address to this building,
     *           (b) fan-out queries against complaints_311, violations, permits.
     */
    allAddresses: string[]
    /**
     * Canonical-form addresses for banner display only.
     * One form per street, no spelling duplicates.
     * buildAddressRange() will group these into "1112–1134 N LA SALLE ST & 153–163 W ELM ST".
     */
    displayAddresses: string[]
    note?: string
  }
  
  export const MANUAL_BUILDING_ADDRESSES: ManualBuildingEntry[] = [
    // ─── 5532–5540 S Hyde Park Blvd ──────────────────────────────────────────
    // Large apartment building, Hyde Park. Single parcel PIN: 20131010190000.
    // Assessor stores under "5532 E HYDE PARK BLVD" (E direction).
    // DOB/city operational systems use S direction for any entrance in the range.
    // Building record: 5532-5540 S HYDE PARK BLVD
    {
      canonicalAddress: '5532 E HYDE PARK BLVD',
      allAddresses: [
        '5532 E HYDE PARK BLVD',
        '5532 S HYDE PARK BLVD',
        '5534 S HYDE PARK BLVD',
        '5536 S HYDE PARK BLVD',
        '5538 S HYDE PARK BLVD',
        '5540 S HYDE PARK BLVD',
      ],
      displayAddresses: [
        '5532 S HYDE PARK BLVD',
        '5534 S HYDE PARK BLVD',
        '5536 S HYDE PARK BLVD',
        '5538 S HYDE PARK BLVD',
        '5540 S HYDE PARK BLVD',
      ],
      note: '5532-5540 S Hyde Park Blvd — Assessor uses E direction; DOB uses S; single parcel',
    },
  
    // ─── 1112–1134 N La Salle St / 153–163 W Elm St ──────────────────────────
    // Large condo building, Near North Side. Multiple unit PINs all under mailing
    // name "1120 N LASALLE LLC" — Path D also does mailing name lookup to collect
    // all unit PINs for correct assessed value aggregation.
    // Assessor stores all units under "1120 N LA SALLE ST" (ST suffix, verified).
    // Building records: 1112-1134 N LA SALLE DR | 153-163 W ELM ST
    // Note: DOB range address uses DR; Assessor uses ST. All variants in allAddresses.
    {
      canonicalAddress: '1120 N LA SALLE ST',
      allAddresses: [
        // ST suffix — Assessor form (two words)
        '1112 N LA SALLE ST', '1114 N LA SALLE ST', '1116 N LA SALLE ST',
        '1118 N LA SALLE ST', '1120 N LA SALLE ST', '1122 N LA SALLE ST',
        '1124 N LA SALLE ST', '1126 N LA SALLE ST', '1128 N LA SALLE ST',
        '1130 N LA SALLE ST', '1132 N LA SALLE ST', '1134 N LA SALLE ST',
        // ST suffix — city operational form (one word)
        '1112 N LASALLE ST', '1114 N LASALLE ST', '1116 N LASALLE ST',
        '1118 N LASALLE ST', '1120 N LASALLE ST', '1122 N LASALLE ST',
        '1124 N LASALLE ST', '1126 N LASALLE ST', '1128 N LASALLE ST',
        '1130 N LASALLE ST', '1132 N LASALLE ST', '1134 N LASALLE ST',
        // DR suffix — DOB range address form (two words)
        '1112 N LA SALLE DR', '1114 N LA SALLE DR', '1116 N LA SALLE DR',
        '1118 N LA SALLE DR', '1120 N LA SALLE DR', '1122 N LA SALLE DR',
        '1124 N LA SALLE DR', '1126 N LA SALLE DR', '1128 N LA SALLE DR',
        '1130 N LA SALLE DR', '1132 N LA SALLE DR', '1134 N LA SALLE DR',
        // DR suffix — city operational form (one word)
        '1112 N LASALLE DR', '1114 N LASALLE DR', '1116 N LASALLE DR',
        '1118 N LASALLE DR', '1120 N LASALLE DR', '1122 N LASALLE DR',
        '1124 N LASALLE DR', '1126 N LASALLE DR', '1128 N LASALLE DR',
        '1130 N LASALLE DR', '1132 N LASALLE DR', '1134 N LASALLE DR',
        // Elm St entrances
        '153 W ELM ST', '155 W ELM ST', '157 W ELM ST',
        '159 W ELM ST', '161 W ELM ST', '163 W ELM ST',
      ],
      displayAddresses: [
        // One canonical form per street for clean banner display
        '1112 N LA SALLE ST', '1114 N LA SALLE ST', '1116 N LA SALLE ST',
        '1118 N LA SALLE ST', '1120 N LA SALLE ST', '1122 N LA SALLE ST',
        '1124 N LA SALLE ST', '1126 N LA SALLE ST', '1128 N LA SALLE ST',
        '1130 N LA SALLE ST', '1132 N LA SALLE ST', '1134 N LA SALLE ST',
        '153 W ELM ST', '155 W ELM ST', '157 W ELM ST',
        '159 W ELM ST', '161 W ELM ST', '163 W ELM ST',
      ],
      note: '1112-1134 N La Salle St / 153-163 W Elm St — condo building; mailing name: 1120 N LASALLE LLC',
    },
  ]
  
  // Build O(1) lookup map at module load time
  const _addressToEntry = new Map<string, ManualBuildingEntry>()
  for (const entry of MANUAL_BUILDING_ADDRESSES) {
    for (const addr of entry.allAddresses) {
      _addressToEntry.set(addr, entry)
    }
  }
  
  /**
   * Look up a normalized address in the manual building table.
   * Returns the full ManualBuildingEntry if found, null otherwise.
   */
  export function findManualBuilding(normalizedAddress: string): ManualBuildingEntry | null {
    return _addressToEntry.get(normalizedAddress) ?? null
  }