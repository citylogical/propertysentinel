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
  } = cityLogic

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
    ohareNoiseContour

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
            <span className="detail-key">O'Hare Noise Zone</span>
            <span className="detail-val">Yes</span>
          </div>
        )}
      </div>
    </div>
  )
}