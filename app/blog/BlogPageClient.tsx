'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

type BlogTab = 'latest' | 'list'

type PostSummary = {
  slug: string
  title: string
  date_label: string
  description?: string
}

type PostFull = {
  slug: string
  title: string
  date_label: string
  body: string
  description?: string
  created_at: string
  updated_at: string
}

export default function BlogPageClient() {
  const router = useRouter()
  const [activeTab, setActiveTab] = useState<BlogTab>('list')
  const [posts, setPosts] = useState<PostSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [latestPost, setLatestPost] = useState<PostFull | null>(null)
  const [latestLoading, setLatestLoading] = useState(false)

  useEffect(() => {
    setLoading(true)
    fetch('/api/blog')
      .then((res) => res.json())
      .then((data) => setPosts(data.posts ?? []))
      .catch(() => setPosts([]))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (activeTab !== 'latest') return
    if (posts.length === 0) return
    if (latestPost) return

    setLatestLoading(true)
    fetch(`/api/blog/${posts[0].slug}`)
      .then((res) => res.json())
      .then((data) => setLatestPost(data.post ?? null))
      .catch(() => setLatestPost(null))
      .finally(() => setLatestLoading(false))
  }, [activeTab, posts, latestPost])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) return

      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        e.preventDefault()
        setActiveTab((current) => (current === 'list' ? 'latest' : 'list'))
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  const handlePostClick = useCallback(
    (slug: string) => {
      router.push(`/blog/${slug}`)
    },
    [router]
  )

  const TABS: { key: BlogTab; label: string }[] = [
    { key: 'latest', label: 'Latest' },
    { key: 'list', label: 'List' },
  ]

  return (
    <>
      <div className="address-header about-header">
        <div className="about-header-inner">
          <div className="address-header-street">Blog</div>
          <div className="about-tabs">
            {TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                className={`about-tab ${activeTab === t.key ? 'active' : ''}`}
                onClick={() => setActiveTab(t.key)}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {activeTab === 'list' && (
        <div key="list" className="about-panel blog-list-panel">
          {loading ? (
            <div className="blog-loading">Loading…</div>
          ) : posts.length === 0 ? (
            <div className="blog-loading">No posts yet.</div>
          ) : (
            <div className="blog-list">
              {posts.map((post) => (
                <div
                  key={post.slug}
                  className="blog-list-row"
                  onClick={() => handlePostClick(post.slug)}
                >
                  <span className="blog-list-title">{post.title}</span>
                  <span className="blog-list-date">{post.date_label}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === 'latest' && (
        <div key="latest" className="about-panel blog-latest-panel">
          {latestLoading || !latestPost ? (
            <div className="blog-loading">Loading…</div>
          ) : (
            <div className="blog-latest-layout">
              <article className="blog-latest-article">
                <div className="about-post-date">{latestPost.date_label}</div>
                <h1 className="about-post-h1">{latestPost.title}</h1>
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
                    {latestPost.body}
                  </ReactMarkdown>
                </div>
              </article>
              <aside className="about-post-sidebar">
                <div className="about-post-sidebar-label">Recent posts</div>
                {posts
                  .filter((p) => p.slug !== latestPost.slug)
                  .map((post) => (
                    <div
                      key={post.slug}
                      className="about-post-sidebar-item"
                      onClick={() => handlePostClick(post.slug)}
                    >
                      <div className="about-post-sidebar-title">
                        {post.title}
                      </div>
                      <div className="about-post-sidebar-date">
                        {post.date_label}
                      </div>
                    </div>
                  ))}
              </aside>
            </div>
          )}
        </div>
      )}
    </>
  )
}
