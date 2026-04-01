import PropertySidebar from '@/components/PropertySidebar'
import BlogPageClient from './BlogPageClient'
import '../about/about.css'
import './blog.css'

export const metadata = {
  title: 'Blog — Property Sentinel',
  description:
    'Chicago property intelligence, 311 data analysis, building compliance, and civic infrastructure — from the team behind Property Sentinel.',
  openGraph: {
    title: 'Blog — Property Sentinel',
    description:
      'Chicago property intelligence, 311 data analysis, and building compliance.',
    url: 'https://www.propertysentinel.io/blog',
    siteName: 'Property Sentinel',
    type: 'website',
  },
  twitter: {
    card: 'summary',
    title: 'Blog — Property Sentinel',
    description:
      'Chicago property intelligence, 311 data analysis, and building compliance.',
  },
  alternates: {
    canonical: 'https://www.propertysentinel.io/blog',
  },
}

export default function BlogPage() {
  return (
    <div className="address-page">
      <div className="prop-page-shell">
        <PropertySidebar initialTab="blog" />
        <div className="prop-main-content">
          <BlogPageClient />
        </div>
      </div>
    </div>
  )
}
