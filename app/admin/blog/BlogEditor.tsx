'use client'

import { useState, useEffect, useCallback } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

type Post = {
  id: string
  slug: string
  title: string
  body: string
  date_label: string
  description?: string | null
  published: boolean
  sort_order: number
  created_at: string
  updated_at: string
}

export default function BlogEditor() {
  const [posts, setPosts] = useState<Post[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState('')
  const [preview, setPreview] = useState(false)

  // Form state
  const [slug, setSlug] = useState('')
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [dateLabel, setDateLabel] = useState('')
  const [published, setPublished] = useState(false)
  const [sortOrder, setSortOrder] = useState(0)
  const [description, setDescription] = useState('')

  const fetchPosts = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/blog/admin')
      const data = await res.json()
      setPosts(data.posts ?? [])
    } catch {
      setPosts([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchPosts()
  }, [fetchPosts])

  const resetForm = () => {
    setSelectedId(null)
    setSlug('')
    setTitle('')
    setBody('')
    setDateLabel('')
    setPublished(false)
    setSortOrder(0)
    setDescription('')
    setPreview(false)
  }

  const loadPost = (post: Post) => {
    setSelectedId(post.id)
    setSlug(post.slug)
    setTitle(post.title)
    setBody(post.body)
    setDateLabel(post.date_label)
    setPublished(post.published)
    setSortOrder(post.sort_order)
    setDescription(post.description || '')
    setPreview(false)
  }

  const handleSave = async (pub?: boolean) => {
    if (!slug.trim() || !title.trim() || !body.trim() || !dateLabel.trim()) {
      setToast('All fields required')
      setTimeout(() => setToast(''), 3000)
      return
    }
    setSaving(true)
    try {
      const res = await fetch('/api/blog/admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: selectedId || undefined,
          slug: slug.trim(),
          title: title.trim(),
          body: body,
          date_label: dateLabel.trim(),
          description: description.trim() || null,
          published: pub !== undefined ? pub : published,
          sort_order: sortOrder,
        }),
      })
      const data = await res.json()
      if (data.error) {
        setToast(`Error: ${data.error}`)
      } else {
        setToast(pub ? 'Published!' : 'Saved!')
        setSelectedId(data.post.id)
        setPublished(data.post.published)
        fetchPosts()
      }
    } catch {
      setToast('Save failed')
    } finally {
      setSaving(false)
      setTimeout(() => setToast(''), 3000)
    }
  }

  const handleDelete = async () => {
    if (!selectedId) return
    if (!window.confirm('Delete this post permanently?')) return
    try {
      await fetch('/api/blog/admin', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: selectedId }),
      })
      resetForm()
      fetchPosts()
      setToast('Deleted')
      setTimeout(() => setToast(''), 3000)
    } catch {
      setToast('Delete failed')
    }
  }

  const autoSlug = (t: string) => {
    return t
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .slice(0, 80)
  }

  return (
    <div style={{ position: 'relative', zIndex: 1, display: 'flex', gap: 20, padding: '20px 24px 60px', maxWidth: 1200, alignItems: 'flex-start' }}>
      {/* ── Post list sidebar ── */}
      <div style={{ width: 260, flexShrink: 0 }}>
        <button
          type="button"
          onClick={resetForm}
          style={{
            width: '100%', padding: '10px 14px', marginBottom: 12,
            background: '#0f2744', color: '#fff', border: 'none', borderRadius: 6,
            fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
          }}
        >
          + New post
        </button>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {loading ? (
            <div style={{ fontSize: 12, color: '#8a94a0', padding: '12px 0' }}>Loading…</div>
          ) : posts.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => loadPost(p)}
              style={{
                display: 'block', width: '100%', textAlign: 'left',
                padding: '10px 12px', border: '1px solid', borderRadius: 6, cursor: 'pointer',
                fontFamily: 'inherit', fontSize: 12, transition: 'all 0.12s',
                background: selectedId === p.id ? '#fff' : 'transparent',
                borderColor: selectedId === p.id ? '#0f2744' : '#ddd9d0',
                color: '#1a1a1a',
              }}
            >
              <div style={{ fontWeight: 600, marginBottom: 2, lineHeight: 1.3 }}>{p.title}</div>
              <div style={{ fontSize: 10, color: '#8a94a0', display: 'flex', gap: 8 }}>
                <span>{p.date_label}</span>
                <span style={{
                  color: p.published ? '#2d6a4f' : '#b7791f',
                  fontWeight: 600,
                }}>
                  {p.published ? 'Published' : 'Draft'}
                </span>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* ── Editor ── */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          background: '#fff', border: '1px solid #ddd9d0', borderRadius: 6,
          padding: 20, marginBottom: 12,
        }}>
          {/* Title */}
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: 'block', fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', color: '#4a5568', marginBottom: 4 }}>
              Title
            </label>
            <input
              value={title}
              onChange={(e) => {
                setTitle(e.target.value)
                if (!selectedId) setSlug(autoSlug(e.target.value))
              }}
              placeholder="What happens after an SHVR complaint is filed in Chicago"
              style={{
                width: '100%', padding: '8px 10px', fontSize: 13, border: '1px solid #ddd9d0',
                borderRadius: 6, outline: 'none', fontFamily: 'inherit', color: '#1a1a1a',
                boxSizing: 'border-box',
              }}
            />
          </div>

          {/* Slug + date + sort on one row */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 140px 80px', gap: 10, marginBottom: 12 }}>
            <div>
              <label style={{ display: 'block', fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', color: '#4a5568', marginBottom: 4 }}>
                Slug
              </label>
              <input
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                placeholder="shvr-complaint-lifecycle"
                style={{
                  width: '100%', padding: '8px 10px', fontSize: 12, border: '1px solid #ddd9d0',
                  borderRadius: 6, outline: 'none', fontFamily: '"DM Mono", monospace', color: '#1a1a1a',
                  boxSizing: 'border-box',
                }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', color: '#4a5568', marginBottom: 4 }}>
                Date label
              </label>
              <input
                value={dateLabel}
                onChange={(e) => setDateLabel(e.target.value)}
                placeholder="March 2026"
                style={{
                  width: '100%', padding: '8px 10px', fontSize: 12, border: '1px solid #ddd9d0',
                  borderRadius: 6, outline: 'none', fontFamily: 'inherit', color: '#1a1a1a',
                  boxSizing: 'border-box',
                }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', color: '#4a5568', marginBottom: 4 }}>
                Sort #
              </label>
              <input
                type="number"
                value={sortOrder}
                onChange={(e) => setSortOrder(parseInt(e.target.value) || 0)}
                style={{
                  width: '100%', padding: '8px 10px', fontSize: 12, border: '1px solid #ddd9d0',
                  borderRadius: 6, outline: 'none', fontFamily: '"DM Mono", monospace', color: '#1a1a1a',
                  boxSizing: 'border-box',
                }}
              />
            </div>
          </div>

          {/* Meta description for SEO */}
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: 'block', fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', color: '#4a5568', marginBottom: 4 }}>
              Meta description (SEO)
            </label>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="155 characters — shown in Google search results"
              maxLength={160}
              style={{
                width: '100%', padding: '8px 10px', fontSize: 12, border: '1px solid #ddd9d0',
                borderRadius: 6, outline: 'none', fontFamily: 'inherit', color: '#1a1a1a',
                boxSizing: 'border-box',
              }}
            />
            <div style={{ fontSize: 10, color: '#8a94a0', marginTop: 3, textAlign: 'right' }}>
              {description.length}/155
            </div>
          </div>

          {/* Write / Preview toggle */}
          <div style={{ display: 'flex', gap: 0, marginBottom: 8, borderBottom: '1px solid #ddd9d0' }}>
            <button
              type="button"
              onClick={() => setPreview(false)}
              style={{
                padding: '6px 14px', fontSize: 12, fontWeight: preview ? 400 : 600,
                color: preview ? '#8a94a0' : '#0f2744', background: 'none', border: 'none',
                borderBottom: preview ? '2px solid transparent' : '2px solid #0f2744',
                cursor: 'pointer', fontFamily: 'inherit',
              }}
            >
              Write
            </button>
            <button
              type="button"
              onClick={() => setPreview(true)}
              style={{
                padding: '6px 14px', fontSize: 12, fontWeight: preview ? 600 : 400,
                color: preview ? '#0f2744' : '#8a94a0', background: 'none', border: 'none',
                borderBottom: preview ? '2px solid #0f2744' : '2px solid transparent',
                cursor: 'pointer', fontFamily: 'inherit',
              }}
            >
              Preview
            </button>
          </div>

          {/* Body */}
          {preview ? (
            <div className="about-post-body" style={{ minHeight: 300, padding: '12px 0' }}>
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  h1: ({ children }) => <h1 style={{ fontFamily: '"Merriweather", Georgia, serif', fontSize: 22, fontWeight: 700, color: '#0f2744', margin: '24px 0 12px' }}>{children}</h1>,
                  h2: ({ children }) => <h2 style={{ fontFamily: '"Merriweather", Georgia, serif', fontSize: 18, fontWeight: 700, color: '#0f2744', margin: '20px 0 10px' }}>{children}</h2>,
                  h3: ({ children }) => <h3 style={{ fontSize: 15, fontWeight: 600, color: '#0f2744', margin: '16px 0 8px' }}>{children}</h3>,
                  h4: ({ children }) => <h4 style={{ fontSize: 13, fontWeight: 600, color: '#4a5568', margin: '14px 0 6px' }}>{children}</h4>,
                  table: ({ children }) => (
                    <div style={{ overflowX: 'auto', margin: '16px 0' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, fontFamily: '"DM Mono", monospace' }}>{children}</table>
                    </div>
                  ),
                  th: ({ children }) => <th style={{ textAlign: 'left', padding: '8px 10px', borderBottom: '2px solid #ddd9d0', fontSize: 10, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase' as const, color: '#8a94a0' }}>{children}</th>,
                  td: ({ children }) => <td style={{ padding: '6px 10px', borderBottom: '1px solid #eee8df', color: '#1a1a1a' }}>{children}</td>,
                  a: ({ href, children }) => <a href={href} style={{ color: '#0f2744', textDecoration: 'underline', textUnderlineOffset: '2px' }}>{children}</a>,
                }}
              >
                {body}
              </ReactMarkdown>
            </div>
          ) : (
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Write your post in markdown…"
              style={{
                width: '100%', minHeight: 300, padding: 10, fontSize: 13, lineHeight: 1.7,
                border: '1px solid #ddd9d0', borderRadius: 6, outline: 'none',
                fontFamily: '"DM Mono", monospace', color: '#1a1a1a', resize: 'vertical',
                boxSizing: 'border-box',
              }}
            />
          )}
        </div>

        {/* Action bar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={() => handleSave(false)}
            disabled={saving}
            style={{
              padding: '9px 16px', fontSize: 12, fontWeight: 600, borderRadius: 6,
              border: '1px solid #ddd9d0', background: '#fff', color: '#1a1a1a',
              cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            {saving ? 'Saving…' : 'Save draft'}
          </button>
          <button
            type="button"
            onClick={() => handleSave(true)}
            disabled={saving}
            style={{
              padding: '9px 16px', fontSize: 12, fontWeight: 600, borderRadius: 6,
              border: 'none', background: '#0f2744', color: '#fff',
              cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            {saving ? 'Publishing…' : published ? 'Update & publish' : 'Publish'}
          </button>
          {published && (
            <button
              type="button"
              onClick={() => handleSave(false)}
              disabled={saving}
              style={{
                padding: '9px 16px', fontSize: 12, fontWeight: 500, borderRadius: 6,
                border: '1px solid #ddd9d0', background: '#fff', color: '#b7791f',
                cursor: 'pointer', fontFamily: 'inherit',
              }}
            >
              Unpublish
            </button>
          )}
          {selectedId && (
            <button
              type="button"
              onClick={handleDelete}
              style={{
                padding: '9px 16px', fontSize: 12, fontWeight: 500, borderRadius: 6,
                border: 'none', background: 'none', color: '#c0392b',
                cursor: 'pointer', fontFamily: 'inherit', marginLeft: 'auto',
              }}
            >
              Delete
            </button>
          )}
          {toast && (
            <span style={{
              fontSize: 12, fontWeight: 500, marginLeft: 8,
              color: toast.startsWith('Error') ? '#c0392b' : '#2d6a4f',
            }}>
              {toast}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
