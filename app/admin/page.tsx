'use client'

import { useState, useEffect } from 'react'

const ADMIN_STORAGE_KEY = 'admin_authenticated'

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

export default function AdminPage() {
  const [authed, setAuthed] = useState<boolean | null>(null)
  const [password, setPassword] = useState('')
  const [authError, setAuthError] = useState('')
  const [address, setAddress] = useState('')
  const [results, setResults] = useState<Record<string, unknown>[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [searchError, setSearchError] = useState('')
  const [showRawJson, setShowRawJson] = useState(false)

  useEffect(() => {
    const stored = typeof window !== 'undefined' && localStorage.getItem(ADMIN_STORAGE_KEY)
    if (!stored) {
      setAuthed(false)
      return
    }
    fetch('/api/admin/me', { credentials: 'include' })
      .then((r) => {
        if (r.ok) setAuthed(true)
        else {
          localStorage.removeItem(ADMIN_STORAGE_KEY)
          setAuthed(false)
        }
      })
      .catch(() => {
        localStorage.removeItem(ADMIN_STORAGE_KEY)
        setAuthed(false)
      })
  }, [])

  function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setAuthError('')
    fetch('/api/admin/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
      credentials: 'include',
    })
      .then((r) => r.json())
      .then((data) => {
        if (data?.ok) {
          if (typeof window !== 'undefined') localStorage.setItem(ADMIN_STORAGE_KEY, 'true')
          setAuthed(true)
          setPassword('')
        } else {
          setAuthError('Invalid password')
        }
      })
      .catch(() => setAuthError('Request failed'))
  }

  function handleLogout() {
    fetch('/api/admin/logout', { method: 'POST', credentials: 'include' }).finally(() => {
      if (typeof window !== 'undefined') localStorage.removeItem(ADMIN_STORAGE_KEY)
      setAuthed(false)
      setResults(null)
    })
  }

  function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    if (!address.trim()) return
    setSearchError('')
    setResults(null)
    setLoading(true)
    const params = new URLSearchParams({ address: address.trim() })
    fetch(`/api/admin/311?${params.toString()}`, { credentials: 'include' })
      .then((r) => {
        if (!r.ok) {
          if (r.status === 401) {
            localStorage.removeItem(ADMIN_STORAGE_KEY)
            setAuthed(false)
          }
          return r.json().then((d) => Promise.reject(new Error(d?.error || r.statusText)))
        }
        return r.json()
      })
      .then((data) => {
        setResults(Array.isArray(data) ? data : [data])
      })
      .catch((err) => {
        setSearchError(err?.message || 'Search failed')
      })
      .finally(() => setLoading(false))
  }

  if (authed === null) {
    return (
      <main className="min-h-screen p-6 bg-gray-100 flex items-center justify-center">
        <p className="text-gray-600">Checking auth…</p>
      </main>
    )
  }

  if (!authed) {
    return (
      <main className="min-h-screen p-6 bg-gray-100 flex items-center justify-center">
        <div className="w-full max-w-sm bg-white border border-gray-200 rounded-lg p-6 shadow-sm">
          <h1 className="text-xl font-semibold text-gray-900 mb-4">Admin login</h1>
          <form onSubmit={handleLogin}>
            <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded mb-4"
              autoComplete="current-password"
              required
            />
            {authError && <p className="text-red-600 text-sm mb-2">{authError}</p>}
            <button type="submit" className="w-full py-2 bg-gray-800 text-white rounded font-medium">
              Log in
            </button>
          </form>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen p-6 bg-gray-100">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-semibold text-gray-900">Admin — 311 full details</h1>
          <button
            type="button"
            onClick={handleLogout}
            className="text-sm text-gray-600 hover:text-gray-900"
          >
            Log out
          </button>
        </div>

        <form onSubmit={handleSearch} className="flex gap-2 mb-6">
          <input
            type="text"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="Chicago address (e.g. 1111 W GRACE ST)"
            className="flex-1 px-3 py-2 border border-gray-300 rounded"
          />
          <button
            type="submit"
            disabled={loading}
            className="px-4 py-2 bg-gray-800 text-white rounded font-medium disabled:opacity-50"
          >
            {loading ? 'Searching…' : 'Search'}
          </button>
        </form>

        {searchError && <p className="text-red-600 text-sm mb-4">{searchError}</p>}

        {results !== null && (
          <div className="mb-4">
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={showRawJson}
                onChange={(e) => setShowRawJson(e.target.checked)}
              />
              Show raw JSON
            </label>
          </div>
        )}

        {results !== null && results.length === 0 && !showRawJson && (
          <p className="text-gray-600">No complaints found for this address.</p>
        )}

        {results !== null && showRawJson && (
          <pre className="bg-gray-900 text-gray-100 p-4 rounded overflow-auto text-xs max-h-[70vh] mb-6">
            {JSON.stringify(results, null, 2)}
          </pre>
        )}

        {results !== null && !showRawJson && results.length > 0 && (
          <div className="space-y-4">
            <p className="text-sm text-gray-600">{results.length} complaint(s)</p>
            {results.map((row, i) => (
              <div key={i} className="bg-white border border-gray-200 rounded p-4 space-y-2">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 text-sm">
                  <div><span className="text-gray-500">SR number:</span> {(row.sr_number as string) ?? '—'}</div>
                  <div><span className="text-gray-500">Type:</span> {(row.sr_type as string) ?? '—'}</div>
                  <div><span className="text-gray-500">Status:</span> {(row.status as string) ?? '—'}</div>
                  <div><span className="text-gray-500">Origin:</span> {(row.origin as string) ?? '—'}</div>
                  <div><span className="text-gray-500">Date filed:</span> {formatDate(row.created_date as string)}</div>
                  <div><span className="text-gray-500">Date closed:</span> {formatDate(row.closed_date as string)}</div>
                  <div className="sm:col-span-2"><span className="text-gray-500">Address:</span> {(row.street_address as string) ?? '—'}</div>
                  {row.created_department != null && <div><span className="text-gray-500">Created dept:</span> {String(row.created_department)}</div>}
                  {row.owner_department != null && <div><span className="text-gray-500">Owner dept:</span> {String(row.owner_department)}</div>}
                </div>
                <div className="text-sm pt-2 border-t border-gray-100">
                  <span className="text-gray-500">Full description (type):</span>{' '}
                  <span className="text-gray-900">{(row.sr_type as string) ?? '—'}</span>
                  {row.sr_short_code != null && (
                    <span className="text-gray-500 ml-2">Code: {String(row.sr_short_code)}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  )
}
