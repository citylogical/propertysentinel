'use client'

// app/address/[slug]/HansenResolveTrigger.tsx
//
// Mounted by the property page ONLY when all three archive sources missed
// (manual entry, approved user range, Hansen archive) and the hansen_lookups
// negative cache permits an attempt. Fires one POST to /api/hansen/resolve
// after mount, stays invisible while pending, and — when Hansen returns a
// genuine multi-address range — pops the SAME 'detected' modal that
// BuildingDetectionModal auto-shows for archive-known buildings: identical
// CSS classes, identical dismiss cookie, identical button set.
//
// Why a sibling render instead of reusing BuildingDetectionModal directly:
// that component is mounted at page render time with the server's
// addressRange (null on this visit — Hansen hadn't resolved yet) and owns the
// header icon button. This component covers exactly the one visit that
// performs the live resolution; every later visit hits the archive
// server-side and BuildingDetectionModal auto-pops as normal. Both paths
// honor the same ps-building-modal-dismissed cookie so "Don't show me this
// again" suppresses both.
//
// "View full building" hard-navigates to ?building=true so the server
// component re-runs against the freshly persisted hansen_* rows (router cache
// bypassed deliberately).
//
// Double-fire guards, in order of scope:
//   - useRef         → React strict-mode double effect-invocation in dev
//                      (deliberately NO abort-on-cleanup — that killed the
//                      request under strict mode)
//   - sessionStorage → client-side navigations back to this address
//                      in-session; set only AFTER the request completes
//   - server claim   → everything else (other tabs, other visitors)

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

const BUILDING_MODAL_DISMISS_COOKIE = 'ps-building-modal-dismissed'

function readDismissCookie(): boolean {
  if (typeof document === 'undefined') return false
  for (const part of document.cookie.split(';')) {
    const [k, v] = part.trim().split('=').map((s) => s.trim())
    if (k === BUILDING_MODAL_DISMISS_COOKIE && v === 'true') return true
  }
  return false
}

function writeDismissCookie(): void {
  document.cookie = `${BUILDING_MODAL_DISMISS_COOKIE}=true;path=/;max-age=31536000;SameSite=Lax`
}

type ResolveResponse = {
  status?: string
  is_multi?: boolean
  display_range?: string | null
}

export default function HansenResolveTrigger({
  normalizedAddress,
}: {
  normalizedAddress: string
}) {
  const fired = useRef(false)
  const [rangeText, setRangeText] = useState<string | null>(null)
  const [showModal, setShowModal] = useState(false)
  const [dontShowAgain, setDontShowAgain] = useState(false)

  useEffect(() => {
    if (fired.current) return
    fired.current = true

    const sessionKey = `hansen-resolve-tried:${normalizedAddress}`
    try {
      if (sessionStorage.getItem(sessionKey)) return
    } catch {
      /* private mode etc. — server claim still dedupes */
    }

    fetch('/api/hansen/resolve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ address: normalizedAddress }),
    })
      .then((res) => (res.ok ? (res.json() as Promise<ResolveResponse>) : null))
      .then((data) => {
        console.log('[hansen/resolve trigger]', normalizedAddress, data)
        try {
          sessionStorage.setItem(sessionKey, '1')
        } catch {
          /* ignore */
        }
        if (
          data?.status === 'resolved' &&
          data.is_multi &&
          data.display_range &&
          !readDismissCookie()
        ) {
          // Existing modal shows the range in uppercase normalized form;
          // the route formats for the (removed) card, so restore case here.
          setRangeText(data.display_range.toUpperCase())
          setShowModal(true)
        }
      })
      .catch(() => {
        /* network failure — leave sessionStorage unset so a later visit retries */
      })
  }, [normalizedAddress])

  const closeModal = () => {
    if (dontShowAgain) writeDismissCookie()
    setShowModal(false)
  }

  const viewFullBuilding = () => {
    if (dontShowAgain) writeDismissCookie()
    setShowModal(false)
    // Hard navigation: the server component must re-run resolveHansenArchive
    // against the rows the resolve route just persisted via after().
    window.location.assign(`${window.location.pathname}?building=true`)
  }

  if (!showModal || !rangeText || typeof window === 'undefined') return null

  return createPortal(
    <div className="building-modal-overlay">
      <div className="building-modal">
        <button
          type="button"
          className="building-modal-x"
          onClick={closeModal}
          aria-label="Close"
        >
          &times;
        </button>
        <div className="building-modal-icon building-modal-icon-amber">
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#d97706"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <path d="M3 21h18" />
            <path d="M5 21V7l8-4v18" />
            <path d="M19 21V11l-6-4" />
            <path d="M9 9v.01" />
            <path d="M9 12v.01" />
            <path d="M9 15v.01" />
            <path d="M9 18v.01" />
          </svg>
        </div>
        <div className="building-modal-title">
          This address appears to belong to a building with multiple addresses
        </div>
        <div className="building-modal-range">{rangeText}</div>
        <div className="building-modal-buttons">
          <button
            type="button"
            className="building-modal-btn building-modal-btn-amber"
            onClick={viewFullBuilding}
          >
            View full building
          </button>
          <button
            type="button"
            className="building-modal-btn building-modal-btn-outline"
            onClick={closeModal}
          >
            View single address
          </button>
        </div>
        <div className="building-modal-dismiss">
          <input
            type="checkbox"
            className="building-modal-checkbox"
            id="hansen-bldg-dismiss"
            checked={dontShowAgain}
            onChange={(e) => setDontShowAgain(e.target.checked)}
          />
          <label className="building-modal-dismiss-label" htmlFor="hansen-bldg-dismiss">
            Don&apos;t show me this again
          </label>
        </div>
      </div>
    </div>,
    document.body
  )
}