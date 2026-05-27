import type { WorkflowBeads } from '../types'
import styles from '../insights.module.css'

type Props = { beads: WorkflowBeads }

// Five-bead chain. Bead diameter is proportional to count, capped at maxRadius
// for the largest bead. Zero counts render as hollow 5px rings so the stage is
// still visually present in the chain. Connecting lines run between bead
// edges (not centers) so the chain reads as discrete stops, not a continuous
// flow. Sizing is recomputed against the visible max each render.
const MAX_RADIUS = 38
const MIN_RADIUS = 5
const SVG_WIDTH = 700
const SVG_HEIGHT = 180
const BEAD_Y = 90
const STAGES = [
  { key: 'assign_inspector' as const, label: 'Assign Inspector', color: '#6b7280' },
  { key: 'investigation' as const, label: 'Investigation', color: '#b7791f' },
  { key: 'case_review' as const, label: 'Case Review', color: '#8a5a17' },
  { key: 'perform_work' as const, label: 'Perform Work', color: '#1a3a5c' },
  { key: 'closed_30d' as const, label: 'Closed', color: '#166534' },
]

export default function WorkflowBeadsSlide({ beads }: Props) {
  const counts = STAGES.map((s) => beads[s.key])
  const maxCount = Math.max(1, ...counts)

  const cx = (i: number) => (SVG_WIDTH / (STAGES.length + 1)) * (i + 1)

  const radius = (count: number) => {
    if (count === 0) return MIN_RADIUS
    return MIN_RADIUS + (count / maxCount) * (MAX_RADIUS - MIN_RADIUS)
  }

  return (
    <div className={styles.beadsWrap}>
      <svg
        viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`}
        className={styles.beadsSvg}
        preserveAspectRatio="xMidYMid meet"
      >
        {/* Connecting line segments — drawn first so beads sit on top */}
        {STAGES.slice(0, -1).map((s, i) => {
          const x1 = cx(i) + radius(counts[i])
          const x2 = cx(i + 1) - radius(counts[i + 1])
          return (
            <line
              key={`line-${i}`}
              x1={x1}
              y1={BEAD_Y}
              x2={x2}
              y2={BEAD_Y}
              stroke="#d9d3c2"
              strokeWidth={1.5}
              strokeDasharray="3 4"
            />
          )
        })}

        {/* Beads */}
        {STAGES.map((s, i) => {
          const count = counts[i]
          const r = radius(count)
          const isEmpty = count === 0
          return (
            <g key={s.key}>
              {/* Stage label above */}
              <text
                x={cx(i)}
                y={28}
                textAnchor="middle"
                fontFamily="DM Mono, ui-monospace, monospace"
                fontSize={11}
                fill="#6b7280"
                style={{ textTransform: 'uppercase', letterSpacing: '0.06em' }}
              >
                {s.label}
              </text>
              {/* Bead */}
              <circle
                cx={cx(i)}
                cy={BEAD_Y}
                r={r}
                fill={isEmpty ? 'transparent' : s.color}
                stroke={s.color}
                strokeWidth={isEmpty ? 1.5 : 0}
              />
              {/* Count below */}
              <text
                x={cx(i)}
                y={BEAD_Y + MAX_RADIUS + 26}
                textAnchor="middle"
                fontFamily="Inter, sans-serif"
                fontSize={16}
                fontWeight={600}
                fill={isEmpty ? '#999' : '#1a1a1a'}
              >
                {count}
              </text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}
