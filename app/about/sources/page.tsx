import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Data Sources — Property Sentinel',
  description:
    'Every public dataset Property Sentinel monitors, with links to the original source and how often we refresh it.',
}

type Source = {
  name: string
  url: string
  note?: string
  refresh: string
}

type Category = {
  heading: string
  sources: Source[]
}

const CATEGORIES: Category[] = [
  {
    heading: 'City activity',
    sources: [
      {
        name: '311 service requests',
        url: 'https://data.cityofchicago.org/d/v6vf-nfxy',
        note: 'Chicago Data Portal',
        refresh: 'Every 30 minutes',
      },
      {
        name: 'CHI 311 service portal',
        url: 'https://311.chicago.gov',
        note: 'Complaint narratives, intake detail, and workflow timelines',
        refresh: 'Continuous',
      },
      {
        name: 'Building violations',
        url: 'https://data.cityofchicago.org/d/22u3-xenr',
        note: 'Chicago Data Portal',
        refresh: 'Daily',
      },
      {
        name: 'Building permits',
        url: 'https://data.cityofchicago.org/d/ydr8-5enu',
        note: 'Chicago Data Portal',
        refresh: 'Daily',
      },
    ],
  },
  {
    heading: 'Cook County parcels',
    sources: [
      {
        name: 'Parcel universe',
        url: 'https://datacatalog.cookcountyil.gov/d/nj4t-kc8j',
        note: 'Cook County Data Portal',
        refresh: 'Periodic',
      },
      {
        name: 'Assessed values',
        url: 'https://datacatalog.cookcountyil.gov/d/uzyt-m557',
        note: 'Cook County Data Portal',
        refresh: 'Periodic',
      },
      {
        name: 'Parcel sales',
        url: 'https://datacatalog.cookcountyil.gov/d/wvhk-k5uv',
        note: 'Cook County Data Portal',
        refresh: 'Periodic',
      },
      {
        name: 'Parcel addresses',
        url: 'https://datacatalog.cookcountyil.gov/d/3723-97qp',
        note: 'Cook County Data Portal',
        refresh: 'Periodic',
      },
      {
        name: 'Residential property characteristics',
        url: 'https://datacatalog.cookcountyil.gov/d/x54s-btds',
        note: 'Cook County Data Portal',
        refresh: 'Periodic',
      },
      {
        name: 'Condominium unit characteristics',
        url: 'https://datacatalog.cookcountyil.gov/d/3r7i-mrz4',
        note: 'Cook County Data Portal',
        refresh: 'Periodic',
      },
      {
        name: 'Commercial property characteristics',
        url: 'https://datacatalog.cookcountyil.gov/d/csik-bsws',
        note: 'Cook County Data Portal',
        refresh: 'Periodic',
      },
      {
        name: 'Exempt parcel characteristics',
        url: 'https://datacatalog.cookcountyil.gov/d/vgzx-68gb',
        note: 'Cook County Data Portal',
        refresh: 'Periodic',
      },
    ],
  },
  {
    heading: 'Subsidized housing',
    sources: [
      {
        name: 'HUD active multifamily portfolio',
        url: 'https://www.hud.gov/program_offices/housing/mfh/exp/mfhdiscl',
        note: 'U.S. Department of Housing and Urban Development',
        refresh: 'Periodic',
      },
      {
        name: 'HUD multifamily assistance and Section 8 contracts',
        url: 'https://www.hud.gov/program_offices/housing/mfh/exp/mfhdiscl',
        note: 'U.S. Department of Housing and Urban Development',
        refresh: 'Periodic',
      },
      {
        name: 'Affordable rental housing developments',
        url: 'https://data.cityofchicago.org/d/s6ha-ppgi',
        note: 'Chicago Data Portal',
        refresh: 'Periodic',
      },
      {
        name: 'Foreclosed rental property registrations (Keep Chicago Renting Ordinance)',
        url: 'https://data.cityofchicago.org/d/yhcw-iu53',
        note: 'Chicago Data Portal',
        refresh: 'Periodic',
      },
    ],
  },
  {
    heading: 'Short-term and vacation rentals',
    sources: [
      {
        name: 'Shared housing unit registrations',
        url: 'https://data.cityofchicago.org/d/qfyy-956j',
        note: 'Chicago Data Portal',
        refresh: 'Daily',
      },
      {
        name: 'Prohibited buildings list',
        url: 'https://data.cityofchicago.org/d/7bzs-jsyj',
        note: 'Chicago Data Portal',
        refresh: 'Periodic',
      },
      {
        name: 'Restricted residential zone precincts',
        url: 'https://data.cityofchicago.org/d/8eww-pamb',
        note: 'Chicago Data Portal',
        refresh: 'Periodic',
      },
      {
        name: 'Inside Airbnb (Chicago)',
        url: 'https://insideairbnb.com/get-the-data/',
        note: 'Independent listing snapshots',
        refresh: 'Quarterly snapshots',
      },
    ],
  },
  {
    heading: 'Geography',
    sources: [
      {
        name: 'Neighborhood boundaries',
        url: 'https://data.cityofchicago.org/d/y6yq-dbs2',
        note: 'Chicago Data Portal',
        refresh: 'Static',
      },
    ],
  },
]

export default function DataSourcesPage() {
  return (
    <div style={{ width: '100%', maxWidth: 820, padding: '20px 32px 60px' }}>
      <h1
        style={{
          fontFamily: 'Merriweather, Georgia, serif',
          fontSize: 28,
          fontWeight: 600,
          color: '#1a1a1a',
          margin: 0,
          lineHeight: 1.2,
        }}
      >
        Data sources
      </h1>
      <div style={{ fontSize: 13, color: '#888', marginTop: 8, marginBottom: 8 }}>
        Every dataset Property Sentinel monitors, the original source it comes from, and how often
        we refresh it. Sources marked periodic are reloaded as the publisher issues updates.
      </div>
      {CATEGORIES.map((cat) => (
        <section key={cat.heading} style={{ marginTop: 28 }}>
          <h2
            style={{
              fontFamily: 'Merriweather, Georgia, serif',
              fontSize: 18,
              fontWeight: 600,
              color: '#1a1a1a',
              margin: 0,
            }}
          >
            {cat.heading}
          </h2>
          <ul style={{ listStyle: 'none', margin: '10px 0 0', padding: 0 }}>
            {cat.sources.map((s) => (
              <li
                key={s.name + s.url}
                style={{
                  padding: '8px 0',
                  borderBottom: '1px solid #e5e1d6',
                  fontSize: 14,
                  color: '#1a1a1a',
                }}
              >
                <a
                  href={s.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: '#0f2744', textDecoration: 'underline' }}
                >
                  {s.name}
                </a>
                {s.note ? <span style={{ color: '#888' }}> — {s.note}</span> : null}
                <span
                  style={{
                    float: 'right',
                    fontFamily: '"DM Mono", monospace',
                    fontSize: 11,
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    color: '#888',
                  }}
                >
                  {s.refresh}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}
