import type { AgingBuckets } from '../types'
import styles from '../insights.module.css'

type Props = { buckets: AgingBuckets }

const SEGMENTS = [
  { key: 'days_0_7' as const, label: '0–7 days', color: '#166534' },
  { key: 'days_8_30' as const, label: '8–30 days', color: '#b7791f' },
  { key: 'days_31_60' as const, label: '31–60 days', color: '#d4673a' },
  { key: 'days_60_plus' as const, label: '60+ days', color: '#c8102e' },
]

export default function OpenAgingSlide({ buckets }: Props) {
  const counts = SEGMENTS.map((s) => buckets[s.key])
  const total = counts.reduce((a, b) => a + b, 0)

  if (total === 0) {
    return (
      <div className={styles.agingWrap}>
        <div className={styles.agingEmpty}>No open actionable complaints.</div>
      </div>
    )
  }

  return (
    <div className={styles.agingWrap}>
      <div className={styles.agingTotal}>
        <span className={styles.agingTotalValue}>{total}</span>
        <span className={styles.agingTotalLabel}>open · actionable</span>
      </div>
      <div className={styles.agingBars}>
        {SEGMENTS.map((s, i) => {
          const count = counts[i]
          const pct = total > 0 ? (count / total) * 100 : 0
          return (
            <div key={s.key} className={styles.agingBucket}>
              <div className={styles.agingBucketHeader}>
                <span className={styles.agingBucketLabel}>{s.label}</span>
                <span className={styles.agingBucketCount}>{count}</span>
              </div>
              <div className={styles.agingBucketTrack}>
                <div className={styles.agingBucketFill} style={{ width: `${pct}%`, background: s.color }} />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
