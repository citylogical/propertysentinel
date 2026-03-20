'use client'

import { SignInButton, useAuth, useClerk } from '@clerk/nextjs'
import Link from 'next/link'

type Props = {
  /** e.g. dropdown row vs drawer row */
  variant: 'dropdown' | 'drawer'
  onAfterAuthAction?: () => void
}

export default function NavClerkAuth({ variant, onAfterAuthAction }: Props) {
  const { isSignedIn } = useAuth()
  const { signOut } = useClerk()

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
            onClick={() => signOut({ redirectUrl: '/' })}
          >
            <span className="text-[14px] text-[#9ca3af] select-none mr-[19px]">&gt;</span>
            Sign Out
          </button>
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
          onClick={() => signOut({ redirectUrl: '/' })}
        >
          <span className="text-[16px] text-[#9ca3af] select-none" aria-hidden>&#8250;</span>
          Sign Out
        </button>
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
