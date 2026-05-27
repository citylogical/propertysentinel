'use client'

import { useEffect, useRef, useState } from 'react'
import styles from './insights.module.css'
import ScopeFunnel from './ScopeFunnel'
import WorkflowBeadsSlide from './slides/WorkflowBeadsSlide'
import DailyActivitySlide from './slides/DailyActivitySlide'
import ComplaintsByTypeSlide from './slides/ComplaintsByTypeSlide'
import OpenAgingSlide from './slides/OpenAgingSlide'
import type {
  AgingBuckets,
  ComplaintTypeEntry,
  DailyActivityEntry,
  ScopeCounts,
  WorkflowBeads,
} from './types'

type Props = {
  scope: ScopeCounts
  workflowBeads: WorkflowBeads
  dailyActivity: DailyActivityEntry[]
  complaintsByType: ComplaintTypeEntry[]
  agingBuckets: AgingBuckets
}

const AUTO_ADVANCE_MS = 12000

// Each slide owns its title + meta string. The carousel renders them in the
// card header so the chart inside has clean real estate. Keep titles short —
// they live next to the funnel.
const SLIDE_META: Array<{ title: string; meta: string }> = [
  { title: 'Workflow status', meta: 'Open by stage · closed last 30d' },
  { title: 'Daily activity', meta: 'Last 60 days · stacked' },
  { title: 'Complaints by SR type', meta: 'Last 60 days · top 6 · WCA2 excluded' },
  { title: 'Open complaint aging', meta: 'Actionable scope · point-in-time' },
]

export default function InsightsCarousel({
  scope,
  workflowBeads,
  dailyActivity,
  complaintsByType,
  agingBuckets,
}: Props) {
  const [index, setIndex] = useState(0)
  const [paused, setPaused] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Auto-advance. Clears + reschedules on every index change, on every
  // pause/resume, and on unmount. Pausing kills the timer; un-pausing restarts.
  useEffect(() => {
    if (paused) return
    timerRef.current = setTimeout(() => {
      setIndex((i) => (i + 1) % SLIDE_META.length)
    }, AUTO_ADVANCE_MS)
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [index, paused])

  const goTo = (i: number) => {
    setIndex(((i % SLIDE_META.length) + SLIDE_META.length) % SLIDE_META.length)
  }
  const next = () => goTo(index + 1)
  const prev = () => goTo(index - 1)

  const meta = SLIDE_META[index]

  return (
    <div
      className={styles.carouselCard}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div className={styles.carouselHeader}>
        <div>
          <div className={styles.carouselTitle}>{meta.title}</div>
          <div className={styles.carouselMeta}>{meta.meta}</div>
        </div>
        <ScopeFunnel scope={scope} />
      </div>

      <div className={styles.carouselViewport}>
        <div className={`${styles.carouselSlide} ${index === 0 ? styles.carouselSlideActive : ''}`}>
          <WorkflowBeadsSlide beads={workflowBeads} />
        </div>
        <div className={`${styles.carouselSlide} ${index === 1 ? styles.carouselSlideActive : ''}`}>
          <DailyActivitySlide entries={dailyActivity} />
        </div>
        <div className={`${styles.carouselSlide} ${index === 2 ? styles.carouselSlideActive : ''}`}>
          <ComplaintsByTypeSlide entries={complaintsByType} />
        </div>
        <div className={`${styles.carouselSlide} ${index === 3 ? styles.carouselSlideActive : ''}`}>
          <OpenAgingSlide buckets={agingBuckets} />
        </div>
      </div>

      <div className={styles.carouselNav}>
        <button type="button" onClick={prev} className={styles.carouselArrow} aria-label="Previous slide">‹</button>
        <div className={styles.carouselDots}>
          {SLIDE_META.map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => goTo(i)}
              className={`${styles.carouselDot} ${i === index ? styles.carouselDotActive : ''}`}
              aria-label={`Slide ${i + 1}`}
            />
          ))}
        </div>
        <button type="button" onClick={next} className={styles.carouselArrow} aria-label="Next slide">›</button>
      </div>
    </div>
  )
}
