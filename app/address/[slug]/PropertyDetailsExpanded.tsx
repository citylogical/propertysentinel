'use client'

import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'
import { getClassDescription } from '@/lib/class-codes'
import type { PropertyCharsCondoRow, PropertyCharsResidentialRow } from '@/lib/supabase-search'

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

const currencyZero = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
  minimumFractionDigits: 0,
})

function getAssessmentLevelForImplied(assessedClass: string | null): number {
  if (!assessedClass) return 0.1
  const major = parseInt(assessedClass.toString()[0], 10)
  if (Number.isNaN(major)) return 0.1
  if (major === 4 || major === 5) return 0.25
  return 0.1
}

function formatTitleCaseAddress(address: string): string {
  if (!address) return '—'
  return address
    .split(' ')
    .map((w, i) => (i === 0 ? w : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()))
    .join(' ')
}

/** Cook County class 299 (condo). */
function isCondo299Class(assessedClass: string | null): boolean {
  if (!assessedClass) return false
  const t = String(assessedClass).trim()
  if (!t.startsWith('2')) return false
  const digits = t.replace(/\D/g, '').replace(/^0+/, '') || '0'
  return digits === '299' || digits.startsWith('299')
}

function numericGtZero(val: unknown): boolean {
  if (val === null || val === undefined) return false
  const n = Number(val)
  return Number.isFinite(n) && n > 0
}

type SharedNumeric = {
  year_built?: unknown
  building_sqft?: unknown
  land_sqft?: unknown
  property_type?: string | null
}

function extractSharedFromCondoOrResidential(row: PropertyCharsCondoRow | PropertyCharsResidentialRow): SharedNumeric {
  const res = row as PropertyCharsResidentialRow
  const tor = res.type_of_residence ?? null
  const svmf = res.single_v_multi_family ?? null
  let propertyType: string | null = null
  if (tor && svmf) propertyType = `${tor}, ${svmf}`
  else if (tor) propertyType = String(tor)
  else if (svmf) propertyType = String(svmf)
  return {
    year_built: row.year_built,
    building_sqft: row.building_sqft,
    land_sqft: row.land_sqft,
    property_type: propertyType,
  }
}

function extractSharedFromCommercialRow(row: Record<string, unknown>): SharedNumeric {
  return {
    year_built: row.year_built,
    building_sqft: row.building_sqft,
    land_sqft: row.land_sqft,
    property_type: row.property_type_use != null ? String(row.property_type_use) : null,
  }
}

const SECTION_LABEL_STYLE: CSSProperties = {
  padding: '7px 14px 3px 29px',
  fontFamily: 'var(--mono)',
  fontSize: '8px',
  letterSpacing: '0.14em',
  textTransform: 'uppercase',
  color: '#2d6a4f',
  borderBottom: '0.5px solid rgba(45,106,79,0.15)',
  display: 'block',
}

type BodyRowDef = { key: string; label: string; value: string }

function ExpandedDataRows({
  rows,
  globalOffset,
  isTerminal,
}: {
  rows: BodyRowDef[]
  globalOffset: number
  /** If true, the last row in this block is the last row before the next PIN (secondary border). */
  isTerminal: boolean
}) {
  if (rows.length === 0) return null
  const lastIdx = rows.length - 1
  return (
    <>
      {rows.map((r, i) => {
        const isLast = i === lastIdx
        return (
          <div
            key={r.key}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'baseline',
              gap: 12,
              padding: '6px 14px 6px 29px',
              borderBottom:
                isLast && isTerminal
                  ? '0.5px solid var(--color-border-secondary)'
                  : '0.5px solid var(--border)',
              background: (globalOffset + i) % 2 === 0 ? '#ffffff' : '#f7f9fb',
            }}
          >
            <span style={{ fontSize: 11, color: 'var(--text-dim)', flexShrink: 0 }}>{r.label}</span>
            <span
              style={{
                fontFamily: 'var(--mono)',
                fontSize: 10,
                color: 'var(--text)',
                textAlign: 'right',
                wordBreak: 'break-word',
              }}
            >
              {r.value}
            </span>
          </div>
        )
      })}
    </>
  )
}

