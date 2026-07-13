'use client'

import { useEffect, useRef, useState, type CSSProperties } from 'react'

// Drives the post-save "building your portfolio" sequence: finish promotion
// (when arriving from Stripe checkout), compute activity stats for any
// property still missing them, then enrich the newest owner-liability
// complaints so the highlights modal and dashboard have real data to show.
// Entirely client-side, entirely ambient — no buttons, nothing blocking.
// Only runs when the URL carries `checkout=success` or `build=1`; a bare
// dashboard visit does nothing (no query param, no traffic).

type Phase = 'idle' | 'finishing' | 'stats' | 'enrich' | 'done'

type Props = {
  isSignedIn: boolean
}

const FINISH_TIMEOUT_MS = 30_000
const FINISH_POLL_MS = 2_000
const FINISH_ATTEMPT_COMMIT_AFTER_POLLS = 3

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export default function PortfolioBuildDriver({ isSignedIn }: Props) {
  const [phase, setPhase] = useState<Phase>('idle')
  const [progress, setProgress] = useState({ processed: 0, total: 0 })
  const [fadeOut, setFadeOut] = useState(false)
  const [visible, setVisible] = useState(false)
  const cancelledRef = useRef(false)
  const startedRef = useRef(false)

  useEffect(() => {
    cancelledRef.current = false
    return () => {
      cancelledRef.current = true
    }
  }, [])

  useEffect(() => {
    if (!isSignedIn || startedRef.current) return
    if (typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    const checkout = params.get('checkout')
    const build = params.get('build')
    if (checkout !== 'success' && build !== '1') return
    startedRef.current = true

    const stripQueryParam = () => {
      const url = new URL(window.location.href)
      url.searchParams.delete('checkout')
      url.searchParams.delete('build')
      window.history.replaceState({}, '', url.toString())
    }

    const runEnrich = async () => {
      setPhase('enrich')
      let srNumbers: string[] = []
      try {
        const res = await fetch('/api/dashboard/build/enrich-queue')
        const data = (await res.json()) as { sr_numbers?: string[]; total?: number }
        srNumbers = data.sr_numbers ?? []
      } catch {
        srNumbers = []
      }
      if (srNumbers.length === 0 || cancelledRef.current) {
        if (!cancelledRef.current) setPhase('done')
        return
      }
      setProgress({ processed: 0, total: srNumbers.length })
      for (let i = 0; i < srNumbers.length; i++) {
        if (cancelledRef.current) return
        try {
          await fetch('/api/complaints/enrich-on-demand', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sr_number: srNumbers[i] }),
          })
        } catch {
          // Individual enrichment failures are tolerated — keep going.
        }
        if (cancelledRef.current) return
        setProgress({ processed: i + 1, total: srNumbers.length })
      }
      if (!cancelledRef.current) setPhase('done')
    }

    const runStats = async () => {
      setPhase('stats')
      // Promotion (if any) is settled by the time we reach here — fire the
      // highlights-modal trigger and clean the URL once, right here.
      window.dispatchEvent(new CustomEvent('ps:portfolio-built'))
      stripQueryParam()

      let firstTotal: number | null = null
      let cumulativeProcessed = 0
      for (;;) {
        if (cancelledRef.current) return
        let processed = 0
        let remaining = 0
        try {
          const res = await fetch('/api/dashboard/build/stats', { method: 'POST' })
          const data = (await res.json()) as { processed?: number; remaining?: number }
          processed = data.processed ?? 0
          remaining = data.remaining ?? 0
        } catch {
          break
        }
        cumulativeProcessed += processed
        if (firstTotal === null) firstTotal = cumulativeProcessed + remaining
        setProgress({ processed: cumulativeProcessed, total: firstTotal ?? cumulativeProcessed })
        if (remaining === 0) break
        // Safety valve: if a call reports no progress but claims more remain,
        // stop rather than loop forever — Worker C's nightly pass is the backstop.
        if (processed === 0) break
      }
      if (!cancelledRef.current) await runEnrich()
    }

    const runFinishing = async () => {
      setPhase('finishing')
      const start = Date.now()
      let pollCount = 0
      let attemptedCommit = false
      while (Date.now() - start < FINISH_TIMEOUT_MS) {
        if (cancelledRef.current) return
        let stagedCount = 0
        let rowIds: string[] = []
        try {
          const res = await fetch('/api/dashboard/stage?list=1')
          const data = (await res.json()) as { rows?: { id: string }[]; staged_count?: number }
          rowIds = (data.rows ?? []).map((r) => r.id)
          stagedCount = data.staged_count ?? rowIds.length
        } catch {
          stagedCount = -1
        }
        pollCount++
        if (stagedCount === 0) {
          await runStats()
          return
        }
        if (pollCount >= FINISH_ATTEMPT_COMMIT_AFTER_POLLS && !attemptedCommit && rowIds.length > 0) {
          attemptedCommit = true
          try {
            const commitRes = await fetch('/api/dashboard/stage/commit', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ staged_ids: rowIds }),
            })
            const commitData = (await commitRes.json()) as {
              promoted?: number
              requires_checkout?: boolean
            }
            if (commitData.promoted) {
              await runStats()
              return
            }
          } catch {
            // Ignore — keep polling; the webhook may still land.
          }
        }
        if (cancelledRef.current) return
        await wait(FINISH_POLL_MS)
      }
      if (!cancelledRef.current) await runStats()
    }

    if (checkout === 'success') {
      void runFinishing()
    } else {
      void runStats()
    }
  }, [isSignedIn])

  useEffect(() => {
    if (phase === 'idle') {
      setVisible(false)
      return
    }
    if (phase === 'done') {
      setFadeOut(true)
      const t = setTimeout(() => setVisible(false), 300)
      return () => clearTimeout(t)
    }
    setFadeOut(false)
    setVisible(true)
  }, [phase])

  if (!visible) return null

  const label =
    phase === 'finishing' || phase === 'stats' ? 'BUILDING YOUR PORTFOLIO' : 'ENRICHING COMPLAINT HISTORY'
  const note =
    phase === 'finishing'
      ? 'Finishing checkout…'
      : phase === 'stats'
        ? 'Computing property stats'
        : 'Pulling city records — you can keep working'

  const pct =
    progress.total > 0 ? Math.min(100, Math.round((progress.processed / progress.total) * 100)) : 0

  return (
    <div style={{ ...bannerStyle, opacity: fadeOut ? 0 : 1 }}>
      <div style={bannerInnerStyle}>
        <span style={labelStyle}>{label}</span>
        <div style={middleStyle}>
          <div className="ir-progress-track" style={trackStyle}>
            {phase === 'finishing' ? (
              <div className="ir-progress-fill ir-progress-indeterminate" />
            ) : (
              <div className="ir-progress-fill" style={{ width: `${pct}%` }} />
            )}
          </div>
          {progress.total > 0 ? (
            <span style={counterStyle}>
              {progress.processed}/{progress.total}
            </span>
          ) : null}
        </div>
        <span style={noteStyle}>{note}</span>
      </div>
    </div>
  )
}

const bannerStyle: CSSProperties = {
  background: '#ffffff',
  borderBottom: '1px solid #e5e1d6',
  padding: '10px 32px',
  transition: 'opacity 0.3s ease',
}

const bannerInnerStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 18,
}

const labelStyle: CSSProperties = {
  fontFamily: 'DM Mono, ui-monospace, monospace',
  fontSize: 11,
  fontWeight: 500,
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  color: '#0f2744',
  flexShrink: 0,
}

const middleStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  flexShrink: 0,
}

const trackStyle: CSSProperties = {
  width: 260,
}

const counterStyle: CSSProperties = {
  fontFamily: 'DM Mono, ui-monospace, monospace',
  fontSize: 11,
  color: '#8a94a0',
  whiteSpace: 'nowrap',
  flexShrink: 0,
}

const noteStyle: CSSProperties = {
  fontSize: 12,
  color: '#8a94a0',
  marginLeft: 'auto',
  flexShrink: 0,
}
