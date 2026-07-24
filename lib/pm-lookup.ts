import { getSupabaseAdmin } from './supabase-admin'

/**
 * PM Universe lookups — matches property addresses against the workers-repo
 * staging tables (arhd_raw, kcro_raw, hud_mf_raw). All three carry an
 * addresses_expanded text[] holding every known form of a building's address
 * (source form, hyphen-range expansion, Assessor-vocabulary corrections), so
 * `.overlaps()` matches where a plain `.in()` on one form would miss.
 * Tables are a few hundred rows each — no index concerns.
 *
 * Server-side only (service role; the pm tables are RLS'd with no policies).
 * Org names only ever leave these lookups — agent phones/emails stay in the
 * lead tables.
 */

export type ArhdPresence = {
  propertyType: string | null
  propertyName: string | null
  units: number | null
  managementCompany: string | null
}

export type KcroPresence = {
  /** Management agent, falling back to the trustee owner when blank. */
  agentName: string | null
  /** ISO date (YYYY-MM-DD) of the most recent registration. */
  latestSubmission: string | null
}

type ArhdRow = {
  property_type: string | null
  property_name: string | null
  units: number | null
  management_company: string | null
}

type KcroRow = {
  mgmt_agent_name: string | null
  owner_name: string | null
  submission_date: string | null
}

/**
 * ARHD + KCRO presence for one building (the City Logic consumer).
 * Pass the page's full address set (normalizedAddress + siblingAddresses).
 */
export async function fetchPmPresence(addresses: string[]): Promise<{
  arhd: ArhdPresence | null
  kcro: KcroPresence | null
}> {
  const cleaned = [...new Set(addresses.map((a) => a.trim().toUpperCase()).filter(Boolean))]
  if (cleaned.length === 0) return { arhd: null, kcro: null }

  const supabase = getSupabaseAdmin()
  try {
    const [arhdRes, kcroRes] = await Promise.all([
      supabase
        .from('arhd_raw')
        .select('property_type, property_name, units, management_company')
        .overlaps('addresses_expanded', cleaned)
        .limit(10),
      supabase
        .from('kcro_raw')
        .select('mgmt_agent_name, owner_name, submission_date')
        .overlaps('addresses_expanded', cleaned)
        .order('submission_date', { ascending: false })
        .limit(10),
    ])

    // Multiple ARHD rows can match a range building — show the largest.
    const arhdBest =
      ((arhdRes.data ?? []) as ArhdRow[]).sort((a, b) => (b.units ?? 0) - (a.units ?? 0))[0] ?? null
    const arhd: ArhdPresence | null = arhdBest
      ? {
          propertyType: arhdBest.property_type?.trim() || null,
          propertyName: arhdBest.property_name?.trim() || null,
          units: arhdBest.units != null && Number.isFinite(Number(arhdBest.units)) ? Number(arhdBest.units) : null,
          managementCompany: arhdBest.management_company?.trim() || null,
        }
      : null

    // KCRO: one row per registration event; take the latest.
    const kcroBest = ((kcroRes.data ?? []) as KcroRow[])[0] ?? null
    const kcro: KcroPresence | null = kcroBest
      ? {
          agentName: kcroBest.mgmt_agent_name?.trim() || kcroBest.owner_name?.trim() || null,
          latestSubmission: kcroBest.submission_date?.slice(0, 10) || null,
        }
      : null

    return { arhd, kcro }
  } catch {
    return { arhd: null, kcro: null }
  }
}

/**
 * Batched manager/owner presence for a page of complaint rows (the explore
 * route consumer). Returns a Map keyed by the input address forms; value is
 * the best-known org name. Priority: HUD mgmt agent > ARHD management
 * company > KCRO agent > HUD/KCRO owner.
 */
export async function fetchPmManagersByAddresses(addresses: string[]): Promise<Map<string, string>> {
  const result = new Map<string, string>()
  const cleaned = [...new Set(addresses.map((a) => a.trim().toUpperCase()).filter(Boolean))]
  if (cleaned.length === 0) return result

  const supabase = getSupabaseAdmin()
  const cleanedSet = new Set(cleaned)

  // rank: lower wins
  const put = (expanded: string[] | null, name: string | null | undefined, rank: number, ranks: Map<string, number>) => {
    const n = (name ?? '').trim()
    if (!n || !expanded) return
    for (const addr of expanded) {
      if (!cleanedSet.has(addr)) continue
      const cur = ranks.get(addr)
      if (cur == null || rank < cur) {
        ranks.set(addr, rank)
        result.set(addr, n)
      }
    }
  }

  try {
    const [hudRes, arhdRes, kcroRes] = await Promise.all([
      supabase
        .from('hud_mf_raw')
        .select('addresses_expanded, mgmt_name, owner_name')
        .overlaps('addresses_expanded', cleaned),
      supabase
        .from('arhd_raw')
        .select('addresses_expanded, management_company')
        .overlaps('addresses_expanded', cleaned),
      supabase
        .from('kcro_raw')
        .select('addresses_expanded, mgmt_agent_name, owner_name')
        .overlaps('addresses_expanded', cleaned),
    ])

    const ranks = new Map<string, number>()
    for (const r of (hudRes.data ?? []) as Array<{ addresses_expanded: string[] | null; mgmt_name: string | null; owner_name: string | null }>) {
      put(r.addresses_expanded, r.mgmt_name, 1, ranks)
      put(r.addresses_expanded, r.owner_name, 4, ranks)
    }
    for (const r of (arhdRes.data ?? []) as Array<{ addresses_expanded: string[] | null; management_company: string | null }>) {
      put(r.addresses_expanded, r.management_company, 2, ranks)
    }
    for (const r of (kcroRes.data ?? []) as Array<{ addresses_expanded: string[] | null; mgmt_agent_name: string | null; owner_name: string | null }>) {
      put(r.addresses_expanded, r.mgmt_agent_name, 3, ranks)
      put(r.addresses_expanded, r.owner_name, 5, ranks)
    }
  } catch {
    // lookup failure degrades to blank column, never breaks the table
  }

  return result
}
