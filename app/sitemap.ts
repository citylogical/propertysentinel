import { createClient } from '@supabase/supabase-js'

export default async function sitemap() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: posts } = await supabase
    .from('blog_posts')
    .select('slug, updated_at')
    .eq('published', true)

  const blogUrls = (posts ?? []).map((post) => ({
    url: `https://www.propertysentinel.io/blog/${post.slug}`,
    lastModified: post.updated_at,
  }))

  return [
    { url: 'https://www.propertysentinel.io', lastModified: new Date() },
    { url: 'https://www.propertysentinel.io/about', lastModified: new Date() },
    { url: 'https://www.propertysentinel.io/blog', lastModified: new Date() },
    ...blogUrls,
  ]
}