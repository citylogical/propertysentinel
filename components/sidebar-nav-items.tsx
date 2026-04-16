import type { ReactNode } from 'react'
import {
  NavIconAbout,
  NavIconAccount,
  NavIconBlog,
  NavIconExplore,
  NavIconLeads,
  NavIconPortfolio,
  NavIconStatus,
} from '@/components/nav-icons'

export type SidebarNavItem = {
  label: string
  href: string
  icon: ReactNode
  active?: boolean
  badge?: 'beta' | 'admin'
  requiresAuth?: boolean
}

/** Same order and icons as desktop AppSidebar. */
export function getSidebarNavItems(isAdmin: boolean): SidebarNavItem[] {
  const items: SidebarNavItem[] = [
    {
      label: 'Dashboard',
      href: '/dashboard',
      icon: <NavIconPortfolio />,
    },
  ]

  if (isAdmin) {
    items.push({
      label: 'Explore',
      href: '/explore',
      badge: 'admin',
      icon: <NavIconExplore />,
    })
  }

  items.push({
    label: 'Leads',
    href: '/leads',
    badge: 'beta',
    icon: <NavIconLeads />,
  })

  items.push(
    {
      label: 'About',
      href: '/about',
      icon: <NavIconAbout />,
    },
    {
      label: 'Blog',
      href: '/blog',
      icon: <NavIconBlog />,
    },
    {
      label: 'Status',
      href: '/status',
      icon: <NavIconStatus />,
    },
    {
      label: 'Account',
      href: '/profile',
      requiresAuth: true,
      icon: <NavIconAccount />,
    }
  )

  return items
}
