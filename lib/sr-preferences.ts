import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Single-user enabled-codes read. Returns the set of sr_short_codes this user
 * has switched on in user_sr_preferences. Presence = enabled; no row = off.
 * Every portfolio user is seeded at first-property-add, so today this set is
 * the whole filter — no fallback/merge needed.
 */
export async function getEnabledCodes(
  supabase: SupabaseClient,
  userId: string            // Clerk ID — matches portfolio_properties.user_id
): Promise<Set<string>> {
  const { data, error } = await supabase
    .from('user_sr_preferences')
    .select('sr_short_code')
    .eq('user_id', userId)
  if (error || !data) return new Set<string>()
  return new Set(data.map((r) => (r as { sr_short_code: string }).sr_short_code))
}

/**
 * Batch pre-load for the digest cron, which loops subscribers. One round-trip
 * for all the given Clerk IDs; caller slices per-user inside the loop. Avoids
 * one query per subscriber. Users absent from the result map have no enabled
 * codes (empty set).
 */
export async function getEnabledCodesForUsers(
  supabase: SupabaseClient,
  userIds: string[]         // Clerk IDs
): Promise<Map<string, Set<string>>> {
  const result = new Map<string, Set<string>>()
  if (userIds.length === 0) return result
  const { data, error } = await supabase
    .from('user_sr_preferences')
    .select('user_id, sr_short_code')
    .in('user_id', userIds)
  if (error || !data) return result
  for (const row of data as Array<{ user_id: string; sr_short_code: string }>) {
    let set = result.get(row.user_id)
    if (!set) { set = new Set<string>(); result.set(row.user_id, set) }
    result.get(row.user_id)!.add(row.sr_short_code)
  }
  return result
}