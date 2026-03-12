'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { supabaseBrowser } from '@/lib/supabase-browser'
import type { User } from '@supabase/supabase-js'

export default function ProfilePage() {
  const router = useRouter()
  const [user, setUser] = useState<User | null>(null)
  const [password, setPassword] = useState('')
  const [passwordConfirm, setPasswordConfirm] = useState('')
  const [message, setMessage] = useState<{ type: 'ok' | 'error'; text: string } | null>(null)

  useEffect(() => {
    supabaseBrowser.auth.getSession().then(({ data: { session } }) => {
      if (!session?.user) {
        router.replace('/')
        return
      }
      setUser(session.user)
    })
  }, [router])

  const handleSetPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setMessage(null)
    if (password.length < 6) {
      setMessage({ type: 'error', text: 'Password must be at least 6 characters.' })
      return
    }
    if (password !== passwordConfirm) {
      setMessage({ type: 'error', text: 'Passwords do not match.' })
      return
    }
    const { error } = await supabaseBrowser.auth.updateUser({ password })
    if (error) {
      setMessage({ type: 'error', text: error.message })
      return
    }
    setMessage({ type: 'ok', text: 'Password updated.' })
    setPassword('')
    setPasswordConfirm('')
  }

  const handleSignOut = async () => {
    await supabaseBrowser.auth.signOut()
    router.replace('/')
  }

  if (user === undefined) {
    return (
      <div className="min-h-screen bg-[#f2f0eb] flex items-center justify-center">
        <p className="text-[#4a5568]">Loading…</p>
      </div>
    )
  }

  if (!user) {
    return null
  }

  return (
    <div className="min-h-screen bg-[#f2f0eb] flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-md bg-white border border-[#ddd9d0] rounded-lg p-8 shadow-sm">
        <h1 className="text-xl font-bold text-[#1a1a1a] mb-6" style={{ fontFamily: 'Playfair Display, Georgia, serif' }}>
          Profile
        </h1>
        <p className="text-sm text-[#4a5568] mb-2">Email</p>
        <p className="text-[#1a1a1a] font-medium mb-6">{user.email}</p>

        <h2 className="text-sm font-semibold text-[#1a1a1a] mb-3">Set a password</h2>
        <form onSubmit={handleSetPassword} className="flex flex-col gap-3 mb-8">
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="New password"
            minLength={6}
            className="w-full px-3 py-2 border border-[#ddd9d0] rounded text-[#1a1a1a] text-sm focus:border-[#0f2744] outline-none"
          />
          <input
            type="password"
            value={passwordConfirm}
            onChange={(e) => setPasswordConfirm(e.target.value)}
            placeholder="Confirm password"
            minLength={6}
            className="w-full px-3 py-2 border border-[#ddd9d0] rounded text-[#1a1a1a] text-sm focus:border-[#0f2744] outline-none"
          />
          {message && (
            <p className={`text-sm ${message.type === 'ok' ? 'text-[#2d6a4f]' : 'text-[#c0392b]'}`}>
              {message.text}
            </p>
          )}
          <button
            type="submit"
            className="w-full py-2 bg-[#0f2744] text-white text-sm font-semibold rounded hover:bg-[#234872] transition-colors"
          >
            Set password
          </button>
        </form>

        <button
          type="button"
          onClick={handleSignOut}
          className="w-full py-2 border border-[#ddd9d0] text-[#1a1a1a] text-sm font-semibold rounded hover:bg-[#f2f0eb] transition-colors"
        >
          Sign out
        </button>
        <Link href="/" className="inline-block mt-6 text-sm text-[#4a5568] hover:text-[#1a1a1a]">
          ← Back to home
        </Link>
      </div>
    </div>
  )
}
