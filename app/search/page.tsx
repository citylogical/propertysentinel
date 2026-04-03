import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { addressToSlug } from '@/lib/address-slug'
import SearchHero from './SearchHero'

export const metadata: Metadata = {
  title: 'Property Sentinel — Search',
  description: 'Search any Chicago address for 311 complaints, violations, permits, and property intelligence.',
}

type PageProps = {
  searchParams: Promise<{ address?: string; zip?: string }>
}

export default async function SearchPage({ searchParams }: PageProps) {
  const { address, zip } = await searchParams
  const trimmed = address?.trim()

  if (trimmed) {
    const slug = addressToSlug(trimmed, zip?.trim() || undefined)
    redirect(`/address/${encodeURIComponent(slug)}`)
  }

  return (
    <div className="address-page">
      <div className="prop-page-shell">
        <div className="prop-main-content search-page-content">
          <SearchHero apiKey={process.env.NEXT_PUBLIC_GOOGLE_PLACES_KEY} />
        </div>
      </div>
    </div>
  )
}
