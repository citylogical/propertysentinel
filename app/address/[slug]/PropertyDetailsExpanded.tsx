'use client'

import { useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import { getClassDescription } from '@/lib/class-codes'
import type { PropertyCharsCondoRow, PropertyCharsResidentialRow } from '@/lib/supabase-search'
import { formatAddressForDisplay } from '@/lib/formatAddress'
import {
  pickPinCharacteristicsSource,
  renderPickedPinCharacteristics,
  residentialPropertyTypeFromChars,
} from './PropertyDetailsCharBlocks'

export type SiblingPin = {
  pin: string
  address: string
  assessedClass: string | null
  assessedValue: number | null
  taxYear: number | null
  valueType: string | null
}

type Props = {
  siblings: SiblingPin[]
  serverSharedChars?: SharedNumeric | null
}

type SharedNumeric = {
  year_built?: unknown
  building_sqft?: unknown
  land_sqft?: unknown
  property_type?: string | null
}

function numericGtZero(val: unknown): boolean {
  if (val === null || val === undefined) return false
  const n = Number(val)
  return Number.isFinite(n) && n > 0
}

/** 25% level for Cook County class major 4 or 5; 10% otherwise (incl. EX). */
function getAssessmentLevelForImplied(assessedClass: string | null): number {
  if (!assessedClass) return 0.1
  const classStr = String(assessedClass).trim()
  if (classStr.startsWith('4') || classStr.startsWith('5')) return 0.25
  return 0.1
}

function impliedMarketValue(assessedValue: number | null, assessedClass: string | null): number | null {
  if (assessedValue == null || !Number.isFinite(assessedValue) || assessedValue === 0) return null
  const level = getAssessmentLevelForImplied(assessedClass)
  if (!level) return null
  return Math.round(assessedValue / level)
}

const MULTIPARCEL_SUMMARY_STYLE: CSSProperties = {
  fontFamily: 'var(--mono)',
  fontSize: '8px',
  fontWeight: 600,
  letterSpacing: '0.14em',
  textTransform: 'uppercase',
  color: '#2d6a4f',
  padding: '8px 14px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  borderBottom: '0.5px solid rgba(45,106,79,0.15)',
  cursor: 'pointer',
  listStyle: 'none',
  userSelect: 'none',
}

async function fetchCharsTriplet(pin: string) {
  const [resR, condoR, comR] = await Promise.all([
    fetch(`/api/property-chars-residential?pin=${encodeURIComponent(pin)}`).then((r) => r.json()),
    fetch(`/api/property-chars-condo?pin=${encodeURIComponent(pin)}`).then((r) => r.json()),
    fetch(`/api/property-chars-commercial?pin=${encodeURIComponent(pin)}`).then((r) => r.json()),
  ])
  return {
    res: (resR as { chars: PropertyCharsResidentialRow | null }).chars ?? null,
    condo: (condoR as { chars: PropertyCharsCondoRow | null }).chars ?? null,
    com: (comR as { row: Record<string, unknown> | null }).row ?? null,
  }
}

/** residential → commercial → condo (for aggregation per user spec). */
function pickAggregateRow(
  res: PropertyCharsResidentialRow | null,
  com: Record<string, unknown> | null,
  condo: PropertyCharsCondoRow | null
): { row: Record<string, unknown> | PropertyCharsResidentialRow | PropertyCharsCondoRow; kind: 'res' | 'com' | 'condo' } | null {
  if (res) return { row: res, kind: 'res' }
  if (com) return { row: com, kind: 'com' }
  if (condo) return { row: condo, kind: 'condo' }
  return null
}

function propertyTypeFromAggRow(
  row: Record<string, unknown> | PropertyCharsResidentialRow | PropertyCharsCondoRow,
  kind: 'res' | 'com' | 'condo'
): string | null {
  if (kind === 'com') {
    const u = row.property_type_use
    if (u != null && String(u).trim() !== '') return String(u).trim()
    return null
  }
  return residentialPropertyTypeFromChars(row as PropertyCharsResidentialRow)
}

type Aggregated = {
  earliestYear: number | null
  totalBsq: number
  totalLand: number
  dominantPropertyType: string | null
}

function computeAggregation(triplets: Awaited<ReturnType<typeof fetchCharsTriplet>>[]): Aggregated {
  const years: number[] = []
  let totalBsq = 0
  let totalLand = 0
  const typeSet = new Set<string>()

  for (const t of triplets) {
    const picked = pickAggregateRow(t.res, t.com, t.condo)
    if (!picked) continue
    const { row, kind } = picked
    const yb = row.year_built
    if (yb != null && String(yb).trim() !== '') {
      const yn = Number(yb)
      if (Number.isFinite(yn) && yn > 1800 && yn <= 2200) years.push(yn)
    }
    const bsq = row.building_sqft
    if (bsq != null && Number(bsq) > 0) totalBsq += Number(bsq)
    const lsq = row.land_sqft
    if (lsq != null && Number(lsq) > 0) totalLand += Number(lsq)
    const pt = propertyTypeFromAggRow(row, kind)
    if (pt) typeSet.add(pt)
  }

  years.sort((a, b) => a - b)
  const dominantPropertyType = typeSet.size === 1 ? [...typeSet][0]! : null

  return {
    earliestYear: years.length > 0 ? years[0]! : null,
    totalBsq,
    totalLand,
    dominantPropertyType,
  }
}

function AggregatedBuildingSummary({ agg, showMixedUse }: { agg: Aggregated; showMixedUse: boolean }) {
  const rows: ReactNode[] = []
  if (agg.earliestYear != null) {
    rows.push(
      <div key="yb" className="detail-row">
        <span className="detail-key">Year Built</span>
        <span className="detail-val">{agg.earliestYear}</span>
      </div>
    )
  }
  if (agg.totalBsq > 0) {
    rows.push(
      <div key="bsq" className="detail-row">
        <span className="detail-key">Building Sqft</span>
        <span className="detail-val">{agg.totalBsq.toLocaleString('en-US')}</span>
      </div>
    )
  }
  if (agg.totalLand > 0) {
    rows.push(
      <div key="lsq" className="detail-row">
        <span className="detail-key">Land Sqft</span>
        <span className="detail-val">{agg.totalLand.toLocaleString('en-US')}</span>
      </div>
    )
  }
  if (agg.dominantPropertyType != null && agg.dominantPropertyType.trim() !== '') {
    rows.push(
      <div key="pt" className="detail-row">
        <span className="detail-key">Property Type</span>
        <span className="detail-val">{agg.dominantPropertyType}</span>
      </div>
    )
  }
  if (showMixedUse) {
    rows.push(
      <div key="use" className="detail-row">
        <span className="detail-key">Use</span>
        <span className="detail-val">Mixed-Use</span>
      </div>
    )
  }
  return (
    <>
      {rows}
      {rows.length > 0 && <div key="rule" style={{ borderBottom: '1px solid var(--border)' }} aria-hidden />}
    </>
  )
}

/** One PIN in expanded building view: full assessor characteristics + Implied + Class + PIN. */
function SinglePinExpandedBody({ s }: { s: SiblingPin }) {
  const [loading, setLoading] = useState(true)
  const [picked, setPicked] = useState<ReturnType<typeof pickPinCharacteristicsSource>>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setPicked(null)
    ;(async () => {
      try {
        const t = await fetchCharsTriplet(s.pin)
        if (cancelled) return
        setPicked(pickPinCharacteristicsSource(t.res, t.com, t.condo))
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [s.pin])

  const c = s.assessedClass
  const classLine =
    c != null && String(c).trim() !== ''
      ? `${c}${getClassDescription(c) ? ` — ${getClassDescription(c)}` : ''}`
      : 'N/A'

  const implied = impliedMarketValue(s.assessedValue, s.assessedClass)
  const showImplied = implied != null && s.taxYear != null

  return (
    <div className="detail-list property-details-expanded-condo-shared">
      {loading && (
        <div className="detail-row">
          <span className="detail-key">Characteristics</span>
          <span className="detail-val">Loading…</span>
        </div>
      )}
      {!loading && picked != null && renderPickedPinCharacteristics(picked)}
      {!loading && picked == null && (
        <div className="detail-row">
          <span className="detail-key">Characteristics</span>
          <span className="detail-val na">No assessor characteristics on file</span>
        </div>
      )}
      {showImplied && (
        <div className="detail-row">
          <span className="detail-key">Implied Value ({s.taxYear})</span>
          <span className="detail-val">${implied.toLocaleString('en-US')}</span>
        </div>
      )}
      <div className="detail-row">
        <span className="detail-key">Class</span>
        <span className="detail-val">{classLine}</span>
      </div>
      <div className="detail-row" style={{ borderBottom: '1px solid var(--border)' }}>
        <span className="detail-key">PIN</span>
        <span className="detail-val">{s.pin}</span>
      </div>
    </div>
  )
}

function MultiparcelPinRow({ s, index }: { s: SiblingPin; index: number }) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [picked, setPicked] = useState<ReturnType<typeof pickPinCharacteristicsSource>>(null)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    setLoading(true)
    setPicked(null)
    ;(async () => {
      try {
        const t = await fetchCharsTriplet(s.pin)
        if (cancelled) return
        setPicked(pickPinCharacteristicsSource(t.res, t.com, t.condo))
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [open, s.pin])

  const c = s.assessedClass
  const classLine =
    c != null && String(c).trim() !== ''
      ? `${c}${getClassDescription(c) ? ` — ${getClassDescription(c)}` : ''}`
      : 'N/A'

  const implied = impliedMarketValue(s.assessedValue, s.assessedClass)
  const showImplied = implied != null && s.taxYear != null

  const headerBg = index % 2 === 0 ? '#ffffff' : '#f7f9fb'

  return (
    <div className="property-details-expanded-section" style={{ borderBottom: 'none' }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'flex-start',
          gap: 0,
          padding: '10px 0',
          margin: 0,
          border: 'none',
          borderLeft: open ? '3px solid #2d6a4f' : '3px solid transparent',
          borderBottom: open ? 'none' : '0.5px solid var(--border)',
          background: headerBg,
          cursor: 'pointer',
          textAlign: 'left',
        }}
      >
        <span
          style={{
            paddingLeft: 10,
            paddingRight: 6,
            flexShrink: 0,
            fontSize: 9,
            lineHeight: 1.2,
            color: 'var(--text-dim)',
          }}
          aria-hidden
        >
          {open ? '▼' : '▶'}
        </span>
        <span style={{ flex: 1, paddingRight: 14, minWidth: 0 }}>
          <span
            style={{
              display: 'block',
              fontWeight: 600,
              fontSize: 12,
              lineHeight: 1.25,
              color: 'var(--text)',
            }}
          >
            {formatAddressForDisplay(s.address) || '—'}
          </span>
          <span
            style={{
              display: 'block',
              fontFamily: 'var(--mono)',
              fontSize: 10,
              color: 'var(--text-dim)',
              marginTop: 2,
            }}
          >
            {s.pin}
          </span>
        </span>
      </button>

      {open && (
        <div
          className="detail-list"
          style={{
            background: 'var(--color-background-primary)',
            borderLeft: '3px solid #2d6a4f',
            borderBottom: '1px solid var(--border)',
            paddingBottom: 4,
          }}
        >
          {loading && (
            <div className="detail-row">
              <span className="detail-key">Characteristics</span>
              <span className="detail-val">Loading…</span>
            </div>
          )}
          {!loading && picked != null && renderPickedPinCharacteristics(picked)}
          {!loading && picked == null && (
            <div className="detail-row">
              <span className="detail-key">Characteristics</span>
              <span className="detail-val na">No assessor characteristics on file</span>
            </div>
          )}
          {showImplied && (
            <div className="detail-row">
              <span className="detail-key">Implied Value ({s.taxYear})</span>
              <span className="detail-val">${implied.toLocaleString('en-US')}</span>
            </div>
          )}
          <div className="detail-row">
            <span className="detail-key">Class</span>
            <span className="detail-val">{classLine}</span>
          </div>
          <div className="detail-row">
            <span className="detail-key">PIN</span>
            <span className="detail-val">{s.pin}</span>
          </div>
        </div>
      )}
    </div>
  )
}

export default function PropertyDetailsExpanded({ siblings, serverSharedChars: _serverSharedChars }: Props) {
  const isMulti = siblings.length > 1

  const [aggregated, setAggregated] = useState<Aggregated | null>(null)
  const [aggregateLoading, setAggregateLoading] = useState(isMulti)

  const siblingPinsKey = siblings.map((s) => s.pin).join('|')

  useEffect(() => {
    if (!isMulti) return
    let cancelled = false
    setAggregateLoading(true)
    setAggregated(null)
    ;(async () => {
      try {
        const triplets = await Promise.all(siblings.map((s) => fetchCharsTriplet(s.pin)))
        if (cancelled) return
        setAggregated(computeAggregation(triplets))
      } finally {
        if (!cancelled) setAggregateLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [siblingPinsKey, isMulti, siblings])

  const uniqueAssessedClasses = new Set(
    siblings.map((s) => (s.assessedClass != null && String(s.assessedClass).trim() !== '' ? String(s.assessedClass).trim() : null)).filter(Boolean) as string[]
  )
  const showMixedUse = uniqueAssessedClasses.size > 1

  const [multiparcelsOpen, setMultiparcelsOpen] = useState(false)

  return (
    <>
      <div className="profile-card-header">
        <span style={{ flex: 1 }}>Property Details</span>
      </div>

      <div className="property-details-expanded">
        {isMulti && (
          <div className="detail-list property-details-expanded-condo-shared">
            {aggregateLoading && (
              <div className="detail-row">
                <span className="detail-key">Building summary</span>
                <span className="detail-val">Loading…</span>
              </div>
            )}
            {!aggregateLoading && aggregated != null && (
              <AggregatedBuildingSummary agg={aggregated} showMixedUse={showMixedUse} />
            )}
          </div>
        )}

        {!isMulti && siblings[0] != null && <SinglePinExpandedBody s={siblings[0]} />}

        {isMulti && (
          <details
            className="property-details-multiparcels"
            onToggle={(e) => setMultiparcelsOpen((e.currentTarget as HTMLDetailsElement).open)}
          >
            <summary style={MULTIPARCEL_SUMMARY_STYLE}>
              <span>{`Multiple Parcels (${siblings.length} PINs)`}</span>
              <span style={{ fontSize: 14 }}>{multiparcelsOpen ? '\u2212' : '+'}</span>
            </summary>
            <div style={{ borderTop: '1px solid var(--border)' }}>
              {siblings.map((s, index) => (
                <MultiparcelPinRow key={s.pin} s={s} index={index} />
              ))}
            </div>
          </details>
        )}
      </div>
    </>
  )
}
