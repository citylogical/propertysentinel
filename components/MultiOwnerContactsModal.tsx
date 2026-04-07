'use client'

import { useEffect, useState } from 'react'

type Contact = {
  mailing_name: string | null
  mailing_address: string | null
  mailing_city: string | null
  mailing_state: string | null
  mailing_zip: string | null
  unit_count: number
  pins: string[]
}

type Props = {
  isOpen: boolean
  onClose: () => void
  address: string
}

export default function MultiOwnerContactsModal({ isOpen, onClose, address }: Props) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [contacts, setContacts] = useState<Contact[]>([])
  const [totalPins, setTotalPins] = useState(0)

  useEffect(() => {
    if (!isOpen || !address) return
    let cancelled = false
    setLoading(true)
    setError(null)
    setContacts([])
    void (async () => {
      try {
        const res = await fetch(`/api/leads/contacts-by-address?address=${encodeURIComponent(address)}`)
        if (!res.ok) {
          if (cancelled) return
          setError('Could not load contacts.')
          return
        }
        const data = (await res.json()) as { contacts?: Contact[]; total_pins?: number }
        if (cancelled) return
        setContacts(data.contacts ?? [])
        setTotalPins(data.total_pins ?? 0)
      } catch {
        if (cancelled) return
        setError('Network error.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [isOpen, address])

  if (!isOpen) return null

  const formatMailingAddress = (c: Contact): string => {
    return [c.mailing_address, [c.mailing_city, c.mailing_state, c.mailing_zip].filter(Boolean).join(' ')]
      .filter((s) => s && String(s).trim() !== '')
      .join(', ')
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
          padding: 24,
          maxWidth: 720,
          width: '100%',
          maxHeight: '85vh',
          display: 'flex',
          flexDirection: 'column',
          fontFamily: "'Inter', sans-serif",
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
          <div>
            <div
              style={{
                fontFamily: 'Merriweather, Georgia, serif',
                fontSize: 18,
                fontWeight: 600,
                color: '#0f2744',
                marginBottom: 4,
              }}
            >
              Tax Assessor Contacts on File
            </div>
            <div style={{ fontSize: 12, color: '#6b7280' }}>{address}</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{
              background: 'transparent',
              border: 'none',
              fontSize: 22,
              color: '#6b7280',
              cursor: 'pointer',
              padding: 0,
              lineHeight: 1,
            }}
          >
            ×
          </button>
        </div>

        {loading ? (
          <div
            style={{
              padding: '40px 20px',
              textAlign: 'center',
              fontFamily: "'DM Mono', monospace",
              fontSize: 11,
              color: '#6b7280',
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
            }}
          >
            Loading contacts…
          </div>
        ) : error ? (
          <div
            style={{
              padding: 12,
              background: '#fecaca',
              border: '1px solid #ef4444',
              borderRadius: 6,
              fontSize: 12,
              color: '#991b1b',
            }}
          >
            {error}
          </div>
        ) : contacts.length === 0 ? (
          <div
            style={{
              padding: '40px 20px',
              textAlign: 'center',
              fontSize: 13,
              color: '#6b7280',
            }}
          >
            No taxpayer contacts on file for this address.
          </div>
        ) : (
          <>
            <div
              style={{
                fontSize: 11,
                color: '#6b7280',
                marginBottom: 12,
                paddingBottom: 10,
                borderBottom: '1px solid #d4cfc4',
              }}
            >
              {contacts.length} {contacts.length === 1 ? 'contact' : 'contacts'} across {totalPins}{' '}
              {totalPins === 1 ? 'parcel' : 'parcels'}. Sorted by units owned. Click any name to search Google for a
              phone number.
            </div>
            <div style={{ overflowY: 'auto', flex: 1 }}>
              {contacts.map((c, idx) => {
                const mailing = formatMailingAddress(c)
                const searchUrl = c.mailing_name
                  ? `https://www.google.com/search?q=${encodeURIComponent(`${c.mailing_name} ${address} phone number`)}`
                  : null
                return (
                  <div
                    key={`${c.mailing_name}-${idx}`}
                    style={{
                      padding: '12px 0',
                      borderBottom: idx === contacts.length - 1 ? 'none' : '1px solid #e5e7eb',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'flex-start',
                      gap: 16,
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                        {searchUrl ? (
                          <a
                            href={searchUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                              fontSize: 14,
                              fontWeight: 600,
                              color: '#0f2744',
                              textDecoration: 'none',
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.textDecoration = 'underline'
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.textDecoration = 'none'
                            }}
                          >
                            {c.mailing_name ?? '—'}
                          </a>
                        ) : (
                          <span style={{ fontSize: 14, fontWeight: 600, color: '#0f2744' }}>
                            {c.mailing_name ?? '—'}
                          </span>
                        )}
                        {c.unit_count > 1 ? (
                          <span
                            style={{
                              fontFamily: "'DM Mono', monospace",
                              fontSize: 9,
                              fontWeight: 600,
                              letterSpacing: '0.08em',
                              textTransform: 'uppercase',
                              background: '#e0e7ff',
                              color: '#3730a3',
                              border: '1px solid #a5b4fc',
                              padding: '2px 6px',
                              borderRadius: 3,
                            }}
                          >
                            {c.unit_count} units
                          </span>
                        ) : null}
                      </div>
                      {mailing ? (
                        <div style={{ fontSize: 12, color: '#6b7280', lineHeight: 1.4 }}>{mailing}</div>
                      ) : null}
                    </div>
                  </div>
                )
              })}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
