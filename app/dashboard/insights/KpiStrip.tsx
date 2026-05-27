import styles from './insights.module.css'
import type { KpiBlock } from './types'

type Props = { kpis: KpiBlock }

function formatDelta(delta: number | null): { text: string; color: string } | null {
  if (delta == null) return null
  if (delta === 0) return { text: 'flat', color: '#6b7280' }
  const sign = delta > 0 ? '+' : ''
  return {
    text: `${sign}${delta}%`,
    color: delta > 0 ? '#c8102e' : '#166534',
  }
}

function formatMoney(dollars: number): string {
  if (dollars >= 1_000_000) return `$${(dollars / 1_000_000).toFixed(1)}M`
  if (dollars >= 1_000) return `$${Math.round(dollars / 1_000)}K`
  return `$${dollars}`
}

export default function KpiStrip({ kpis }: Props) {
  const openDelta = formatDelta(kpis.open_complaints_delta_pct)
  const newDelta = formatDelta(kpis.new_7d_delta_pct)
  const permitsDelta = formatDelta(kpis.permits_ytd_delta_pct_yoy)

  return (
    <div className={styles.kpiStrip}>
      <div className={styles.kpiCard}>
        <div className={styles.kpiLabel}>Open complaints</div>
        <div className={styles.kpiValue}>{kpis.open_complaints}</div>
        {openDelta ? (
          <div className={styles.kpiDelta} style={{ color: openDelta.color }}>
            {openDelta.text} vs 30d
          </div>
        ) : null}
      </div>

      <div className={styles.kpiCard}>
        <div className={styles.kpiLabel}>New · 7 days</div>
        <div className={styles.kpiValue}>{kpis.new_7d}</div>
        {newDelta ? (
          <div className={styles.kpiDelta} style={{ color: newDelta.color }}>
            {newDelta.text} vs prior wk
          </div>
        ) : null}
      </div>

      <div className={styles.kpiCard}>
        <div className={styles.kpiLabel}>Closed · 7 days</div>
        <div className={styles.kpiValue}>{kpis.closed_7d}</div>
        <div className={styles.kpiDotsRow}>
          <span className={styles.kpiDot} style={{ background: '#166534' }} title="Productive" />
          <span className={styles.kpiDotCount}>{kpis.closed_7d_outcomes.productive}</span>
          <span className={styles.kpiDot} style={{ background: '#6b7280' }} title="No cause" />
          <span className={styles.kpiDotCount}>{kpis.closed_7d_outcomes.no_cause}</span>
          <span className={styles.kpiDot} style={{ background: '#b7791f' }} title="Owner responsibility" />
          <span className={styles.kpiDotCount}>{kpis.closed_7d_outcomes.owner_responsibility}</span>
        </div>
      </div>

      <div className={`${styles.kpiCard} ${styles.kpiCardAlert}`}>
        <div className={styles.kpiLabel}>Overdue</div>
        <div className={`${styles.kpiValue} ${styles.kpiValueAlert}`}>{kpis.overdue}</div>
        {kpis.overdue_delta_24h !== 0 ? (
          <div className={styles.kpiDelta} style={{ color: kpis.overdue_delta_24h > 0 ? '#c8102e' : '#166534' }}>
            {kpis.overdue_delta_24h > 0 ? '+' : ''}{kpis.overdue_delta_24h} since yesterday
          </div>
        ) : (
          <div className={styles.kpiDelta} style={{ color: '#6b7280' }}>no change</div>
        )}
      </div>

      <div className={styles.kpiCard}>
        <div className={styles.kpiLabel}>Permits · YTD</div>
        <div className={styles.kpiValue}>{formatMoney(kpis.permits_ytd_dollars)}</div>
        {permitsDelta ? (
          <div className={styles.kpiDelta} style={{ color: '#6b7280' }}>
            {permitsDelta.text} YoY
          </div>
        ) : null}
      </div>
    </div>
  )
}
