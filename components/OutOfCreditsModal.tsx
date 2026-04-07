'use client'

type Props = {
  isOpen: boolean
  onClose: () => void
}

export default function OutOfCreditsModal({ isOpen, onClose }: Props) {
  if (!isOpen) return null
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
          maxWidth: 440,
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
          Out of free unlocks
        </div>
        <p style={{ fontSize: 14, color: '#3a3a3a', lineHeight: 1.5, margin: '0 0 14px' }}>
          Free tier: 5 unlocks used. Subscription tiers coming soon.
        </p>
        <p style={{ fontSize: 14, color: '#3a3a3a', lineHeight: 1.5, margin: '0 0 20px' }}>
          Email{' '}
          <a href="mailto:jim@propertysentinel.io" style={{ color: '#0f2744', textDecoration: 'underline' }}>
            jim@propertysentinel.io
          </a>{' '}
          for early access.
        </p>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: '#0f2744',
              color: '#f2f0eb',
              border: 'none',
              borderRadius: 6,
              padding: '9px 18px',
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
              fontFamily: "'Inter', sans-serif",
            }}
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  )
}