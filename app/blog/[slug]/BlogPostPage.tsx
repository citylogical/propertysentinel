'use client'

import { useRouter } from 'next/navigation'
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
  const router = useRouter()

  return (
    <>
      <div className="address-header about-header">
        <div className="about-header-inner">
          <div className="address-header-street">Blog</div>
          <div className="about-tabs">
            <button
              type="button"
              className="about-tab active"
            >
              Latest
            </button>
            <button
              type="button"
              className="about-tab"
              onClick={() => router.push('/blog')}
            >
              List
            </button>
          </div>
        </div>
      </div>

      <div className="about-panel blog-latest-panel">
        <button
          type="button"
          className="about-post-back"
          onClick={() => router.push('/blog')}
        >
          ← All posts
        </button>
        <div className="blog-latest-layout">
          <article>
            <div className="about-post-date">{post.date_label}</div>
            <h1 className="about-post-h1">{post.title}</h1>
            <div className="about-post-body">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
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
                }}
              >
                {post.body}
              </ReactMarkdown>
            </div>
          </article>
          <aside className="about-post-sidebar">
            <div className="about-post-sidebar-label">Recent posts</div>
            {otherPosts.length === 0 ? (
              <div style={{ fontSize: 12, color: '#8a94a0', padding: '8px 0' }}>
                No other posts yet.
              </div>
            ) : (
              otherPosts.map((p) => (
                <div
                  key={p.slug}
                  className="about-post-sidebar-item"
                  onClick={() => router.push(`/blog/${p.slug}`)}
                >
                  <div className="about-post-sidebar-title">{p.title}</div>
                  <div className="about-post-sidebar-date">{p.date_label}</div>
                </div>
              ))
            )}
          </aside>
        </div>
      </div>
    </>
  )
}
