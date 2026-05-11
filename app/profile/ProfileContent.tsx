'use client'

import { useUser, useClerk } from '@clerk/nextjs'
import { UserProfile } from '@clerk/nextjs'
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
  const [showSecurityModal, setShowSecurityModal] = useState(false)

  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [organization, setOrganization] = useState('')
  const [phone, setPhone] = useState('')
  const [zip, setZip] = useState('')

  const [email, setEmail] = useState('')
  const [plan, setPlan] = useState('')
  const [role, setRole] = useState('')
  const [memberSince, setMemberSince] = useState('')

  useEffect(() => {
    if (!isLoaded) return

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

  const roleLabel =
    role === 'admin' ? 'Administrator' : role === 'approved' ? 'Approved subscriber' : 'Free tier'

  return (
    <>
      <div className="profile-content" style={{ maxWidth: 720, margin: '0 auto' }}>
        {/* Account information card */}
        <div
          style={{
            background: '#fff',
            borderRadius: 8,
            border: '1px solid #ece8dd',
            overflow: 'hidden',
            marginBottom: 16,
          }}
        >
          <div
            style={{
              background: '#243f5e',
              color: '#fff',
              padding: '14px 22px',
              fontFamily: 'var(--font-mono, ui-monospace, monospace)',
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
            }}
          >
            Account information
          </div>
          <div style={{ padding: '22px 22px 8px' }}>
            <Field
              id="profile-email"
              label="Email"
              value={email}
              readOnly
              hint="Use 'Manage sign-in & security' below to change"
            />

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <Field
                id="profile-first"
                label="First name"
                value={firstName}
                onChange={setFirstName}
                placeholder="First name"
              />
              <Field
                id="profile-last"
                label="Last name"
                value={lastName}
                onChange={setLastName}
                placeholder="Last name"
              />
            </div>

            <Field
              id="profile-org"
              label="Organization"
              value={organization}
              onChange={setOrganization}
              placeholder="Company or property management firm"
            />

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <Field
                id="profile-phone"
                label="Phone"
                value={phone}
                onChange={setPhone}
                placeholder="(312) 555-0100"
                type="tel"
              />
              <Field
                id="profile-zip"
                label="Zip code"
                value={zip}
                onChange={setZip}
                placeholder="60601"
                maxLength={10}
              />
            </div>
          </div>
          <div
            style={{
              padding: '14px 22px',
              borderTop: '1px solid #f0ede5',
              background: '#faf8f3',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'flex-end',
              gap: 12,
            }}
          >
            {error ? (
              <span style={{ color: '#b8302a', fontSize: 12 }}>{error}</span>
            ) : null}
            {saved ? (
              <span style={{ color: '#166534', fontSize: 12, fontWeight: 500 }}>
                Saved ✓
              </span>
            ) : null}
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              style={{
                background: '#1e3a5f',
                color: '#fff',
                border: 'none',
                padding: '8px 18px',
                borderRadius: 4,
                fontSize: 13,
                fontWeight: 500,
                cursor: saving ? 'not-allowed' : 'pointer',
                opacity: saving ? 0.6 : 1,
                fontFamily: 'inherit',
              }}
            >
              {saving ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </div>

        {/* Plan card — compact horizontal */}
        <div
          style={{
            background: '#fff',
            borderRadius: 8,
            border: '1px solid #ece8dd',
            overflow: 'hidden',
            marginBottom: 16,
          }}
        >
          <div
            style={{
              background: '#243f5e',
              color: '#fff',
              padding: '14px 22px',
              fontFamily: 'var(--font-mono, ui-monospace, monospace)',
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
            }}
          >
            Plan
          </div>
          <div
            style={{
              padding: '20px 22px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 14,
              flexWrap: 'wrap',
            }}
          >
            <div>
              <div style={{ fontSize: 18, fontWeight: 600, color: '#1a1a1a', lineHeight: 1.2 }}>
                {plan || 'Free'}
              </div>
              <div style={{ fontSize: 12, color: '#666', marginTop: 4 }}>{roleLabel}</div>
            </div>
            {memberSince ? (
              <div style={{ textAlign: 'right' }}>
                <div
                  style={{
                    fontFamily: 'var(--font-mono, ui-monospace, monospace)',
                    fontSize: 10,
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                    color: '#888',
                  }}
                >
                  Member since
                </div>
                <div style={{ fontSize: 13, color: '#1a1a1a', marginTop: 2 }}>{memberSince}</div>
              </div>
            ) : null}
          </div>
        </div>

        {/* Footer — security link + sign out */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '8px 4px 24px',
            fontSize: 13,
          }}
        >
          <button
            type="button"
            onClick={() => setShowSecurityModal(true)}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#1e3a5f',
              padding: 0,
              cursor: 'pointer',
              fontFamily: 'inherit',
              fontSize: 13,
            }}
          >
            Manage sign-in & security →
          </button>
          <button
            type="button"
            onClick={() => signOut({ redirectUrl: '/' })}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#888',
              padding: 0,
              cursor: 'pointer',
              fontFamily: 'inherit',
              fontSize: 13,
            }}
          >
            Sign out
          </button>
        </div>
      </div>

      {/* Clerk UserProfile modal */}
      {showSecurityModal ? (
        <div
          role="dialog"
          aria-modal="true"
          onClick={() => setShowSecurityModal(false)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: 24,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: '#fff',
              borderRadius: 8,
              maxWidth: 880,
              width: '100%',
              maxHeight: '88vh',
              overflow: 'auto',
              boxShadow: '0 30px 90px rgba(0,0,0,0.3)',
              position: 'relative',
            }}
          >
            <button
              type="button"
              onClick={() => setShowSecurityModal(false)}
              aria-label="Close"
              style={{
                position: 'absolute',
                top: 12,
                right: 12,
                background: 'transparent',
                border: 'none',
                fontSize: 24,
                cursor: 'pointer',
                color: '#666',
                zIndex: 10,
                padding: 4,
              }}
            >
              ×
            </button>
            <UserProfile
              routing="hash"
              appearance={{
                elements: {
                  rootBox: { width: '100%' },
                  card: { boxShadow: 'none', border: 'none' },
                },
              }}
            />
          </div>
        </div>
      ) : null}
    </>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// Field — labeled input subcomponent
// ─────────────────────────────────────────────────────────────────────────

type FieldProps = {
  id: string
  label: string
  value: string
  onChange?: (v: string) => void
  placeholder?: string
  readOnly?: boolean
  hint?: string
  type?: string
  maxLength?: number
}

function Field({ id, label, value, onChange, placeholder, readOnly, hint, type = 'text', maxLength }: FieldProps) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label
        htmlFor={id}
        style={{
          display: 'block',
          fontFamily: 'var(--font-mono, ui-monospace, monospace)',
          fontSize: 10,
          fontWeight: 500,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          color: '#666',
          marginBottom: 6,
        }}
      >
        {label}
      </label>
      <input
        id={id}
        type={type}
        value={value}
        readOnly={readOnly}
        maxLength={maxLength}
        onChange={(e) => onChange?.(e.target.value)}
        placeholder={placeholder}
        style={{
          width: '100%',
          padding: '8px 12px',
          fontSize: 13,
          fontFamily: 'inherit',
          border: '1px solid #d9d3c2',
          borderRadius: 4,
          background: readOnly ? '#f5f2eb' : '#fff',
          color: readOnly ? '#666' : '#1a1a1a',
          outline: 'none',
        }}
      />
      {hint ? (
        <div style={{ fontSize: 11, color: '#888', marginTop: 4 }}>{hint}</div>
      ) : null}
    </div>
  )
}
