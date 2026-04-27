'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import NearbyListingsModal from '@/components/NearbyListingsModal'
import UpgradeModal from '@/components/UpgradeModal'
import PortfolioDetail from '@/app/dashboard/PortfolioDetail'
import type { PortfolioProperty } from '@/app/dashboard/types'

export type AuditProperty = {
  id: string
  canonical_address: string
  address_range: string | null
  additional_streets: string[] | null
  display_name: string | null
  pins: string[] | null
  slug: string | null
  community_area: string | null
  property_class: string | null
  year_built: string | null
  implied_value: number | null
  open_complaints: number
  total_complaints_12mo: number
  open_violations: number
  total_violations_12mo: number
  total_permits_12mo: number
  shvr_count: number
  is_pbl: boolean
  has_stop_work: boolean
  str_registrations?: number
  is_restricted_zone?: boolean
  nearby_listings?: number
}

export type Audit = {
  id: string
  slug: string
  pm_company_name: string | null
  contact_email: string | null
  created_at: string
  expires_at: string | null
}

type Props = {
  audit: Record<string, unknown>
  properties: Record<string, unknown>[]
}

function asAudit(a: Record<string, unknown>): Audit {
  return {
    id: String(a.id ?? ''),
    slug: String(a.slug ?? ''),
    pm_company_name: (a.pm_company_name as string | null) ?? null,
    contact_email: (a.contact_email as string | null) ?? null,
    created_at: String(a.created_at ?? ''),
    expires_at: (a.expires_at as string | null) ?? null,
  }
}

function auditPropertyToPortfolioProperty(p: AuditProperty): PortfolioProperty {
  return {
    id: p.id,
    canonical_address: p.canonical_address,
    address_range: p.address_range,
    additional_streets: p.additional_streets,
    pins: p.pins,
    slug: p.slug ?? '',
    display_name: p.display_name,
    units_override: null,
    sqft_override: null,
    notes: null,
    alerts_enabled: false,
    created_at: '',
    open_violations: p.open_violations,
    open_complaints: p.open_complaints,
    total_complaints_12mo: p.total_complaints_12mo,
    total_violations_12mo: p.total_violations_12mo,
    total_permits: p.total_permits_12mo,
    shvr_count: p.shvr_count,
    is_pbl: p.is_pbl,
    has_stop_work: p.has_stop_work,
    str_registrations: p.str_registrations,
    is_restricted_zone: p.is_restricted_zone,
    nearby_listings: p.nearby_listings,
    implied_value: p.implied_value,
    community_area: p.community_area,
    property_class: p.property_class,
    building_chars: { year_built: p.year_built },
    latest_violation_date: null,
    latest_permit_date: null,
    recent_complaints: [],
    recent_violations: [],
    recent_permits: [],
  }
}

function asAuditProperty(p: Record<string, unknown>): AuditProperty {
  return {
    id: String(p.id ?? ''),
    canonical_address: String(p.canonical_address ?? ''),
    address_range: (p.address_range as string | null) ?? null,
    additional_streets: (p.additional_streets as string[] | null) ?? null,
    display_name: (p.display_name as string | null) ?? null,
    pins: (p.pins as string[] | null) ?? null,
    slug: (p.slug as string | null) ?? null,
    community_area: (p.community_area as string | null) ?? null,
    property_class: (p.property_class as string | null) ?? null,
    year_built: p.year_built != null ? String(p.year_built) : null,
    implied_value: (p.implied_value as number | null) ?? null,
    open_complaints: Number(p.open_complaints ?? 0),
    total_complaints_12mo: Number(p.total_complaints_12mo ?? 0),
    open_violations: Number(p.open_violations ?? 0),
    total_violations_12mo: Number(p.total_violations_12mo ?? 0),
    total_permits_12mo: Number(p.total_permits_12mo ?? 0),
    shvr_count: Number(p.shvr_count ?? 0),
    is_pbl: Boolean(p.is_pbl),
    has_stop_work: Boolean(p.has_stop_work),
    str_registrations: Number(p.str_registrations ?? 0),
    is_restricted_zone: Boolean(p.is_restricted_zone),
    nearby_listings: Number(p.nearby_listings ?? 0),
  }
}

