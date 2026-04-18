'use client'

import { useEffect } from 'react'
import type { PortfolioSaveStatsPayload } from '@/lib/portfolio-save-stats'
import { usePortfolioSaveStats } from '@/components/PortfolioSaveStatsContext'

export default function PortfolioSaveStatsUpdater({ payload }: { payload: PortfolioSaveStatsPayload }) {
  const { setStats } = usePortfolioSaveStats()

  useEffect(() => {
    setStats(payload)
    return () => setStats(null)
  }, [payload, setStats])

  return null
}
