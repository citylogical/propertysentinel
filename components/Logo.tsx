import type { SVGProps } from 'react'

type LogoProps = SVGProps<SVGSVGElement> & {
  size?: number
}

/**
 * Property Sentinel mark.
 * Color is controlled by the parent via `currentColor` — apply Tailwind text-* classes
 * to set color (e.g. `text-white` on navy backgrounds, `text-navy-900` on cream).
 */
export function Logo({ size = 36, className, ...props }: LogoProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="247 249 529 529"
      width={size}
      height={size}
      fill="currentColor"
      role="img"
      aria-label="Property Sentinel"
      className={className}
      {...props}
    >
      <g transform="translate(0,1024) scale(0.1,-0.1)" stroke="none">
        <path d="M5090 7395 l0 -155 -30 0 -30 0 0 -229 0 -230 -53 -24 c-29 -13 -69 -39 -90 -56 -48 -43 -97 -142 -104 -214 l-6 -57 337 0 336 0 0 33 c0 51 -26 128 -61 181 -33 49 -113 110 -161 122 l-28 6 0 234 0 234 -30 0 -30 0 0 155 0 155 -25 0 -25 0 0 -155z" />
        <path d="M4740 4510 l0 -1850 155 0 155 0 0 1505 0 1505 60 0 60 0 2 -1502 3 -1503 158 -3 157 -3 0 1851 0 1850 -375 0 -375 0 0 -1850z" />
        <path d="M4305 4318 c-3 -706 -5 -1366 -3 -1468 l3 -185 158 -3 157 -3 0 1471 0 1470 -154 0 -154 0 -7 -1282z" />
        <path d="M5610 4130 l0 -1470 155 0 155 0 0 1470 0 1470 -155 0 -155 0 0 -1470z" />
        <path d="M3600 3895 l0 -395 -280 0 -280 0 0 -420 0 -420 575 0 575 0 0 815 0 815 -295 0 -295 0 0 -395z" />
        <path d="M6030 3475 l0 -815 578 2 577 3 3 418 2 417 -280 0 -280 0 -2 253 c-2 138 -2 279 0 312 1 33 0 97 -4 143 l-6 82 -294 0 -294 0 0 -815z" />
      </g>
    </svg>
  )
}
