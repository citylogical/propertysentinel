import 'server-only'

import { unstable_cache } from 'next/cache'
import { getSupabaseAdmin } from '@/lib/supabase'

export type BlogPostRow = {
  slug: string
  title: string
  date_label: string | null
  sort_order: number
  body: string
  description: string | null
}

async function fetchAllPublishedPostsUncached(): Promise<BlogPostRow[]> {
  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('blog_posts')
    .select('slug, title, date_label, sort_order, body, description')
    .eq('published', true)
    .order('sort_order', { ascending: false })

  if (error) {
    console.error('[blog] failed to fetch posts:', error.message)
    return []
  }
  return (data ?? []) as BlogPostRow[]
}

export const fetchAllPublishedPosts = unstable_cache(
  fetchAllPublishedPostsUncached,
  ['blog-posts-all-published-v1'],
  { revalidate: 300, tags: ['blog-posts'] }
)
