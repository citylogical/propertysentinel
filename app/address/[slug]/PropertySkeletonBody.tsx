export default function PropertySkeletonBody() {
  return (
    <>
      <div className="profile">
        <div className="stat-row">
          {[
            { label: 'Complaints' },
            { label: 'Last Violation' },
            { label: 'Last Permit' },
            { label: 'Implied Value' },
          ].map((s) => (
            <div key={s.label} className="stat stat-sub-bottom">
              <div className="stat-label">{s.label}</div>
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  marginTop: 4,
                  gap: 6,
                }}
              >
                <div className="ps-skel-bar" style={{ width: 56, height: 14 }} />
                <div className="ps-skel-bar" style={{ width: 38, height: 9, opacity: 0.6 }} />
              </div>
            </div>
          ))}
        </div>

        <div className="profile-card">
          <div className="profile-card-header">
            <span style={{ flex: 1 }}>Property Details</span>
          </div>
          <div className="detail-list">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="detail-row">
                <span className="detail-key">
                  <span className="ps-skel-bar" style={{ width: 80, height: 10 }} />
                </span>
                <span className="detail-val">
                  <span className="ps-skel-bar" style={{ width: 140, height: 10 }} />
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div
        style={{
          marginTop: 16,
          padding: 20,
          background: 'var(--cream-dark)',
          border: '1px solid var(--border)',
          borderRadius: 6,
          fontFamily: 'var(--mono)',
          fontSize: 11,
          color: 'var(--text-dim)',
          textAlign: 'center',
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
        }}
      >
        Loading records…
      </div>

      <style>{`
        .ps-skel-bar {
          display: inline-block;
          background: linear-gradient(90deg, #e4e0d8 0%, #f0ece3 50%, #e4e0d8 100%);
          background-size: 200% 100%;
          border-radius: 3px;
          animation: ps-skel-pulse 1.4s ease-in-out infinite;
        }
        @keyframes ps-skel-pulse {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
      `}</style>
    </>
  )
}
