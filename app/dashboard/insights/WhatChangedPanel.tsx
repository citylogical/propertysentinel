import styles from './insights.module.css'
import type { WhatChangedEvent } from './types'

type Props = { events: WhatChangedEvent[] }

function dotColor(kind: WhatChangedEvent['kind']): string {
  switch (kind) {
    case 'stop_work':
      return '#c8102e'
    case 'owner_resp':
      return '#b7791f'
    case 'transition':
      return '#1e3a5f'
    case 'new_complaint':
      return '#1e3a5f'
    case 'closure':
      return '#166534'
    case 'permit':
      return '#166534'
  }
}

export default function WhatChangedPanel({ events }: Props) {
  return (
    <div className={styles.whatChangedCard}>
      <div className={styles.whatChangedHeader}>
        <div className={styles.whatChangedTitle}>What changed</div>
        <div className={styles.whatChangedMeta}>Last 7 days</div>
      </div>
      {events.length === 0 ? (
        <div className={styles.whatChangedEmpty}>No portfolio events in the last 7 days.</div>
      ) : (
        <div className={styles.whatChangedList}>
          {events.slice(0, 10).map((e, i) => (
            <div key={`${e.timestamp}-${i}`} className={styles.whatChangedRow}>
              <span className={styles.whatChangedDot} style={{ background: dotColor(e.kind) }} />
              <div className={styles.whatChangedBody}>
                <div className={styles.whatChangedLabel}>{e.label}</div>
                {e.address ? <div className={styles.whatChangedAddress}>{e.address}</div> : null}
              </div>
              <span className={styles.whatChangedAge}>{e.age_label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
