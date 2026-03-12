'use client'

import { Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { supabaseBrowser } from '@/lib/supabase-browser'

function CallbackContent() {
  const searchParams = useSearchParams()
  const [status, setStatus] = useState<'loading' | 'ok' | 'error'>('loading')

  useEffect(() => {
    const next = searchParams.get('next') ?? '/'
    const code = searchParams.get('code')

    async function handleCallback() {
      if (code) {
        const { error } = await supabaseBrowser.auth.exchangeCodeForSession(code)
        if (error) {
          setStatus('error')
          return
        }
      } else {
        const hash = typeof window !== 'undefined' ? window.location.hash : ''
        if (hash) {
          const params = new URLSearchParams(hash.replace(/^#/, ''))
          const access_token = params.get('access_token')
          const refresh_token = params.get('refresh_token')
          if (access_token && refresh_token) {
            const { error } = await supabaseBrowser.auth.setSession({
              access_token,
              refresh_token,
            })
            if (error) {
              setStatus('error')
              return
            }
          }
        }
      }
      setStatus('ok')
      window.location.href = next
    }

    handleCallback()
  }, [searchParams])

  if (status === 'error') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f2f0eb]">
        <p className="text-[#1a1a1a]">Something went wrong signing you in. Try again.</p>
      </div>
    )
  }

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
