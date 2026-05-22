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
    pins?: string[]
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
    // ─── 1402–1408 W Belden Ave / 2300 N Southport Ave ───────────────────────
    // Condo building, Lincoln Park. Multiple unit PINs all under 2300 N SOUTHPORT AVE.
    // Belden Ave entrances have no independent Assessor records — resolved via Southport.
    // Building records: 1402-1408 W BELDEN AVE | 2300 N SOUTHPORT AVE
    {
      canonicalAddress: '2300 N SOUTHPORT AVE',
      allAddresses: [
        '2300 N SOUTHPORT AVE',
        '1402 W BELDEN AVE',
        '1404 W BELDEN AVE',
        '1406 W BELDEN AVE',
        '1408 W BELDEN AVE',
      ],
      displayAddresses: [
        '1402 W BELDEN AVE',
        '1404 W BELDEN AVE',
        '1406 W BELDEN AVE',
        '1408 W BELDEN AVE',
        '2300 N SOUTHPORT AVE',
      ],
      pins: [
        '14321030461001', '14321030461002', '14321030461003',
        '14321030461004', '14321030461005', '14321030461006',
        '14321030461007', '14321030461008', '14321030461009',
        '14321030461010',
      ],
      note: '1402-1408 W Belden Ave / 2300 N Southport Ave — condo building; Assessor stores all units under Southport address',
    },
    // ─── 609–645 W North Ave ──────────────────────────────────────────────────
    // Large mixed-use apartment building, Near North/Old Town.
    // Commercial on ground floor, residential above.
    // Assessor normalizes NORTH → N AVE. Multiple PINs across odd addresses.
    // Mailing name on primary PIN: 633 W NORTH OWNER LLC
    {
      canonicalAddress: '609 W NORTH AVE',
      allAddresses: [
        // Normalized form (NORTH → N)
        '609 W N AVE', '611 W N AVE', '613 W N AVE', '615 W N AVE',
        '617 W N AVE', '619 W N AVE', '621 W N AVE', '623 W N AVE',
        '625 W N AVE', '627 W N AVE', '629 W N AVE', '631 W N AVE',
        '633 W N AVE', '635 W N AVE', '637 W N AVE', '639 W N AVE',
        '641 W N AVE', '643 W N AVE', '645 W N AVE',
        // Full form (in case searched via slug or direct)
        '609 W NORTH AVE', '611 W NORTH AVE', '613 W NORTH AVE', '615 W NORTH AVE',
        '617 W NORTH AVE', '619 W NORTH AVE', '621 W NORTH AVE', '623 W NORTH AVE',
        '625 W NORTH AVE', '627 W NORTH AVE', '629 W NORTH AVE', '631 W NORTH AVE',
        '633 W NORTH AVE', '635 W NORTH AVE', '637 W NORTH AVE', '639 W NORTH AVE',
        '641 W NORTH AVE', '643 W NORTH AVE', '645 W NORTH AVE',
      ],
      displayAddresses: [
        '609 W NORTH AVE', '611 W NORTH AVE', '613 W NORTH AVE', '615 W NORTH AVE',
        '617 W NORTH AVE', '619 W NORTH AVE', '621 W NORTH AVE', '623 W NORTH AVE',
        '625 W NORTH AVE', '627 W NORTH AVE', '629 W NORTH AVE', '631 W NORTH AVE',
        '633 W NORTH AVE', '635 W NORTH AVE', '637 W NORTH AVE', '639 W NORTH AVE',
        '641 W NORTH AVE', '643 W NORTH AVE', '645 W NORTH AVE',
      ],
      pins: [
        '17041040180000', // 609
        '06344000090000', // 611
        '06344000080000', // 619
      ],
      note: '609-645 W North Ave — mixed-use apartment building; primary mailing: 633 W NORTH OWNER LLC; many addresses have no independent Assessor parcel',
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
    // ─── 1301–1309 N State Pkwy / 2–18 E Goethe St (Ambassador Chicago) ──────
    // Ambassador Hotel Chicago, Gold Coast. Corner building on N State Pkwy and E Goethe St.
    // CCAO stores all 3 confirmed PINs under "N STATE ST" (1301, 1303, 1305).
    // Marketed/postal address is "N STATE PKWY". Side entrances on E GOETHE ST.
    // 311 complaints split across PKWY and ST forms — verified via SQL:
    //   1301 N STATE PKWY: 29 complaints | 1301 N STATE ST: 14 complaints
    //   plus minor counts at 1303/1305/1307/1309 PKWY and 6/10 E GOETHE ST.
    // Mailing name: FHM AMBASSADOR EAST (3 PINs).
    {
      canonicalAddress: '1301 N STATE ST',
      allAddresses: [
        // Postal / marketed address (Pkwy) — 1301 through 1309
        '1301 N STATE PKWY', '1303 N STATE PKWY', '1305 N STATE PKWY',
        '1307 N STATE PKWY', '1309 N STATE PKWY',
        // CCAO address (St) — what's actually in our properties table
        '1301 N STATE ST', '1303 N STATE ST', '1305 N STATE ST',
        '1307 N STATE ST', '1309 N STATE ST',
        // Goethe side entrance — even numbers (south side of Goethe)
        '2 E GOETHE ST', '4 E GOETHE ST', '6 E GOETHE ST',
        '8 E GOETHE ST', '10 E GOETHE ST', '12 E GOETHE ST',
        '14 E GOETHE ST', '16 E GOETHE ST', '18 E GOETHE ST',
      ],
      displayAddresses: [
        // Pkwy form preferred for banner — matches how the hotel markets itself
        '1301 N STATE PKWY', '1303 N STATE PKWY', '1305 N STATE PKWY',
        '1307 N STATE PKWY', '1309 N STATE PKWY',
        '2 E GOETHE ST', '4 E GOETHE ST', '6 E GOETHE ST',
        '8 E GOETHE ST', '10 E GOETHE ST', '12 E GOETHE ST',
        '14 E GOETHE ST', '16 E GOETHE ST', '18 E GOETHE ST',
      ],
      pins: [
        '17031060060000', // 1305 N STATE ST
        '17031060070000', // 1303 N STATE ST
        '17031060080000', // 1301 N STATE ST
      ],
      note: '1301-1309 N State Pkwy / 2-18 E Goethe St — Ambassador Hotel Chicago; corner hotel; CCAO uses State St, postal/marketed uses State Pkwy; mailing name: FHM AMBASSADOR EAST',
    },
    // ─── 3328 W Chicago Ave / 802 N Christiana Ave ────────────────────────────
    // Corner building, Humboldt Park. Frontage on both W Chicago Ave and N Christiana Ave.
    // Confirmed GC Realty managed property (active rental listing).
    // 311 complaints split across both street addresses — manual range ensures
    // both entrances surface in the property page.
    {
      canonicalAddress: '3328 W CHICAGO AVE',
      allAddresses: [
        '3328 W CHICAGO AVE',
        '802 N CHRISTIANA AVE',
      ],
      displayAddresses: [
        '3328 W CHICAGO AVE',
        '802 N CHRISTIANA AVE',
      ],
      note: '3328 W Chicago Ave / 802 N Christiana Ave — corner building; managed by GC Realty',
    },
    // ─── 600 N Lake Shore Dr / 460 E Ohio St ──────────────────────────────────
    // The Lancaster at Lakeshore East — 48-story residential condo tower, Streeterville.
    // PBL listed (600 North Lake Shore Drive Condominium Assoc).
    // Building has 370 unit PINs all under N Lake Shore Dr; Assessor range anchors
    // on 460 E Ohio St (corner parcel). Range includes the "600 Lake Shore Dr"
    // (no directional) form which Google Places ambiguously resolves to Palatine —
    // mapping that form + pinning Chicago PINs explicitly here forces resolution
    // to the right building regardless of address ambiguity.
    {
      canonicalAddress: '600 N LAKE SHORE DR',
      allAddresses: [
        // N Lake Shore Dr — primary marketed address (DR suffix)
        '600 N LAKE SHORE DR',
        '602 N LAKE SHORE DR',
        '604 N LAKE SHORE DR',
        '606 N LAKE SHORE DR',
        '608 N LAKE SHORE DR',
        '610 N LAKE SHORE DR',
        // N Lake Shore Drive — full DRIVE suffix variant
        '600 N LAKE SHORE DRIVE',
        '602 N LAKE SHORE DRIVE',
        '604 N LAKE SHORE DRIVE',
        '606 N LAKE SHORE DRIVE',
        '608 N LAKE SHORE DRIVE',
        '610 N LAKE SHORE DRIVE',
        // No-directional forms — what Google Places returns for ambiguous searches.
        // Mapping these forces Palatine-defaulting addresses to resolve to Chicago.
        '600 LAKE SHORE DR',
        '602 LAKE SHORE DR',
        '604 LAKE SHORE DR',
        '606 LAKE SHORE DR',
        '608 LAKE SHORE DR',
        '610 LAKE SHORE DR',
        '600 LAKE SHORE DRIVE',
        '602 LAKE SHORE DRIVE',
        '604 LAKE SHORE DRIVE',
        '606 LAKE SHORE DRIVE',
        '608 LAKE SHORE DRIVE',
        '610 LAKE SHORE DRIVE',
        // E Ohio St — Assessor anchor address
        '460 E OHIO ST',
      ],
      displayAddresses: [
        // Marketed form only — banner reads "600-610 N LAKE SHORE DR & 460 E OHIO ST"
        '600 N LAKE SHORE DR',
        '602 N LAKE SHORE DR',
        '604 N LAKE SHORE DR',
        '606 N LAKE SHORE DR',
        '608 N LAKE SHORE DR',
        '610 N LAKE SHORE DR',
        '460 E OHIO ST',
      ],
      pins: [
        '17102080201001','17102080201002','17102080201003','17102080201004','17102080201005',
        '17102080201006','17102080201007','17102080201008','17102080201009','17102080201010',
        '17102080201011','17102080201012','17102080201013','17102080201014','17102080201015',
        '17102080201016','17102080201017','17102080201018','17102080201019','17102080201020',
        '17102080201021','17102080201022','17102080201023','17102080201024','17102080201025',
        '17102080201026','17102080201027','17102080201028','17102080201029','17102080201030',
        '17102080201031','17102080201032','17102080201033','17102080201034','17102080201035',
        '17102080201036','17102080201037','17102080201038','17102080201039','17102080201040',
        '17102080201041','17102080201042','17102080201043','17102080201044','17102080201045',
        '17102080201046','17102080201047','17102080201048','17102080201049','17102080201050',
        '17102080201051','17102080201052','17102080201053','17102080201054','17102080201055',
        '17102080201056','17102080201057','17102080201058','17102080201059','17102080201060',
        '17102080201061','17102080201062','17102080201063','17102080201064','17102080201065',
        '17102080201066','17102080201067','17102080201068','17102080201069','17102080201070',
        '17102080201071','17102080201072','17102080201073','17102080201074','17102080201075',
        '17102080201076','17102080201077','17102080201078','17102080201079','17102080201080',
        '17102080201081','17102080201082','17102080201083','17102080201084','17102080201085',
        '17102080201086','17102080201087','17102080201088','17102080201089','17102080201090',
        '17102080201091','17102080201092','17102080201093','17102080201094','17102080201095',
        '17102080201096','17102080201097','17102080201098','17102080201099','17102080201100',
        '17102080201101','17102080201102','17102080201103','17102080201104','17102080201105',
        '17102080201106','17102080201107','17102080201108','17102080201109','17102080201110',
        '17102080201111','17102080201112','17102080201113','17102080201114','17102080201115',
        '17102080201116','17102080201117','17102080201118','17102080201119','17102080201120',
        '17102080201121','17102080201122','17102080201123','17102080201124','17102080201125',
        '17102080201126','17102080201127','17102080201128','17102080201129','17102080201130',
        '17102080201131','17102080201132','17102080201133','17102080201134','17102080201135',
        '17102080201136','17102080201137','17102080201138','17102080201139','17102080201140',
        '17102080201141','17102080201142','17102080201143','17102080201144','17102080201145',
        '17102080201146','17102080201147','17102080201148','17102080201149','17102080201150',
        '17102080201151','17102080201152','17102080201153','17102080201154','17102080201155',
        '17102080201156','17102080201157','17102080201158','17102080201159','17102080201160',
        '17102080201161','17102080201162','17102080201163','17102080201164','17102080201165',
        '17102080201166','17102080201167','17102080201168','17102080201169','17102080201170',
        '17102080201171','17102080201172','17102080201173','17102080201174','17102080201175',
        '17102080201176','17102080201177','17102080201178','17102080201179','17102080201180',
        '17102080201181','17102080201182','17102080201183','17102080201184','17102080201185',
        '17102080201186','17102080201187','17102080201188','17102080201189','17102080201190',
        '17102080201191','17102080201192','17102080201193','17102080201194','17102080201195',
        '17102080201196','17102080201197','17102080201198','17102080201199','17102080201200',
        '17102080201201','17102080201202','17102080201203','17102080201204','17102080201205',
        '17102080201206','17102080201207','17102080201208','17102080201209','17102080201210',
        '17102080201211','17102080201212','17102080201213','17102080201214','17102080201215',
        '17102080201216','17102080201217','17102080201218','17102080201219','17102080201220',
        '17102080201221','17102080201222','17102080201223','17102080201224','17102080201225',
        '17102080201226','17102080201227','17102080201228','17102080201229','17102080201230',
        '17102080201231','17102080201232','17102080201233','17102080201234','17102080201235',
        '17102080201236','17102080201237','17102080201238','17102080201239','17102080201240',
        '17102080201241','17102080201242','17102080201243','17102080201244','17102080201245',
        '17102080201246','17102080201247','17102080201248','17102080201249','17102080201250',
        '17102080201251','17102080201252','17102080201253','17102080201254','17102080201255',
        '17102080201256','17102080201257','17102080201258','17102080201259','17102080201260',
        '17102080201261','17102080201262','17102080201263','17102080201264','17102080201265',
        '17102080201266','17102080201267','17102080201268','17102080201269','17102080201270',
        '17102080201271','17102080201272','17102080201273','17102080201274','17102080201275',
        '17102080201276','17102080201277','17102080201278','17102080201279','17102080201280',
        '17102080201281','17102080201282','17102080201283','17102080201284','17102080201285',
        '17102080201286','17102080201287','17102080201288','17102080201289','17102080201290',
        '17102080201291','17102080201292','17102080201293','17102080201294','17102080201295',
        '17102080201296','17102080201297','17102080201298','17102080201299','17102080201300',
        '17102080201301','17102080201302','17102080201303','17102080201304','17102080201305',
        '17102080201306','17102080201307','17102080201308','17102080201309','17102080201310',
        '17102080201311','17102080201312','17102080201313','17102080201314','17102080201315',
        '17102080201316','17102080201317','17102080201318','17102080201319','17102080201320',
        '17102080201321','17102080201322','17102080201323','17102080201324','17102080201325',
        '17102080201326','17102080201327','17102080201328','17102080201329','17102080201330',
        '17102080201331','17102080201332','17102080201333','17102080201334','17102080201335',
        '17102080201336','17102080201337','17102080201338','17102080201339','17102080201340',
        '17102080201341','17102080201342','17102080201343','17102080201344','17102080201345',
        '17102080201346','17102080201347','17102080201348','17102080201349','17102080201350',
        '17102080201351','17102080201352','17102080201353','17102080201354','17102080201355',
        '17102080201356','17102080201357','17102080201358','17102080201359','17102080201360',
        '17102080201361','17102080201362','17102080201363','17102080201364','17102080201365',
        '17102080201366','17102080201367','17102080201368','17102080201369','17102080201370',
        '17102080201371','17102080201372','17102080201373','17102080201374','17102080201375',
        '17102080201376','17102080201377','17102080201378','17102080201379','17102080201380',
        '17102080201381','17102080201382','17102080201383','17102080201384','17102080201385',
        '17102080201386','17102080201387','17102080201388','17102080201389','17102080201390',
        '17102080201391','17102080201392','17102080201393','17102080201394','17102080201395',
        '17102080201396','17102080201397','17102080201398','17102080201399','17102080201400',
        '17102080201401','17102080201402',
      ],
      note: '600 N Lake Shore Dr / 460 E Ohio St — The Lancaster at Lakeshore East; 48-story condo tower; on PBL; no-directional forms mapped to prevent Palatine misroute; 370 PINs pinned explicitly',
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