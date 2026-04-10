import { Metadata } from 'next'
import { createClient } from '@supabase/supabase-js'
import { notFound } from 'next/navigation'
import BlogPostPage from './BlogPostPage'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export const dynamic = 'force-dynamic'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const supabase = getSupabase()

  const { data: post } = await supabase
    .from('blog_posts')
    .select('title, description, body, date_label')
    .eq('slug', slug)
    .eq('published', true)
    .single()

  if (!post) {
    return { title: 'Post Not Found — Property Sentinel' }
  }

  const desc =
    post.description ||
    post.body.replace(/[#*_\[\]()]/g, '').slice(0, 155) + '…'

  return {
    title: `${post.title} — Property Sentinel`,
    description: desc,
    openGraph: {
      title: post.title,
      description: desc,
      url: `https://www.propertysentinel.io/blog/${slug}`,
      siteName: 'Property Sentinel',
      type: 'article',
    },
    twitter: {
      card: 'summary_large_image',
      title: post.title,
      description: desc,
    },
    alternates: {
      canonical: `https://www.propertysentinel.io/blog/${slug}`,
    },
  }
}

export default async function BlogSlugPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const supabase = getSupabase()

  const { data: post } = await supabase
    .from('blog_posts')
    .select('*')
    .eq('slug', slug)
    .eq('published', true)
    .single()

  if (!post) notFound()

  const { data: allPosts } = await supabase
    .from('blog_posts')
    .select('slug, title, date_label')
    .eq('published', true)
    .order('sort_order', { ascending: false })

  const otherPosts = (allPosts ?? []).filter((p) => p.slug !== slug)

  return (
    <div className="address-page">
      <div className="prop-page-shell">
        <div className="prop-main-content blog-container">
          <BlogPostPage post={post} otherPosts={otherPosts} />

          <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{
              __html: JSON.stringify({
                '@context': 'https://schema.org',
                '@type': 'Article',
                headline: post.title,
                description:
                  post.description ||
                  post.body.replace(/[#*_\[\]()]/g, '').slice(0, 155),
                datePublished: post.created_at,
                dateModified: post.updated_at,
                url: `https://www.propertysentinel.io/blog/${post.slug}`,
                author: {
                  '@type': 'Person',
                  name: 'Jim McMahon',
                  jobTitle: 'Founder',
                  worksFor: {
                    '@type': 'Organization',
                    name: 'City Logical LLC',
                  },
                },
                publisher: {
                  '@type': 'Organization',
                  name: 'Property Sentinel',
                  url: 'https://www.propertysentinel.io',
                },
                mainEntityOfPage: `https://www.propertysentinel.io/blog/${post.slug}`,
              }),
            }}
          />
        </div>
      </div>
    </div>
  )
}
