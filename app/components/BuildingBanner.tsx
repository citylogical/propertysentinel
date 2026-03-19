import Link from 'next/link'

interface BuildingBannerProps {
  addressRange: string
  currentSlug: string
  currentAddress: string
  isExpanded: boolean
}

function formatShortAddress(address: string): string {
  return address
    .split(' ')
    .map((w, i) => i === 0 ? w : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ')
}

export default function BuildingBanner({
  addressRange,
  currentSlug,
  currentAddress,
  isExpanded,
}: BuildingBannerProps) {
  const baseUrl = `/address/${currentSlug}`

  if (isExpanded) {
    return (
      <div className="building-banner">
        <span>Showing results for <strong>{addressRange}</strong></span>
        <Link href={baseUrl} className="building-banner-link">
          Show only {formatShortAddress(currentAddress)} →
        </Link>
      </div>
    )
  }

  return (
    <div className="building-banner">
      <span>This building spans <strong>{addressRange}</strong></span>
      <Link href={`${baseUrl}?building=true`} className="building-banner-link">
        Show full building →
      </Link>
    </div>
  )
}