'use client'

import { usePathname } from 'next/navigation'
import Link from 'next/link'
import HomeSearch from '@/app/components/HomeSearch'
import type { Session } from '@supabase/supabase-js'

type NavMenuDropdownProps = {
  onClose: () => void
  apiKey: string | undefined
  session: Session | null
}

export default function NavMenuDropdown({ onClose, apiKey, session }: NavMenuDropdownProps) {
  const pathname = usePathname()
  const isHomepage = pathname === '/'
  const isPropertyPage = pathname.startsWith('/address/')
  const showSearch = !isHomepage && !isPropertyPage

  return (
    <div
      className="absolute top-full right-0 mt-0 w-[220px] bg-white rounded-md shadow-[0_4px_16px_rgba(0,0,0,0.12)] z-[9999] py-0 overflow-hidden hidden md:block nav-menu-dropdown [&>*:last-child]:border-b-0"
      role="menu"
    >
      {showSearch && (
        <div className="min-h-[44px] flex items-center px-4 border-b border-[#f0f0f0]">
          <div className="w-full min-w-0">
            <HomeSearch apiKey={apiKey} hideSubmitButton />
          </div>
        </div>
      )}
      <Link
        href="/tax-appeals"
        className="flex items-center min-h-[44px] px-4 text-sm font-normal text-[#1a1a1a] border-b border-[#f0f0f0] no-underline hover:bg-gray-50 nav-menu-dropdown-item"
        onClick={onClose}
      >
        Tax Appeals
      </Link>
      <Link
        href="/about"
        className="flex items-center min-h-[44px] px-4 text-sm font-normal text-[#1a1a1a] border-b border-[#f0f0f0] no-underline hover:bg-gray-50 nav-menu-dropdown-item"
        onClick={onClose}
      >
        About
      </Link>
      <Link
        href="/contact"
        className="flex items-center min-h-[44px] px-4 text-sm font-normal text-[#1a1a1a] border-b border-[#f0f0f0] no-underline hover:bg-gray-50 nav-menu-dropdown-item"
        onClick={onClose}
      >
        Contact
      </Link>
      {session ? (
        <Link
          href="/profile"
          className="flex items-center min-h-[44px] px-4 text-sm font-normal text-[#c0392b] border-b border-[#f0f0f0] no-underline hover:bg-gray-50 nav-menu-dropdown-item"
          onClick={onClose}
        >
          My Account
        </Link>
      ) : (
        <Link
          href="/login"
          className="flex items-center min-h-[44px] px-4 text-sm font-normal text-[#c0392b] border-b border-[#f0f0f0] no-underline hover:bg-gray-50 nav-menu-dropdown-item"
          onClick={onClose}
        >
          Log In
        </Link>
      )}
    </div>
  )
}
