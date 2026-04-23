'use client'

import { useCallback, useEffect, useState } from 'react'

type AuditRow = {
  id: string
  slug: string
  pm_company_name: string | null
  contact_email: string | null
  expires_at: string | null
  is_active: boolean
  created_at: string
  property_count: number
  is_expired: boolean
  url: string
  total_views: number
  unique_visitors: number
  last_viewed_at: string | null
}

export default function AuditList() {
  const [audits, setAudits] = useState<AuditRow[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(() => {
    return fetch('/api/dashboard/audit/list')
      .then((r) => r.json())
      .then((d) => setAudits((d.audits as AuditRow[]) ?? []))
      .catch(() => setAudits([]))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const handleAction = async (audit: AuditRow, action: 'deactivate' | 'reactivate' | 'delete') => {
    const messages: Record<'deactivate' | 'reactivate' | 'delete', string> = {
      deactivate: `Deactivate "${audit.pm_company_name || audit.slug}"? The public link will stop working until reactivated.`,
      reactivate: `Reactivate "${audit.pm_company_name || audit.slug}"? The public link will start working again.`,
      delete: `Permanently delete "${audit.pm_company_name || audit.slug}"? This cannot be undone.`,
    }
    if (!confirm(messages[action])) return
    const res = await fetch('/api/dashboard/audit/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ audit_id: audit.id, action }),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      alert(typeof err.error === 'string' ? err.error : 'Request failed')
      return
    }
    void load()
  }

  if (loading || audits.length === 0) return null

  return (
    <div className="audit-list-section">
      <div className="audit-list-header">
        <span className="audit-list-title">Portfolio audits</span>
        <span className="audit-list-count">{audits.length}</span>
      </div>
      <table className="dashboard-table">
        <thead>
          <tr>
            <th>Audit</th>
            <th className="r">Properties</th>
            <th>Status</th>
            <th className="r">Views</th>
            <th>Created</th>
            <th>Expires</th>
            <th style={{ width: 200 }} />
          </tr>
        </thead>
        <tbody>
          {audits.map((a) => {
            const isLive = a.is_active && !a.is_expired
            return (
              <tr key={a.id}>
                <td>
                  <span className="dashboard-addr">{a.pm_company_name || a.slug}</span>
                  <span className="dashboard-addr-hood">/{a.slug}</span>
                </td>
                <td className="r">{a.property_count}</td>
                <td>
                  {isLive ? (
                    <span className="audit-status-badge audit-status-live">Live</span>
                  ) : a.is_expired ? (
                    <span className="audit-status-badge audit-status-expired">Expired</span>
                  ) : (
                    <span className="audit-status-badge audit-status-inactive">Inactive</span>
                  )}
                </td>
                <td className="r" style={{ fontSize: 12 }}>
                  {a.unique_visitors > 0 ? (
                    <span title={`${a.total_views} total page loads from ${a.unique_visitors} unique visitors`}>
                      <strong style={{ color: '#1a1a1a' }}>{a.unique_visitors}</strong>
                      <span style={{ color: '#999' }}> unique</span>
                      {a.last_viewed_at ? (
                        <div style={{ fontSize: 10, color: '#999', marginTop: 1 }}>
                          Last{' '}
                          {new Date(a.last_viewed_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        </div>
                      ) : null}
                    </span>
                  ) : (
                    <span style={{ color: '#d0ccc0' }}>—</span>
                  )}
                </td>
                <td style={{ fontSize: 12, color: '#999' }}>
                  {new Date(a.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </td>
                <td style={{ fontSize: 12, color: '#999' }}>
                  {a.expires_at
                    ? new Date(a.expires_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                    : 'Never'}
                </td>
                <td className="audit-actions-cell">
                  <a href={a.url} target="_blank" rel="noopener noreferrer" className="audit-action-link">
                    View
                  </a>
                  {a.is_active ? (
                    <button
                      type="button"
                      className="audit-action-deactivate"
                      onClick={() => void handleAction(a, 'deactivate')}
                    >
                      Deactivate
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="audit-action-reactivate"
                      onClick={() => void handleAction(a, 'reactivate')}
                    >
                      Reactivate
                    </button>
                  )}
                  <button type="button" className="audit-action-delete" onClick={() => void handleAction(a, 'delete')}>
                    Delete
                  </button>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
