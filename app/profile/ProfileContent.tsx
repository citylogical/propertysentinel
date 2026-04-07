'use client'

import { useUser, useClerk } from '@clerk/nextjs'
import { useEffect, useState } from 'react'

type SubscriberProfile = {
  email?: string | null
  first_name?: string | null
  last_name?: string | null
  organization?: string | null
  phone?: string | null
  zip?: string | null
  plan?: string | null
  role?: string | null
  created_at?: string | null
}

export default function ProfileContent() {
  const { user, isLoaded } = useUser()
  const { signOut } = useClerk()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [organization, setOrganization] = useState('')
  const [phone, setPhone] = useState('')
  const [zip, setZip] = useState('')

  const [email, setEmail] = useState('')
  const [plan, setPlan] = useState('')
  const [role, setRole] = useState('')
  const [memberSince, setMemberSince] = useState('')
  const [quota, setQuota] = useState<{
    remaining: number | null
    limit: number | null
    unlimited: boolean
    used: number
  } | null>(null)

  useEffect(() => {
    if (!isLoaded) return

    void fetch('/api/leads/quota')
      .then((res) => res.json())
      .then((data: { remaining: number | null; limit: number | null; unlimited: boolean; used: number }) => {
        setQuota({
          remaining: data.remaining,
          limit: data.limit,
          unlimited: data.unlimited,
          used: data.used,
        })
      })
      .catch(() => {})

    fetch('/api/profile/update')
      .then((res) => res.json())
      .then((data: { error?: string; profile?: SubscriberProfile | null }) => {
        if (data.error) return
        const p = data.profile
        const clerkEmail = user?.primaryEmailAddress?.emailAddress ?? user?.emailAddresses?.[0]?.emailAddress ?? ''
        setEmail((p?.email && p.email.trim()) || clerkEmail)
        setFirstName(p?.first_name ?? '')
        setLastName(p?.last_name ?? '')
        setOrganization(p?.organization ?? '')
        setPhone(p?.phone ?? '')
        setZip(p?.zip ?? '')
        setPlan(p?.plan || 'Free')
        setRole(p?.role || 'default')
        setMemberSince(
          p?.created_at
            ? new Date(p.created_at).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
            : ''
        )
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [isLoaded, user?.primaryEmailAddress?.emailAddress, user?.emailAddresses?.[0]?.emailAddress])

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    setSaved(false)

    try {
      const res = await fetch('/api/profile/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          first_name: firstName,
          last_name: lastName,
          organization,
          phone,
          zip,
        }),
      })

      if (!res.ok) {
        const data = (await res.json()) as { error?: string }
        throw new Error(data.error || 'Failed to save')
      }

      setSaved(true)
      window.setTimeout(() => setSaved(false), 3000)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div
        style={{
          padding: '80px 28px',
          textAlign: 'center',
          fontFamily: 'var(--mono)',
          fontSize: 12,
          color: 'var(--text-dim)',
        }}
      >
        Loading...
      </div>
    )
  }

  return (
    <div className="profile-content">
      <div className="profile-content-card">
        <div className="profile-content-card-header">Account information</div>
        <div className="profile-content-card-body">
          <div className="profile-content-field">
            <label className="profile-content-field-label" htmlFor="profile-email">
              Email
            </label>
            <input
              id="profile-email"
              className="profile-content-field-input profile-content-field-readonly"
              type="email"
              value={email}
              readOnly
            />
          </div>
          <div className="profile-content-field-row">
            <div className="profile-content-field">
              <label className="profile-content-field-label" htmlFor="profile-first">
                First name
              </label>
              <input
                id="profile-first"
                className="profile-content-field-input"
                type="text"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder="First name"
              />
            </div>
            <div className="profile-content-field">
              <label className="profile-content-field-label" htmlFor="profile-last">
                Last name
              </label>
              <input
                id="profile-last"
                className="profile-content-field-input"
                type="text"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                placeholder="Last name"
              />
            </div>
          </div>
          <div className="profile-content-field">
            <label className="profile-content-field-label" htmlFor="profile-org">
              Organization
            </label>
            <input
              id="profile-org"
              className="profile-content-field-input"
              type="text"
              value={organization}
              onChange={(e) => setOrganization(e.target.value)}
              placeholder="Company or property management firm"
            />
          </div>
          <div className="profile-content-field-row">
            <div className="profile-content-field">
              <label className="profile-content-field-label" htmlFor="profile-phone">
                Phone
              </label>
              <input
                id="profile-phone"
                className="profile-content-field-input"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="(312) 555-0100"
              />
            </div>
            <div className="profile-content-field">
              <label className="profile-content-field-label" htmlFor="profile-zip">
                Zip code
              </label>
              <input
                id="profile-zip"
                className="profile-content-field-input"
                type="text"
                value={zip}
                onChange={(e) => setZip(e.target.value)}
                placeholder="60601"
                maxLength={10}
              />
            </div>
          </div>
        </div>
        <div className="profile-content-card-footer">
          {error && <span className="profile-content-error">{error}</span>}
          {saved && <span className="profile-content-saved">Saved</span>}
          <button type="button" className="profile-content-save-btn" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : 'Save changes'}
          </button>
        </div>
      </div>

      <div className="profile-content-card">
        <div className="profile-content-card-header">Plan</div>
        <div className="profile-content-card-body">
          <div className="profile-content-plan-row">
            <div>
              <div className="profile-content-plan-name">{plan || 'Free'}</div>
              <div className="profile-content-plan-sub">
                {role === 'admin'
                  ? 'Administrator'
                  : role === 'approved'
                    ? 'Approved subscriber'
                    : 'Free tier'}
              </div>
            </div>
          </div>
          {quota && (
            <div
              style={{
                marginTop: 16,
                padding: '12px 14px',
                background: '#e8e4db',
                border: '1px solid #d4cfc4',
                borderRadius: 6,
              }}
            >
              <div
                style={{
                  fontFamily: "'DM Mono', monospace",
                  fontSize: 9,
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  color: '#6b7280',
                  marginBottom: 4,
                }}
              >
                Lead Unlocks
              </div>
              <div style={{ fontSize: 15, fontWeight: 600, color: '#0f2744' }}>
                {quota.unlimited
                  ? 'Unlimited'
                  : `${quota.remaining ?? 0} of ${quota.limit ?? 5} credits remaining`}
              </div>
              {!quota.unlimited && (
                <div style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>
                  {quota.used} used to date
                </div>
              )}
            </div>
          )}
          {memberSince && <div className="profile-content-plan-meta">Member since {memberSince}</div>}
        </div>
      </div>

      <button type="button" className="profile-content-signout" onClick={() => signOut({ redirectUrl: '/' })}>
        Sign out
      </button>
    </div>
  )
}
