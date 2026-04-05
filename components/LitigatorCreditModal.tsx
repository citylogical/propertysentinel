'use client'

type Props = {
  isOpen: boolean
  onClose: () => void
  address: string
}

export default function LitigatorCreditModal({ isOpen, onClose, address }: Props) {
  if (!isOpen) return null

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15, 39, 68, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: '24px',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#f2f0eb',
          border: '2px solid #0f2744',
          borderRadius: '8px',
          padding: '32px',
          maxWidth: '480px',
          width: '100%',
          boxShadow: '0 12px 32px rgba(15, 39, 68, 0.25)',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            marginBottom: '16px',
          }}
        >
          <span style={{ fontSize: '24px' }}>⚠</span>
          <h2
            style={{
              fontFamily: "'Merriweather', serif",
              fontSize: '20px',
              fontWeight: 700,
              color: '#0f2744',
              margin: 0,
            }}
          >
            TCPA Litigator Flagged — No Charge
          </h2>
        </div>

        <p
          style={{
            fontFamily: "'Inter', sans-serif",
            fontSize: '14px',
            color: '#3a3a3a',
            lineHeight: 1.6,
            marginBottom: '14px',
          }}
        >
          The contact we pulled for <strong>{address}</strong> is flagged as a known TCPA litigator — an
          individual with a documented pattern of filing lawsuits against businesses for phone outreach.
        </p>

        <p
          style={{
            fontFamily: "'Inter', sans-serif",
            fontSize: '14px',
            color: '#3a3a3a',
            lineHeight: 1.6,
            marginBottom: '14px',
          }}
        >
          We <strong>strongly recommend you do not call this number</strong>. Because this lead carries
          elevated legal risk, <strong>this unlock is on us</strong> — you will not be charged.
        </p>

        <p
          style={{
            fontFamily: "'Inter', sans-serif",
            fontSize: '13px',
            color: '#6b6b6b',
            lineHeight: 1.6,
            marginBottom: '24px',
            fontStyle: 'italic',
          }}
        >
          The contact info is still visible on your Unlocked Leads tab in case you want to review it, but
          we&apos;d suggest passing on this one.
        </p>

        <button
          type="button"
          onClick={onClose}
          style={{
            fontFamily: "'DM Mono', monospace",
            fontSize: '11px',
            fontWeight: 500,
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            background: '#0f2744',
            color: '#f2f0eb',
            border: 'none',
            padding: '12px 24px',
            borderRadius: '4px',
            cursor: 'pointer',
            width: '100%',
          }}
        >
          Got it — thanks
        </button>
      </div>
    </div>
  )
}
