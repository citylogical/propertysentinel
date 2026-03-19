'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function SetPasswordPage() {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const supabase = createClient()
    void supabase.auth.getSession().then(({ data }) => {
      if (!data.session) {
        router.push('/?auth_error=expired')
      }
    })
  }, [router])

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }
    if (password !== confirmPassword) {
      setError('Passwords must match.')
      return
    }

    setLoading(true)
    try {
      const supabase = createClient()
      const { error: updateError } = await supabase.auth.updateUser({ password })
      if (updateError) {
        setError(updateError.message)
        return
      }
      router.push('/profile?password_updated=1')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#f2f0eb] text-[#1a1a1a]">
      <header className="w-full bg-[#0f2744] text-white">
        <div className="mx-auto max-w-3xl px-6 py-5" style={{ fontFamily: 'Playfair Display, Georgia, serif' }}>
          <h1 className="text-2xl font-semibold">Set your password</h1>
        </div>
      </header>

      <main className="mx-auto max-w-md px-6 py-10">
        <form onSubmit={onSubmit} className="rounded-lg border border-[#d9d4ca] bg-white p-6 shadow-sm">
          <label htmlFor="new-password" className="mb-2 block text-sm font-medium">
            Password
          </label>
          <input
            id="new-password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
            className="mb-4 w-full rounded border border-[#d6d1c6] px-3 py-2 text-sm outline-none focus:border-[#0f2744]"
          />

          <label htmlFor="confirm-password" className="mb-2 block text-sm font-medium">
            Confirm password
          </label>
          <input
            id="confirm-password"
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
            minLength={8}
            className="mb-4 w-full rounded border border-[#d6d1c6] px-3 py-2 text-sm outline-none focus:border-[#0f2744]"
          />

          {error && <p className="mb-3 text-sm text-[#c0392b]">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded bg-[#0f2744] px-4 py-2 text-sm font-semibold text-white hover:bg-[#1b3d65] disabled:opacity-70"
          >
            {loading ? 'Saving…' : 'Set your password'}
          </button>
        </form>
      </main>
    </div>
  )
}
