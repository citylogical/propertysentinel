'use client'

import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'

const AUTH_ERROR_KEY = 'auth_error'

export default function AuthErrorBanner() {
  const searchParams = useSearchParams()
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    if (typeof window === 'undefined') return

    const hash = window.location.hash.replace(/^#/, '')
    const hashParams = new URLSearchParams(hash)
    const hashError = hashParams.get('error')
    if (hashError) {
      const kind = hashError === 'access_denied' ? 'denied' : 'expired'
      window.history.replaceState(null, '', `${window.location.pathname}?${AUTH_ERROR_KEY}=${kind}`)
      setMessage(kind === 'denied' ? 'Sign-in was denied.' : 'Your sign-in link has expired. Please request a new one from the property page or login.')
      return
    }

    const authError = searchParams.get(AUTH_ERROR_KEY)
    if (authError === 'expired') {
      setMessage('Your sign-in link has expired. Please request a new one from the property page or login.')
    } else if (authError === 'denied') {
      setMessage('Sign-in was denied.')
    }
  }, [searchParams])

  if (!message) return null

  return (
    <div
      className="auth-error-banner"
      role="alert"
      style={{
        padding: '12px 16px',
        marginBottom: '16px',
        backgroundColor: '#fef3cd',
        border: '1px solid #e0c14a',
        borderRadius: '6px',
        color: '#856404',
        fontSize: '14px',
        textAlign: 'center',
      }}
    >
      {message}
    </div>
  )
}
