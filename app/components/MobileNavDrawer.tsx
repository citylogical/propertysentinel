'use client'

import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { usePathname } from 'next/navigation'
import Link from 'next/link'
import HomeSearch from '@/app/components/HomeSearch'
import type { Session } from '@supabase/supabase-js'

type MobileNavDrawerProps = {
  open: boolean
  onClose: () => void
  onLoginClick: () => void
  apiKey: string | undefined
  session: Session | null
  /** When true, HomeSearch will not load Maps script (parent already loaded it). */
  skipMapsScript?: boolean
}

export default function MobileNavDrawer({ open, onClose, onLoginClick, apiKey, session, skipMapsScript }: MobileNavDrawerProps) {
  const pathname = usePathname()
  const isHomepage = pathname === '/'

  useEffect(() => {
    if (!open) {
      document.body.style.overflow = ''
      return
    }
    if (typeof window !== 'undefined' && window.innerWidth <= 768) {
      document.body.style.overflow = 'hidden'
    }
    return () => {
      document.body.style.overflow = ''
    }
  }, [open])

  if (!open) return null

  const drawer = (
    <div
      className="fixed inset-0 z-[9999] bg-white nav-drawer md:hidden"
      role="dialog"
      aria-modal="true"
      aria-label="Menu"
    >
      <div className="flex flex-col h-full overflow-visible">
        {/* Close row: same height as menu rows (56px), × right-aligned */}
        <div className="flex items-center justify-end min-h-[56px] px-4 shrink-0 border-b border-gray-200">
          <button
            type="button"
            className="flex items-center justify-center w-10 h-10 text-[#374151] border-0 bg-transparent cursor-pointer rounded hover:bg-gray-100 font-bold text-xl nav-drawer-close-btn"
            aria-label="Close menu"
            onClick={onClose}
          >
            ×
          </button>
        </div>
        <div className="flex-1 overflow-y-auto min-h-0 px-4 pb-6 nav-drawer-scroll">
          {/* Search row: hide on homepage only; other pages show it */}
          {!isHomepage && (
            <div className="min-h-[56px] flex items-center border-b border-gray-200 mb-0">
              <div className="w-full">
                <HomeSearch apiKey={apiKey} hideSubmitButton skipMapsScript={skipMapsScript} />
              </div>
            </div>
          )}
          {/* Menu items: chevron at pin left (36px), label at "E" (8px gap + 19px = label starts at 69px) */}
          <Link
            href="/tax-appeals"
            className="flex items-center min-h-[56px] pl-[36px] pr-0 py-4 text-base font-normal text-[#1a1a1a] border-b border-gray-200 no-underline hover:bg-gray-50 nav-drawer-item"
            onClick={onClose}
          >
            <span className="text-[14px] text-[#9ca3af] select-none mr-[19px]">&gt;</span>
            Tax Appeals
          </Link>
          <Link
            href="/about"
            className="flex items-center min-h-[56px] pl-[36px] pr-0 py-4 text-base font-normal text-[#1a1a1a] border-b border-gray-200 no-underline hover:bg-gray-50 nav-drawer-item"
            onClick={onClose}
          >
            <span className="text-[14px] text-[#9ca3af] select-none mr-[19px]">&gt;</span>
            About
          </Link>
          <Link
            href="/contact"
            className="flex items-center min-h-[56px] pl-[36px] pr-0 py-4 text-base font-normal text-[#1a1a1a] border-b border-gray-200 no-underline hover:bg-gray-50 nav-drawer-item"
            onClick={onClose}
          >
            <span className="text-[14px] text-[#9ca3af] select-none mr-[19px]">&gt;</span>
            Contact
          </Link>
          {session ? (
            <Link
              href="/profile"
              className="flex items-center min-h-[56px] pl-[36px] pr-0 py-4 text-base font-normal text-[#c0392b] border-b border-gray-200 no-underline hover:bg-gray-50 nav-drawer-item"
              onClick={onClose}
            >
              <span className="text-[14px] text-[#9ca3af] select-none mr-[19px]">&gt;</span>
              My Profile
            </Link>
          ) : (
            <button
              type="button"
              className="flex w-full items-center min-h-[56px] pl-[36px] pr-0 py-4 text-base font-normal text-[#c0392b] border-b border-gray-200 bg-transparent no-underline hover:bg-gray-50 nav-drawer-item text-left"
              onClick={() => {
                onClose()
                onLoginClick()
              }}
            >
              <span className="text-[14px] text-[#9ca3af] select-none mr-[19px]">&gt;</span>
              Log In
            </button>
          )}
        </div>
      </div>
    </div>
  )

  if (typeof document !== 'undefined') {
    return createPortal(drawer, document.body)
  }
  return null
}
