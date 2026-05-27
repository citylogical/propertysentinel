'use client'

import { useState } from 'react'
import type { DailyActivityEntry } from '../types'
import styles from '../insights.module.css'

type Props = { entries: DailyActivityEntry[] }

type Category = 'complaints' | 'violations' | 'permits'
const CATEGORY_META: Record<Category, { label: string; color: string }> = {
  complaints: { label: 'Complaints', color: '#1e3a5f' },
  violations: { label: 'Violations', color: '#b8302a' },
  permits: { label: 'Permits', color: '#166534' },
}

// Stacked vertical bars over 60 days. Each toggle disables a stack. Y-axis
// rescales to the visible max so a single-category view doesn't render as
// a flat line at the bottom of the chart.
const SVG_WIDTH = 900
const SVG_HEIGHT = 200
const TOP_PAD = 16
const BOTTOM_PAD = 28
const SIDE_PAD = 12

export default function DailyActivitySlide({ entries }: Props) {
  const [visible, setVisible] = useState<Record<Category, boolean>>({
    complaints: true,
    violations: true,
    permits: true,
  })

  const visibleTotal = (e: DailyActivityEntry): number => {
    return (
      (visible.complaints ? e.complaints : 0) +
      (visible.violations ? e.violations : 0) +
      (visible.permits ? e.permits : 0)
    )
  }

  const max = Math.max(1, ...entries.map(visibleTotal))
  const chartHeight = SVG_HEIGHT - TOP_PAD - BOTTOM_PAD
  const barWidth = entries.length > 0 ? (SVG_WIDTH - SIDE_PAD * 2) / entries.length : 0
  const barGap = Math.max(1, barWidth * 0.15)
  const innerBarWidth = barWidth - barGap

  const yForStack = (stackBase: number, value: number): { y: number; h: number } => {
    const h = (value / max) * chartHeight
    const y = TOP_PAD + chartHeight - stackBase - h
    return { y, h }
  }

  const toggle = (k: Category) => setVisible((v) => ({ ...v, [k]: !v[k] }))

  return (
    <div className={styles.activityWrap}>
      <div className={styles.activityToggles}>
        {(Object.keys(CATEGORY_META) as Category[]).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => toggle(k)}
            className={`${styles.activityToggle} ${!visible[k] ? styles.activityToggleOff : ''}`}
          >
            <span className={styles.activityToggleSwatch} style={{ background: CATEGORY_META[k].color }} />
            {CATEGORY_META[k].label}
          </button>
        ))}
      </div>
      <svg viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`} className={styles.activitySvg} preserveAspectRatio="none">
        {/* Baseline */}
        <line
          x1={SIDE_PAD}
          y1={TOP_PAD + chartHeight}
          x2={SVG_WIDTH - SIDE_PAD}
          y2={TOP_PAD + chartHeight}
          stroke="#e5e1d6"
          strokeWidth={1}
        />
        {entries.map((e, i) => {
          const x = SIDE_PAD + i * barWidth
          let stack = 0
          const stacks: Array<{ y: number; h: number; color: string }> = []
          for (const k of ['complaints', 'violations', 'permits'] as Category[]) {
            if (!visible[k]) continue
            const v = e[k]
            if (v === 0) continue
            const { y, h } = yForStack(stack, v)
            stacks.push({ y, h, color: CATEGORY_META[k].color })
            stack += h
          }
          return (
            <g key={e.date}>
              {stacks.map((s, j) => (
                <rect
                  key={j}
                  x={x}
                  y={s.y}
                  width={innerBarWidth}
                  height={s.h}
                  fill={s.color}
                />
              ))}
            </g>
          )
        })}
        {/* Date ticks: first, middle, last */}
        {[0, Math.floor(entries.length / 2), entries.length - 1].map((i) => {
          if (!entries[i]) return null
          const x = SIDE_PAD + i * barWidth + innerBarWidth / 2
          return (
            <text
              key={`tick-${i}`}
              x={x}
              y={SVG_HEIGHT - 8}
              textAnchor="middle"
              fontFamily="DM Mono, ui-monospace, monospace"
              fontSize={10}
              fill="#999"
            >
              {entries[i].date.slice(5)}
            </text>
          )
        })}
      </svg>
    </div>
  )
}
