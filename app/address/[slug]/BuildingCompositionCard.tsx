import type { BuildingComposition } from '@/lib/building-composition'
import { getConstructionLabel } from '@/lib/construction-codes'

type Props = {
  composition: BuildingComposition
  totalPins: number
}

const SECTION_LABEL_STYLE: React.CSSProperties = {
  fontFamily: 'var(--mono)',
  fontSize: '9px',
  fontWeight: 400,
  letterSpacing: '0.1em',
  textTransform: 'uppercase',
  color: 'var(--text)',
  padding: '7px 14px',
  background: 'rgba(15, 39, 68, 0.08)',
  borderTop: '1px solid var(--border)',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  cursor: 'pointer',
  listStyle: 'none',
  userSelect: 'none' as const,
}

const SECTION_LABEL_COUNT_STYLE: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 10,
}

const CLASS_ROW_STYLE: React.CSSProperties = {
  background: 'rgba(15, 39, 68, 0.08)',
  borderTop: '1px solid var(--border)',
  borderBottom: 'none',
}

const CLASS_ROW_KEY_STYLE: React.CSSProperties = {
  fontWeight: 600,
  color: 'var(--text)',
}

const CLASS_ROW_VAL_STYLE: React.CSSProperties = {
  fontWeight: 600,
  color: 'var(--text)',
}

const SUB_ROW_STYLE: React.CSSProperties = {
  paddingLeft: 32,
  borderBottom: '1px solid rgba(221, 217, 208, 0.5)',
}

// When a single class row acts as the disclosure summary, apply summary-required
// styling (cursor, list-style hiding) on top of the existing CLASS_ROW_STYLE.
// Padding and font weight stay matched to CLASS_ROW_STYLE.
const SECTION_LABEL_STYLE_OVERRIDE_FOR_SINGLE_CLASS: React.CSSProperties = {
  cursor: 'pointer',
  listStyle: 'none',
  userSelect: 'none' as const,
  padding: '7px 14px',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
}

const SINGLE_PIN_FOOTER_STYLE: React.CSSProperties = {
  background: 'rgba(15, 39, 68, 0.08)',
  borderTop: '1px solid var(--border)',
  padding: '9px 14px',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'flex-start',
  gap: 16,
}

const SINGLE_PIN_FOOTER_COL_STYLE: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 2,
  minWidth: 0,
}

const SINGLE_PIN_FOOTER_LABEL_STYLE: React.CSSProperties = {
  fontFamily: 'var(--mono)',
  fontSize: '8px',
  letterSpacing: '0.1em',
  textTransform: 'uppercase',
  fontWeight: 600,
  color: 'var(--text-dim)',
}

const SINGLE_PIN_FOOTER_VALUE_STYLE: React.CSSProperties = {
  fontSize: '11px',
  fontWeight: 400,
  color: 'var(--text)',
}

function formatRent(n: number): string {
  if (Number.isInteger(n)) return `$${n}/sf`
  return `$${n.toFixed(2).replace(/\.?0+$/, '')}/sf`
}

function formatBaths(full: number | null, half: number | null): string | null {
  if (full == null && half == null) return null
  if (full != null && half != null && half > 0) return `${full}F + ${half}H`
  if (full != null) return `${full}F`
  if (half != null && half > 0) return `${half}H`
  return null
}

function formatRoomsBedsBaths(
  rooms: number | null,
  beds: number | null,
  bathsFull: number | null,
  bathsHalf: number | null
): string | null {
  const baths = formatBaths(bathsFull, bathsHalf)
  // Skip the row entirely if everything's null
  if (rooms == null && beds == null && baths == null) return null
  const parts: string[] = [
    rooms != null ? String(rooms) : '—',
    beds != null ? String(beds) : '—',
    baths ?? '—',
  ]
  return parts.join(' / ')
}

function formatBasementGaragePorch(
  basement: string | null,
  garageSize: number | null,
  porch: string | null
): string | null {
  const parts: string[] = []
  if (basement) parts.push(basement)
  if (garageSize != null) parts.push(`${garageSize} ${garageSize === 1 ? 'car' : 'cars'}`)
  if (porch) parts.push(porch)
  if (!parts.length) return null
  return parts.join(' / ')
}

function formatHvac(heating: string | null, centralAir: string | null): string | null {
  const parts: string[] = []
  if (heating) parts.push(heating)
  if (centralAir) parts.push(centralAir)
  if (!parts.length) return null
  return parts.join(' / ')
}

function formatConstructionFromMaterials(
  exterior: string | null,
  roof: string | null
): string | null {
  const parts: string[] = []
  if (exterior) parts.push(exterior)
  if (roof) parts.push(roof)
  if (!parts.length) return null
  return parts.join(', ')
}

