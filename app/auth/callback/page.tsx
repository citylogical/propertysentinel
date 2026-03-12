'use client'

import { useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  getAuthNextCookie,
  clearAuthNextCookie,
  getPendingZipFromCookie,
  clearPendingZipCookie,
  upsertSubscriberOnSession,
} from '@/lib/subscriber'

function redirectTo(next: string) {
  if (typeof window === 'undefined') return
  clearAuthNextCookie()
  window.location.replace(next)
}

export default function AuthCallbackPage() {
  const handled = useRef(false)

  useEffect(() => {
    if (handled.current) return
    const supabase = createClient()

    async function finishWithSession(session: import('@supabase/supabase-js').Session | null) {
      if (!session || handled.current) return
      handled.current = true
      const zip = getPendingZipFromCookie()
      if (zip) {
        await upsertSubscriberOnSession(session, zip)
        clearPendingZipCookie()
      }
      const next = getAuthNextCookie() ?? '/'
      redirectTo(next)
    }

    async function run() {
      const { data: { session } } = await supabase.auth.getSession()
      if (session) {
        await finishWithSession(session)
        return
      }

      const hasHash = typeof window !== 'undefined' && window.location.hash.length > 0
      if (hasHash) {
        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
          if (s) void finishWithSession(s)
        })
        setTimeout(async () => {
          if (handled.current) return
          const { data: { session: s } } = await supabase.auth.getSession()
          if (s) {
            await finishWithSession(s)
          } else {
            redirectTo('/?auth_error=expired')
          }
          subscription.unsubscribe()
        }, 1500)
        return
      }

      redirectTo('/?auth_error=expired')
    }

    run()
  }, [])

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#f2f0eb]">
      <p className="text-[#4a5568]">Signing you in…</p>
    </div>
  )
}
