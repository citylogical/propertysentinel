import { getSupabaseAdmin } from './supabase-admin'

export const INITIAL_CREDIT_GRANT = 5
export const CREDIT_BACK_LIMIT_PER_24H = 2
export const CREDIT_BACK_FRESHNESS_DAYS = 7

export type UnlockQuota = {
  remaining: number
  limit: number
  unlimited: boolean
  used: number
}

/**
 * Ensures the user has received their initial grant of credits.
 * Safe to call multiple times — a unique partial index prevents double-grants.
 */
export async function ensureInitialGrant(userId: string): Promise<void> {
  const supabase = getSupabaseAdmin()
  try {
    // Unique partial index on (user_id) WHERE reason = 'initial_grant' will
    // reject duplicate inserts with code 23505 — silently ignore.
    await supabase
      .from('unlock_credits')
      .insert({
        user_id: userId,
        delta: INITIAL_CREDIT_GRANT,
        reason: 'initial_grant',
        sr_number: null,
      })
      .select()
      .maybeSingle()
  } catch {
    // ignore duplicate grant / transient failures
  }
}

/**
 * Returns the user's current quota. Ensures initial grant exists first.
 * Checks subscribers.unlimited_unlocks for admin bypass.
 */
export async function getUnlockQuota(userId: string): Promise<UnlockQuota> {
  const supabase = getSupabaseAdmin()

  // Check admin bypass first.
  const { data: sub } = await supabase
    .from('subscribers')
    .select('unlimited_unlocks')
    .eq('clerk_id', userId)
    .maybeSingle()
  const unlimited = Boolean((sub as { unlimited_unlocks?: boolean } | null)?.unlimited_unlocks)

  if (unlimited) {
    return { remaining: Infinity, limit: Infinity, unlimited: true, used: 0 }
  }

  // Ensure the user has their starting credits.
  await ensureInitialGrant(userId)

  // Compute balance by summing deltas in application code.
  // PostgREST doesn't expose SUM directly; we fetch all rows for the user
  // (cheap — lifetime credits per user should stay well under 100 rows).
  const { data: ledger } = await supabase
    .from('unlock_credits')
    .select('delta')
    .eq('user_id', userId)

  const rows = (ledger ?? []) as { delta: number }[]
  const balance = rows.reduce((sum, r) => sum + (r.delta ?? 0), 0)
  const positiveDeltas = rows.reduce((sum, r) => sum + (r.delta > 0 ? r.delta : 0), 0)
  const negativeDeltas = rows.reduce((sum, r) => sum + (r.delta < 0 ? -r.delta : 0), 0)

  return {
    remaining: Math.max(0, balance),
    limit: positiveDeltas, // total credits ever granted (initial 5 + credit-backs)
    unlimited: false,
    used: negativeDeltas,
  }
}

/**
 * Atomically consumes one credit for an unlock. Caller must check quota first.
 * Inserts a -1 ledger row tagged with the sr_number.
 */
export async function consumeCreditForUnlock(userId: string, srNumber: string): Promise<void> {
  const supabase = getSupabaseAdmin()
  await supabase.from('unlock_credits').insert({
    user_id: userId,
    delta: -1,
    reason: 'unlock',
    sr_number: srNumber,
  })
}

/**
 * Credit-back eligibility check. Returns null if eligible, or an error reason string.
 */
export async function checkCreditBackEligibility(
  userId: string,
  srNumber: string
): Promise<{ eligible: true } | { eligible: false; reason: string; message: string }> {
  const supabase = getSupabaseAdmin()

  // Rule 1: the original unlock must exist and belong to this user.
  const { data: unlock } = await supabase
    .from('lead_unlocks')
    .select('created_at')
    .eq('user_id', userId)
    .eq('sr_number', srNumber)
    .maybeSingle()

  if (!unlock) {
    return {
      eligible: false,
      reason: 'unlock_not_found',
      message: 'No matching unlock found for this lead.',
    }
  }

  // Rule 2: the unlock must be less than 7 days old.
  const unlockAge =
    Date.now() - new Date((unlock as { created_at: string }).created_at).getTime()
  const maxAgeMs = CREDIT_BACK_FRESHNESS_DAYS * 24 * 60 * 60 * 1000
  if (unlockAge > maxAgeMs) {
    return {
      eligible: false,
      reason: 'too_old',
      message: `Credit-back is only available within ${CREDIT_BACK_FRESHNESS_DAYS} days of the original unlock.`,
    }
  }

  // Rule 3: cannot credit back the same unlock twice.
  const { data: prior } = await supabase
    .from('unlock_credits')
    .select('id')
    .eq('user_id', userId)
    .eq('sr_number', srNumber)
    .eq('reason', 'incorrect_info')
    .maybeSingle()

  if (prior) {
    return {
      eligible: false,
      reason: 'already_credited',
      message: 'You have already received a credit-back for this lead.',
    }
  }

  // Rule 4: max 2 credit-backs per 24 hours.
  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const { data: recent } = await supabase
    .from('unlock_credits')
    .select('id')
    .eq('user_id', userId)
    .eq('reason', 'incorrect_info')
    .gte('created_at', twentyFourHoursAgo)

  if ((recent ?? []).length >= CREDIT_BACK_LIMIT_PER_24H) {
    return {
      eligible: false,
      reason: 'rate_limited',
      message: `You can only request ${CREDIT_BACK_LIMIT_PER_24H} credit-backs per 24 hours. Please try again later.`,
    }
  }

  return { eligible: true }
}

/**
 * Issues a credit-back. Caller must check eligibility first.
 */
export async function issueCreditBack(userId: string, srNumber: string): Promise<void> {
  const supabase = getSupabaseAdmin()
  await supabase.from('unlock_credits').insert({
    user_id: userId,
    delta: 1,
    reason: 'incorrect_info',
    sr_number: srNumber,
  })
}