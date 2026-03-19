'use client'

import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  clearAuthNextCookie,
  getPendingZipFromCookie,
  clearPendingZipCookie,
  upsertSubscriberOnSession,
} from '@/lib/subscriber'

export default function AuthCallbackPage() {
  const router = useRouter()
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
      clearAuthNextCookie()
      const params = new URLSearchParams(window.location.hash.substring(1))
      const type = params.get('type')

      if (type === 'recovery') {
        router.push('/profile/set-password')
      } else {
        router.push('/profile')
      }
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
            router.push('/?auth_error=expired')
          }
          subscription.unsubscribe()
        }, 1500)
        return
      }

      router.push('/?auth_error=expired')
    }

    run()
  }, [router])

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#f2f0eb]">
      <p className="text-[#4a5568]">Signing you in…</p>
    </div>
  )
}
