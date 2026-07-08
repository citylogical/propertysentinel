// Runtime verification for AddressBarButtons: bundle with esbuild (Clerk
// mocked), then renderToString in three auth states. Catches JSX/apostrophe/
// TDZ failures that tsc alone would miss. Not part of the app build.
import { createRequire } from 'module'
import path from 'path'
import { fileURLToPath } from 'url'

const require = createRequire(import.meta.url)
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PROJECT = path.join(__dirname, '..')

const esbuild = require('esbuild')

const outfile = path.join(__dirname, '.verify-bundle.cjs')

await esbuild.build({
  entryPoints: [path.join(PROJECT, 'app/address/[slug]/AddressBarButtons.tsx')],
  bundle: true,
  format: 'cjs',
  platform: 'node',
  jsx: 'automatic',
  external: ['react', 'react-dom'],
  alias: {
    '@clerk/nextjs': path.join(__dirname, 'clerk-mock.cjs'),
    'next/navigation': path.join(__dirname, 'next-nav-mock.cjs'),
  },
  tsconfig: path.join(PROJECT, 'tsconfig.json'),
  outfile,
  logLevel: 'silent',
})

const React = require('react')
const { renderToString } = require('react-dom/server')
const AddressBarButtons = require(outfile).default

const clerkState = { isSignedIn: false, isLoaded: true }
globalThis.__clerkState = clerkState

const saveData = {
  currentAddress: '540 N LAKE SHORE DR',
  canonicalAddress: '540 N LAKE SHORE DR',
  isPartOfBuilding: true,
  buildingAddressRange: '536-548 N LAKE SHORE DR',
  additionalStreets: [],
  portfolioAddressRangeRaw: null,
  allPins: ['17101050110000'],
  assessorSqft: 66800,
  assessorUnits: 84,
  yearBuilt: '1929',
  impliedValue: 12000000,
  communityArea: 'NEAR NORTH SIDE',
  propertyClass: '3-18',
}

const props = {
  addressRange: '536-548 N LAKE SHORE DR',
  slug: '540-n-lake-shore-dr',
  isExpanded: false,
  isFullBuildingView: false,
  saveData,
}

function renderState(label, isSignedIn, isLoaded) {
  clerkState.isSignedIn = isSignedIn
  clerkState.isLoaded = isLoaded
  const html = renderToString(React.createElement(AddressBarButtons, props))
  const checks = [
    ['renders non-empty', html.length > 100],
    ['no literal "undefined" text', !html.includes('>undefined<')],
    ['plus icon present', html.includes('x1="12"')],
  ]
  if (!isLoaded) {
    checks.push(['disabled placeholder button', html.includes('disabled')])
  } else if (!isSignedIn) {
    checks.push(['sign-in title present', html.includes('Sign in to add to dashboard')])
  } else {
    checks.push(['add title present', html.includes('Add to dashboard')])
  }
  const failed = checks.filter(([, ok]) => !ok)
  console.log(`[${label}] ${failed.length === 0 ? 'PASS' : 'FAIL'} (${html.length} chars)`)
  for (const [name, ok] of checks) {
    if (!ok) console.log(`   FAILED: ${name}`)
  }
  return failed.length === 0
}

let allPass = true
allPass = renderState('clerk loading', false, false) && allPass
allPass = renderState('signed out', false, true) && allPass
allPass = renderState('signed in', true, true) && allPass

if (!allPass) process.exit(1)
console.log('All render states pass.')
