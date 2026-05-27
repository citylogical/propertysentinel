import styles from './insights.module.css'
import type { ScopeCounts } from './types'

type Props = { scope: ScopeCounts }

// Used inside the InsightsCarousel card header to show the funnel from all
// open complaints → building+property scope → actionable subset. Third tier
// is visually emphasized — that's the number the workflow chart operates on.
export default function ScopeFunnel({ scope }: Props) {
  return (
    <div className={styles.funnel}>
      <div className={styles.funnelStep}>
        <div className={styles.funnelLabel}>All open</div>
        <div className={styles.funnelValue}>{scope.all_open}</div>
      </div>
      <div className={styles.funnelArrow}>›</div>
      <div className={styles.funnelStep}>
        <div className={styles.funnelLabel}>Building + property</div>
        <div className={styles.funnelValue}>{scope.building_property}</div>
      </div>
      <div className={styles.funnelArrow}>›</div>
      <div className={`${styles.funnelStep} ${styles.funnelStepEmphasized}`}>
        <div className={styles.funnelLabel}>Actionable</div>
        <div className={styles.funnelValue}>{scope.actionable}</div>
      </div>
    </div>
  )
}
