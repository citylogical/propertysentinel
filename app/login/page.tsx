'use client'

import { Suspense, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { supabaseBrowser } from '@/lib/supabase-browser'

function LoginForm() {
  const searchParams = useSearchParams()
  const next = searchParams.get('next') ?? '/'
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    const origin = typeof window !== 'undefined' ? window.location.origin : 'https://propertysentinel.io'
    const { error: err } = await supabaseBrowser.auth.signInWithOtp({
      email: email.trim(),
      options: {
        shouldCreateUser: true,
        emailRedirectTo: `${origin}/auth/callback?next=${encodeURIComponent(next)}`,
      },
    })
    if (err) {
      setError(err.message)
      return
    }
    setSent(true)
  }

  return (
    <div className="min-h-screen bg-[#f2f0eb] flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-sm bg-white border border-[#ddd9d0] rounded-lg p-8 shadow-sm">
        <h1 className="text-xl font-bold text-[#1a1a1a] mb-2" style={{ fontFamily: 'Playfair Display, Georgia, serif' }}>
          Log in
        </h1>
        <p className="text-sm text-[#4a5568] mb-6">
          We&apos;ll send you a magic link to sign in. No password needed.
        </p>
        {sent ? (
          <p className="text-sm text-[#2d6a4f]">
            Check your inbox — click the link we sent to verify.
          </p>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email"
              required
              className="w-full px-3 py-2 border border-[#ddd9d0] rounded text-[#1a1a1a] text-sm focus:border-[#0f2744] outline-none"
            />
            {error && <p className="text-xs text-[#c0392b]">{error}</p>}
            <button
              type="submit"
              className="w-full py-2 bg-[#0f2744] text-white text-sm font-semibold rounded hover:bg-[#234872] transition-colors"
            >
              Send verification link
            </button>
          </form>
        )}
        <Link href="/" className="inline-block mt-6 text-sm text-[#4a5568] hover:text-[#1a1a1a]">
          ← Back to home
        </Link>
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[#f2f0eb] flex items-center justify-center">
        <p className="text-[#4a5568]">Loading…</p>
      </div>
    }>
      <LoginForm />
    </Suspense>
  )
}
