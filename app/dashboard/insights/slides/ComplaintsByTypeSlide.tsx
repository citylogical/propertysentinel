import type { ComplaintTypeEntry } from '../types'
import styles from '../insights.module.css'

type Props = { entries: ComplaintTypeEntry[] }

// Horizontal bars, max 6 codes. Bar width proportional to top count. WCA2
// already excluded upstream — the API filter handles that.
export default function ComplaintsByTypeSlide({ entries }: Props) {
  if (entries.length === 0) {
    return (
      <div className={styles.byTypeWrap}>
        <div className={styles.byTypeEmpty}>No complaint activity in the last 60 days.</div>
      </div>
    )
  }
  const top = entries.slice(0, 6)
  const max = Math.max(1, ...top.map((e) => e.count))
  return (
    <div className={styles.byTypeWrap}>
      {top.map((e) => {
        const pct = (e.count / max) * 100
        return (
          <div key={e.code} className={styles.byTypeRow}>
            <div className={styles.byTypeCode}>{e.code}</div>
            <div className={styles.byTypeLabel}>{e.label}</div>
            <div className={styles.byTypeBarTrack}>
              <div className={styles.byTypeBarFill} style={{ width: `${pct}%` }} />
            </div>
            <div className={styles.byTypeCount}>{e.count}</div>
          </div>
        )
      })}
    </div>
  )
}
