import type { ReactNode } from 'react'

/** Full-bleed shell: sidebar/mobile nav hidden via `body:has(.audit-route-root)` in globals.css */
export default function AuditLayout({ children }: { children: ReactNode }) {
  return <div className="audit-route-root">{children}</div>
}
