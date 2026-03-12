'use client'

import { useEffect } from 'react'
import { useSearchParams } from 'next/navigation'

/**
 * If Supabase redirects to the Site URL with ?code= (instead of /auth/callback?code=),
 * redirect to the callback route so the PKCE flow can complete.
 */
export default function AuthCodeRedirect() {
  const searchParams = useSearchParams()

  useEffect(() => {
    const code = searchParams.get('code')
    if (!code || typeof window === 'undefined') return

    const next = searchParams.get('next') ?? '/'
    const url = `${window.location.origin}/auth/callback?code=${encodeURIComponent(code)}&next=${encodeURIComponent(next)}`
    window.location.replace(url)
  }, [searchParams])

  return null
}
