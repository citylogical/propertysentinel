import { getSupabaseAdmin } from './supabase-admin'
import { normalizePinSilent } from './supabase-search'

export type CityLogic = {
    ward: number | null
    /** Formatted "Wicker Park (West Town)" when both populated, else community area only. */
    neighborhood: string | null
    schoolElementary: string | null
    walkabilityScore: number | null
    /** TIF district name when in one (e.g. "Central Loop TIF"); null otherwise. */
    tifDistrictName: string | null
    /** TIF district number when in one; null otherwise. Kept for cases where name is empty. */
    tifDistrictNum: number | null
    opportunityZone: boolean
    isPbl: boolean
    /** Association/cooperative/owner name from the PBL row when on PBL; null otherwise. */
    pblAssociation: string | null
    isRestrictedZone: boolean
    floodFemaSfha: boolean
    ohareNoiseContour: boolean
  }

type ParcelRow = {
    ward: number | null
    community_area_name: string | null
    neighborhood_code: string | null
    school_elementary_name: string | null
    walkability_score: number | null
    tif_district_num: number | null
    tif_district_name: string | null
    opportunity_zone: boolean | null
    flood_fema_sfha: boolean | null
    ohare_noise_contour: boolean | null
  }

type Wicker = {
  community_area_name: string | null
  local_neighborhood_name: string | null
}

/**
 * Fetch civic/regulatory context for a property. Reuses the same address-based
 * lookup logic as fetchPortfolioActivity for PBL and restricted zone checks.
 *
 * Pass all of the building's normalized addresses (siblingAddresses + the
 * page's normalizedAddress) and PINs so multi-PIN buildings (e.g. Trump Tower)
 * get a PBL hit if ANY address in the range matches a PBL row.
 */
export async function fetchCityLogic(params: {
  /** Representative PIN for parcel_universe lookup (ward, neighborhood, etc). */
  pin: string
  addresses: string[]
  /** lat/lng of representative PIN — used for restricted-zone (ward+precinct) lookup. */
  lat: number | null
  lng: number | null
}): Promise<{ cityLogic: CityLogic | null; error: string | null }> {
  const supabase = getSupabaseAdmin()
  const normalized = normalizePinSilent(params.pin)
  if (!normalized) return { cityLogic: null, error: 'invalid pin' }

  const cleanedAddresses = [
    ...new Set(params.addresses.map((a) => a.trim().toUpperCase()).filter(Boolean)),
  ]

  try {
    const [parcelRes, neighborhoodRes, pblRes, restrictedZoneRes] = await Promise.all([
      // 1. parcel_universe — latest tax_year for this PIN
      supabase
        .from('parcel_universe')
        .select(
          'ward, community_area_name, neighborhood_code, school_elementary_name, walkability_score, tif_district_num, tif_district_name, opportunity_zone, flood_fema_sfha, ohare_noise_contour'
        )
        .eq('pin', normalized)
        .order('tax_year', { ascending: false })
        .limit(1)
        .maybeSingle(),

      // 2. Local neighborhood name (e.g. "Wicker Park") via spatial polygon lookup
      params.lat != null && params.lng != null && Number.isFinite(params.lat) && Number.isFinite(params.lng)
        ? supabase.rpc('lookup_chicago_neighborhood', {
            lookup_lat: params.lat,
            lookup_lng: params.lng,
          })
        : Promise.resolve({ data: null, error: null }),

      // 3. PBL — any of this building's addresses on str_prohibited_buildings
      cleanedAddresses.length > 0
        ? supabase
            .from('str_prohibited_buildings')
            .select('association_cooperative_or_owner')
            .in('address_normalized', cleanedAddresses)
            .limit(1)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),

      // 4. Restricted zone — derive ward+precinct from a 311 record at this address,
      //    then check str_restricted_zones for an active restriction.
      (async () => {
        if (cleanedAddresses.length === 0) return false
        const { data: hits } = await supabase
          .from('complaints_311')
          .select('ward, precinct')
          .in('address_normalized', cleanedAddresses)
          .not('precinct', 'is', null)
          .not('ward', 'is', null)
          .limit(1)
        const row = hits?.[0] as { ward?: unknown; precinct?: unknown } | undefined
        if (!row?.ward || !row?.precinct) return false
        const { count } = await supabase
          .from('str_restricted_zones')
          .select('ward', { count: 'exact', head: true })
          .eq('ward', parseInt(String(row.ward), 10))
          .eq('precinct', parseInt(String(row.precinct), 10))
          .is('repeal_ordinance_effective_date', null)
        return (count ?? 0) > 0
      })(),
    ])

    const parcel = (parcelRes.data ?? null) as ParcelRow | null
    const neighborhoodLookup = (neighborhoodRes.data ?? null) as Wicker | Wicker[] | null

    // RPC returns either a single row or array depending on stored function signature.
    // Handle both. Local name takes precedence; fall back to parcel_universe community area.
    const neighborhoodRow: Wicker | null = Array.isArray(neighborhoodLookup)
      ? neighborhoodLookup[0] ?? null
      : neighborhoodLookup
    const formatted = (() => {
      const localName = neighborhoodRow?.local_neighborhood_name?.trim() || null
      const communityArea =
        neighborhoodRow?.community_area_name?.trim() ||
        parcel?.community_area_name?.trim() ||
        null
      if (localName && communityArea && localName.toUpperCase() !== communityArea.toUpperCase()) {
        return `${localName} (${communityArea})`
      }
      return localName ?? communityArea
    })()

    const pblData = (pblRes.data ?? null) as {
      association_cooperative_or_owner: string | null
    } | null
    const isPbl = pblData != null
    const pblAssociation = (pblData?.association_cooperative_or_owner ?? '').trim() || null

    return {
      cityLogic: {
        ward: parcel?.ward ?? null,
        neighborhood: formatted,
        schoolElementary: parcel?.school_elementary_name?.trim() || null,
        walkabilityScore:
          parcel?.walkability_score != null && Number.isFinite(Number(parcel.walkability_score))
            ? Number(parcel.walkability_score)
            : null,
            tifDistrictName: parcel?.tif_district_name?.trim() || null,
            tifDistrictNum:
              parcel?.tif_district_num != null && Number.isFinite(Number(parcel.tif_district_num))
                ? Number(parcel.tif_district_num)
                : null,
        opportunityZone: parcel?.opportunity_zone === true,
        isPbl,
        pblAssociation,
        isRestrictedZone: restrictedZoneRes === true,
        floodFemaSfha: parcel?.flood_fema_sfha === true,
        ohareNoiseContour: parcel?.ohare_noise_contour === true,
      },
      error: null,
    }
  } catch (e) {
    return {
      cityLogic: null,
      error: e instanceof Error ? e.message : 'Unknown error',
    }
  }
}