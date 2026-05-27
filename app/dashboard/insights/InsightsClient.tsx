'use client'

import { useEffect, useState } from 'react'
import styles from './insights.module.css'
import type { InsightsData } from './types'
import HeadlineInsight from './HeadlineInsight'
import KpiStrip from './KpiStrip'
import InsightsCarousel from './InsightsCarousel'
import WhatChangedPanel from './WhatChangedPanel'
import HotProperties from './HotProperties'

export default function InsightsClient() {
  const [data, setData] = useState<InsightsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)

    fetch('/api/dashboard/insights')
      .then(async (res) => {
        if (!res.ok) {
          const txt = await res.text().catch(() => '')
          throw new Error(`HTTP ${res.status}: ${txt || 'request failed'}`)
        }
        return res.json() as Promise<InsightsData>
      })
      .then((d) => {
        if (cancelled) return
        setData(d)
      })
      .catch((e: unknown) => {
        if (cancelled) return
        setError(e instanceof Error ? e.message : String(e))
      })
      .finally(() => {
        if (cancelled) return
        setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [])

  if (loading) {
    return (
      <div className={styles.page}>
        <div className={styles.pageInner}>
          <div className={styles.loadingFallback}>Loading insights…</div>
        </div>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className={styles.page}>
        <div className={styles.pageInner}>
          <div className={styles.errorFallback}>
            Failed to load insights{error ? `: ${error}` : ''}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.page}>
      <div className={styles.pageInner}>
        <div className={styles.identityRow}>
          <div className={styles.identityTitle}>
            {data.meta.org_name ?? 'Portfolio'} — Insights
          </div>
          <div className={styles.identityMeta}>
            {data.meta.portfolio_buildings} buildings · last 24h
          </div>
        </div>

        <HeadlineInsight headline={data.headline} />

        <KpiStrip kpis={data.kpis} />

        <div className={styles.midGrid}>
          <InsightsCarousel
            scope={data.scope}
            workflowBeads={data.workflow_beads}
            dailyActivity={data.daily_activity}
            complaintsByType={data.complaints_by_type}
            agingBuckets={data.aging_buckets}
          />
          <WhatChangedPanel events={data.what_changed} />
        </div>

        <HotProperties properties={data.hot_properties} />
      </div>
    </div>
  )
}
