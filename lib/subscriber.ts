import type { Session } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/client'

const PENDING_ZIP_COOKIE = 'ps_pending_zip'
const AUTH_NEXT_COOKIE = 'ps_auth_next'
const COOKIE_MAX_AGE = 3600 // 1 hour
const AUTH_NEXT_MAX_AGE = 600 // 10 min

export function setPendingZipCookie(zip: string): void {
  if (typeof document === 'undefined') return
  document.cookie = `${PENDING_ZIP_COOKIE}=${encodeURIComponent(zip)}; path=/; max-age=${COOKIE_MAX_AGE}; SameSite=Lax`
}

export function getPendingZipFromCookie(): string | null {
  if (typeof document === 'undefined') return null
  const m = document.cookie.match(new RegExp(`${PENDING_ZIP_COOKIE}=([^;]+)`))
  return m ? decodeURIComponent(m[1].trim()) : null
}

export function clearPendingZipCookie(): void {
  if (typeof document === 'undefined') return
  document.cookie = `${PENDING_ZIP_COOKIE}=; path=/; max-age=0; SameSite=Lax`
}

export function setAuthNextCookie(path: string): void {
  if (typeof document === 'undefined') return
  document.cookie = `${AUTH_NEXT_COOKIE}=${encodeURIComponent(path)}; path=/; max-age=${AUTH_NEXT_MAX_AGE}; SameSite=Lax`
}

export function getAuthNextCookie(): string | null {
  if (typeof document === 'undefined') return null
  const m = document.cookie.match(new RegExp(`${AUTH_NEXT_COOKIE}=([^;]+)`))
  return m ? decodeURIComponent(m[1].trim()) : null
}

export function clearAuthNextCookie(): void {
  if (typeof document === 'undefined') return
  document.cookie = `${AUTH_NEXT_COOKIE}=; path=/; max-age=0; SameSite=Lax`
}

/**
 * Upsert subscriber row after magic link verification.
 * Uses session.user.id as id; on conflict (existing row) only updates zip and updated_at,
 * and does not overwrite plan if it is already 'premium'.
 */
export async function upsertSubscriberOnSession(session: Session, zip: string): Promise<{ error: string | null }> {
  try {
    const id = session.user.id
    const email = session.user.email ?? ''
    const now = new Date().toISOString()

    const supabase = createClient()
    const { data: existing } = await supabase
      .from('subscribers')
      .select('id, plan')
      .eq('id', id)
      .maybeSingle()

    if (existing?.plan === 'premium') {
      const { error } = await supabase
        .from('subscribers')
        .update({ zip, updated_at: now })
        .eq('id', id)
      return { error: error?.message ?? null }
    }

    const { error } = await supabase.from('subscribers').upsert(
      {
        id,
        email,
        zip,
        plan: 'free',
        email_alerts: true,
        created_at: now,
        updated_at: now,
      },
      { onConflict: 'id' }
    )
    return { error: error?.message ?? null }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Unknown error' }
  }
}
