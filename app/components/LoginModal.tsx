'use client'

import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

type LoginAction =
  | 'register'
  | 'verify_email'
  | 'enter_password'
  | 'set_password_email_sent'
  | 'registered'
  | 'password_reset_sent'

type Props = {
  open: boolean
  onClose: () => void
  isAuthenticated: boolean
}

export default function LoginModal({ open, onClose, isAuthenticated }: Props) {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [action, setAction] = useState<LoginAction | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open || isAuthenticated) {
      setEmail('')
      setPassword('')
      setConfirmPassword('')
      setAction(null)
      setLoading(false)
      setError(null)
    }
  }, [open, isAuthenticated])

  useEffect(() => {
    if (!open) return
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onEsc)
    return () => document.removeEventListener('keydown', onEsc)
  }, [open, onClose])

  const message = useMemo(() => {
    if (action === 'verify_email') return `We've sent a verification email to ${email}. Please verify before signing in.`
    if (action === 'set_password_email_sent') return "We've sent you an email to set up your password. Please check your inbox."
    if (action === 'registered') return 'Check your email to verify your account'
    if (action === 'password_reset_sent') return 'Password reset email sent.'
    return null
  }, [action, email])

  if (!open || isAuthenticated || typeof document === 'undefined') return null

  const submitEmail = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email.trim()) return
    setLoading(true)
    setError(null)

    try {
      const response = await fetch('/api/auth/login-or-register', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      })
      const data = (await response.json()) as { action?: LoginAction; error?: string }
      if (!response.ok) {
        setError(data.error ?? 'Unable to continue')
        return
      }
      if (
        data.action === 'register' ||
        data.action === 'verify_email' ||
        data.action === 'enter_password' ||
        data.action === 'set_password_email_sent'
      ) {
        setAction(data.action)
        return
      }
      setError('Unexpected response')
    } catch {
      setError('Unable to continue')
    } finally {
      setLoading(false)
    }
  }

  const submitRegistration = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email.trim() || !password) return
    if (password !== confirmPassword) {
      setError('Passwords do not match')
      return
    }
    setLoading(true)
    setError(null)

    try {
      const supabase = createClient()
      const emailRedirectTo = `${window.location.origin}/auth/callback`
      const { error: signUpError } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: { emailRedirectTo },
      })
      if (signUpError) {
        setError(signUpError.message)
        return
      }
      setAction('registered')
      setPassword('')
      setConfirmPassword('')
    } catch {
      setError('Unable to create account')
    } finally {
      setLoading(false)
    }
  }

  const submitPasswordSignIn = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email.trim() || !password) return
    setLoading(true)
    setError(null)

    try {
      const supabase = createClient()
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      })
      if (signInError) {
        setError('Incorrect password')
        return
      }
      onClose()
      router.push('/profile')
    } catch {
      setError('Incorrect password')
    } finally {
      setLoading(false)
    }
  }

  const handleForgotPassword = async () => {
    if (!email.trim()) return
    setLoading(true)
    setError(null)
    try {
      const supabase = createClient()
      const emailRedirectTo = `${window.location.origin}/auth/callback`
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: emailRedirectTo })
      if (resetError) {
        setError(resetError.message)
        return
      }
      setAction('password_reset_sent')
    } catch {
      setError('Unable to send reset email')
    } finally {
      setLoading(false)
    }
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[10000] flex items-center justify-center p-4"
      style={{ background: 'rgba(5, 12, 23, 0.55)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Log in"
    >
      <div
        className="w-full max-w-sm rounded-lg border border-[#d9d4ca] bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          className="ml-auto block text-[#4a5568] hover:text-[#1a1a1a]"
          aria-label="Close login modal"
          onClick={onClose}
        >
          ×
        </button>
        <div
          className="mb-5 text-center text-xl font-bold text-[#0f2744]"
          style={{ fontFamily: 'Playfair Display, Georgia, serif' }}
        >
          Property Sentinel
        </div>

        {action === null || action === 'verify_email' || action === 'set_password_email_sent' || action === 'password_reset_sent' ? (
          <form onSubmit={submitEmail} className="space-y-3">
            <label htmlFor="login-email" className="block text-sm font-medium text-[#1a1a1a]">
              Email address
            </label>
            <input
              id="login-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full rounded border border-[#d6d1c6] px-3 py-2 text-sm outline-none focus:border-[#0f2744]"
            />
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded bg-[#0f2744] px-4 py-2 text-sm font-semibold text-white hover:bg-[#1b3d65] disabled:opacity-70"
            >
              Continue
            </button>
          </form>
        ) : action === 'register' ? (
          <form onSubmit={submitRegistration} className="space-y-3">
            <label htmlFor="login-password" className="block text-sm font-medium text-[#1a1a1a]">
              Password
            </label>
            <input
              id="login-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              className="w-full rounded border border-[#d6d1c6] px-3 py-2 text-sm outline-none focus:border-[#0f2744]"
            />
            <label htmlFor="login-confirm-password" className="block text-sm font-medium text-[#1a1a1a]">
              Confirm password
            </label>
            <input
              id="login-confirm-password"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              minLength={8}
              className="w-full rounded border border-[#d6d1c6] px-3 py-2 text-sm outline-none focus:border-[#0f2744]"
            />
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded bg-[#0f2744] px-4 py-2 text-sm font-semibold text-white hover:bg-[#1b3d65] disabled:opacity-70"
            >
              Create account
            </button>
          </form>
        ) : (
          <form onSubmit={submitPasswordSignIn} className="space-y-3">
            <label htmlFor="login-password" className="block text-sm font-medium text-[#1a1a1a]">
              Password
            </label>
            <input
              id="login-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full rounded border border-[#d6d1c6] px-3 py-2 text-sm outline-none focus:border-[#0f2744]"
            />
            <button
              type="button"
              onClick={handleForgotPassword}
              className="text-sm text-[#0f2744] underline hover:text-[#1b3d65]"
            >
              Forgot password?
            </button>
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded bg-[#0f2744] px-4 py-2 text-sm font-semibold text-white hover:bg-[#1b3d65] disabled:opacity-70"
            >
              Sign in
            </button>
          </form>
        )}

        {message && <p className="mt-4 text-sm text-[#2d6a4f]">{message}</p>}
        {error && <p className="mt-4 text-sm text-[#c0392b]">{error}</p>}
      </div>
    </div>,
    document.body
  )
}
