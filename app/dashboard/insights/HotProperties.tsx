import Link from 'next/link'
import styles from './insights.module.css'
import type { HotProperty } from './types'

type Props = { properties: HotProperty[] }

function liabilityColor(kind: HotProperty['liability_kind']): string {
  if (kind === 'stop_work') return '#c8102e'
  if (kind === 'owner_resp') return '#b7791f'
  if (kind === 'big_permit') return '#166534'
  return '#6b7280'
}

export default function HotProperties({ properties }: Props) {
  if (properties.length === 0) {
    return (
      <div className={styles.hotCard}>
        <div className={styles.hotHeader}>
          <div className={styles.hotTitle}>Hot properties</div>
        </div>
        <div className={styles.hotEmpty}>No properties with open or overdue activity.</div>
      </div>
    )
  }

  return (
    <div className={styles.hotCard}>
      <div className={styles.hotHeader}>
        <div className={styles.hotTitle}>Hot properties</div>
        <div className={styles.hotMeta}>Top 5 by overdue, then open</div>
      </div>
      <table className={styles.hotTable}>
        <thead>
          <tr>
            <th className={styles.hotThAddress}>Address</th>
            <th className={styles.hotThRight}>Open</th>
            <th className={styles.hotThRight}>Overdue</th>
            <th className={styles.hotThLeft}>Signal</th>
            <th className={styles.hotThRight}>Last event</th>
          </tr>
        </thead>
        <tbody>
          {properties.map((p) => {
            const href = p.slug ? `/address/${encodeURIComponent(p.slug)}?building=true` : null
            return (
              <tr key={p.id}>
                <td className={styles.hotTdAddress}>
                  {href ? (
                    <Link href={href} className={styles.hotAddressLink}>
                      {p.address}
                    </Link>
                  ) : (
                    <span>{p.address}</span>
                  )}
                  {p.community_area ? (
                    <span className={styles.hotCommunity}>{p.community_area}</span>
                  ) : null}
                </td>
                <td className={styles.hotTdRight}>
                  {p.open > 0 ? (
                    <span style={{ color: p.open >= 5 ? '#b8302a' : '#1a1a1a', fontWeight: 600 }}>{p.open}</span>
                  ) : (
                    <span className={styles.hotZero}>0</span>
                  )}
                </td>
                <td className={styles.hotTdRight}>
                  {p.overdue > 0 ? (
                    <span style={{ color: '#c8102e', fontWeight: 600 }}>{p.overdue}</span>
                  ) : (
                    <span className={styles.hotZero}>0</span>
                  )}
                </td>
                <td className={styles.hotTdLeft}>
                  {p.liability_label ? (
                    <span className={styles.hotSignalPill} style={{ color: liabilityColor(p.liability_kind), borderColor: liabilityColor(p.liability_kind) }}>
                      {p.liability_label}
                    </span>
                  ) : (
                    <span className={styles.hotZero}>—</span>
                  )}
                </td>
                <td className={styles.hotTdRight}>
                  {p.last_event_age ? (
                    <span className={styles.hotMono}>{p.last_event_age}</span>
                  ) : (
                    <span className={styles.hotZero}>—</span>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