export default function PropertyDetailsExpanded({ siblings, serverSharedChars }: Props) {
  const [openPins, setOpenPins] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(siblings.map((s) => [s.pin, false]))
  )

  const siblingPinsKey = siblings.map((s) => s.pin).join('|')

  const [sharedChars, setSharedChars] = useState<SharedNumeric | null>(null)
  const [sharedReady, setSharedReady] = useState(false)

  const [condoByPin, setCondoByPin] = useState<Record<string, PropertyCharsCondoRow | null | 'loading'>>({})
  const condoFetchedRef = useRef<Set<string>>(new Set())

  const anyExpanded = siblings.some((s) => openPins[s.pin])

  useEffect(() => {
    // If server already provided shared chars, use them directly — no client fetch needed
    if (serverSharedChars !== undefined) {
      setSharedChars(serverSharedChars)
      setSharedReady(true)
      return
    }

    const pinList = siblingPinsKey.split('|').filter(Boolean)
    if (pinList.length === 0) {
      setSharedChars(null)
      setSharedReady(true)
      return
    }

    let cancelled = false
    setSharedReady(false)
    setSharedChars(null)

    ;(async () => {
      const tryPinWaterfall = async (pin: string): Promise<SharedNumeric | null> => {
        const condoRes = await fetch(`/api/property-chars-condo?pin=${encodeURIComponent(pin)}`)
        const condoJson = (await condoRes.json()) as { chars: PropertyCharsCondoRow | null }
        if (cancelled) return null
        if (condoJson.chars) return extractSharedFromCondoOrResidential(condoJson.chars)

        const resRes = await fetch(`/api/property-chars-residential?pin=${encodeURIComponent(pin)}`)
        const resJson = (await resRes.json()) as { chars: PropertyCharsResidentialRow | null }
        if (cancelled) return null
        if (resJson.chars) return extractSharedFromCondoOrResidential(resJson.chars)

        const commRes = await fetch(`/api/property-chars-commercial?pin=${encodeURIComponent(pin)}`)
        const commJson = (await commRes.json()) as { row: Record<string, unknown> | null }
        if (cancelled) return null
        if (commJson.row) return extractSharedFromCommercialRow(commJson.row)

        return null
      }

      try {
        for (const pin of pinList) {
          const picked = await tryPinWaterfall(pin)
          if (cancelled) return
          if (picked) {
            setSharedChars(picked)
            return
          }
        }
        if (!cancelled) setSharedChars(null)
      } finally {
        if (!cancelled) setSharedReady(true)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [siblingPinsKey, serverSharedChars])

  const loadLazyCondoForPin = useCallback((pinKey: string) => {
    if (condoFetchedRef.current.has(pinKey)) return
    condoFetchedRef.current.add(pinKey)
    setCondoByPin((p) => ({ ...p, [pinKey]: 'loading' }))
    void fetch(`/api/property-chars-condo?pin=${encodeURIComponent(pinKey)}`)
      .then((r) => r.json())
      .then((j: { chars: PropertyCharsCondoRow | null }) => {
        setCondoByPin((p) => ({ ...p, [pinKey]: j.chars ?? null }))
      })
      .catch(() => {
        setCondoByPin((p) => ({ ...p, [pinKey]: null }))
      })
  }, [])

  const togglePin = (pinKey: string, assessedClass: string | null) => {
    setOpenPins((prev) => {
      const nextOpen = !prev[pinKey]
      if (nextOpen && isCondo299Class(assessedClass)) {
        loadLazyCondoForPin(pinKey)
      }
      return { ...prev, [pinKey]: nextOpen }
    })
  }

  const expandAll = () => {
    setOpenPins(Object.fromEntries(siblings.map((s) => [s.pin, true])))
    siblings.forEach((s) => {
      if (isCondo299Class(s.assessedClass)) {
        loadLazyCondoForPin(s.pin)
      }
    })
  }

  const collapseAll = () => {
    setOpenPins(Object.fromEntries(siblings.map((s) => [s.pin, false])))
  }

  const firstSiblingWithClass = siblings.find(
    (s) => s.assessedClass != null && String(s.assessedClass).trim() !== ''
  )
  const sharedClassLine =
    firstSiblingWithClass != null
      ? (() => {
          const c = firstSiblingWithClass.assessedClass
          const desc = getClassDescription(c)
          return desc && c != null ? `${c} — ${desc}` : String(c)
        })()
      : null
  const showSharedClass = sharedClassLine != null && sharedClassLine.trim() !== ''

  const showSharedYear =
    sharedChars != null &&
    sharedChars.year_built != null &&
    String(sharedChars.year_built).trim() !== '' &&
    numericGtZero(sharedChars.year_built)
  const showSharedBsq =
    sharedChars != null && sharedChars.building_sqft != null && numericGtZero(sharedChars.building_sqft)
  const showSharedLand =
    sharedChars != null && sharedChars.land_sqft != null && numericGtZero(sharedChars.land_sqft)

  const sharedDetailRows: { key: string; label: string; value: string }[] = []
  if (showSharedYear) {
    sharedDetailRows.push({
      key: 'yb',
      label: 'Year Built',
      value: String(sharedChars!.year_built),
    })
  }
  if (showSharedBsq) {
    sharedDetailRows.push({
      key: 'bsq',
      label: 'Building Sqft',
      value: Number(sharedChars!.building_sqft).toLocaleString('en-US'),
    })
  }
  if (showSharedLand) {
    sharedDetailRows.push({
      key: 'lsq',
      label: 'Land Sqft',
      value: Number(sharedChars!.land_sqft).toLocaleString('en-US'),
    })
  }
  const showSharedPropertyType =
    sharedChars != null &&
    sharedChars.property_type != null &&
    String(sharedChars.property_type).trim() !== ''
  if (showSharedPropertyType) {
    sharedDetailRows.push({ key: 'ptyp', label: 'Property Type', value: String(sharedChars!.property_type) })
  }
  if (showSharedClass) {
    sharedDetailRows.push({ key: 'cls', label: 'Class', value: sharedClassLine! })
  }

  const showSharedSection = sharedReady && sharedDetailRows.length > 0
  const lastSharedIdx = sharedDetailRows.length - 1

  return (
    <>
      <div className="profile-card-header profile-card-header--with-toggle">
        <span style={{ flex: 1 }}>Property Details</span>
        {siblings.length > 0 && (
          <button
            type="button"
            aria-label={anyExpanded ? 'Collapse all units' : 'Expand all units'}
            onClick={anyExpanded ? collapseAll : expandAll}
            style={{
              fontFamily: 'var(--mono)',
              fontSize: 14,
              color: 'rgba(255,255,255,0.45)',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              marginLeft: 'auto',
              padding: '0 0 0 8px',
              lineHeight: 1,
            }}
          >
            {anyExpanded ? '−' : '+'}
          </button>
        )}
      </div>

      <div className="property-details-expanded">
        {showSharedSection && (
          <div className="detail-list property-details-expanded-condo-shared">
            {sharedDetailRows.map((row, i) => (
              <div
                key={row.key}
                className="detail-row"
                style={
                  i === lastSharedIdx ? { borderBottom: '1px solid var(--border)' } : undefined
                }
              >
                <span className="detail-key">{row.label}</span>
                <span className="detail-val">{row.value}</span>
              </div>
            ))}
          </div>
        )}

        {!showSharedSection && sharedReady && (
          <div style={{ borderTop: '1px solid var(--border)' }} aria-hidden />
        )}

        {siblings.map((s, index) => {
          const pinKey = s.pin
          const open = !!openPins[pinKey]
          const implied =
            s.assessedValue != null &&
            Number.isFinite(s.assessedValue) &&
            s.assessedClass != null &&
            getAssessmentLevelForImplied(s.assessedClass) > 0
              ? s.assessedValue! / getAssessmentLevelForImplied(s.assessedClass)
              : null

          const unitChars = condoByPin[pinKey]
          const showUnitLoading =
            open && isCondo299Class(s.assessedClass) && (unitChars === undefined || unitChars === 'loading')
          const showBedrooms =
            unitChars != null && unitChars !== 'loading' && unitChars.num_bedrooms != null
          const showUnitSqft =
            unitChars != null &&
            unitChars !== 'loading' &&
            unitChars.unit_sqft != null &&
            numericGtZero(unitChars.unit_sqft)
          const showUnitSection =
            isCondo299Class(s.assessedClass) &&
            (showUnitLoading || showBedrooms || showUnitSqft)

          const showTaxYear = s.taxYear != null && Number.isFinite(s.taxYear)
          const showValueSource = s.valueType != null && String(s.valueType).trim() !== ''
          const showAssessedVal = s.assessedValue != null && Number.isFinite(s.assessedValue)
          const showLevel = s.assessedClass != null && String(s.assessedClass).trim() !== ''
          const showImplied = implied != null && Number.isFinite(implied)

          const unitRows: BodyRowDef[] = []
          if (showUnitLoading) {
            unitRows.push({ key: 'ul', label: 'Unit details', value: 'Loading…' })
          }
          if (showBedrooms) {
            unitRows.push({
              key: 'br',
              label: 'Bedrooms',
              value: String((unitChars as PropertyCharsCondoRow).num_bedrooms),
            })
          }
          if (showUnitSqft) {
            unitRows.push({
              key: 'usq',
              label: 'Unit Sqft',
              value: Number((unitChars as PropertyCharsCondoRow).unit_sqft).toLocaleString('en-US'),
            })
          }

          const assessmentRows: BodyRowDef[] = []
          if (showTaxYear) {
            assessmentRows.push({ key: 'ty', label: 'AV Tax Year', value: String(s.taxYear) })
          }
          if (showValueSource) {
            assessmentRows.push({ key: 'vs', label: 'AV Value Source', value: String(s.valueType) })
          }
          if (showAssessedVal) {
            assessmentRows.push({
              key: 'av',
              label: 'Assessed Value',
              value: currencyZero.format(s.assessedValue!),
            })
          }
          if (showLevel) {
            assessmentRows.push({
              key: 'al',
              label: 'Assessment Level',
              value: getAssessmentLevelForImplied(s.assessedClass) === 0.25 ? '25%' : '10%',
            })
          }
          if (showImplied) {
            assessmentRows.push({
              key: 'imv',
              label: 'Implied Market Value',
              value: currencyZero.format(implied!),
            })
          }

          const hasAssessmentBlock =
            showTaxYear || showValueSource || showAssessedVal || showLevel || showImplied
          const unitRowCount = unitRows.length

          const headerBg = index % 2 === 0 ? '#ffffff' : '#f7f9fb'

          return (
            <div key={pinKey} className="property-details-expanded-section" style={{ borderBottom: 'none' }}>
              <button
                type="button"
                onClick={() => togglePin(pinKey, s.assessedClass)}
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
                    {formatTitleCaseAddress(s.address)}
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
                    {pinKey}
                  </span>
                </span>
              </button>

              {open && (
                <div
                  style={{
                    background: 'var(--color-background-primary)',
                    borderLeft: '3px solid #2d6a4f',
                    borderBottom: '1px solid var(--border)',
                  }}
                >
                  {showUnitSection && (
                    <>
                      <span style={SECTION_LABEL_STYLE}>Unit</span>
                      <ExpandedDataRows
                        rows={unitRows}
                        globalOffset={0}
                        isTerminal={!hasAssessmentBlock}
                      />
                    </>
                  )}

                  {hasAssessmentBlock && (
                    <>
                      <span style={SECTION_LABEL_STYLE}>Assessment</span>
                      <ExpandedDataRows
                        rows={assessmentRows}
                        globalOffset={unitRowCount}
                        isTerminal
                      />
                    </>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </>
  )
}