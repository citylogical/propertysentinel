'use client'

import Link from 'next/link'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

type Post = {
  slug: string
  title: string
  body: string
  date_label: string
}

type PostSummary = {
  slug: string
  title: string
  date_label: string
}

type Props = {
  post: Post
  otherPosts: PostSummary[]
}

export default function BlogPostPage({ post, otherPosts }: Props) {
  return (
    <>
      <div className="property-identity-row">
        <div className="property-identity-left">
          <p className="blog-slug-back">
            <Link href="/blog">← All posts</Link>
          </p>
          <h1 className="property-identity-address">{post.title}</h1>
          <div className="property-identity-citystate">{post.date_label}</div>
        </div>
      </div>

      <div className="blog-layout">
        <div className="blog-stream">
          <article className="blog-post blog-post-latest">
            <div className="blog-post-content">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  h2: ({ children }) => (
                    <h2
                      style={{
                        fontFamily: '"Merriweather", Georgia, serif',
                        fontSize: 18,
                        fontWeight: 700,
                        color: '#0f2744',
                        margin: '24px 0 12px',
                      }}
                    >
                      {children}
                    </h2>
                  ),
                  h3: ({ children }) => (
                    <h3
                      style={{
                        fontSize: 15,
                        fontWeight: 600,
                        color: '#0f2744',
                        margin: '20px 0 8px',
                      }}
                    >
                      {children}
                    </h3>
                  ),
                  h4: ({ children }) => (
                    <h4
                      style={{
                        fontSize: 13,
                        fontWeight: 600,
                        color: '#4a5568',
                        margin: '16px 0 6px',
                      }}
                    >
                      {children}
                    </h4>
                  ),
                  h5: ({ children }) => (
                    <h5
                      style={{
                        fontSize: 12,
                        fontWeight: 600,
                        color: '#4a5568',
                        margin: '14px 0 4px',
                      }}
                    >
                      {children}
                    </h5>
                  ),
                  a: ({ href, children }) => (
                    <a
                      href={href}
                      style={{
                        color: '#0f2744',
                        textDecoration: 'underline',
                        textUnderlineOffset: '2px',
                      }}
                    >
                      {children}
                    </a>
                  ),
                  table: ({ children }) => (
                    <div style={{ overflowX: 'auto', margin: '16px 0' }}>
                      <table
                        style={{
                          width: '100%',
                          borderCollapse: 'collapse',
                          fontSize: 12,
                          fontFamily: '"DM Mono", monospace',
                        }}
                      >
                        {children}
                      </table>
                    </div>
                  ),
                  th: ({ children }) => (
                    <th
                      style={{
                        textAlign: 'left',
                        padding: '8px 10px',
                        borderBottom: '2px solid #ddd9d0',
                        fontSize: 10,
                        fontWeight: 600,
                        letterSpacing: '0.06em',
                        textTransform: 'uppercase' as const,
                        color: '#8a94a0',
                      }}
                    >
                      {children}
                    </th>
                  ),
                  td: ({ children }) => (
                    <td
                      style={{
                        padding: '6px 10px',
                        borderBottom: '1px solid #eee8df',
                        color: '#1a1a1a',
                      }}
                    >
                      {children}
                    </td>
                  ),
                  img: ({ src, alt }) => (
                    <img
                      src={src}
                      alt={alt ?? ''}
                      style={{
                        maxWidth: '480px',
                        width: '100%',
                        display: 'block',
                        margin: '24px auto',
                        borderRadius: '4px',
                      }}
                    />
                  ),
                }}
              >
                {post.body}
              </ReactMarkdown>
            </div>
          </article>
        </div>

        <aside className="blog-directory" aria-label="Other posts">
          <div className="blog-directory-sticky">
            <div className="blog-directory-label">Other posts</div>
            <ul className="blog-directory-list">
              {otherPosts.length === 0 ? (
                <li className="blog-directory-link-date" style={{ padding: '4px 0' }}>
                  No other posts yet.
                </li>
              ) : (
                otherPosts.map((p) => (
                  <li key={p.slug}>
                    <Link href={`/blog/${p.slug}`} className="blog-directory-link">
                      <span className="blog-directory-link-title">{p.title}</span>
                      <span className="blog-directory-link-date">{p.date_label}</span>
                    </Link>
                  </li>
                ))
              )}
            </ul>
          </div>
        </aside>
      </div>
    </>
  )
}
