import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { fetchAllPublishedPosts } from '@/lib/blog-posts'

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

export default async function BlogPage() {
  const posts = await fetchAllPublishedPosts()

  if (posts.length === 0) {
    return (
      <div className="address-page">
        <div className="prop-page-shell">
          <div className="prop-main-content blog-container">
            <div className="property-identity-row">
              <div className="property-identity-left">
                <h1 className="property-identity-address">Blog</h1>
                <div className="property-identity-citystate">No posts yet</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="address-page">
      <div className="prop-page-shell">
        <div className="prop-main-content blog-container">
          <div className="property-identity-row">
            <div className="property-identity-left">
              <h1 className="property-identity-address">Blog</h1>
              <div className="property-identity-citystate">
                Property Sentinel field notes and analysis
              </div>
            </div>
          </div>

          <div className="blog-layout">
            <div className="blog-stream">
              {posts.map((post, idx) => (
                <article
                  key={post.slug}
                  id={post.slug}
                  className={idx === 0 ? 'blog-post blog-post-latest' : 'blog-post'}
                >
                  <header className="blog-post-header">
                    <h2 className="blog-post-title">{post.title}</h2>
                    {post.date_label ? (
                      <div className="blog-post-date">{post.date_label}</div>
                    ) : null}
                  </header>
                  <div className="blog-post-content">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{post.body}</ReactMarkdown>
                  </div>
                </article>
              ))}
            </div>

            <aside className="blog-directory" aria-label="All posts">
              <div className="blog-directory-sticky">
                <div className="blog-directory-label">All Posts</div>
                <ul className="blog-directory-list">
                  {posts.map((post) => (
                    <li key={post.slug}>
                      <a href={`#${post.slug}`} className="blog-directory-link">
                        <span className="blog-directory-link-title">{post.title}</span>
                        {post.date_label ? (
                          <span className="blog-directory-link-date">{post.date_label}</span>
                        ) : null}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            </aside>
          </div>
        </div>
      </div>
    </div>
  )
}
