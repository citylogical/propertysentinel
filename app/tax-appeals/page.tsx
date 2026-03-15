import Link from 'next/link'

export default function TaxAppealsPage() {
  return (
    <div className="min-h-screen bg-[#f2f0eb] p-6">
      <nav className="mb-8">
        <Link href="/" className="text-[var(--navy)] font-semibold no-underline hover:underline">
          ← Property Sentinel
        </Link>
      </nav>
      <h1 className="text-2xl font-bold text-[#1a1a1a]">Tax Appeals</h1>
      <p className="mt-2 text-[#4a5568]">This page is a placeholder. Content coming soon.</p>
    </div>
  )
}
