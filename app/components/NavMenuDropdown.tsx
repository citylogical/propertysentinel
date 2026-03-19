'use client'

import { usePathname } from 'next/navigation'
import Link from 'next/link'
import HomeSearch from '@/app/components/HomeSearch'
import NavClerkAuth from '@/app/components/NavClerkAuth'

type NavMenuDropdownProps = {
  onClose: () => void
  apiKey: string | undefined
  /** When true, HomeSearch will not load Maps script (parent already loaded it). */
  skipMapsScript?: boolean
}

export default function NavMenuDropdown({ onClose, apiKey, skipMapsScript }: NavMenuDropdownProps) {
  const pathname = usePathname()
  const isHomepage = pathname === '/'
  const isPropertyPage = pathname.startsWith('/address/')
  const showSearch = !isHomepage && !isPropertyPage

  const itemClass = 'flex items-center min-h-[48px] pl-5 pr-5 gap-[10px] text-[15px] font-normal border-b border-[#f0f0f0] no-underline hover:bg-gray-50 nav-menu-dropdown-item'
  const itemClassRed = 'flex items-center min-h-[48px] pl-5 pr-5 gap-[10px] text-[15px] font-normal text-[#c0392b] border-b border-[#f0f0f0] no-underline hover:bg-gray-50 nav-menu-dropdown-item'
  const chevron = <span className="text-[16px] text-[#9ca3af] select-none" aria-hidden>&#8250;</span>

  return (
    <div
      className="absolute top-full right-0 mt-0 min-w-[200px] bg-white rounded-md shadow-[0_4px_16px_rgba(0,0,0,0.12)] z-[9999] p-0 overflow-hidden hidden md:block nav-menu-dropdown [&>*:last-child]:border-b-0"
      role="menu"
    >
      {showSearch && (
        <div className="min-h-[48px] flex items-center pl-5 pr-5 border-b border-[#f0f0f0]">
          <div className="w-full min-w-0">
            <HomeSearch apiKey={apiKey} hideSubmitButton skipMapsScript={skipMapsScript} />
          </div>
        </div>
      )}
      <Link href="/tax-appeals" className={`${itemClass} text-[#1a1a1a]`} onClick={onClose}>
        {chevron}
        Tax Appeals
      </Link>
      <Link href="/about" className={`${itemClass} text-[#1a1a1a]`} onClick={onClose}>
        {chevron}
        About
      </Link>
      <Link href="/contact" className={`${itemClass} text-[#1a1a1a]`} onClick={onClose}>
        {chevron}
        Contact
      </Link>
      <NavClerkAuth variant="dropdown" onAfterAuthAction={onClose} />
    </div>
  )
}
