import type { ReactNode } from 'react'
import styles from './insights.module.css'
import type { HeadlineBlock } from './types'

type Props = { headline: HeadlineBlock }

// Deterministic template assembly. No LLM. Each clause is conditional so the
// rendered prose stays grammatical across all edge cases (zero activity, one
// address, no transitions, no overdue).
function buildHeadline(h: HeadlineBlock): ReactNode[] {
  const parts: ReactNode[] = []

  if (h.addresses_with_activity === 0) {
    parts.push('No portfolio activity in the last 24 hours.')
    if (h.overdue_count > 0) {
      parts.push(' ')
      parts.push(
        <span key="overdue">
          <strong>{h.overdue_count}</strong> open {h.overdue_count === 1 ? 'complaint is' : 'complaints are'} past their expected completion date.
        </span>
      )
    } else {
      parts.push(' All open complaints are within their expected completion windows.')
    }
    return parts
  }

  // Address clause
  if (h.addresses_with_activity === 1 && h.addresses_sample[0]) {
    parts.push(
      <span key="addr">
        Activity recorded at <strong>{h.addresses_sample[0]}</strong> in the last 24 hours.
      </span>
    )
  } else if (h.addresses_sample.length >= 2) {
    parts.push(
      <span key="addr">
        Activity recorded at <strong>{h.addresses_with_activity}</strong> addresses, including{' '}
        <strong>{h.addresses_sample[0]}</strong> and <strong>{h.addresses_sample[1]}</strong>.
      </span>
    )
  } else {
    parts.push(
      <span key="addr">
        Activity recorded at <strong>{h.addresses_with_activity}</strong> addresses.
      </span>
    )
  }

  // Workflow change clause
  if (h.workflow_changes_count > 0) {
    parts.push(' ')
    const closurePart =
      h.workflow_closures_count > 0 && h.closure_sample_address
        ? (
          <span key="close">
            {' '}— <strong>{h.workflow_closures_count}</strong> closed productive at{' '}
            <strong>{h.closure_sample_address}</strong>
          </span>
        )
        : null
    parts.push(
      <span key="wf">
        <strong>{h.workflow_changes_count}</strong>{' '}
        {h.workflow_changes_count === 1 ? 'complaint had' : 'complaints had'} workflow status changed
        {closurePart}
        .
      </span>
    )
  }

  // Overdue clause
  if (h.overdue_count > 0) {
    parts.push(' ')
    parts.push(
      <span key="overdue">
        <strong>{h.overdue_count}</strong> total {h.overdue_count === 1 ? 'is' : 'are'} past their expected completion date.
      </span>
    )
  }

  return parts
}

export default function HeadlineInsight({ headline }: Props) {
  return (
    <div className={styles.headlineCard}>
      <div className={styles.headlineLabel}>Last 24 hours</div>
      <div className={styles.headlineProse}>{buildHeadline(headline)}</div>
    </div>
  )
}
