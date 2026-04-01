import Link from 'next/link'
import { addressToSlug } from '@/lib/address-slug'

export type OwnerProperty = {
  address: string
  address_normalized: string
  pin: string
  neighborhood: string | null
}

type Props = {
  mailingName: string
  properties: OwnerProperty[]
}

function titleCaseAddress(addr: string): string {
  return addr
    .split(' ')
    .map((w, i) => {
      if (i === 0) return w
      const u = w.toUpperCase()
      if (/^[NSEW]$/.test(u)) return u
      return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()
    })
    .join(' ')
}

export default function OwnerPortfolioCard({ mailingName, properties }: Props) {
  if (properties.length === 0) return null

  const grouped = new Map<string, { address: string; pin: string; count: number; neighborhood: string | null }>()
  for (const p of properties) {
    const parts = p.address_normalized.split(' ')
    const key = parts.slice(0, Math.min(parts.length, 5)).join(' ')
    if (!grouped.has(key)) {
      grouped.set(key, { address: p.address_normalized, pin: p.pin, count: 1, neighborhood: p.neighborhood })
    } else {
      grouped.get(key)!.count++
    }
  }

  const entries = Array.from(grouped.entries()).map(([groupKey, entry]) => ({ groupKey, ...entry }))

  return (
    <div className="profile-card" style={{ marginTop: 12 }}>
      <div className="profile-card-header" style={{ background: '#264a6e', color: 'rgba(255,255,255,0.95)' }}>
        <span style={{ flex: 1 }}>Mutually Owned Parcels</span>
      </div>
      <div
        style={{
          fontSize: '12px',
          color: 'var(--text)',
          fontWeight: 600,
          padding: '8px 14px',
          borderBottom: '1px solid var(--border)',
        }}
      >
        {mailingName} · {properties.length}{' '}
        {properties.length === 1 ? 'parcel' : 'parcels'}
      </div>
      <div style={{ maxHeight: 300, overflowY: 'auto' }}>
        {entries.map((entry) => {
          const { address, count, pin, neighborhood } = entry
          const displayAddr = titleCaseAddress(address)
          const slug = addressToSlug(address)
          return (
            <Link
              key={pin}
              href={`/address/${encodeURIComponent(slug)}`}
              className="detail-row"
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'baseline',
                textDecoration: 'none',
                color: 'inherit',
                cursor: 'pointer',
              }}
            >
              <span className="detail-key" style={{ color: 'var(--navy)', fontWeight: 500 }}>
                {displayAddr}
                {count > 1 && (
                  <span style={{ fontSize: '10px', color: 'var(--text-dim)', fontWeight: 400, marginLeft: 6 }}>
                    ({count} parcels)
                  </span>
                )}
              </span>
              <span className="detail-val" style={{ color: 'var(--text-dim)', fontWeight: 400 }}>
                {neighborhood ?? ''}
              </span>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
