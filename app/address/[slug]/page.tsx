import Link from 'next/link'
import { slugToDisplayAddress, slugToNormalizedAddress, slugToZip } from '@/lib/address-slug'
import { fetchProperty, fetchComplaints } from '@/lib/supabase-search'
import PropertyNav from './PropertyNav'
import PropertyFeed from './PropertyFeed'

type PageProps = { params: Promise<{ slug: string }> }

export async function generateMetadata({ params }: PageProps) {
  const { slug } = await params
  const display = slugToDisplayAddress(decodeURIComponent(slug))
  return {
    title: display ? `Property Sentinel — ${display}` : 'Property Sentinel — Address',
    description: '311 complaints, violations, and property details for this Chicago address.',
  }
}

function na(val: string | number | null | undefined): string {
  if (val === null || val === undefined || val === '') return 'N/A'
  return String(val)
}

export default async function AddressPage({ params }: PageProps) {
  const { slug } = await params
  const decodedSlug = decodeURIComponent(slug)
  const normalizedAddress = slugToNormalizedAddress(decodedSlug)
  const displayAddress = slugToDisplayAddress(decodedSlug)

  const [propertyResult, complaintsResult] = await Promise.all([
    fetchProperty(normalizedAddress),
    fetchComplaints(normalizedAddress),
  ])

  const property = propertyResult.property
  const complaints = complaintsResult.complaints ?? []
  const complaintsOpenCount = complaints.filter((c) => (c.status ?? '').toUpperCase() === 'OPEN').length

  const zip = slugToZip(decodedSlug)
  const addressBarMeta = [
    property?.community_area ?? null,
    property?.ward != null ? `Ward ${property.ward}` : null,
    zip ? `Chicago, IL ${zip}` : 'Chicago, IL',
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <div className="address-page">
      <PropertyNav />

      <div className="address-bar">
        <div>
          <div className="address-bar-street">{displayAddress || slug}</div>
          <div className="address-bar-meta">
            {addressBarMeta || 'Chicago'}
          </div>
        </div>
        <button type="button" className="alert-btn">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
            <path d="M13.73 21a2 2 0 0 1-3.46 0" />
          </svg>
          Turn on Alerts
        </button>
      </div>

      <div className="prop-page">
        <div className="profile">
          <div className="stat-row">
            <div className="stat">
              <div className="stat-label">Complaints</div>
              <div className={`stat-val ${complaintsOpenCount > 0 ? 'red' : ''}`}>{complaints.length}</div>
              <div className="stat-fraction">
                open / <strong>{complaints.length}</strong> total (90d)
              </div>
            </div>
            <div className="stat">
              <div className="stat-label">Violations</div>
              <div className="stat-val amber">0</div>
              <div className="stat-fraction">open / <strong>0</strong> total (90d)</div>
            </div>
            <div className="stat">
              <div className="stat-label">Last Permit</div>
              <span className="stat-val na">N/A</span>
            </div>
            <div className="stat">
              <div className="stat-label">Roof Age Est.</div>
              <span className="stat-val na">N/A</span>
            </div>
          </div>

          <div className="profile-card">
            <div className="profile-card-header">Property Details</div>
            <div className="detail-list">
              <div className="detail-row">
                <span className="detail-key">PIN</span>
                <span className={property?.pin ? 'detail-val' : 'detail-val na'}>{na(property?.pin)}</span>
              </div>
              <div className="detail-row">
                <span className="detail-key">Community Area</span>
                <span className={property?.community_area ? 'detail-val' : 'detail-val na'}>{na(property?.community_area)}</span>
              </div>
              <div className="detail-row">
                <span className="detail-key">Ward</span>
                <span className={property?.ward != null ? 'detail-val' : 'detail-val na'}>{na(property?.ward)}</span>
              </div>
              <div className="detail-row">
                <span className="detail-key">Class</span>
                <span className="detail-val na">{na(property?.class_code)}</span>
              </div>
              <div className="detail-row">
                <span className="detail-key">Units</span>
                <span className="detail-val na">{na(property?.units)}</span>
              </div>
              <div className="detail-row">
                <span className="detail-key">Tax Year</span>
                <span className="detail-val na">{na(property?.tax_year)}</span>
              </div>
              <div className="detail-row">
                <span className="detail-key">Zoning</span>
                <span className="detail-val na">{na(property?.zoning)}</span>
              </div>
            </div>
          </div>
        </div>

        <PropertyFeed complaints={complaints} complaintsOpenCount={complaintsOpenCount} />

        <div className="rail">
          <div className="rail-alert-card">
            <div className="rail-alert-title">Get alerted instantly</div>
            <div className="rail-alert-sub">
              SMS + email within 15 minutes of any new complaint, violation, or permit.
            </div>
            <div className="rail-alert-benefits">
              <div className="rail-alert-benefit">
                <span className="benefit-check">✓</span> Full complaint &amp; violation detail
              </div>
              <div className="rail-alert-benefit">
                <span className="benefit-check">✓</span> Inspector comments &amp; ordinance text
              </div>
              <div className="rail-alert-benefit">
                <span className="benefit-check">✓</span> First two properties included
              </div>
            </div>
          </div>
          <div className="rail-link-card">
            <div className="rail-link-title">Understand what you&apos;re seeing</div>
            <div className="rail-links">
              <Link className="rail-link" href="/#how">
                What happens after a complaint is filed <span className="rail-link-arrow">→</span>
              </Link>
              <Link className="rail-link" href="/#how">
                What each SR code means <span className="rail-link-arrow">→</span>
              </Link>
              <Link className="rail-link" href="/#how">
                Complaint vs. violation — what&apos;s the difference <span className="rail-link-arrow">→</span>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
