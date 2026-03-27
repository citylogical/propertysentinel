'use client'

import { useEffect } from 'react'
import { addRecentSearch } from '@/lib/recent-searches'

export default function RecordSearch({ address, slug }: { address: string; slug: string }) {
  useEffect(() => {
    if (address && slug) {
      addRecentSearch(address, slug)
    }
  }, [address, slug])
  return null
}
