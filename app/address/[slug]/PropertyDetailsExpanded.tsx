'use client'

import { useState, type CSSProperties } from 'react'
import { getClassDescription } from '@/lib/class-codes'

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
  commercialCharsByPin: Record<string, any[]>
}

function getAssessmentLevel(assessedClass: string | null): number {
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

const currencyFmt = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
  minimumFractionDigits: 0,
})

function isCommercialAssessedClass(assessedClass: string | null): boolean {
  if (!assessedClass) return false
  const d = String(assessedClass).replace(/\D/g, '')
  const f = d.charAt(0)
  return f === '3' || f === '5' || f === '6' || f === '7' || f === '8'
}

function levelNote(level: number): string {
  return level >= 0.25 ? '(25% level)' : '(10% level)'
}

export default function PropertyDetailsExpanded({ siblings, commercialCharsByPin }: Props) {
  const [openPins, setOpenPins] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(siblings.map((s) => [s.pin, false]))
  )
  const [openYears, setOpenYears] = useState<Record<string, boolean>>({})

  const togglePin = (pinKey: string) => {
    setOpenPins((prev) => ({ ...prev, [pinKey]: !prev[pinKey] }))
  }

  const toggleYear = (yearKey: string) => {
    setOpenYears((prev) => ({ ...prev, [yearKey]: !prev[yearKey] }))
  }

  const nestedWrap: CSSProperties = {
    marginLeft: '0.5rem',
    paddingLeft: '0.75rem',
    borderLeft: '2px solid var(--border)',
  }

  return (
    <div className="property-details-expanded">
      {siblings.map((s) => {
        const pinKey = s.pin
        const open = !!openPins[pinKey]
        const level = getAssessmentLevel(s.assessedClass)
        const implied =
          s.assessedValue != null && Number.isFinite(s.assessedValue) && level > 0
            ? s.assessedValue / level
            : null
        const desc = getClassDescription(s.assessedClass)
        const classLine =
          s.assessedClass != null && String(s.assessedClass).trim() !== ''
            ? desc
              ? `${s.assessedClass} — ${desc}`
              : String(s.assessedClass)
            : null
        const isCommercial = isCommercialAssessedClass(s.assessedClass)
        const commercialRows = commercialCharsByPin[pinKey] ?? []

        return (
          <div key={pinKey} className="property-details-expanded-section">
            <button
              type="button"
              className="property-details-expanded-header"
              onClick={() => togglePin(pinKey)}
              aria-expanded={open}
              style={{ alignItems: 'center' }}
            >
              <span className="property-details-expanded-chevron" style={{ width: 'auto', marginTop: 0 }}>
                {open ? '▼' : '▶'}
              </span>
              <span className="property-details-expanded-address" style={{ fontWeight: 600, fontSize: '0.8rem' }}>
                {formatTitleCaseAddress(s.address)}
              </span>
            </button>

            {open && (
              <div className="detail-list property-details-expanded-body">
                <div className="detail-row">
                  <span className="detail-key">PIN</span>
                  <span className="detail-val">{pinKey}</span>
                </div>
                <div className="detail-row">
                  <span className="detail-key">Class (property)</span>
                  <span className={classLine ? 'detail-val' : 'detail-val na'}>{classLine ?? 'N/A'}</span>
                </div>
                <div className="detail-row">
                  <span className="detail-key">AV Class</span>
                  <span className={s.assessedClass ? 'detail-val' : 'detail-val na'}>
                    {s.assessedClass ?? 'N/A'}
                  </span>
                </div>
                <div className="detail-row">
                  <span className="detail-key">AV Tax Year</span>
                  <span
                    className={
                      s.taxYear != null && Number.isFinite(s.taxYear) ? 'detail-val' : 'detail-val na'
                    }
                  >
                    {s.taxYear != null && Number.isFinite(s.taxYear) ? String(s.taxYear) : 'N/A'}
                  </span>
                </div>
                <div className="detail-row">
                  <span className="detail-key">AV Value Source</span>
                  <span className={s.valueType ? 'detail-val' : 'detail-val na'}>
                    {s.valueType ?? 'N/A'}
                  </span>
                </div>
                <div className="detail-row">
                  <span className="detail-key">Assessed Value</span>
                  <span
                    className={
                      s.assessedValue != null && Number.isFinite(s.assessedValue) ? 'detail-val' : 'detail-val na'
                    }
                  >
                    {s.assessedValue != null && Number.isFinite(s.assessedValue)
                      ? currencyFmt.format(s.assessedValue)
                      : 'N/A'}
                  </span>
                </div>
                <div className="detail-row">
                  <span className="detail-key">Implied Market Value</span>
                  <span
                    className={implied != null ? 'detail-val' : 'detail-val na'}
                    style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: '0.35rem' }}
                  >
                    {implied != null ? currencyFmt.format(implied) : 'N/A'}
                    {implied != null && (
                      <span style={{ fontSize: '10px', color: 'var(--text-dim)', fontStyle: 'italic' }}>
                        {levelNote(level)}
                      </span>
                    )}
                  </span>
                </div>

                {isCommercial && (
                  <>
                    <div className="profile-card-header" style={{ margin: '0.75rem 0 0.5rem' }}>
                      Commercial Valuation
                    </div>
                    {commercialRows.length === 0 ? (
                      <div className="detail-row">
                        <span className="detail-key">Commercial data</span>
                        <span className="detail-val na">Not available</span>
                      </div>
                    ) : (
                      <div style={nestedWrap}>
                        {commercialRows.map((row: any, idx: number) => {
                          const ty = row.tax_year
                          const yearLabel =
                            ty != null && ty !== '' ? String(ty) : `Year ${idx}`
                          const yearKey =
                            ty != null && ty !== '' ? `${pinKey}-${ty}` : `${pinKey}-row-${idx}`
                          const yearOpen = !!openYears[yearKey]
                          const bsq = row.building_sqft
                          const noi = row.noi
                          const cap = row.caprate
                          const fmv = row.final_market_value

                          return (
                            <div key={`${yearKey}-r-${idx}`} style={{ marginBottom: '0.5rem' }}>
                              <button
                                type="button"
                                className="property-details-expanded-header"
                                onClick={() => toggleYear(yearKey)}
                                aria-expanded={yearOpen}
                                style={{ alignItems: 'center', padding: '0.4rem 0' }}
                              >
                                <span
                                  className="property-details-expanded-chevron"
                                  style={{ width: 'auto', marginTop: 0 }}
                                >
                                  {yearOpen ? '▼' : '▶'}
                                </span>
                                <span style={{ fontWeight: 600, fontSize: '0.75rem' }}>{yearLabel}</span>
                              </button>
                              {yearOpen && (
                                <div className="detail-list" style={{ paddingLeft: '0.25rem' }}>
                                  <div className="detail-row">
                                    <span className="detail-key">Property Type</span>
                                    <span className={row.property_type_use ? 'detail-val' : 'detail-val na'}>
                                      {row.property_type_use ?? 'N/A'}
                                    </span>
                                  </div>
                                  <div className="detail-row">
                                    <span className="detail-key">Sheet</span>
                                    <span className={row.sheet ? 'detail-val' : 'detail-val na'}>
                                      {row.sheet ?? 'N/A'}
                                    </span>
                                  </div>
                                  <div className="detail-row">
                                    <span className="detail-key">Building Sqft</span>
                                    <span
                                      className={
                                        bsq != null && Number.isFinite(Number(bsq)) ? 'detail-val' : 'detail-val na'
                                      }
                                    >
                                      {bsq != null && Number.isFinite(Number(bsq))
                                        ? Number(bsq).toLocaleString('en-US')
                                        : 'N/A'}
                                    </span>
                                  </div>
                                  <div className="detail-row">
                                    <span className="detail-key">NOI</span>
                                    <span
                                      className={
                                        noi != null && Number.isFinite(Number(noi)) ? 'detail-val' : 'detail-val na'
                                      }
                                    >
                                      {noi != null && Number.isFinite(Number(noi))
                                        ? currencyFmt.format(Number(noi))
                                        : 'N/A'}
                                    </span>
                                  </div>
                                  <div className="detail-row">
                                    <span className="detail-key">Cap Rate</span>
                                    <span
                                      className={
                                        cap != null && Number.isFinite(Number(cap)) ? 'detail-val' : 'detail-val na'
                                      }
                                    >
                                      {cap != null && Number.isFinite(Number(cap))
                                        ? `${(Number(cap) * 100).toFixed(2)}%`
                                        : 'N/A'}
                                    </span>
                                  </div>
                                  <div className="detail-row">
                                    <span className="detail-key">CCAO Market Value (income approach)</span>
                                    <span
                                      className={
                                        fmv != null && Number.isFinite(Number(fmv)) ? 'detail-val' : 'detail-val na'
                                      }
                                    >
                                      {fmv != null && Number.isFinite(Number(fmv))
                                        ? currencyFmt.format(Number(fmv))
                                        : 'N/A'}
                                    </span>
                                  </div>
                                </div>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
