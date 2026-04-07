'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { useUser, SignInButton } from '@clerk/nextjs'
import { CHICAGO_COMMUNITY_AREAS, getCommunityAreaName } from '@/lib/chicago-community-areas'
import {
  ALL_MAPPED_CODES,
  getCategoryForCode,
  getCodesForCategory,
  LEAD_CATEGORIES,
  type LeadCategory,
} from '@/lib/lead-categories'
import { getPropertyTypeStyle, type PropertyTypeLabel } from '@/lib/property-type'
import LitigatorCreditModal from '@/components/LitigatorCreditModal'
import OutOfCreditsModal from '@/components/OutOfCreditsModal'
import IncorrectInfoModal from '@/components/IncorrectInfoModal'
import MultiOwnerContactsModal from '@/components/MultiOwnerContactsModal'
import HoverTooltip from '@/components/HoverTooltip'

const NEIGHBORHOOD_OPTIONS = Object.entries(CHICAGO_COMMUNITY_AREAS)
  .map(([num, name]) => ({ num, name }))
  .sort((a, b) => a.name.localeCompare(b.name))

const ALL_NEIGHBORHOOD_NUMS = NEIGHBORHOOD_OPTIONS.map((o) => o.num)
const NEIGHBORHOOD_COUNT = ALL_NEIGHBORHOOD_NUMS.length

const PAGE_SIZE = 25

export type LeadRow = {
  sr_number: string
  sr_type?: string | null
  sr_short_code?: string | null
  address_normalized?: string | null
  community_area?: string | null
  ward?: string | null
  created_date?: string | null
  status?: string | null
  street_name?: string
  property_type_label?: PropertyTypeLabel | null
  /** Unlocked view */
  pin?: string | null
  owner_name?: string | null
  owner_phone?: string | null
  owner_address?: string | null
}

function deriveStreetName(addr: string | null | undefined): string {
  if (!addr) return '—'
  const parts = addr.trim().split(/\s+/).filter(Boolean)
  if (parts.length <= 1) return addr
  return parts.slice(1).join(' ')
}

function normalizeLead(r: Record<string, unknown>): LeadRow {
  const addr = String(r.address_normalized ?? '')
  return {
    sr_number: String(r.sr_number ?? ''),
    sr_type: (r.sr_type as string) ?? null,
    sr_short_code: (r.sr_short_code as string) ?? null,
    address_normalized: addr || null,
    community_area: (r.community_area as string) ?? null,
    ward: (r.ward as string) ?? null,
    created_date: (r.created_date as string) ?? null,
    status: (r.status as string) ?? null,
    street_name: (r.street_name as string) || deriveStreetName(addr),
    property_type_label: (r.property_type_label as PropertyTypeLabel | null) ?? null,
    pin: (r.pin as string) ?? null,
    owner_name: (r.owner_name as string) ?? null,
    owner_phone: (r.owner_phone as string) ?? null,
    owner_address: (r.owner_address as string) ?? null,
  }
}

function ComplaintTypeCell({
  srType,
  srShortCode,
  propertyTypeLabel,
}: {
  srType: string | null | undefined
  srShortCode: string | null | undefined
  propertyTypeLabel?: PropertyTypeLabel | null
}) {
  const cat = getCategoryForCode(srShortCode)
  const categoryLabel = cat ? LEAD_CATEGORIES[cat].label : null
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
      <div
        style={{
          whiteSpace: 'normal',
          wordBreak: 'normal',
          overflowWrap: 'break-word',
          lineHeight: 1.35,
          fontSize: '14px',
          fontWeight: 500,
          color: '#0f2744',
        }}
      >
        {srType ?? '—'}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        {categoryLabel ? (
          <span
            style={{
              fontFamily: "'DM Mono', monospace",
              fontSize: '9px',
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: '#7a7a7a',
              fontWeight: 500,
            }}
          >
            {categoryLabel}
          </span>
        ) : null}
        <PropertyTypeBadge label={propertyTypeLabel} />
      </div>
    </div>
  )
}

function freshnessClass(n: number): string {
  if (n <= 0) return 'leads-freshness-green'
  if (n <= 2) return 'leads-freshness-amber'
  return 'leads-freshness-red'
}

/** Socrata stores Chicago local time with false +00:00 — slice so Date parses as local components. */
function formatLeadDate(rawDate: string | null | undefined): { date: string; time: string } {
  if (!rawDate) return { date: '—', time: '' }
  const local = rawDate.slice(0, 19)
  const d = new Date(local)
  if (Number.isNaN(d.getTime())) return { date: '—', time: '' }

  const month = d.toLocaleDateString('en-US', { month: 'short' })
  const day = d.getDate()
  const hour = d.getHours()
  const minute = d.getMinutes().toString().padStart(2, '0')
  const ampm = hour >= 12 ? 'PM' : 'AM'
  const h12 = hour % 12 || 12

  return { date: `${month} ${day}`, time: `${h12}:${minute} ${ampm}` }
}

function parseLeadDateLocal(raw: string | null | undefined): Date | null {
  if (!raw) return null
  const d = new Date(raw.slice(0, 19))
  return Number.isNaN(d.getTime()) ? null : d
}

function slugifyAddress(addr: string | null | undefined): string {
  if (!addr?.trim()) return 'property'
  return (
    addr
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'property'
  )
}

function maskedStreetLine(addr: string | null | undefined): string {
  if (!addr?.trim()) return '—'
  const parts = addr.trim().split(/\s+/).filter(Boolean)
  if (parts.length <= 1) return `?? ${addr.trim()}`
  return `?? ${parts.slice(1).join(' ')}`
}

type UnlockStatusEntry =
  | {
      unlocked: true
      unlock: Record<string, unknown>
      contact: Record<string, unknown> | null
      taxpayer_name?: string | null
    }
  | { unlocked: false; unavailable?: boolean }

type EnrichedPhone = {
  number: string
  type: string
  dnc: boolean
  carrier: string
  rank: number
  person_name: string
}

type EnrichedEmail = {
  email: string
  rank: number
  person_name: string
}

type EnrichedPerson = {
  first_name: string
  last_name: string
  full_name: string
  age: string
  dob: string
  property_owner: boolean
  litigator: boolean
  mailing_address: { street: string; city: string; state: string; zip: string }
  mailing_matches_property: boolean
  phones: unknown[]
  emails: unknown[]
}

type LeadWithUnlock = LeadRow & {
  unlocked_at?: string | null
  owner_email?: string | null
  phone_type?: string | null
  phone_dnc?: boolean
  owner_litigator?: boolean
  taxpayer_name?: string | null
  taxpayer_address?: string | null
  taxpayer_city?: string | null
  taxpayer_state?: string | null
  taxpayer_zip?: string | null
  all_persons?: EnrichedPerson[] | null
  all_phones?: EnrichedPhone[] | null
  all_emails?: EnrichedEmail[] | null
  business_trace_recommended?: boolean
  business_trace_reason?:
    | 'commercial_class'
    | 'exempt_class'
    | 'entity_mailing_name'
    | 'multi_owner_building'
    | null
  property_type_label?: PropertyTypeLabel | null
  unlock_source?: 'tracerfy_instant' | 'multi_owner_skip' | string | null
}

function mapMyUnlockRowToLeadWithUnlock(u: Record<string, unknown>): LeadWithUnlock {
  return {
    ...normalizeLead({
      sr_number: u.sr_number,
      sr_type: u.sr_type,
      sr_short_code: u.sr_short_code,
      address_normalized: u.address_normalized,
      community_area: u.community_area,
      ward: u.ward,
      created_date: u.created_date,
      status: u.status,
      pin: u.pin,
      owner_name: u.owner_name,
      owner_phone: u.owner_phone,
      owner_address: u.owner_address,
    }),
    unlocked_at: (u.created_at as string) ?? null,
    owner_email: (u.owner_email as string) ?? null,
    phone_type: (u.phone_type as string) ?? null,
    phone_dnc: Boolean(u.phone_dnc),
    owner_litigator: Boolean(u.owner_litigator),
    taxpayer_name: (u.taxpayer_name as string) ?? null,
    taxpayer_address: (u.taxpayer_address as string) ?? null,
    taxpayer_city: (u.taxpayer_city as string) ?? null,
    taxpayer_state: (u.taxpayer_state as string) ?? null,
    taxpayer_zip: (u.taxpayer_zip as string) ?? null,
    all_persons: (u.all_persons as EnrichedPerson[] | null) ?? null,
    all_phones: (u.all_phones as EnrichedPhone[] | null) ?? null,
    all_emails: (u.all_emails as EnrichedEmail[] | null) ?? null,
    business_trace_recommended: Boolean(u.business_trace_recommended),
    business_trace_reason: (u.business_trace_reason as LeadWithUnlock['business_trace_reason']) ?? null,
    property_type_label: (u.property_type_label as PropertyTypeLabel | null) ?? null,
    unlock_source: (u.unlock_source as LeadWithUnlock['unlock_source']) ?? null,
  }
}