function formatRecentSale(sale: { saleDate: string; salePrice: number | null }): string {
  // sale_date is ISO YYYY-MM-DD; format as readable month + year
  const parts = sale.saleDate.split('-')
  if (parts.length !== 3) {
    // Fallback if format unexpected
    return sale.salePrice != null
      ? `${sale.saleDate} · $${sale.salePrice.toLocaleString('en-US')}`
      : sale.saleDate
  }
  const [year, month, day] = parts
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  const monthName = months[parseInt(month, 10) - 1] ?? month
  const dateText = `${monthName} ${parseInt(day, 10)}, ${year}`
  if (sale.salePrice == null) return dateText
  return `${dateText} · $${sale.salePrice.toLocaleString('en-US')}`
}

export default function BuildingCompositionCard({ composition, totalPins }: Props) {
  const {
    yearBuilt,
    stories,
    floorArea,
    lotDims,
    lotAreaFallback,
    constrType,
    materials,
    recentSale,
    rows,
    propertyType,
    singlePinClass,
    singlePinClassDescription,
    singlePinPin,
  } = composition

  return (
    <div className="detail-list">
      {yearBuilt != null && (
        <div className="detail-row">
          <span className="detail-key">Built</span>
          <span className="detail-val">{yearBuilt}</span>
        </div>
      )}

      {propertyType != null && (
        <div className="detail-row">
          <span className="detail-key">Property type</span>
          <span className="detail-val">{propertyType}</span>
        </div>
      )}

      {(floorArea != null || stories != null) && (
        <div className="detail-row">
          <span className="detail-key">
            {floorArea != null ? 'Floor area' : 'Stories'}
          </span>
          <span className="detail-val">
            {floorArea != null && stories != null
              ? `${floorArea.toLocaleString('en-US')} sqft / ${stories} ${stories === 1 ? 'story' : 'stories'}`
              : floorArea != null
                ? `${floorArea.toLocaleString('en-US')} sqft`
                : `${stories} ${stories === 1 ? 'story' : 'stories'}`}
          </span>
        </div>
      )}

      {lotDims != null && (
        <div className="detail-row">
          <span className="detail-key">Lot size</span>
          <span className="detail-val">
            {Math.min(lotDims.width, lotDims.length).toLocaleString('en-US')}
            {' × '}
            {Math.max(lotDims.width, lotDims.length).toLocaleString('en-US')}
            {' ft'}
          </span>
        </div>
      )}

      {lotDims == null && lotAreaFallback != null && lotAreaFallback > 0 && (
        <div className="detail-row">
          <span className="detail-key">Lot size</span>
          <span className="detail-val">{lotAreaFallback.toLocaleString('en-US')} sqft</span>
        </div>
      )}

      {constrType != null && (
        <div className="detail-row">
          <span className="detail-key">Construction</span>
          <span className="detail-val">{getConstructionLabel(constrType) ?? constrType}</span>
        </div>
      )}

      {constrType == null && materials != null &&
        formatConstructionFromMaterials(materials.exterior, materials.roof) != null && (
          <div className="detail-row">
            <span className="detail-key">Construction</span>
            <span className="detail-val">
              {formatConstructionFromMaterials(materials.exterior, materials.roof)}
            </span>
          </div>
        )}

      {recentSale && (
        <div className="detail-row">
          <span className="detail-key">Most recent parcel sale</span>
          <span className="detail-val">{formatRecentSale(recentSale)}</span>
        </div>
      )}

      {rows.length === 1 && (() => {
        const row = rows[0]
        const hasUnitSubrows =
          row.unitBreakdown != null &&
          (row.unitBreakdown.parking > 0 || row.unitBreakdown.other > 0)
        const hasCommercialSubrows =
          row.commercialUses != null && row.commercialUses.length > 0
        const isExpandable = hasUnitSubrows || hasCommercialSubrows

        const classRowContent = (
          <>
            <span className="detail-key" style={CLASS_ROW_KEY_STYLE}>
              {row.class}
              {row.description ? ` — ${row.description}` : ''}
            </span>
            <span style={SECTION_LABEL_COUNT_STYLE}>
              <span className="detail-val" style={CLASS_ROW_VAL_STYLE}>
                {row.pinCount.toLocaleString('en-US')} {row.pinCount === 1 ? 'PIN' : 'PINs'}
              </span>
              {isExpandable && (
                <span className="building-composition-toggle" aria-hidden="true" />
              )}
            </span>
          </>
        )

        if (!isExpandable) {
          // Static class row — no expansion, no toggle (e.g. 5040 N Marine: 203 units, no parking)
          return (
            <div className="detail-row" style={CLASS_ROW_STYLE}>
              {classRowContent}
            </div>
          )
        }

        // Single class with sub-rows — class row acts as the disclosure summary
        return (
          <details className="building-composition-classes">
            <summary style={{ ...CLASS_ROW_STYLE, ...SECTION_LABEL_STYLE_OVERRIDE_FOR_SINGLE_CLASS }}>
              {classRowContent}
            </summary>
            {row.unitBreakdown && (
              <>
                {row.unitBreakdown.units > 0 && (
                  <div className="detail-row" style={SUB_ROW_STYLE}>
                    <span className="detail-key">Units</span>
                    <span className="detail-val">
                      {row.unitBreakdown.units.toLocaleString('en-US')}
                    </span>
                  </div>
                )}
                {row.unitBreakdown.parking > 0 && (
                  <div className="detail-row" style={SUB_ROW_STYLE}>
                    <span className="detail-key">Parking</span>
                    <span className="detail-val">
                      {row.unitBreakdown.parking.toLocaleString('en-US')}
                    </span>
                  </div>
                )}
                {row.unitBreakdown.other > 0 && (
                  <div className="detail-row" style={SUB_ROW_STYLE}>
                    <span className="detail-key">Other</span>
                    <span className="detail-val">
                      {row.unitBreakdown.other.toLocaleString('en-US')}
                    </span>
                  </div>
                )}
              </>
            )}
            {row.commercialUses &&
              row.commercialUses.map((use, idx) => (
                <div
                  key={`${row.class}-${idx}-${use.propertyType}`}
                  className="detail-row"
                  style={SUB_ROW_STYLE}
                >
                  <span className="detail-key">{use.propertyType}</span>
                  <span className="detail-val">
                    {use.rentPsf != null ? formatRent(use.rentPsf) : '—'}
                  </span>
                </div>
              ))}
          </details>
        )
      })()}

      {rows.length > 1 && (
        <details className="building-composition-classes">
          <summary style={SECTION_LABEL_STYLE}>
            <span>Class Breakdown</span>
            <span style={SECTION_LABEL_COUNT_STYLE}>
              <span>
                {totalPins.toLocaleString('en-US')} {totalPins === 1 ? 'PIN' : 'PINs'} total
              </span>
              <span className="building-composition-toggle" aria-hidden="true" />
            </span>
          </summary>

          {rows.map((row) => (
            <div key={row.class}>
              <div className="detail-row" style={CLASS_ROW_STYLE}>
                <span className="detail-key" style={CLASS_ROW_KEY_STYLE}>
                  {row.class}
                  {row.description ? ` — ${row.description}` : ''}
                </span>
                <span className="detail-val" style={CLASS_ROW_VAL_STYLE}>
                  {row.pinCount.toLocaleString('en-US')} {row.pinCount === 1 ? 'PIN' : 'PINs'}
                </span>
              </div>

              {row.unitBreakdown &&
                (row.unitBreakdown.parking > 0 || row.unitBreakdown.other > 0) && (
                  <>
                    {row.unitBreakdown.units > 0 && (
                      <div className="detail-row" style={SUB_ROW_STYLE}>
                        <span className="detail-key">Units</span>
                        <span className="detail-val">
                          {row.unitBreakdown.units.toLocaleString('en-US')}
                        </span>
                      </div>
                    )}
                    {row.unitBreakdown.parking > 0 && (
                      <div className="detail-row" style={SUB_ROW_STYLE}>
                        <span className="detail-key">Parking</span>
                        <span className="detail-val">
                          {row.unitBreakdown.parking.toLocaleString('en-US')}
                        </span>
                      </div>
                    )}
                    {row.unitBreakdown.other > 0 && (
                      <div className="detail-row" style={SUB_ROW_STYLE}>
                        <span className="detail-key">Other</span>
                        <span className="detail-val">
                          {row.unitBreakdown.other.toLocaleString('en-US')}
                        </span>
                      </div>
                    )}
                  </>
                )}

              {row.commercialUses &&
                row.commercialUses.map((use, idx) => (
                  <div
                    key={`${row.class}-${idx}-${use.propertyType}`}
                    className="detail-row"
                    style={SUB_ROW_STYLE}
                  >
                    <span className="detail-key">{use.propertyType}</span>
                    <span className="detail-val">
                      {use.rentPsf != null ? formatRent(use.rentPsf) : '—'}
                    </span>
                  </div>
                ))}
            </div>
          ))}
        </details>
      )}

      {singlePinClass != null && singlePinPin != null && (
        <div style={SINGLE_PIN_FOOTER_STYLE}>
          <div style={SINGLE_PIN_FOOTER_COL_STYLE}>
            <span style={SINGLE_PIN_FOOTER_LABEL_STYLE}>Class</span>
            <span style={SINGLE_PIN_FOOTER_VALUE_STYLE}>
              {singlePinClass}
              {singlePinClassDescription ? ` — ${singlePinClassDescription}` : ''}
            </span>
          </div>
          <div style={{ ...SINGLE_PIN_FOOTER_COL_STYLE, alignItems: 'flex-end' }}>
            <span style={SINGLE_PIN_FOOTER_LABEL_STYLE}>PIN</span>
            <span style={{ ...SINGLE_PIN_FOOTER_VALUE_STYLE, fontFamily: 'var(--mono)' }}>
              {singlePinPin}
            </span>
          </div>
        </div>
      )}
    </div>
  )
}