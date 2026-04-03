type Props = {
  mailingName: string
  isJunkName: boolean
  parcelsAtAddress: number
  otherParcelsCount: number
}

export default function OwnerPortfolioCard({
  mailingName,
  isJunkName,
  parcelsAtAddress,
  otherParcelsCount,
}: Props) {
  return (
    <div className="profile-card" style={{ marginTop: 12 }}>
      <div className="profile-card-header" style={{ background: '#264a6e', color: 'rgba(255,255,255,0.95)' }}>
        <span style={{ flex: 1 }}>Ownership Information</span>
      </div>

      <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)' }}>
        <div style={{ fontSize: '11px', color: 'var(--text-dim)', marginBottom: 2 }}>Mailing Name</div>
        <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--navy)' }}>{mailingName}</div>
        <div style={{ fontSize: '11px', color: 'var(--text-dim)', marginTop: 2 }}>
          {parcelsAtAddress} {parcelsAtAddress === 1 ? 'parcel' : 'parcels'} at this address
        </div>
      </div>

      <div style={{ position: 'relative', paddingBottom: 8 }}>
        <div className="detail-row">
          <span className="detail-key">Mailing Address</span>
          <span
            className="detail-val"
            style={{ filter: 'blur(5px)', userSelect: 'none', pointerEvents: 'none' }}
          >
            1234 N Example St, Chicago IL
          </span>
        </div>
        <div className="detail-row">
          <span className="detail-key">Phone Number</span>
          <span
            className="detail-val"
            style={{ filter: 'blur(5px)', userSelect: 'none', pointerEvents: 'none' }}
          >
            (312) 555-0100
          </span>
        </div>
        {!isJunkName && (
          <div className="detail-row">
            <span className="detail-key">Other Parcels Owned</span>
            <span
              className="detail-val"
              style={{ filter: 'blur(5px)', userSelect: 'none', pointerEvents: 'none' }}
            >
              {otherParcelsCount > 0 ? `${otherParcelsCount} properties` : '12 properties'}
            </span>
          </div>
        )}

        <div
          style={{
            position: 'absolute',
            top: 0,
            right: 0,
            bottom: 0,
            width: '60%',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(255, 255, 255, 0.4)',
            borderRadius: 6,
            pointerEvents: 'none',
          }}
        >
          <div
            style={{
              fontSize: '11px',
              fontWeight: 600,
              color: 'var(--navy)',
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              marginBottom: 4,
              display: 'flex',
              alignItems: 'center',
              gap: 4,
            }}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
            Unlock Owner Details
          </div>
          <div
            style={{
              fontSize: '10px',
              color: 'var(--text-dim)',
              textAlign: 'center',
              lineHeight: 1.4,
              maxWidth: 180,
            }}
          >
            Subscribe to view contact info and full ownership portfolio
          </div>
        </div>
      </div>
    </div>
  )
}
