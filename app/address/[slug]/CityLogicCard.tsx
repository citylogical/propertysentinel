import type { CityLogic } from '@/lib/city-logic'

type Props = {
  cityLogic: CityLogic
}

export default function CityLogicCard({ cityLogic }: Props) {
  const {
    ward,
    neighborhood,
    schoolElementary,
    walkabilityScore,
    tifDistrictName,
    tifDistrictNum,
    opportunityZone,
    isPbl,
    pblAssociation,
    isRestrictedZone,
    floodFemaSfha,
    ohareNoiseContour,
    hudAssisted,
    affordableHousing,
    foreclosureRegistry,
  } = cityLogic

  // "ARO · 23 units · Willow Bridge"
  const affordableLabel = affordableHousing
    ? [
        affordableHousing.propertyType,
        affordableHousing.units != null && affordableHousing.units > 0
          ? `${affordableHousing.units} units`
          : null,
        affordableHousing.managementCompany,
      ]
        .filter(Boolean)
        .join(' · ') || 'Listed'
    : null

  // "Oak River Property Management · Jul 2026" — month formatted from the
  // ISO date string directly (Date parsing would shift days across timezones)
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  const foreclosureLabel = foreclosureRegistry
    ? [
        foreclosureRegistry.agentName,
        foreclosureRegistry.latestSubmission
          ? `${MONTHS[parseInt(foreclosureRegistry.latestSubmission.slice(5, 7), 10) - 1] ?? ''} ${foreclosureRegistry.latestSubmission.slice(0, 4)}`.trim()
          : null,
      ]
        .filter(Boolean)
        .join(' · ') || 'Registered'
    : null

  // "Section 8 · 120 units · Ludwig and Company" — programs joined, falling
  // back to the HUD category when no program flags were set; units and
  // management agent appended when present.
  const hudAssistedLabel = hudAssisted
    ? [
        hudAssisted.programs.length > 0 ? hudAssisted.programs.join(', ') : hudAssisted.category,
        hudAssisted.unitsAssisted != null && hudAssisted.unitsAssisted > 0
          ? `${hudAssisted.unitsAssisted} units`
          : null,
        hudAssisted.managerName,
      ]
        .filter(Boolean)
        .join(' · ') || 'Yes'
    : null

  // If literally nothing populated, hide the entire card. Should be rare
  // since parcel_universe almost always has ward + community area.
  const hasAnyContent =
    ward != null ||
    neighborhood != null ||
    schoolElementary != null ||
    walkabilityScore != null ||
    tifDistrictName != null ||
    tifDistrictNum != null ||
    opportunityZone ||
    isPbl ||
    isRestrictedZone ||
    floodFemaSfha ||
    ohareNoiseContour ||
    hudAssisted != null ||
    affordableHousing != null ||
    foreclosureRegistry != null

  if (!hasAnyContent) return null

  return (
    <div className="profile-card" style={{ marginTop: 12 }}>
      <div className="profile-card-header">
        <span style={{ flex: 1 }}>City Logic</span>
      </div>

      <div className="detail-list">
        {ward != null && (
          <div className="detail-row">
            <span className="detail-key">Ward</span>
            <span className="detail-val">{ward}</span>
          </div>
        )}

        {neighborhood != null && (
          <div className="detail-row">
            <span className="detail-key">Neighborhood</span>
            <span className="detail-val">{neighborhood}</span>
          </div>
        )}

        {schoolElementary != null && (
          <div className="detail-row">
            <span className="detail-key">Elementary school</span>
            <span className="detail-val">{schoolElementary}</span>
          </div>
        )}

        {walkabilityScore != null && (
          <div className="detail-row">
            <span className="detail-key">Walkability</span>
            <span className="detail-val">{walkabilityScore}</span>
          </div>
        )}

        {(tifDistrictName != null || tifDistrictNum != null) && (
          <div className="detail-row">
            <span className="detail-key">TIF district</span>
            <span className="detail-val">
              {tifDistrictName ?? `TIF #${tifDistrictNum}`}
            </span>
          </div>
        )}

        {opportunityZone && (
          <div className="detail-row">
            <span className="detail-key">Opportunity Zone</span>
            <span className="detail-val">Yes</span>
          </div>
        )}

        {isPbl && (
          <div className="detail-row">
            <span className="detail-key">Prohibited Building List</span>
            <span className="detail-val">{pblAssociation ?? 'Listed'}</span>
          </div>
        )}

        {hudAssistedLabel != null && (
          <div className="detail-row">
            <span className="detail-key">HUD Assisted</span>
            <span className="detail-val">{hudAssistedLabel}</span>
          </div>
        )}

        {affordableLabel != null && (
          <div className="detail-row">
            <span className="detail-key">Affordable Housing</span>
            <span className="detail-val">{affordableLabel}</span>
          </div>
        )}

        {foreclosureLabel != null && (
          <div className="detail-row">
            <span className="detail-key">Foreclosure Registry</span>
            <span className="detail-val">{foreclosureLabel}</span>
          </div>
        )}

        {isRestrictedZone && (
          <div className="detail-row">
            <span className="detail-key">STR Restricted Zone</span>
            <span className="detail-val">Yes</span>
          </div>
        )}

        {floodFemaSfha && (
          <div className="detail-row">
            <span className="detail-key">Flood Hazard Area</span>
            <span className="detail-val">FEMA SFHA</span>
          </div>
        )}

        {ohareNoiseContour && (
          <div className="detail-row">
            <span className="detail-key">O&apos;Hare Noise Zone</span>
            <span className="detail-val">Yes</span>
          </div>
        )}
      </div>
    </div>
  )
}