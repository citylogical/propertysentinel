'use client'

import Link from 'next/link'

export default function ProfileClient() {
  return (
    <div className="min-h-screen bg-[#f2f0eb] flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-md bg-white border border-[#ddd9d0] rounded-lg p-8 shadow-sm">
        <h1 className="text-xl font-bold text-[#1a1a1a] mb-6" style={{ fontFamily: 'Playfair Display, Georgia, serif' }}>
          Profile
        </h1>
        <p className="text-sm text-[#4a5568] mb-6">Manage your account and alerts from here.</p>
        <Link href="/" className="inline-block mt-6 text-sm text-[#4a5568] hover:text-[#1a1a1a]">
          ← Back to home
        </Link>
      </div>
    </div>
  )
}