/** DNC + TCPA litigator badges; tooltips render via portal to avoid scroll clipping. */
function LeadsPhoneRiskBadges({ phoneDnc, ownerLitigator }: { phoneDnc: boolean; ownerLitigator: boolean }) {
  return (
    <>
      {phoneDnc ? (
        <HoverTooltip
          variant="navy"
          width={280}
          content={
            <>
              <strong style={{ display: 'block', marginBottom: '6px', fontSize: '12px' }}>DNC Registered</strong>
              This number is on the National Do Not Call registry. DNC restrictions apply to unsolicited
              telemarketing. Calls about specific documented issues at the property (e.g. this recent 311
              complaint) should qualify for exemptions. Consult your own compliance policies.
            </>
          }
        >
          <span
            style={{
              fontFamily: "'DM Mono', monospace",
              fontSize: '9px',
              fontWeight: 500,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              background: '#fde68a',
              color: '#92400e',
              padding: '2px 6px',
              borderRadius: '3px',
              marginLeft: '6px',
              verticalAlign: 'middle',
            }}
          >
            DNC
          </span>
        </HoverTooltip>
      ) : null}
      {ownerLitigator ? (
        <HoverTooltip
          variant="red"
          width={280}
          content={
            <>
              <strong style={{ display: 'block', marginBottom: '6px', fontSize: '12px', color: '#fecaca' }}>
                TCPA Litigator Warning
              </strong>
              This phone number belongs to a known TCPA litigator — an individual with a documented pattern of
              filing lawsuits against businesses for phone outreach violations. We strongly recommend you do not
              call this number.
            </>
          }
        >
          <span
            style={{
              fontFamily: "'DM Mono', monospace",
              fontSize: '9px',
              fontWeight: 600,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              background: '#fecaca',
              color: '#991b1b',
              padding: '2px 6px',
              borderRadius: '3px',
              marginLeft: '6px',
              verticalAlign: 'middle',
              border: '1px solid #ef4444',
            }}
          >
            ⚠ TCPA Litigator — Do Not Call
          </span>
        </HoverTooltip>
      ) : null}
    </>
  )
}

function ContactUnlockedBlock({
  unlock,
  contact,
  srNumber,
  onSeeMore,
}: {
  unlock: Record<string, unknown>
  contact: Record<string, unknown> | null
  srNumber: string
  onSeeMore: (sr: string) => void
}) {
  const name =
    (unlock.owner_name as string) ||
    (contact?.primary_owner_full_name as string) ||
    '—'
  const phone =
    (unlock.owner_phone as string) || (contact?.primary_phone as string) || ''
  const dnc = Boolean(unlock.phone_dnc ?? contact?.primary_phone_dnc)
  const litigator = Boolean(unlock.owner_litigator ?? contact?.primary_owner_litigator)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ fontSize: 12, fontWeight: 500, color: '#0f2744' }}>{name}</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
        {phone ? (
          <span style={{ fontSize: 11, color: '#8a94a0', fontFamily: 'var(--mono, ui-monospace, monospace)' }}>
            {phone}
          </span>
        ) : (
          <span style={{ fontSize: 11, color: '#9ca3af' }}>—</span>
        )}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onSeeMore(srNumber)
          }}
          style={{
            fontFamily: "'DM Mono', monospace",
            fontSize: 9,
            fontWeight: 600,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            color: '#0f2744',
            background: 'transparent',
            border: '1px solid #0f2744',
            padding: '2px 6px',
            borderRadius: 4,
            cursor: 'pointer',
          }}
        >
          See More Info →
        </button>
        <LeadsPhoneRiskBadges phoneDnc={dnc} ownerLitigator={litigator} />
      </div>
    </div>
  )
}

function formatUnlockedAtDisplay(iso: string | null | undefined): { dateStr: string; timeStr: string } {
  if (!iso) return { dateStr: '—', timeStr: '' }
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return { dateStr: '—', timeStr: '' }
  const dateStr = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  const timeStr = d.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })
  return { dateStr, timeStr }
}

/**
 * Sort phones non-DNC first, then by rank. Stable so equal ranks preserve original order.
 */
function sortPhonesForDisplay(phones: EnrichedPhone[] | null | undefined): EnrichedPhone[] {
  if (!phones?.length) return []
  return [...phones].sort((a, b) => {
    if (a.dnc !== b.dnc) return a.dnc ? 1 : -1
    return a.rank - b.rank
  })
}

function businessTraceReasonLabel(reason: LeadWithUnlock['business_trace_reason']): string {
  switch (reason) {
    case 'commercial_class':
      return 'a commercial property'
    case 'exempt_class':
      return 'a tax-exempt institutional property'
    case 'entity_mailing_name':
      return 'owned by a business entity'
    case 'multi_owner_building':
      return 'a condo or association building'
    default:
      return ''
  }
}

function formatPhoneDisplay(num: string): string {
  if (!num || num.length !== 10) return num
  return `(${num.slice(0, 3)}) ${num.slice(3, 6)}-${num.slice(6)}`
}

/**
 * Build the per-owner pivot row groups for the Unlocked Leads pivot table.
 *
 * Layout per unlock:
 *   Row 1 (Tax Assessor section):
 *     - Owner col:    KARMELA HOWELL (or "—")
 *     - Contact col:  mailing address
 *     - Phone col:    CTA banner if business_trace_recommended, else "Look up phone #" link
 *
 *   For each enriched person (filtered, deceased already removed in Phase 1):
 *     N rows where N = max(person.phones.length, person.emails.length)
 *     - Owner col:    person name on first row only (rowSpan), with ⚠ badge if mailing mismatched
 *     - Contact col:  one email per row, blank if more phones than emails
 *     - Phone col:    one phone per row, sorted non-DNC first then by rank
 *
 *   Last row of unlock contains the Incorrect Info button (rendered in the Location col by parent)
 */
type PivotRow =
  | {
      kind: 'tax_assessor'
      ownerName: string
      mailingAddress: string
      ctaBannerReason: LeadWithUnlock['business_trace_reason']
      ctaBannerAddress: string | null
      googleSearchUrl: string | null
      isBusinessTrace: boolean
    }
  | {
      kind: 'multi_owner_trigger'
      address: string
    }
  | {
      kind: 'person_phone'
      personIndex: number
      personRowIndex: number
      personRowCount: number
      personName: string
      mailingMismatch: boolean
      email: EnrichedEmail | null
      phone: EnrichedPhone | null
    }