export default function AuditView({ audit: auditRaw, properties: propertiesRaw }: Props) {
  const audit = asAudit(auditRaw)
  const properties = propertiesRaw.map(asAuditProperty).sort((a, b) => {
    const ac = a.total_complaints_12mo ?? a.open_complaints ?? 0
    const bc = b.total_complaints_12mo ?? b.open_complaints ?? 0
    if (bc !== ac) return bc - ac
    const av = a.total_violations_12mo ?? 0
    const bv = b.total_violations_12mo ?? 0
    if (bv !== av) return bv - av
    const ap = a.total_permits_12mo ?? 0
    const bp = b.total_permits_12mo ?? 0
    if (bp !== ap) return bp - ap
    const al = a.nearby_listings ?? 0
    const bl = b.nearby_listings ?? 0
    return bl - al
  })

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const selectedProperty = properties.find((row) => row.id === selectedId) ?? null
  const [listingsProperty, setListingsProperty] = useState<AuditProperty | null>(null)
  const [listingsCoords, setListingsCoords] = useState<{ lat: number; lng: number } | null>(null)
  const [upgradeOpen, setUpgradeOpen] = useState(false)

  useEffect(() => {
    if (!listingsProperty) return

    let cancelled = false
    const pin = listingsProperty.pins?.[0]
    if (!pin) {
      const id = globalThis.setTimeout(() => {
        if (!cancelled) setListingsCoords(null)
      }, 0)
      return () => {
        cancelled = true
        globalThis.clearTimeout(id)
      }
    }

    fetch(`/api/parcel-coords?pin=${encodeURIComponent(pin)}`)
      .then((r) => r.json())
      .then((d: { lat?: number | null; lng?: number | null }) => {
        if (cancelled) return
        if (d.lat != null && d.lng != null && Number.isFinite(d.lat) && Number.isFinite(d.lng)) {
          setListingsCoords({ lat: d.lat, lng: d.lng })
        } else {
          setListingsCoords(null)
        }
      })
      .catch(() => {
        if (!cancelled) setListingsCoords(null)
      })
    return () => {
      cancelled = true
    }
  }, [listingsProperty])

  const totalComplaints = properties.reduce((s, p) => s + (p.total_complaints_12mo ?? p.open_complaints ?? 0), 0)
  const totalViolations = properties.reduce((s, p) => s + (p.total_violations_12mo ?? 0), 0)
  const totalOpen = properties.reduce((s, p) => s + (p.open_violations ?? 0), 0)
  const totalPermits = properties.reduce((s, p) => s + (p.total_permits_12mo ?? 0), 0)
  const strFlagsCount = properties.filter((p) => (p.shvr_count ?? 0) > 0 || p.is_pbl).length

  const companyName = audit.pm_company_name || 'Portfolio Audit'
  const initials = companyName.trim().length >= 2 ? companyName.slice(0, 2).toUpperCase() : 'PS'

  const getFlag = (p: AuditProperty): { label: string; color: 'red' | 'amber' } | null => {
    if (p.has_stop_work) return { label: 'Stop work', color: 'red' }
    const recent = (p as AuditProperty & { recent_complaints_30d?: number | null }).recent_complaints_30d ?? 0
    if (recent >= 3) return { label: `${recent} recent`, color: 'red' }
    if (recent > 0) return { label: `${recent} recent`, color: 'amber' }
    if (p.is_pbl) return { label: 'PBL', color: 'amber' }
    if (p.shvr_count > 0) return { label: `${p.shvr_count} SHVR`, color: 'amber' }
    return null
  }

  return (
    <div style={{ padding: '20px 28px', maxWidth: 1400, margin: '0 auto' }}>
      <div className="dashboard-identity-row">
        <div className="dashboard-identity-left">
          <div className="dashboard-logo">{initials}</div>
          <div className="dashboard-identity-text">
            <h1 className="dashboard-identity-name">{companyName}</h1>
            <div className="dashboard-identity-sub">
              {properties.length} properties · Last 12 months ·{' '}
              {audit.created_at
                ? new Date(audit.created_at).toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  })
                : ''}
            </div>
            <div
              style={{
                fontSize: 12,
                color: '#7a7468',
                fontStyle: 'italic',
                marginTop: 6,
                maxWidth: 720,
                lineHeight: 1.5,
              }}
            >
              This audit was compiled from publicly available information of
              properties in your portfolio. To see all properties and get
              same-day updates, please reach out.
            </div>
          </div>
        </div>
        <div className="dashboard-inline-stats">
          <div className="dashboard-istat">
            <div className="dashboard-istat-num">{totalComplaints}</div>
            <div className="dashboard-istat-label">Complaints</div>
          </div>
          <div className="dashboard-istat-sep" />
          <div className="dashboard-istat">
            <div className="dashboard-istat-num">{totalViolations}</div>
            <div className="dashboard-istat-label">Violations</div>
          </div>
          <div className="dashboard-istat-sep" />
          <div className="dashboard-istat">
            <div className="dashboard-istat-num">{totalPermits}</div>
            <div className="dashboard-istat-label">Permits</div>
          </div>
          <div className="dashboard-istat-sep" />
          <div className="dashboard-istat">
            <div className="dashboard-istat-num">{strFlagsCount}</div>
            <div className="dashboard-istat-label">STR flags</div>
          </div>
        </div>
      </div>

      <div className="dashboard-banner-row" style={{ marginBottom: 16 }}>
        <div className="dashboard-banner dashboard-banner-monitor">
          <span>
            <strong>Set up real-time monitoring</strong> — get alerts the moment something hits your portfolio
          </span>
          <button
            type="button"
            className="dashboard-banner-monitor-btn"
            onClick={() => setUpgradeOpen(true)}
          >
            Set up →
          </button>
        </div>
        <div className="dashboard-banner dashboard-banner-right">
          <div className="dashboard-banner-right-left">
            <div className="dashboard-banner-count">{properties.length}</div>
            <div className="dashboard-banner-count-text">
              <strong>properties tracked</strong>
              <br />
              Add the rest of your portfolio in a single click
            </div>
          </div>
          <button
            type="button"
            className="dashboard-banner-add-btn"
            onClick={() => setUpgradeOpen(true)}
          >
            + Add property
          </button>
        </div>
      </div>

      {selectedProperty ? (
        <PortfolioDetail
          property={auditPropertyToPortfolioProperty(selectedProperty)}
          onClose={() => setSelectedId(null)}
          detailEndpoint={`/api/audit/detail?slug=${encodeURIComponent(audit.slug)}&property_id=${encodeURIComponent(selectedProperty.id)}`}
          showHistoricalActivityBar={false}
          showParaphrasedReports={true}
          onUpgradePrompt={() => setUpgradeOpen(true)}
        />
      ) : null}

      <div className="dashboard-table-wrap">
        <table className="dashboard-table">
          <thead>
            <tr>
              <th>Address</th>
              <th className="r" style={{ width: 95 }}>
                Complaints
              </th>
              <th className="r" style={{ width: 95 }}>
                Violations
              </th>
              <th className="r" style={{ width: 80 }}>
                Permits
              </th>
              <th className="r" style={{ width: 100 }}>
                STR Listings
              </th>
              <th style={{ width: 130 }}>Flags</th>
            </tr>
          </thead>
          <tbody>
            {properties.map((p) => {
              const flag = getFlag(p)
              return (
                <tr
                  key={p.id}
                  className={selectedId === p.id ? 'selected' : ''}
                  onClick={() => setSelectedId(selectedId === p.id ? null : p.id)}
                >
                  <td>
                    <span className="dashboard-addr">
                      {p.display_name || p.address_range || p.canonical_address}
                    </span>
                    <span className="dashboard-addr-hood">{p.community_area || ''}</span>
                  </td>
                  <td className="r">
                    {(p.total_complaints_12mo ?? p.open_complaints ?? 0) > 0 ? (
                      p.total_complaints_12mo ?? p.open_complaints ?? 0
                    ) : (
                      <span className="zero">0</span>
                    )}
                  </td>
                  <td className="r">
                    {(p.total_violations_12mo ?? 0) > 0 ? p.total_violations_12mo : <span className="zero">0</span>}
                  </td>
                  <td className="r">
                    {p.total_permits_12mo > 0 ? p.total_permits_12mo : <span className="zero">0</span>}
                  </td>
                  <td className="r">
                    {(p.nearby_listings ?? 0) > 0 ? (
                      <button
                        type="button"
                        className="dashboard-val-link"
                        style={{ color: '#b87514', fontWeight: 500 }}
                        onClick={(e) => {
                          e.stopPropagation()
                          setUpgradeOpen(true)
                        }}
                      >
                        {p.nearby_listings}
                      </button>
                    ) : (
                      <span className="zero">0</span>
                    )}
                  </td>
                  <td>
                    {flag ? (
                      <span className={`dashboard-flag ${flag.color}`}>
                        <span className={`dashboard-flag-dot ${flag.color}`} />
                        {flag.label}
                      </span>
                    ) : null}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {audit.contact_email ? (
        <div
          style={{
            marginTop: 20,
            padding: '12px 16px',
            background: '#f7f6f2',
            border: '1px solid #e5e1d6',
            fontSize: 13,
            color: '#666',
          }}
        >
          Questions about this audit? Contact{' '}
          <a href={`mailto:${audit.contact_email}`} style={{ color: '#0f2744', fontWeight: 500 }}>
            {audit.contact_email}
          </a>
        </div>
      ) : null}

      {listingsProperty && listingsCoords ? (
        <NearbyListingsModal
          isOpen
          onClose={() => {
            setListingsProperty(null)
            setListingsCoords(null)
          }}
          address={listingsProperty.display_name || listingsProperty.canonical_address}
          lat={listingsCoords.lat}
          lng={listingsCoords.lng}
        />
      ) : null}
      <UpgradeModal isOpen={upgradeOpen} onClose={() => setUpgradeOpen(false)} />
    </div>
  )
}
