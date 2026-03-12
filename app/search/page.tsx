import { redirect } from 'next/navigation'
import { addressToSlug } from '@/lib/address-slug'
import Link from 'next/link'

type PageProps = { searchParams: Promise<{ address?: string; zip?: string }> }

export default async function SearchPage({ searchParams }: PageProps) {
  const { address, zip } = await searchParams
  const trimmed = address?.trim()

  if (trimmed) {
    const slug = addressToSlug(trimmed, zip?.trim() || undefined)
    redirect(`/address/${encodeURIComponent(slug)}`)
  }

  return (
    <>
      <header
        className="fixed top-0 left-0 right-0 z-[100] flex items-center justify-between h-14 px-6 border-b border-white/10 bg-[#001f3f]"
      >
        <Link href="/" className="text-white font-bold text-lg no-underline font-[Merriweather,Georgia,serif]">
          Property Sentinel
        </Link>
        <Link href="/" className="text-white text-sm font-medium px-4 py-2 rounded hover:opacity-90 bg-[#003366]">
          New search
        </Link>
      </header>
      <main className="min-h-screen pt-14 px-6 py-12 flex flex-col items-center justify-center bg-[#f0f0ed]">
        <div className="max-w-xl w-full rounded-lg border border-[#d4cfc4] bg-white p-8 shadow-sm">
          <h1 className="text-2xl font-bold mb-3 text-[#001f3f] font-[Merriweather,Georgia,serif]">
            Search Chicago 311 complaints
          </h1>
          <p className="text-[#3d3d3d] mb-6 text-sm">
            Enter an address on the homepage to view complaint activity.
          </p>
          <Link
            href="/"
            className="inline-flex px-4 py-2 rounded text-sm font-semibold text-white bg-[#003366] hover:opacity-90"
          >
            Back to search
          </Link>
        </div>
      </main>
    </>
  )
}
