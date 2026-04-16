import type { Metadata } from 'next'
import AboutClient from './AboutClient'
import './about.css'

export const metadata: Metadata = {
  title: 'Property Sentinel — About',
  description: 'Chicago property intelligence powered by 13M+ public records.',
  alternates: {
    canonical: '/about',
  },
}

export default function AboutPage() {
  return (
    <div className="address-page">
      <div className="prop-page-shell">
        <div className="prop-main-content">
          <AboutClient />
        </div>
      </div>
    </div>
  )
}