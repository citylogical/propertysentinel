'use client'

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import type { PortfolioSaveStatsPayload } from '@/lib/portfolio-save-stats'

type Ctx = {
  stats: PortfolioSaveStatsPayload | null
  setStats: (p: PortfolioSaveStatsPayload | null) => void
}

const PortfolioSaveStatsContext = createContext<Ctx | null>(null)

export function PortfolioSaveStatsProvider({ children }: { children: ReactNode }) {
  const [stats, setStatsState] = useState<PortfolioSaveStatsPayload | null>(null)
  const setStats = useCallback((p: PortfolioSaveStatsPayload | null) => {
    setStatsState(p)
  }, [])
  const value = useMemo(() => ({ stats, setStats }), [stats, setStats])
  return <PortfolioSaveStatsContext.Provider value={value}>{children}</PortfolioSaveStatsContext.Provider>
}

export function usePortfolioSaveStats(): Ctx {
  const ctx = useContext(PortfolioSaveStatsContext)
  if (!ctx) {
    return { stats: null, setStats: () => {} }
  }
  return ctx
}
