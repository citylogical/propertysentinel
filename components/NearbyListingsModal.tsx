'use client'

import { useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

export type NearbyListingsModalProps = {
  isOpen: boolean
  onClose: () => void
  address: string
  lat: number
  lng: number
}

type ListingRow = Record<string, unknown>

function formatListingPrice(price: unknown): string {
  if (price == null || price === '') return '—'
  if (typeof price === 'number' && Number.isFinite(price)) return `$${Math.round(price)}`
  const n = parseFloat(String(price).replace(/[^0-9.]/g, ''))
  return Number.isFinite(n) ? `$${Math.round(n)}` : '—'
}

function formatReviews(n: unknown): string {
  if (n == null || n === '') return '—'
  const v = Number(n)
  return Number.isFinite(v) ? v.toLocaleString('en-US') : '—'
}

export default function NearbyListingsModal({ isOpen, onClose, address, lat, lng }: NearbyListingsModalProps) {
  const [rows, setRows] = useState<ListingRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!isOpen || !Number.isFinite(lat) || !Number.isFinite(lng)) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(
        `/api/dashboard/nearby-listings?lat=${encodeURIComponent(String(lat))}&lng=${encodeURIComponent(String(lng))}`
      )
      const json = (await res.json()) as { data?: ListingRow[]; error?: string }
      if (!res.ok) {
        setError(json.error ?? `Request failed (${res.status})`)
        setRows([])
        return
      }
      setRows(Array.isArray(json.data) ? json.data : [])
    } catch {
      setError('Failed to load listings')
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [isOpen, lat, lng])

  useEffect(() => {
    if (!isOpen) return
    void load()
  }, [isOpen, load])

  if (!isOpen || typeof document === 'undefined') return null

  const listings = rows

  return createPortal(
    <div className="save-modal-backdrop" onClick={onClose} role="presentation">
      <div
        className="listings-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="listings-modal-header">
          <div>
            <div className="listings-modal-kicker">Airbnb Listings Near</div>
            <div className="listings-modal-title">{address}</div>
          </div>
          <button type="button" className="listings-modal-close" onClick={onClose} aria-label="Close">
            &times;
          </button>
        </div>

        <div className="listings-modal-count">
          {loading
            ? 'Loading…'
            : error
              ? error
              : `${listings.length} listing${listings.length !== 1 ? 's' : ''} within 150m`}
        </div>

        <div className="listings-modal-table-wrap">
          {loading ? (
            <div style={{ padding: '20px 24px', fontSize: 13, color: '#666' }}>Loading…</div>
          ) : error ? (
            <div style={{ padding: '20px 24px', fontSize: 13, color: '#b8302a' }}>{error}</div>
          ) : (
            <table className="dashboard-table">
              <thead>
                <tr>
                  <th>Listing</th>
                  <th>Host</th>
                  <th>Type</th>
                  <th className="r">Price</th>
                  <th>License</th>
                  <th>Compliant</th>
                  <th className="r">Reviews</th>
                  <th className="r">Host Listings</th>
                </tr>
              </thead>
              <tbody>
                {listings.map((l, i) => {
                  const listingId = l.listing_id ?? l.id
                  const idStr = listingId != null ? String(listingId) : ''
                  const hrefFromRow =
                    typeof l.listing_url === 'string' && l.listing_url.trim() !== ''
                      ? l.listing_url.trim()
                      : idStr
                        ? `https://www.airbnb.com/rooms/${encodeURIComponent(idStr)}`
                        : null
                  const licenseStr = l.license != null ? String(l.license) : ''
                  const compliant = licenseStr.trim() !== ''
                  const roomOrProp =
                    l.room_type != null && String(l.room_type).trim() !== ''
                      ? String(l.room_type)
                      : l.property_type != null
                        ? String(l.property_type)
                        : '—'
                  const hostListings =
                    l.calculated_host_listings_count ?? l.host_listings_count ?? l.host_listings
                  return (
                    <tr key={String(l.id ?? l.listing_id ?? i)}>
                      <td>
                        {hrefFromRow ? (
                          <a href={hrefFromRow} target="_blank" rel="noopener noreferrer" className="listings-modal-link">
                            {idStr || '—'}
                          </a>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td>{l.host_name != null ? String(l.host_name) : '—'}</td>
                      <td className="listings-modal-type">{roomOrProp}</td>
                      <td className="r">{formatListingPrice(l.price)}</td>
                      <td className="listings-modal-license">{licenseStr.trim() !== '' ? licenseStr : '—'}</td>
                      <td>
                        {compliant ? (
                          <span className="listings-modal-badge listings-modal-badge-yes">Yes</span>
                        ) : (
                          <span className="listings-modal-badge listings-modal-badge-no">No</span>
                        )}
                      </td>
                      <td className="r">{formatReviews(l.number_of_reviews ?? l.reviews)}</td>
                      <td className="r">
                        {hostListings != null && hostListings !== '' ? String(hostListings) : '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>,
    document.body
  )
}
