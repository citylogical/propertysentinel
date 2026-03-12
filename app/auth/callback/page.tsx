'use client'

import { Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { supabaseBrowser } from '@/lib/supabase-browser'
import { getPendingZipFromCookie, clearPendingZipCookie, upsertSubscriberOnSession } from '@/lib/subscriber'

function redirectToHomeWithAuthError(kind: 'expired' | 'denied' = 'expired') {
  if (typeof window === 'undefined') return
  window.location.replace(`${window.location.origin}/?auth_error=${kind}`)
}

function getHashParams(): URLSearchParams {
  if (typeof window === 'undefined') return new URLSearchParams()
  const hash = window.location.hash.replace(/^#/, '')
  return new URLSearchParams(hash)
}

function CallbackContent() {
  const searchParams = useSearchParams()
  const [status, setStatus] = useState<'loading' | 'ok'>('loading')

  useEffect(() => {
    const hashParams = getHashParams()
    const hashError = hashParams.get('error')
    if (hashError) {
      const kind = hashError === 'access_denied' ? 'denied' : 'expired'
      redirectToHomeWithAuthError(kind)
      return
    }

    const next = searchParams.get('next') ?? '/'
    const code = searchParams.get('code')

    async function handleCallback() {
      if (code) {
        const { data, error } = await supabaseBrowser.auth.exchangeCodeForSession(code)
        if (error) {
          redirectToHomeWithAuthError('expired')
          return
        }
        if (data.session) {
          const zip = getPendingZipFromCookie()
          if (zip) {
            await upsertSubscriberOnSession(data.session, zip)
            clearPendingZipCookie()
          }
        }
      } else {
        const hash = typeof window !== 'undefined' ? window.location.hash : ''
        if (hash) {
          const params = new URLSearchParams(hash.replace(/^#/, ''))
          const access_token = params.get('access_token')
          const refresh_token = params.get('refresh_token')
          if (access_token && refresh_token) {
            const { data, error } = await supabaseBrowser.auth.setSession({
              access_token,
              refresh_token,
            })
            if (error) {
              redirectToHomeWithAuthError('expired')
              return
            }
            if (data.session) {
              const zip = getPendingZipFromCookie()
              if (zip) {
                await upsertSubscriberOnSession(data.session, zip)
                clearPendingZipCookie()
              }
            }
          }
        }
      }
      setStatus('ok')
      window.location.href = next
    }

    handleCallback()
  }, [searchParams])

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#f2f0eb]">
      <p className="text-[#4a5568]">Signing you in…</p>
    </div>
  )
}

export default function AuthCallbackPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-[#f2f0eb]">
        <p className="text-[#4a5568]">Loading…</p>
      </div>
    }>
      <CallbackContent />
    </Suspense>
  )
}
