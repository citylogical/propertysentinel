'use client'

import { SignInButton, useAuth, useClerk } from '@clerk/nextjs'
import Link from 'next/link'
import { useState } from 'react'
import { createPortal } from 'react-dom'

type Props = {
  /** e.g. dropdown row vs drawer row */
  variant: 'dropdown' | 'drawer'
  onAfterAuthAction?: () => void
}

export default function NavClerkAuth({ variant, onAfterAuthAction }: Props) {
  const { isSignedIn } = useAuth()
  const { signOut } = useClerk()
  const [showSignOutConfirm, setShowSignOutConfirm] = useState(false)

  const signOutModal =
    showSignOutConfirm &&
    typeof document !== 'undefined' &&
    createPortal(
      <div className="building-modal-overlay">
        <div className="building-modal" style={{ maxWidth: 320 }}>
          <button type="button" className="building-modal-x" onClick={() => setShowSignOutConfirm(false)} aria-label="Close">
            &times;
          </button>
          <div className="building-modal-title" style={{ marginBottom: 8 }}>
            Sign out?
          </div>
          <div className="building-modal-subtitle" style={{ marginBottom: 16 }}>
            You&apos;ll need to sign in again to access your dashboard and saved properties.
          </div>
          <div className="building-modal-buttons">
            <button
              type="button"
              className="building-modal-btn building-modal-btn-navy"
              onClick={() => {
                signOut({ redirectUrl: '/' })
                setShowSignOutConfirm(false)
              }}
            >
              Sign out
            </button>
            <button
              type="button"
              className="building-modal-btn building-modal-btn-outline"
              onClick={() => setShowSignOutConfirm(false)}
            >
              Cancel
            </button>
          </div>
        </div>
      </div>,
      document.body
    )

  if (isSignedIn) {
    if (variant === 'drawer') {
      return (
        <>
          <Link
            href="/profile"
            className="flex w-full items-center min-h-[56px] pl-[36px] pr-0 py-4 text-base font-normal text-white border-0 border-b border-gray-200 bg-transparent cursor-pointer text-left hover:bg-gray-50 nav-drawer-item"
            onClick={onAfterAuthAction}
          >
            <span className="text-[14px] text-[#9ca3af] select-none mr-[19px]">&gt;</span>
            My Account
          </Link>
          <button
            type="button"
            className="flex w-full items-center min-h-[56px] pl-[36px] pr-0 py-4 text-base font-normal text-[#c0392b] border-0 border-b border-gray-200 bg-transparent cursor-pointer text-left hover:bg-gray-50 nav-drawer-item"
            onClick={() => setShowSignOutConfirm(true)}
          >
            <span className="text-[14px] text-[#9ca3af] select-none mr-[19px]">&gt;</span>
            Sign Out
          </button>
          {signOutModal}
        </>
      )
    }

    return (
      <>
        <Link
          href="/profile"
          className="nav-login-btn flex w-full items-center min-h-[48px] pl-5 pr-5 gap-[10px] text-[15px] font-normal text-white border-0 border-b border-[#f0f0f0] bg-transparent cursor-pointer text-left hover:bg-gray-50 nav-menu-dropdown-item"
          onClick={onAfterAuthAction}
        >
          <span className="text-[16px] text-[#9ca3af] select-none" aria-hidden>&#8250;</span>
          My Account
        </Link>
        <button
          type="button"
          className="nav-login-btn flex w-full items-center min-h-[48px] pl-5 pr-5 gap-[10px] text-[15px] font-normal text-[#c0392b] border-0 border-b border-[#f0f0f0] bg-transparent cursor-pointer text-left hover:bg-gray-50 nav-menu-dropdown-item"
          onClick={() => setShowSignOutConfirm(true)}
        >
          <span className="text-[16px] text-[#9ca3af] select-none" aria-hidden>&#8250;</span>
          Sign Out
        </button>
        {signOutModal}
      </>
    )
  }

  const loginBtnClass =
    variant === 'dropdown'
      ? 'nav-login-btn flex w-full items-center min-h-[48px] pl-5 pr-5 gap-[10px] text-[15px] font-normal text-[#c0392b] border-0 border-b border-[#f0f0f0] bg-transparent cursor-pointer text-left hover:bg-gray-50 nav-menu-dropdown-item'
      : 'nav-login-btn flex w-full items-center min-h-[56px] pl-[36px] pr-0 py-4 text-base font-normal text-[#c0392b] border-0 border-b border-gray-200 bg-transparent cursor-pointer text-left hover:bg-gray-50 nav-drawer-item'

  return (
    <SignInButton mode="modal">
      <button type="button" className={loginBtnClass} onClick={onAfterAuthAction}>
        {variant === 'drawer' && <span className="text-[14px] text-[#9ca3af] select-none mr-[19px]">&gt;</span>}
        {variant === 'dropdown' && <span className="text-[16px] text-[#9ca3af] select-none" aria-hidden>&#8250;</span>}
        Log In
      </button>
    </SignInButton>
  )
}
