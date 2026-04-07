'use client'

import { useState } from 'react'

type Props = {
  isOpen: boolean
  onClose: () => void
  srNumber: string
  address: string
  onSuccess: (newQuota: { remaining: number | null; unlimited: boolean }) => void
}

export default function IncorrectInfoModal({
  isOpen,
  onClose,
  srNumber,
  address,
  onSuccess,
}: Props) {
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!isOpen) return null

  const handleSubmit = async () => {
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch('/api/leads/unlock/credit-back', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sr_number: srNumber }),
      })
      const data = (await res.json()) as {
        success: boolean
        message?: string
        quota?: { remaining: number | null; unlimited: boolean }
      }
      if (!data.success) {
        setError(data.message || 'Could not process credit-back.')
        return
      }
      if (data.quota) onSuccess({ remaining: data.quota.remaining, unlimited: data.quota.unlimited })
      onClose()
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15, 39, 68, 0.55)',
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#f2f0eb',
          border: '1px solid #0f2744',
          borderRadius: 8,
          padding: 28,
          maxWidth: 460,
          width: '100%',
          fontFamily: "'Inter', sans-serif",
        }}
      >
        <div
          style={{
            fontFamily: 'Merriweather, Georgia, serif',
            fontSize: 18,
            fontWeight: 600,
            color: '#0f2744',
            marginBottom: 10,
          }}
        >
          Report incorrect information
        </div>
        <p style={{ fontSize: 13, color: '#3a3a3a', lineHeight: 1.5, margin: '0 0 8px' }}>
          Getting a credit back for:
        </p>
        <div
          style={{
            fontSize: 13,
            color: '#0f2744',
            fontWeight: 500,
            margin: '0 0 14px',
          }}
        >
          {address}
        </div>
        <div
          style={{
            fontSize: 12,
            color: '#6b7280',
            lineHeight: 1.55,
            background: '#e8e4db',
            border: '1px solid #d4cfc4',
            borderRadius: 6,
            padding: '10px 12px',
            marginBottom: 18,
          }}
        >
          <strong style={{ color: '#3a3a3a' }}>Rules:</strong> up to 2 credit-backs per 24 hours,
          only within 7 days of the original unlock, and only once per lead. You&apos;ll keep
          seeing the data you unlocked either way.
        </div>
        {error ? (
          <div
            style={{
              fontSize: 12,
              color: '#991b1b',
              background: '#fecaca',
              border: '1px solid #ef4444',
              borderRadius: 6,
              padding: '8px 12px',
              marginBottom: 14,
            }}
          >
            {error}
          </div>
        ) : null}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            style={{
              background: 'transparent',
              color: '#0f2744',
              border: '1px solid #0f2744',
              borderRadius: 6,
              padding: '9px 16px',
              fontSize: 13,
              fontWeight: 600,
              cursor: submitting ? 'not-allowed' : 'pointer',
              fontFamily: "'Inter', sans-serif",
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={submitting}
            style={{
              background: '#0f2744',
              color: '#f2f0eb',
              border: 'none',
              borderRadius: 6,
              padding: '9px 18px',
              fontSize: 13,
              fontWeight: 600,
              cursor: submitting ? 'not-allowed' : 'pointer',
              fontFamily: "'Inter', sans-serif",
            }}
          >
            {submitting ? 'Submitting…' : 'Request credit-back'}
          </button>
        </div>
      </div>
    </div>
  )
}