function buildPivotRows(lead: LeadWithUnlock): PivotRow[] {
  const rows: PivotRow[] = []

  // Multi-owner Tracerfy skip: one spanned trigger row only — no Tax Assessor row.
  // Cached Tracerfy unlocks at the same address keep Tax Assessor + trigger (unlock_source !== multi_owner_skip).
  if (lead.unlock_source === 'multi_owner_skip' && lead.address_normalized) {
    rows.push({ kind: 'multi_owner_trigger', address: lead.address_normalized })
    return rows
  }

  // Build Tax Assessor row
  const taxpayerAddressLine = [
    lead.taxpayer_address,
    [lead.taxpayer_city, lead.taxpayer_state, lead.taxpayer_zip].filter(Boolean).join(' '),
  ]
    .filter((s) => s && String(s).trim() !== '')
    .join(', ')

  const normalizeName = (s: string | null | undefined) =>
    (s ?? '')
      .toUpperCase()
      .replace(/[.,&]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
  const ownerNorm = normalizeName(lead.owner_name)
  const taxpayerNorm = normalizeName(lead.taxpayer_name)
  const namesMatch =
    ownerNorm.length > 0 && taxpayerNorm.length > 0 && ownerNorm === taxpayerNorm

  // The "Look up phone #" link only shows when the CTA banner does NOT take its place.
  const isBusinessTrace = Boolean(lead.business_trace_recommended)
  const googleSearchUrl =
    lead.taxpayer_name && !namesMatch && !isBusinessTrace
      ? `https://www.google.com/search?q=${encodeURIComponent(`${lead.taxpayer_name} phone number`)}`
      : null

  rows.push({
    kind: 'tax_assessor',
    ownerName: lead.taxpayer_name ?? '—',
    mailingAddress: taxpayerAddressLine || '—',
    ctaBannerReason: lead.business_trace_reason,
    ctaBannerAddress: lead.address_normalized ?? null,
    googleSearchUrl,
    isBusinessTrace,
  })

  // For multi-owner buildings, replace the Tracerfy person rows entirely with
  // a single "see all contacts" trigger. The Tracerfy persons (e.g. Rosie + Tanya
  // at 5901 N Sheridan) are misleading because they're individual unit owners,
  // not the management contact the user actually wants. Surface the full taxpayer
  // list from the properties table instead via the modal.
  if (lead.business_trace_reason === 'multi_owner_building' && lead.address_normalized) {
    rows.push({
      kind: 'multi_owner_trigger',
      address: lead.address_normalized,
    })
    return rows
  }

  // Build per-person sections.
  // Use Phase 1 enriched data when available; fall back to flat fields for legacy unlocks.
  const persons = lead.all_persons ?? []
  if (persons.length === 0 && (lead.owner_name || lead.owner_phone || lead.owner_email)) {
    // Legacy unlock: synthesize a single fake person from the flat columns.
    const fakePhone: EnrichedPhone | null = lead.owner_phone
      ? {
          number: lead.owner_phone,
          type: lead.phone_type ?? '',
          dnc: Boolean(lead.phone_dnc),
          carrier: '',
          rank: 1,
          person_name: lead.owner_name ?? '',
        }
      : null
    const fakeEmail: EnrichedEmail | null = lead.owner_email
      ? { email: lead.owner_email, rank: 1, person_name: lead.owner_name ?? '' }
      : null
    rows.push({
      kind: 'person_phone',
      personIndex: 0,
      personRowIndex: 0,
      personRowCount: 1,
      personName: lead.owner_name ?? '—',
      mailingMismatch: false,
      email: fakeEmail,
      phone: fakePhone,
    })
    return rows
  }

  persons.forEach((person, personIndex) => {
    // Filter phones/emails to only this person's
    const personPhones = sortPhonesForDisplay(
      (lead.all_phones ?? []).filter((ph) => ph.person_name === person.full_name)
    )
    const personEmails = (lead.all_emails ?? [])
      .filter((em) => em.person_name === person.full_name)
      .sort((a, b) => a.rank - b.rank)

    const rowCount = Math.max(personPhones.length, personEmails.length, 1)

    for (let i = 0; i < rowCount; i++) {
      rows.push({
        kind: 'person_phone',
        personIndex,
        personRowIndex: i,
        personRowCount: rowCount,
        personName: person.full_name,
        mailingMismatch: !person.mailing_matches_property,
        email: personEmails[i] ?? null,
        phone: personPhones[i] ?? null,
      })
    }
  })

  return rows
}

function BusinessTraceCTA({
  reason,
  address,
}: {
  reason: LeadWithUnlock['business_trace_reason']
  address: string | null | undefined
}) {
  if (!reason || !address) return null
  const label = businessTraceReasonLabel(reason)
  const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(`${address} property phone number`)}`
  return (
    <div
      style={{
        padding: '8px 10px',
        background: '#fff7ed',
        border: '1px solid #fed7aa',
        borderRadius: 4,
        fontSize: 11,
        color: '#9a3412',
        fontFamily: "'Inter', sans-serif",
        lineHeight: 1.4,
      }}
    >
      This property is likely <strong>{label}</strong> — any owner contacts generated may be unit owners or past
      residents.{' '}
      <a
        href={searchUrl}
        target="_blank"
        rel="noopener noreferrer"
        style={{ color: '#9a3412', textDecoration: 'underline', fontWeight: 600 }}
      >
        Search for the building&apos;s management contact →
      </a>
    </div>
  )
}

function PropertyTypeBadge({ label }: { label: PropertyTypeLabel | null | undefined }) {
  if (!label) return null
  const style = getPropertyTypeStyle(label)
  return (
    <span
      style={{
        display: 'inline-block',
        fontFamily: "'DM Mono', monospace",
        fontSize: 9,
        fontWeight: 600,
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        background: style.bg,
        color: style.fg,
        border: `1px solid ${style.border}`,
        padding: '2px 7px',
        borderRadius: 3,
      }}
    >
      {style.text}
    </span>
  )
}

function LeadsLocationBlock({
  displayAddress,
  neighborhood,
  addressNormalized,
  showPropertyLink,
}: {
  displayAddress: string
  neighborhood: string
  addressNormalized: string | null | undefined
  showPropertyLink: boolean
}) {
  const slug = addressNormalized?.trim() ? slugifyAddress(addressNormalized) : ''
  const canLink = showPropertyLink && Boolean(slug)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        {canLink ? (
          <a
            href={`/address/${slug}`}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            style={{
              fontFamily: "'Inter', sans-serif",
              fontSize: '14px',
              fontWeight: 500,
              color: '#0f2744',
              whiteSpace: 'normal',
              wordBreak: 'normal',
              overflowWrap: 'break-word',
              lineHeight: 1.35,
              textDecoration: 'underline',
              textDecorationColor: 'rgba(15, 39, 68, 0.4)',
              textUnderlineOffset: '2px',
            }}
          >
            {displayAddress}
          </a>
        ) : (
          <span
            style={{
              fontFamily: "'Inter', sans-serif",
              fontSize: '14px',
              fontWeight: 500,
              color: '#0f2744',
              whiteSpace: 'normal',
              wordBreak: 'normal',
              overflowWrap: 'break-word',
              lineHeight: 1.35,
            }}
          >
            {displayAddress}
          </span>
        )}
        {canLink ? (
          <a
            href={`/address/${slug}`}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            title="Open property page"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#0f2744',
              opacity: 0.5,
              transition: 'opacity 0.15s ease',
              textDecoration: 'none',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.opacity = '1'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.opacity = '0.5'
            }}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="13"
              height="13"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.25"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
              <polyline points="15 3 21 3 21 9" />
              <line x1="10" y1="14" x2="21" y2="3" />
            </svg>
          </a>
        ) : null}
      </div>
      <span
        style={{
          fontFamily: "'Inter', sans-serif",
          fontSize: '12px',
          color: '#7a7a7a',
          fontWeight: 400,
        }}
      >
        {neighborhood}
      </span>
    </div>
  )
}

function NeighborhoodFilter({
  neighborhoodOptions,
  neighborhoods,
  onChange,
}: {
  neighborhoodOptions: { num: string; name: string }[]
  neighborhoods: string[]
  onChange: (next: string[]) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    if (open) document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [open])

  const allNums = neighborhoodOptions.map((o) => o.num)
  const activeFilter = neighborhoods.length > 0 && neighborhoods.length < NEIGHBORHOOD_COUNT

  const toggleAll = () => {
    if (neighborhoods.length === 0) onChange([...allNums])
    else onChange([])
  }

  const toggleOne = (n: string) => {
    if (neighborhoods.includes(n)) onChange(neighborhoods.filter((x) => x !== n))
    else onChange([...neighborhoods, n])
  }

  const label = !activeFilter
    ? 'All Neighborhoods'
    : `${neighborhoods.length} Neighborhood${neighborhoods.length === 1 ? '' : 's'}`

  return (
    <div className="leads-nb-wrap" ref={ref}>
      <button type="button" className="leads-nb-btn leads-select" onClick={() => setOpen((o) => !o)}>
        <span className="leads-nb-pin" aria-hidden>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M12 21s-8-4.5-8-11a8 8 0 1116 0c0 6.5-8 11-8 11z" />
            <circle cx="12" cy="10" r="2.5" />
          </svg>
        </span>
        {label}
        {activeFilter && <span className="leads-nb-badge">{neighborhoods.length}</span>}
      </button>
      {open && (
        <div className="leads-nb-dropdown">
          <label className="leads-nb-item leads-nb-item-all">
            <input
              type="checkbox"
              checked={!activeFilter}
              ref={(el) => {
                if (el) el.indeterminate = activeFilter
              }}
              onChange={toggleAll}
            />
            <span>All neighborhoods</span>
          </label>
          <div className="leads-nb-list">
            {neighborhoodOptions.map(({ num, name }) => (
              <label key={num} className="leads-nb-item">
                <input type="checkbox" checked={neighborhoods.includes(num)} onChange={() => toggleOne(num)} />
                <span>{name}</span>
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default function LeadsClient() {
  const { isSignedIn, isLoaded } = useUser()
  const [view, setView] = useState<'public' | 'watchlist' | 'unlocked'>('public')
  const [category, setCategory] = useState<LeadCategory | 'all'>('all')
  const [neighborhoods, setNeighborhoods] = useState<string[]>([])
  const [timeWindow, setTimeWindow] = useState<number>(14)
  const [page, setPage] = useState(1)
  const [leads, setLeads] = useState<LeadRow[]>([])
  const [total, setTotal] = useState(0)
  const [addressCounts, setAddressCounts] = useState<
    Record<string, { complaints: number; violations: number; permits: number }>
  >({})
  const [unlockCounts, setUnlockCounts] = useState<Record<string, number>>({})
  const [selectedSrNumbers, setSelectedSrNumbers] = useState<Set<string>>(new Set())
  const [watchlistSrNumbers, setWatchlistSrNumbers] = useState<Set<string>>(new Set())
  const [watchlistRows, setWatchlistRows] = useState<LeadRow[]>([])
  const [loading, setLoading] = useState(true)
  const [unlockStatus, setUnlockStatus] = useState<Record<string, UnlockStatusEntry>>({})
  const [unlockLoadingSr, setUnlockLoadingSr] = useState<string | null>(null)
  const [litigatorModalOpen, setLitigatorModalOpen] = useState(false)
  const [litigatorModalAddress, setLitigatorModalAddress] = useState('')
  const [unlockedLeadsList, setUnlockedLeadsList] = useState<LeadWithUnlock[]>([])
  const [highlightedSrNumber, setHighlightedSrNumber] = useState<string | null>(null)
  const [quota, setQuota] = useState<{
    signed_in: boolean
    remaining: number | null
    limit: number | null
    unlimited: boolean
  }>({ signed_in: false, remaining: null, limit: 5, unlimited: false })
  const [outOfCreditsOpen, setOutOfCreditsOpen] = useState(false)
  const [incorrectInfoModal, setIncorrectInfoModal] = useState<{
    open: boolean
    srNumber: string
    address: string
  }>({ open: false, srNumber: '', address: '' })
  const [contactsModal, setContactsModal] = useState<{ open: boolean; address: string }>({
    open: false,
    address: '',
  })

  const refetchQuota = useCallback(async () => {
    try {
      const res = await fetch('/api/leads/quota')
      if (!res.ok) return
      const json = (await res.json()) as {
        signed_in: boolean
        remaining: number | null
        limit: number | null
        unlimited: boolean
      }
      setQuota(json)
    } catch {
      // Silent fail — button state will fall back to signed_in: false default
    }
  }, [])

  useEffect(() => {
    if (!isLoaded) return
    void refetchQuota()
  }, [isLoaded, isSignedIn, refetchQuota])

  const navigateToUnlockedRow = useCallback((srNumber: string) => {
    setView('unlocked')
    setPage(1)
    setSelectedSrNumbers(new Set())
    setHighlightedSrNumber(srNumber)
    setTimeout(() => {
      setHighlightedSrNumber((current) => (current === srNumber ? null : current))
    }, 2500)
    setTimeout(() => {
      const el = document.getElementById(`unlocked-row-${srNumber}`)
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }, 100)
  }, [])

  const codesForCategory = useMemo(() => {
    if (category === 'all') return ALL_MAPPED_CODES
    return getCodesForCategory(category)
  }, [category])

  const codesSet = useMemo(() => new Set(codesForCategory), [codesForCategory])

  const filterLeadByFilters = useCallback(
    (row: LeadRow) => {
      if (!row.sr_short_code || !codesSet.has(row.sr_short_code)) return false
      if (
        neighborhoods.length > 0 &&
        neighborhoods.length < NEIGHBORHOOD_COUNT
      ) {
        const ca = row.community_area != null ? String(row.community_area) : ''
        if (!neighborhoods.includes(ca)) return false
      }
      if (timeWindow && row.created_date) {
        const d = parseLeadDateLocal(row.created_date)
        if (!d) return false
        const since = new Date()
        since.setDate(since.getDate() - timeWindow)
        if (d < since) return false
      }
      return true
    },
    [codesSet, neighborhoods, timeWindow]
  )

  const refetchWatchlist = useCallback(async () => {
    if (!isSignedIn) {
      setWatchlistRows([])
      setWatchlistSrNumbers(new Set())
      return
    }
    const res = await fetch('/api/leads/watchlist')
    if (!res.ok) return
    const json = (await res.json()) as { watchlist?: Record<string, unknown>[] }
    const rows = (json.watchlist ?? []).map((w) =>
      normalizeLead({
        ...w,
        created_date: (w.created_date as string) ?? null,
        address_normalized: w.address_normalized,
      })
    )
    setWatchlistRows(rows)
    setWatchlistSrNumbers(new Set(rows.map((r) => r.sr_number)))
  }, [isSignedIn])

  useEffect(() => {
    if (!isLoaded) return
    refetchWatchlist()
  }, [isLoaded, isSignedIn, refetchWatchlist])

  useEffect(() => {
    if (!isLoaded) return
    if (!isSignedIn) {
      setUnlockStatus({})
      setUnlockedLeadsList([])
      setUnlockLoadingSr(null)
    }
  }, [isLoaded, isSignedIn])

  const refetchMyUnlocks = useCallback(async () => {
    if (!isSignedIn) {
      setUnlockedLeadsList([])
      return
    }
    const res = await fetch('/api/leads/unlock/my')
    if (!res.ok) return
    const json = (await res.json()) as { unlocks?: Record<string, unknown>[] }
    const raw = json.unlocks ?? []
    setUnlockedLeadsList(raw.map(mapMyUnlockRowToLeadWithUnlock))
  }, [isSignedIn])

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return
    // Fire on mount AND on tab change so the dropdown count "(N)" is accurate
    // from the moment the page loads, not just after the user clicks the tab.
    void refetchMyUnlocks()
  }, [isLoaded, isSignedIn, view, refetchMyUnlocks])

  useEffect(() => {
    if (!isLoaded || !isSignedIn || view === 'unlocked') return
    if (leads.length === 0) return
    const visibleSr = leads.map((l) => l.sr_number).filter(Boolean)
    let cancelled = false
    void (async () => {
      const res = await fetch(`/api/leads/unlock/status?sr_numbers=${encodeURIComponent(visibleSr.join(','))}`)
      if (!res.ok || cancelled) return
      const json = (await res.json()) as { unlocks?: Record<string, UnlockStatusEntry> }
      const batch = json.unlocks ?? {}
      if (cancelled) return
      setUnlockStatus((prev) => {
        const next = { ...prev }
        for (const [sr, incoming] of Object.entries(batch)) {
          const old = prev[sr]
          if (old && !old.unlocked && old.unavailable && !incoming.unlocked) {
            next[sr] = { unlocked: false, unavailable: true }
          } else {
            next[sr] = incoming
          }
        }
        return next
      })
    })()
    return () => {
      cancelled = true
    }
  }, [isLoaded, isSignedIn, view, leads])

  const enrichCounts = useCallback(async (pageLeads: LeadRow[]) => {
    const addrs = [...new Set(pageLeads.map((l) => l.address_normalized).filter(Boolean) as string[])]
    const srs = pageLeads.map((l) => l.sr_number).filter(Boolean)
    if (addrs.length > 0) {
      const acRes = await fetch('/api/leads/address-counts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ addresses: addrs }),
      })
      const acJson = (await acRes.json()) as {
        counts?: Record<string, { complaints: number; violations: number; permits: number }>
      }
      if (acJson.counts) setAddressCounts((prev) => ({ ...prev, ...acJson.counts }))
    }
    if (srs.length > 0) {
      const ucRes = await fetch('/api/leads/unlock-counts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sr_numbers: srs }),
      })
      const ucJson = (await ucRes.json()) as { counts?: Record<string, number> }
      if (ucJson.counts) setUnlockCounts((prev) => ({ ...prev, ...ucJson.counts }))
    }
  }, [])

  useEffect(() => {
    if (view !== 'public') return

    let cancelled = false
    setLoading(true)
    ;(async () => {
      try {
        const res = await fetch('/api/leads/query', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            category,
            days: timeWindow,
            neighborhoods:
              neighborhoods.length > 0 && neighborhoods.length < NEIGHBORHOOD_COUNT
                ? neighborhoods
                : undefined,
            page,
            pageSize: PAGE_SIZE,
          }),
        })
        const json = (await res.json()) as { leads?: Record<string, unknown>[]; total?: number; error?: string }
        if (cancelled) return
        if (json.error) {
          setLeads([])
          setTotal(0)
          return
        }
        const next = (json.leads ?? []).map((r) => normalizeLead(r))
        setLeads(next)
        setTotal(json.total ?? 0)
        await enrichCounts(next)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [view, category, neighborhoods, timeWindow, page, enrichCounts])

  useEffect(() => {
    if (view !== 'watchlist') return
    if (!isSignedIn) {
      setLeads([])
      setTotal(0)
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    const filtered = watchlistRows.filter(filterLeadByFilters)
    const from = (page - 1) * PAGE_SIZE
    const slice = filtered.slice(from, from + PAGE_SIZE)
    setLeads(slice)
    setTotal(filtered.length)
    void enrichCounts(slice).finally(() => {
      if (!cancelled) setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [view, watchlistRows, isSignedIn, category, neighborhoods, timeWindow, page, filterLeadByFilters, enrichCounts])

  useEffect(() => {
    if (view === 'unlocked') {
      setSelectedSrNumbers(new Set())
    }
  }, [view])

  const onFilterChange = useCallback(() => {
    setPage(1)
    setSelectedSrNumbers(new Set())
  }, [])

  const toggleRow = (sr: string) => {
    setSelectedSrNumbers((prev) => {
      const next = new Set(prev)
      if (next.has(sr)) next.delete(sr)
      else next.add(sr)
      return next
    })
  }

  const selectAllOnPage = () => {
    if (leads.every((l) => selectedSrNumbers.has(l.sr_number))) {
      setSelectedSrNumbers(new Set())
      return
    }
    setSelectedSrNumbers(new Set(leads.map((l) => l.sr_number)))
  }

  const addToWatchlist = async () => {
    if (!isSignedIn) {
      window.alert('Sign in to save leads to your watchlist.')
      return
    }
    const picked = leads.filter((l) => selectedSrNumbers.has(l.sr_number))
    if (picked.length === 0) return
    const res = await fetch('/api/leads/watchlist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ leads: picked }),
    })
    if (!res.ok) {
      const j = await res.json().catch(() => ({}))
      window.alert((j as { error?: string }).error || 'Could not save watchlist')
      return
    }
    await refetchWatchlist()
    setSelectedSrNumbers(new Set())
  }

  const removeFromWatchlist = async () => {
    if (!isSignedIn) return
    const srs = [...selectedSrNumbers]
    if (srs.length === 0) return
    const res = await fetch('/api/leads/watchlist', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sr_numbers: srs }),
    })
    if (!res.ok) return
    await refetchWatchlist()
    setSelectedSrNumbers(new Set())
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const fromIdx = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1
  const toIdx = Math.min(page * PAGE_SIZE, total)

  const handleViewChange = (v: 'public' | 'watchlist' | 'unlocked') => {
    setView(v)
    setPage(1)
    setSelectedSrNumbers(new Set())
  }

  const handleUnlock = async (lead: LeadRow) => {
    if (!isSignedIn) {
      window.alert('Sign in to unlock contact info.')
      return
    }
    const st = unlockStatus[lead.sr_number]
    if (st?.unlocked) return
    if (st && !st.unlocked && st.unavailable) return
    if (unlockLoadingSr === lead.sr_number) return

    setUnlockLoadingSr(lead.sr_number)
    try {
      const res = await fetch('/api/leads/unlock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sr_number: lead.sr_number }),
      })
      const data = (await res.json()) as {
        success?: boolean
        reason?: string
        message?: string
        unlock?: Record<string, unknown>
        contact_cache?: Record<string, unknown> | null
      }

      if (res.status === 401 || data.reason === 'unauthorized') {
        window.alert('Sign in to unlock contact info.')
        return
      }

      if (data.reason === 'no_credits') {
        setOutOfCreditsOpen(true)
        const dataWithQuota = data as typeof data & {
          quota?: { remaining: number | null; limit: number | null; unlimited: boolean }
        }
        if (dataWithQuota.quota) {
          setQuota({ signed_in: true, ...dataWithQuota.quota })
        }
        return
      }

      if (data.reason === 'no_phone') {
        window.alert(data.message || 'No phone number available for this property. No credit used.')
        setUnlockStatus((prev) => ({
          ...prev,
          [lead.sr_number]: { unlocked: false, unavailable: true },
        }))
        return
      }

      if (data.success && data.unlock) {
        const unlock = data.unlock
        const contact = (data.contact_cache ?? null) as Record<string, unknown> | null
        const statusRes = await fetch(
          `/api/leads/unlock/status?sr_numbers=${encodeURIComponent(lead.sr_number)}`
        )
        if (statusRes.ok) {
          const statusJson = (await statusRes.json()) as { unlocks?: Record<string, UnlockStatusEntry> }
          const entry = statusJson.unlocks?.[lead.sr_number]
          if (entry?.unlocked) {
            setUnlockStatus((prev) => ({ ...prev, [lead.sr_number]: entry }))
          } else {
            setUnlockStatus((prev) => ({
              ...prev,
              [lead.sr_number]: { unlocked: true, unlock, contact, taxpayer_name: null },
            }))
          }
        } else {
          setUnlockStatus((prev) => ({
            ...prev,
            [lead.sr_number]: { unlocked: true, unlock, contact, taxpayer_name: null },
          }))
        }
        const dataWithQuota = data as typeof data & {
          quota?: { remaining: number | null; limit: number | null; unlimited: boolean }
        }
        if (dataWithQuota.quota && data.reason !== 'already_unlocked') {
          setQuota({ signed_in: true, ...dataWithQuota.quota })
        }
        await refetchMyUnlocks()
        if (data.reason !== 'already_unlocked') {
          const srs = leads.map((l) => l.sr_number).filter(Boolean)
          if (srs.length > 0) {
            const ucRes = await fetch('/api/leads/unlock-counts', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ sr_numbers: srs }),
            })
            const ucJson = (await ucRes.json()) as { counts?: Record<string, number> }
            if (ucJson.counts) setUnlockCounts((prev) => ({ ...prev, ...ucJson.counts }))
          }
        }
        // If this lead was on the watchlist, remove it now that it's unlocked.
        // Unlocked leads have their own dedicated tab and shouldn't double up on the watchlist.
        if (watchlistSrNumbers.has(lead.sr_number)) {
          const watchRes = await fetch('/api/leads/watchlist', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sr_numbers: [lead.sr_number] }),
          })
          if (watchRes.ok) await refetchWatchlist()
        }

        // LITIGATOR AUTO-CREDIT FLOW
        // When a litigator-flagged contact is unlocked, show the free-unlock modal.
        //
        // TODO (Stripe integration): Once billing is wired up, check the
        // contact_cache.primary_owner_litigator flag BEFORE firing the Stripe
        // charge. If the flag is true, skip the charge entirely and show this
        // modal. Do not insert a refund flow — the charge should never fire.
        //
        // Backend TODO in app/api/leads/unlock/route.ts:
        //   After computing cacheRow and before calling stripe.paymentIntents.create(),
        //   if cacheRow.primary_owner_litigator === true, skip billing and return
        //   { success: true, unlock, contact_cache, litigator_credit: true }
        //
        // The modal below is non-destructive tonight (all unlocks are currently
        // free anyway) and serves as a UX signal that sets expectations for when
        // billing IS live.
        const isLitigatorFlagged =
          Boolean(unlock.owner_litigator) || Boolean(contact?.primary_owner_litigator)
        if (data.reason !== 'already_unlocked' && isLitigatorFlagged) {
          setLitigatorModalAddress(lead.address_normalized?.trim() || '—')
          setLitigatorModalOpen(true)
        }
        return
      }

      if (data.reason === 'miss') {
        window.alert(data.message || 'No owner information available for this address.')
        setUnlockStatus((prev) => ({
          ...prev,
          [lead.sr_number]: { unlocked: false, unavailable: true },
        }))
        return
      }
      if (data.reason === 'deceased_owner') {
        window.alert(data.message || 'Owner of record is deceased. This lead is not available.')
        setUnlockStatus((prev) => ({
          ...prev,
          [lead.sr_number]: { unlocked: false, unavailable: true },
        }))
        return
      }
      if (data.reason === 'tracerfy_error') {
        window.alert(data.message || 'Temporarily unavailable, please try again shortly.')
        return
      }
      window.alert(data.message || 'Unlock failed. Please try again.')
    } finally {
      setUnlockLoadingSr((s) => (s === lead.sr_number ? null : s))
    }
  }

  return (
    <>
      <style>{`
        .leads-page { padding: 32px 40px; max-width: 1400px; margin: 0 auto; }
        .leads-title { font-family: Merriweather, Georgia, serif; font-size: 22px; font-weight: 600; color: #162d47; margin: 0 0 8px; }
        .leads-toolbar { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; margin-bottom: 16px; }
        .leads-toolbar-filters {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 12px;
        }
        .leads-select { font-size: 13px; padding: 8px 12px; border-radius: 6px; border: 1px solid #e5e7eb; background: #fff; color: #1a1a1a; min-height: 36px; }
        .toolbar-divider { width: 1px; height: 24px; background: #e5e7eb; }
        .leads-meta { font-size: 13px; color: #6b7280; }
        .leads-nb-wrap { position: relative; }
        .leads-nb-btn { display: inline-flex; align-items: center; gap: 8px; cursor: pointer; }
        .leads-nb-pin { display: flex; color: #162d47; opacity: 0.85; }
        .leads-nb-badge { background: #162d47; color: #fff; font-size: 11px; padding: 1px 6px; border-radius: 10px; }
        .leads-nb-dropdown { position: absolute; top: 100%; left: 0; margin-top: 6px; min-width: 280px; max-height: 320px; overflow: auto; background: #fff; border: 1px solid #e5e7eb; border-radius: 8px; box-shadow: 0 8px 24px rgba(0,0,0,.08); z-index: 50; }
        .leads-nb-list { max-height: 260px; overflow-y: auto; }
        .leads-nb-item { display: flex; align-items: center; gap: 8px; padding: 8px 12px; font-size: 12px; cursor: pointer; }
        .leads-nb-item:hover { background: #f9fafb; }
        .leads-nb-item-all { font-weight: 600; border-bottom: 1px solid #f3f4f6; }
        .watchlist-bar { display: flex; align-items: center; gap: 16px; padding: 12px 16px; background: #f0faf2; border: 1px solid #c5e6c8; border-radius: 8px; margin-bottom: 16px; font-size: 13px; }
        .watchlist-bar-btn { border: 0; padding: 8px 16px; border-radius: 6px; font-size: 13px; font-weight: 600; cursor: pointer; color: #fff; }
        .watchlist-bar-btn-add { background: #2d7a3a; }
        .watchlist-bar-btn-add:hover { background: #256d31; }
        .watchlist-bar-btn-remove { background: #b83232; }
        .watchlist-bar-btn-remove:hover { background: #a02828; }
        .watchlist-bar button:last-of-type { background: transparent; border: 0; font-size: 18px; cursor: pointer; color: #374151; line-height: 1; }
        .leads-table-wrap { background: #fff; border: 1px solid #e5e7eb; border-radius: 6px; overflow: hidden; }
        .leads-table-scroll { max-height: calc(100vh - 200px); overflow-y: auto; overflow-x: auto; width: 100%; }
        .leads-table { width: 100%; border-collapse: collapse; font-size: 13px; }
        .leads-table thead th {
          position: sticky;
          top: 0;
          z-index: 10;
          font-family: var(--font-dm-sans, 'DM Sans', system-ui, sans-serif);
          font-size: 13px;
          font-weight: 600;
          padding: 10px 10px;
          text-align: left;
          border-bottom: 1px solid rgba(255,255,255,.12);
          color: #e5e7eb;
          background: #0f2744;
        }
        .leads-table thead th.record-col {
          text-align: center;
          font-family: var(--mono, ui-monospace, monospace);
          color: rgba(255,255,255,0.55);
          background: #162d47;
        }
        .leads-table thead th.record-col-first {
          border-left: 1px solid rgba(255,255,255,0.1);
        }
        .leads-table thead th.leads-col-cb { text-align: center; vertical-align: middle; }
        .col-sub-record {
          display: block;
          font-size: 9px;
          font-weight: 400;
          color: rgba(255,255,255,0.3);
          margin-top: 1px;
        }
        .leads-col-sub { display: block; font-size: 10px; font-weight: 500; opacity: 0.85; margin-top: 2px; }
        .leads-th-center { text-align: center; }
        .leads-th-sub { display: block; font-size: 10px; font-weight: 500; opacity: 0.85; margin-top: 2px; }
        .leads-table .street { font-weight: 600; color: #162d47; display: block; }
        .leads-table .hood { font-size: 12px; color: #9ca3af; display: block; margin-top: 2px; }
        td.record-col {
          text-align: center;
          font-family: var(--mono, ui-monospace, monospace);
          font-size: 13px;
          color: #8a94a0;
          background: rgba(240, 242, 245, 0.35);
        }
        td.record-col-first {
          border-left: 1px solid #e5e2dc;
        }
        .leads-table tbody td { padding: 10px; vertical-align: top; border-bottom: 1px solid #f3f4f6; height: auto; }
        .leads-table tbody tr.leads-row-checked { background: #f7fbf8; }
        .leads-col-cb { width: 44px; text-align: center; }
        .leads-table tbody td.leads-col-cb { vertical-align: middle; }
        .leads-col-type { width: 160px; color: #162d47; }
        .leads-table.leads-table-public { table-layout: auto; width: 100%; }
        .leads-table.leads-table-public .leads-col-type {
          width: auto;
          min-width: 200px;
          max-width: 450px;
        }
        .leads-table.leads-table-public th.leads-col-location,
        .leads-table.leads-table-public td.leads-col-location {
          width: auto;
          min-width: 180px;
          max-width: 380px;
        }
        .leads-table.leads-table-public .leads-col-contact { width: auto; min-width: 140px; max-width: 260px; }
        .leads-table.leads-table-public th.record-col,
        .leads-table.leads-table-public td.record-col { min-width: 72px; }
        .leads-col-time { width: 90px; }
        .leads-time-date { display: block; color: #111827; }
        .leads-time-h { display: block; font-size: 11px; color: #9ca3af; margin-top: 2px; }
        .leads-col-contact { width: 150px; }
        .leads-col-email { width: 180px; max-width: 180px; vertical-align: top; }
        .leads-unlock-btn { width: 100%; display: inline-flex; align-items: center; justify-content: center; gap: 6px; padding: 8px 10px; background: #f0eeea; border: 1px solid #e7e2db; border-radius: 6px; font-size: 12px; color: #374151; cursor: pointer; font-weight: 500; }
        .leads-unlock-btn:hover { background: #e8e4de; }
        .leads-col-fresh { width: 90px; text-align: center; font-family: ui-monospace, monospace; font-weight: 700; }
        .leads-freshness-green { color: #15803d; }
        .leads-freshness-amber { color: #b45309; }
        .leads-freshness-red { color: #b91c1c; }
        .leads-col-stat { width: 80px; text-align: center; background: rgba(240, 242, 245, 0.35); }
        .leads-pagination { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px; padding: 14px 16px; background: #fafafa; border-top: 1px solid #e5e7eb; font-size: 13px; color: #4b5563; }
        .leads-page-btns { display: flex; gap: 6px; flex-wrap: wrap; }
        .leads-page-btns button { min-width: 36px; padding: 6px 10px; border: 1px solid #e5e7eb; background: #fff; border-radius: 6px; cursor: pointer; font-size: 12px; }
        .leads-page-btns button:disabled { opacity: 0.5; cursor: not-allowed; }
        .leads-page-btns button.leads-pg-active { background: #162d47; color: #fff; border-color: #162d47; }
        .leads-empty { padding: 48px 24px; text-align: center; color: #6b7280; font-size: 14px; }
        .leads-cb { width: 18px; height: 18px; accent-color: #162d47; cursor: pointer; }
        @media (max-width: 768px) {
          .leads-page { padding: 56px 16px 24px; }
        }
      `}</style>

      <div className="leads-page">
        <h1 className="leads-title">311 Service Leads</h1>
        <div style={{ marginBottom: '16px' }}>
          <p
            style={{
              fontFamily: "'Inter', sans-serif",
              fontSize: '14px',
              color: '#0f2744',
              lineHeight: 1.5,
              margin: '0 0 10px 0',
            }}
          >
            Recent complaints in Chicago. Unlock contact info to claim a lead.
          </p>

          <div
            style={{
              display: 'inline-flex',
              alignItems: 'flex-start',
              gap: '8px',
              background: '#e8e4db',
              border: '1px solid #d4cfc4',
              borderRadius: '6px',
              padding: '10px 14px',
              maxWidth: '720px',
            }}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#0f2744"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ flexShrink: 0, marginTop: '2px', opacity: 0.7 }}
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="16" x2="12" y2="12" />
              <line x1="12" y1="8" x2="12.01" y2="8" />
            </svg>
            <HoverTooltip
              variant="navy"
              width={360}
              content={
                <>
                  <p style={{ margin: '0 0 8px', fontSize: 12, lineHeight: 1.5 }}>
                    <strong>Residential building owners</strong> may be surprised to hear about a 311 complaint at their
                    address — it could have been called in by a neighbor or passerby. Make sure you leave a call-back number.
                  </p>
                  <p style={{ margin: 0, fontSize: 12, lineHeight: 1.5 }}>
                    <strong>Condos and commercial properties</strong> likely had a tenant call in the complaint. Leave your
                    contact and let them know how you found out — they&apos;ll be curious.
                  </p>
                </>
              }
            >
              <span
                style={{
                  fontFamily: "'Inter', sans-serif",
                  fontSize: '13px',
                  color: '#3a3a3a',
                  lineHeight: 1.5,
                  cursor: 'help',
                }}
              >
                Building owners are typically unaware of a 311 complaint at their address until a city inspector shows up
                — <strong>you will be the first person to let them know.</strong>
              </span>
            </HoverTooltip>
          </div>
        </div>

        <div className="leads-toolbar">
          <div className="leads-toolbar-filters">
            <select
              className="leads-select"
              value={view}
              onChange={(e) => handleViewChange(e.target.value as 'public' | 'watchlist' | 'unlocked')}
            >
              <option value="public">Public Leads</option>
              <option value="watchlist">Watchlist ({watchlistSrNumbers.size})</option>
              <option value="unlocked">Unlocked Leads ({unlockedLeadsList.length})</option>
            </select>

            <div className="toolbar-divider" aria-hidden />

            <select
              className="leads-select"
              value={category}
              disabled={view === 'unlocked'}
              onChange={(e) => {
                setCategory(e.target.value as LeadCategory | 'all')
                onFilterChange()
              }}
            >
              <option value="all">All Categories</option>
              <option value="plumbing_water">{LEAD_CATEGORIES.plumbing_water.label}</option>
              <option value="building_code">{LEAD_CATEGORIES.building_code.label}</option>
              <option value="property_maintenance">{LEAD_CATEGORIES.property_maintenance.label}</option>
            </select>

            <div className="toolbar-divider" aria-hidden />

            <NeighborhoodFilter
              neighborhoodOptions={NEIGHBORHOOD_OPTIONS}
              neighborhoods={neighborhoods}
              onChange={(n) => {
                setNeighborhoods(n)
                onFilterChange()
              }}
            />
          </div>

          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
            {view !== 'unlocked' && (
              <span className="leads-meta">{total.toLocaleString()} leads</span>
            )}
            {isSignedIn && (
              <button
                type="button"
                onClick={() => {
                  if (!quota.unlimited && quota.remaining !== null && quota.remaining <= 0) {
                    setOutOfCreditsOpen(true)
                  }
                }}
                style={{
                  fontFamily: "'DM Mono', monospace",
                  fontSize: 10,
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                  color: '#0f2744',
                  background: quota.unlimited
                    ? '#e8e4db'
                    : quota.remaining !== null && quota.remaining <= 0
                      ? '#fecaca'
                      : '#e8e4db',
                  border: `1px solid ${
                    quota.unlimited
                      ? '#0f2744'
                      : quota.remaining !== null && quota.remaining <= 0
                        ? '#ef4444'
                        : '#d4cfc4'
                  }`,
                  padding: '4px 10px',
                  borderRadius: 4,
                  cursor:
                    !quota.unlimited && quota.remaining !== null && quota.remaining <= 0
                      ? 'pointer'
                      : 'default',
                  fontWeight: 600,
                }}
              >
                {quota.unlimited
                  ? 'Unlimited'
                  : `${quota.remaining ?? 0} / ${quota.limit ?? 5} credits`}
              </button>
            )}
            <div className="toolbar-divider" />
            <select
              className="leads-select"
              value={timeWindow}
              disabled={view === 'unlocked'}
              onChange={(e) => {
                setTimeWindow(Number(e.target.value))
                onFilterChange()
              }}
            >
              <option value={1}>Last 24 Hours</option>
              <option value={3}>Last 3 Days</option>
              <option value={7}>Last 7 Days</option>
              <option value={14}>Last 14 Days</option>
            </select>
          </div>
        </div>

        {view !== 'unlocked' && selectedSrNumbers.size > 0 && (
          <div className="watchlist-bar">
            {view === 'watchlist' ? (
              <button type="button" className="watchlist-bar-btn watchlist-bar-btn-remove" onClick={() => void removeFromWatchlist()}>
                − Remove from Watchlist
              </button>
            ) : (
              <button type="button" className="watchlist-bar-btn watchlist-bar-btn-add" onClick={() => void addToWatchlist()}>
                + Add to Watchlist
              </button>
            )}
            <span>{selectedSrNumbers.size} leads selected</span>
            <button type="button" aria-label="Clear selection" onClick={() => setSelectedSrNumbers(new Set())}>
              ×
            </button>
          </div>
        )}

        {view === 'unlocked' ? (
          <div className="leads-table-wrap">
            <div className="leads-table-scroll">
              <table className="leads-table" style={{ tableLayout: 'fixed' as const }}>
                <colgroup>
                  <col style={{ width: '20%' }} />
                  <col style={{ width: '8%' }} />
                  <col style={{ width: '8%' }} />
                  <col style={{ width: '20%' }} />
                  <col style={{ width: '13%' }} />
                  <col style={{ width: '180px' }} />
                  <col style={{ width: 'auto' }} />
                </colgroup>
                <thead>
                  <tr>
                    <th>Complaint Type</th>
                    <th>Recorded</th>
                    <th>Date Unlocked</th>
                    <th>Location</th>
                    <th>Owner</th>
                    <th>Contact Address</th>
                    <th>Phone</th>
                  </tr>
                </thead>
                <tbody>
                  {unlockedLeadsList.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="leads-empty">
                        No unlocked leads yet. Unlock a lead from the Public Leads view to see contact info here.
                      </td>
                    </tr>
                  ) : (
                    unlockedLeadsList.flatMap((lead) => {
                      const rec = formatLeadDate(lead.created_date ?? undefined)
                      const hoodUnlocked =
                        getCommunityAreaName(lead.community_area) ||
                        (lead.community_area != null ? `Area ${lead.community_area}` : '—')
                      const unlockedDisp = formatUnlockedAtDisplay(lead.unlocked_at)
                      const isHighlighted = highlightedSrNumber === lead.sr_number
                      const pivotRows = buildPivotRows(lead)
                      const totalRowCount = pivotRows.length
                      const highlightStyle = isHighlighted ? { background: '#fef3c7' } : undefined

                      return pivotRows.map((row, rowIdx) => {
                        const isFirstRow = rowIdx === 0
                        const trKey = `${lead.sr_number}-${rowIdx}`
                        const trId = isFirstRow ? `unlocked-row-${lead.sr_number}` : undefined
                        const trStyle: CSSProperties = {
                          ...highlightStyle,
                          transition: 'background-color 0.6s ease',
                          borderTop: isFirstRow ? '2px solid #e5e7eb' : 'none',
                        }

                        return (
                          <tr key={trKey} id={trId} style={trStyle}>
                            {isFirstRow ? (
                              <td className="leads-col-type" rowSpan={totalRowCount} style={{ verticalAlign: 'top' }}>
                                <ComplaintTypeCell
                                  srType={lead.sr_type}
                                  srShortCode={lead.sr_short_code}
                                  propertyTypeLabel={lead.property_type_label}
                                />
                              </td>
                            ) : null}

                            {isFirstRow ? (
                              <td className="leads-col-time" rowSpan={totalRowCount} style={{ verticalAlign: 'top' }}>
                                <span className="leads-time-date">{rec.date}</span>
                                {rec.time ? <span className="leads-time-h">{rec.time}</span> : null}
                              </td>
                            ) : null}

                            {isFirstRow ? (
                              <td className="leads-col-time" rowSpan={totalRowCount} style={{ verticalAlign: 'top' }}>
                                <span className="leads-time-date">{unlockedDisp.dateStr}</span>
                                {unlockedDisp.timeStr ? (
                                  <span className="leads-time-h">{unlockedDisp.timeStr}</span>
                                ) : null}
                              </td>
                            ) : null}

                            {isFirstRow ? (
                              <td rowSpan={totalRowCount} style={{ verticalAlign: 'top' }}>
                                <LeadsLocationBlock
                                  displayAddress={lead.address_normalized?.trim() || '—'}
                                  neighborhood={hoodUnlocked}
                                  addressNormalized={lead.address_normalized}
                                  showPropertyLink
                                />
                                {lead.business_trace_reason !== 'multi_owner_building' ? (
                                  <div style={{ marginTop: 10 }}>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setIncorrectInfoModal({
                                          open: true,
                                          srNumber: lead.sr_number,
                                          address: lead.address_normalized?.trim() || '—',
                                        })
                                      }
                                      style={{
                                        fontFamily: "'DM Mono', monospace",
                                        fontSize: 9,
                                        letterSpacing: '0.06em',
                                        textTransform: 'uppercase',
                                        color: '#6b7280',
                                        background: 'transparent',
                                        border: '1px dashed #9ca3af',
                                        padding: '3px 8px',
                                        borderRadius: 4,
                                        cursor: 'pointer',
                                        fontWeight: 500,
                                      }}
                                      title="Request a credit-back if this contact info is incorrect. Rules: 2 per 24h, 7-day freshness, once per lead."
                                    >
                                      Incorrect info?
                                    </button>
                                  </div>
                                ) : null}
                              </td>
                            ) : null}

                            {row.kind === 'tax_assessor' ? (
                              <td style={{ verticalAlign: 'top' }}>
                                <div
                                  style={{
                                    fontFamily: "'DM Mono', monospace",
                                    fontSize: 9,
                                    letterSpacing: '0.08em',
                                    textTransform: 'uppercase',
                                    color: '#9ca3af',
                                    marginBottom: 2,
                                  }}
                                >
                                  Tax Assessor
                                </div>
                                <div style={{ fontSize: 13, fontWeight: 500, color: '#0f2744' }}>
                                  {row.ownerName}
                                </div>
                              </td>
                            ) : row.kind === 'multi_owner_trigger' ? (
                              <td colSpan={3} style={{ verticalAlign: 'top' }}>
                                <div
                                  style={{
                                    fontFamily: "'DM Mono', monospace",
                                    fontSize: 9,
                                    letterSpacing: '0.08em',
                                    textTransform: 'uppercase',
                                    color: '#9ca3af',
                                    marginBottom: 4,
                                  }}
                                >
                                  All Unit Owners on File
                                </div>
                                <div style={{ marginBottom: 8 }}>
                                  <button
                                    type="button"
                                    onClick={() => setContactsModal({ open: true, address: row.address })}
                                    style={{
                                      fontFamily: "'Inter', sans-serif",
                                      fontSize: 14,
                                      fontWeight: 600,
                                      color: '#0f2744',
                                      background: 'transparent',
                                      border: 'none',
                                      padding: 0,
                                      textDecoration: 'underline',
                                      cursor: 'pointer',
                                      textAlign: 'left',
                                    }}
                                  >
                                    See all contacts on file →
                                  </button>
                                </div>
                                {lead.unlock_source === 'multi_owner_skip' ? (
                                  <BusinessTraceCTA reason="multi_owner_building" address={row.address} />
                                ) : null}
                              </td>
                            ) : row.kind === 'person_phone' && row.personRowIndex === 0 ? (
                              <td rowSpan={row.personRowCount} style={{ verticalAlign: 'top' }}>
                                {row.personIndex === 0 ? (
                                  <div
                                    style={{
                                      fontFamily: "'DM Mono', monospace",
                                      fontSize: 9,
                                      letterSpacing: '0.08em',
                                      textTransform: 'uppercase',
                                      color: '#9ca3af',
                                      marginBottom: 2,
                                    }}
                                  >
                                    Skip-Traced
                                    {(lead.all_persons?.length ?? 0) > 1
                                      ? ` Owners (${lead.all_persons!.length})`
                                      : ' Owner'}
                                  </div>
                                ) : null}
                                <div
                                  style={{
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: 2,
                                  }}
                                >
                                  <div style={{ fontSize: 13, fontWeight: 500, color: '#0f2744' }}>
                                    {row.personName}
                                  </div>
                                  {row.mailingMismatch ? (
                                    <span
                                      style={{
                                        fontFamily: "'DM Mono', monospace",
                                        fontSize: 8,
                                        fontWeight: 600,
                                        letterSpacing: '0.08em',
                                        textTransform: 'uppercase',
                                        background: '#fde68a',
                                        color: '#92400e',
                                        padding: '2px 5px',
                                        borderRadius: 3,
                                        alignSelf: 'flex-start',
                                      }}
                                      title="This person's mailing address does not match the property — they may be a former resident."
                                    >
                                      ⚠ Mailing Elsewhere
                                    </span>
                                  ) : null}
                                </div>
                              </td>
                            ) : null}

                            {row.kind === 'tax_assessor' ? (
                              <td className="leads-col-email" style={{ verticalAlign: 'top' }}>
                                <div
                                  style={{
                                    fontFamily: "'DM Mono', monospace",
                                    fontSize: 9,
                                    letterSpacing: '0.08em',
                                    textTransform: 'uppercase',
                                    color: '#9ca3af',
                                    marginBottom: 2,
                                  }}
                                >
                                  Mailing Address
                                </div>
                                <div style={{ fontSize: 12, color: '#0f2744', lineHeight: 1.35 }}>
                                  {row.mailingAddress}
                                </div>
                              </td>
                            ) : row.kind === 'multi_owner_trigger' ? null : (
                              <td className="leads-col-email" style={{ verticalAlign: 'top' }}>
                                {row.email ? (
                                  <a
                                    href={`mailto:${row.email.email}`}
                                    style={{
                                      fontFamily: "'Inter', sans-serif",
                                      fontSize: 12,
                                      color: '#0f2744',
                                      textDecoration: 'none',
                                      wordBreak: 'break-all',
                                    }}
                                  >
                                    {row.email.email}
                                  </a>
                                ) : (
                                  <span style={{ fontSize: 12, color: '#d1d5db' }}>—</span>
                                )}
                              </td>
                            )}

                            {row.kind === 'tax_assessor' ? (
                              <td style={{ verticalAlign: 'top' }}>
                                {row.isBusinessTrace ? (
                                  <BusinessTraceCTA
                                    reason={row.ctaBannerReason}
                                    address={row.ctaBannerAddress}
                                  />
                                ) : row.googleSearchUrl ? (
                                  <a
                                    href={row.googleSearchUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    style={{
                                      fontSize: 12,
                                      color: '#0f2744',
                                      textDecoration: 'underline',
                                      fontFamily: "'Inter', sans-serif",
                                    }}
                                  >
                                    Look up phone # →
                                  </a>
                                ) : (
                                  <span style={{ fontSize: 12, color: '#9ca3af' }}>—</span>
                                )}
                              </td>
                            ) : row.kind === 'multi_owner_trigger' ? null : (
                              <td style={{ verticalAlign: 'top' }}>
                                {row.phone ? (
                                  <div
                                    style={{
                                      display: 'flex',
                                      flexWrap: 'wrap',
                                      alignItems: 'center',
                                      gap: 6,
                                      fontFamily: 'var(--mono, ui-monospace, monospace)',
                                      color: '#0f2744',
                                      fontSize: 13,
                                      opacity: row.phone.dnc ? 0.7 : 1,
                                    }}
                                  >
                                    <span>{formatPhoneDisplay(row.phone.number)}</span>
                                    {row.phone.type ? (
                                      <span
                                        style={{
                                          fontFamily: "'Inter', sans-serif",
                                          fontSize: 9,
                                          fontWeight: 600,
                                          letterSpacing: '0.06em',
                                          textTransform: 'uppercase',
                                          color: '#5c6570',
                                          background: '#f3f4f6',
                                          padding: '2px 6px',
                                          borderRadius: 4,
                                        }}
                                      >
                                        {row.phone.type}
                                      </span>
                                    ) : null}
                                    {row.phone.dnc ? (
                                      <span
                                        style={{
                                          fontFamily: "'DM Mono', monospace",
                                          fontSize: 9,
                                          fontWeight: 500,
                                          letterSpacing: '0.08em',
                                          textTransform: 'uppercase',
                                          background: '#fde68a',
                                          color: '#92400e',
                                          padding: '2px 6px',
                                          borderRadius: 3,
                                        }}
                                      >
                                        DNC
                                      </span>
                                    ) : null}
                                  </div>
                                ) : (
                                  <span style={{ fontSize: 12, color: '#d1d5db' }}>—</span>
                                )}
                              </td>
                            )}
                          </tr>
                        )
                      })
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="leads-table-wrap">
            <div className="leads-table-scroll">
              <table className="leads-table leads-table-public">
                <colgroup>
                  <col style={{ width: 44 }} />
                </colgroup>
                <thead>
                  <tr>
                    <th className="leads-col-cb" aria-label="Select all">
                      <input
                        type="checkbox"
                        className="leads-cb"
                        checked={leads.length > 0 && leads.every((l) => selectedSrNumbers.has(l.sr_number))}
                        ref={(el) => {
                          if (el)
                            el.indeterminate =
                              selectedSrNumbers.size > 0 && !leads.every((l) => selectedSrNumbers.has(l.sr_number))
                        }}
                        onChange={selectAllOnPage}
                      />
                    </th>
                    <th>Complaint Type</th>
                    <th>Recorded</th>
                    <th className="leads-col-location">Location</th>
                    <th>
                      Contact
                      <span className="leads-col-sub">Name, Address &amp; Phone #</span>
                    </th>
                    <th className="leads-th-center">
                      Freshness
                      <span className="leads-col-sub"># of Unlocks</span>
                    </th>
                    <th className="record-col record-col-first">
                      <HoverTooltip
                        variant="navy"
                        width={240}
                        content="Public records at the same address over the last 365 days"
                      >
                        <div style={{ textAlign: 'center' }}>
                          <div>311</div>
                          <div style={{ fontSize: '10px', fontWeight: 400, opacity: 0.7 }}>complaints</div>
                        </div>
                      </HoverTooltip>
                    </th>
                    <th className="record-col">
                      <HoverTooltip
                        variant="navy"
                        width={240}
                        content="Public records at the same address over the last 365 days"
                      >
                        <div style={{ textAlign: 'center' }}>
                          <div>Violations</div>
                          <div style={{ fontSize: '10px', fontWeight: 400, opacity: 0.7 }}>issued</div>
                        </div>
                      </HoverTooltip>
                    </th>
                    <th className="record-col">
                      <HoverTooltip
                        variant="navy"
                        width={240}
                        content="Public records at the same address over the last 365 days"
                      >
                        <div style={{ textAlign: 'center' }}>
                          <div>Permits</div>
                          <div style={{ fontSize: '10px', fontWeight: 400, opacity: 0.7 }}>filed</div>
                        </div>
                      </HoverTooltip>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={9} className="leads-empty">
                        Loading…
                      </td>
                    </tr>
                  ) : leads.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="leads-empty">
                        No leads match your filters.
                      </td>
                    </tr>
                  ) : (
                    leads.map((row) => {
                      const addr = row.address_normalized ?? ''
                      const ac = addr ? addressCounts[addr] : undefined
                      const unc = unlockCounts[row.sr_number] ?? 0
                      const rec = formatLeadDate(row.created_date ?? undefined)
                      const hood =
                        getCommunityAreaName(row.community_area) ||
                        (row.community_area != null ? `Area ${row.community_area}` : '—')
                      const checked = selectedSrNumbers.has(row.sr_number)
                      const uSt = unlockStatus[row.sr_number]
                      const isUnlocked = uSt?.unlocked === true
                      const isUnavailable = Boolean(uSt && !uSt.unlocked && uSt.unavailable)
                      const locLine = isUnlocked
                        ? row.address_normalized?.trim() || '—'
                        : maskedStreetLine(row.address_normalized)
                      return (
                        <tr key={row.sr_number} className={checked ? 'leads-row-checked' : undefined}>
                          <td className="leads-col-cb">
                            <input
                              type="checkbox"
                              className="leads-cb"
                              checked={checked}
                              onChange={() => toggleRow(row.sr_number)}
                            />
                          </td>
                          <td className="leads-col-type">
                            <ComplaintTypeCell
                              srType={row.sr_type}
                              srShortCode={row.sr_short_code}
                              propertyTypeLabel={row.property_type_label}
                            />
                          </td>
                          <td className="leads-col-time">
                            <span className="leads-time-date">{rec.date}</span>
                            {rec.time ? <span className="leads-time-h">{rec.time}</span> : null}
                          </td>
                          <td className="leads-col-location">
                            <LeadsLocationBlock
                              displayAddress={locLine}
                              neighborhood={hood}
                              addressNormalized={row.address_normalized}
                              showPropertyLink={isUnlocked}
                            />
                          </td>
                          <td className="leads-col-contact">
                            {isUnlocked && uSt.unlocked ? (
                              <ContactUnlockedBlock
                                unlock={uSt.unlock}
                                contact={uSt.contact}
                                srNumber={row.sr_number}
                                onSeeMore={navigateToUnlockedRow}
                              />
                            ) : isUnavailable ? (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                <span style={{ fontSize: 12, color: '#9ca3af', fontWeight: 500 }}>No data</span>
                                <button
                                  type="button"
                                  className="leads-unlock-btn"
                                  disabled
                                  style={{ opacity: 0.55, cursor: 'not-allowed' }}
                                >
                                  Unlock
                                </button>
                              </div>
                            ) : !isSignedIn ? (
                              <SignInButton mode="modal">
                                <button type="button" className="leads-unlock-btn">
                                  <svg
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="1.5"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    style={{ width: 13, height: 13, verticalAlign: '-2px', marginRight: 5 }}
                                  >
                                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                                    <path d="M7 11V7a5 5 0 0110 0v4" />
                                  </svg>
                                  Sign in to unlock
                                </button>
                              </SignInButton>
                            ) : !quota.unlimited && quota.remaining !== null && quota.remaining <= 0 ? (
                              <button
                                type="button"
                                className="leads-unlock-btn"
                                onClick={() => setOutOfCreditsOpen(true)}
                                style={{ opacity: 0.7 }}
                              >
                                No credits left
                              </button>
                            ) : (
                              <button
                                type="button"
                                className="leads-unlock-btn"
                                disabled={unlockLoadingSr === row.sr_number}
                                onClick={() => void handleUnlock(row)}
                              >
                                <svg
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="1.5"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  style={{ width: 13, height: 13, verticalAlign: '-2px', marginRight: 5 }}
                                >
                                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                                  <path d="M7 11V7a5 5 0 0110 0v4" />
                                </svg>
                                {unlockLoadingSr === row.sr_number
                                  ? 'Unlocking…'
                                  : quota.unlimited
                                    ? 'Unlock'
                                    : `Unlock (${quota.remaining} left)`}
                              </button>
                            )}
                          </td>
                          <td className={`leads-col-fresh ${freshnessClass(unc)}`}>{unc}</td>
                          <td className="record-col record-col-first">{ac?.complaints ?? '—'}</td>
                          <td className="record-col">{ac?.violations ?? '—'}</td>
                          <td className="record-col">{ac?.permits ?? '—'}</td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>

            {!loading && leads.length > 0 && (
              <div className="leads-pagination">
                <span>
                  Showing {fromIdx.toLocaleString()}–{toIdx.toLocaleString()} of {total.toLocaleString()}
                </span>
                <div className="leads-page-btns">
                  <button type="button" disabled={page <= 1} onClick={() => setPage(1)}>
                    First
                  </button>
                  <button type="button" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                    Prev
                  </button>
                  {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                    let num = i + 1
                    if (totalPages > 5 && page > 3) num = page - 2 + i
                    if (num > totalPages) return null
                    if (num < 1) return null
                    return (
                      <button
                        key={num}
                        type="button"
                        className={num === page ? 'leads-pg-active' : ''}
                        onClick={() => setPage(num)}
                      >
                        {num}
                      </button>
                    )
                  })}
                  <button type="button" disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>
                    Next
                  </button>
                  <button type="button" disabled={page >= totalPages} onClick={() => setPage(totalPages)}>
                    Last
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <LitigatorCreditModal
        isOpen={litigatorModalOpen}
        onClose={() => setLitigatorModalOpen(false)}
        address={litigatorModalAddress}
      />
      <OutOfCreditsModal isOpen={outOfCreditsOpen} onClose={() => setOutOfCreditsOpen(false)} />
      <IncorrectInfoModal
        isOpen={incorrectInfoModal.open}
        onClose={() => setIncorrectInfoModal({ open: false, srNumber: '', address: '' })}
        srNumber={incorrectInfoModal.srNumber}
        address={incorrectInfoModal.address}
        onSuccess={(newQuota: { remaining: number | null; unlimited: boolean }) => {
          setQuota((prev) => ({
            ...prev,
            remaining: newQuota.remaining,
            unlimited: newQuota.unlimited,
          }))
          void refetchMyUnlocks()
        }}
      />
      <MultiOwnerContactsModal
        isOpen={contactsModal.open}
        onClose={() => setContactsModal({ open: false, address: '' })}
        address={contactsModal.address}
      />
    </>
  )
}
