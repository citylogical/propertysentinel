'use client'

/**
 * Settings → 311 complaints. A simple, read-only view of the owner-relevant
 * complaint codes we alert on. Every row is alerts-enabled (checkbox ticked
 * and disabled) for now — unticking is not yet supported. The full reasoning,
 * department breakdown, and enforcement detail live in the linked blog post
 * and on the public /about/311complaints diagram.
 */

type Row = { code: string; name: string; dept: string; median: string }

const ROWS: Row[] = [
  { code: "BBA", name: "Building Violation", dept: "Buildings", median: "18.1 days" },
  { code: "BBC", name: "Plumbing Violation", dept: "Buildings", median: "49 days" },
  { code: "BBD", name: "No Permit / Construction", dept: "Buildings", median: "137.7 days" },
  { code: "BBK", name: "Vacant/Abandoned Bldg", dept: "Buildings", median: "25.6 days" },
  { code: "BPI", name: "Porch Inspection", dept: "Buildings", median: "6.8 days" },
  { code: "NAC", name: "No Air Conditioning", dept: "Buildings", median: "0.6 days" },
  { code: "AAF", name: "Water in Basement", dept: "Water Mgmt", median: "0.1 days" },
  { code: "WBJ", name: "No Water", dept: "Water Mgmt", median: "0.1 days" },
  { code: "WBK", name: "Low Water Pressure", dept: "Water Mgmt", median: "1.5 days" },
  { code: "WCA", name: "Water Quality Concern", dept: "Water Mgmt", median: "4.9 days" },
  { code: "WCA2", name: "Water Lead Test Kit", dept: "Water Mgmt", median: "137 days" },
  { code: "WCA3", name: "Water Lead Test Visit", dept: "Water Mgmt", median: "97.8 days" },
  { code: "WM3", name: "Check for Leak", dept: "Water Mgmt", median: "1.9 days" },
  { code: "AAD", name: "Sewer Cave-In Inspection", dept: "Water Mgmt", median: "26.9 days" },
  { code: "AAI", name: "Alley Sewer Inspection", dept: "Water Mgmt", median: "28.1 days" },
  { code: "SCB", name: "Sanitation Code Violation", dept: "Streets & San", median: "4 days" },
  { code: "SGA", name: "Rodent Baiting / Rat", dept: "Streets & San", median: "3.8 days" },
  { code: "SCX", name: "Recycling Inspection", dept: "Streets & San", median: "10 days" },
  { code: "SCT", name: "Clean Vacant Lot", dept: "Streets & San", median: "6.9 days" },
  { code: "SCP", name: "Weed Removal", dept: "Streets & San", median: "4.9 days" },
  { code: "SDR", name: "Fly Dumping", dept: "Streets & San", median: "5.5 days" },
  { code: "SEC", name: "Tree Emergency", dept: "Streets & San", median: "0.8 days" },
  { code: "HDF", name: "Lead Inspection", dept: "Public Health", median: "1.9 days" },
  { code: "RFC", name: "Renters & Foreclosure", dept: "BACP", median: "22.8 days" },
  { code: "SHVR", name: "Shared Housing / STR", dept: "BACP", median: "5.2 days" },
  { code: "SWSNOREM", name: "Snow — Uncleared Sidewalk", dept: "CDOT", median: "—" },
  { code: "SCSP", name: "Shared Cost Sidewalk", dept: "CDOT", median: "743.6 days" },
  { code: "EAF", name: "Vicious Animal", dept: "Animal Care", median: "0.7 days" },
  { code: "FAC", name: "Commercial Fire Safety", dept: "Fire", median: "11.7 days" },
]

// Blog post URL — update to the live slug when published.
const BLOG_URL = 'https://propertysentinel.io/blog'

export default function SettingsComplaintsTable() {
  return (
    <div>
      <div style={{ fontSize: 13, color: '#555', lineHeight: 1.55, marginBottom: 20, maxWidth: 680 }}>
        These are the owner-relevant Chicago 311 complaints we monitor and alert on for your
        portfolio. For the full department-by-department breakdown and what each one means,{' '}
        <a href={BLOG_URL} style={{ color: '#166534', fontWeight: 500 }}>
          read this post
        </a>
        .
      </div>

      <div
        style={{
          background: '#fff',
          borderRadius: 'var(--card-radius, 8px)',
          boxShadow: 'var(--card-shadow, 0 1px 3px rgba(0,0,0,0.08))',
          overflow: 'hidden',
        }}
      >
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: '#243f5e', color: '#fff' }}>
              <th style={thStyle}>Alerts</th>
              <th style={{ ...thStyle, textAlign: 'left' }}>Code</th>
              <th style={{ ...thStyle, textAlign: 'left' }}>Complaint Type</th>
              <th style={{ ...thStyle, textAlign: 'left' }}>Department</th>
              <th style={{ ...thStyle, textAlign: 'right' }}>Median to close</th>
            </tr>
          </thead>
          <tbody>
            {ROWS.map((r, i) => (
              <tr
                key={r.code}
                style={{ borderTop: i === 0 ? 'none' : '1px solid #ece8df' }}
              >
                <td style={{ ...tdStyle, textAlign: 'center', width: 64 }}>
                  <input
                    type="checkbox"
                    checked
                    disabled
                    aria-label={`Alerts enabled for ${r.code}`}
                    style={{ accentColor: '#166534', cursor: 'not-allowed' }}
                  />
                </td>
                <td style={{ ...tdStyle, fontFamily: 'DM Mono, ui-monospace, monospace', fontSize: 12, color: '#1a2230' }}>
                  {r.code}
                </td>
                <td style={{ ...tdStyle, color: '#2a3340' }}>{r.name}</td>
                <td style={{ ...tdStyle, color: '#5a6470' }}>{r.dept}</td>
                <td style={{ ...tdStyle, textAlign: 'right', color: '#5a6470', fontVariantNumeric: 'tabular-nums' }}>
                  {r.median}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ fontSize: 11, color: '#9aa3ad', marginTop: 10, fontStyle: 'italic' }}>
        Median days-to-close over the trailing 365 days. Alerts are enabled for all
        owner-relevant codes; per-code toggles are coming soon.
      </div>
    </div>
  )
}

const thStyle: React.CSSProperties = {
  padding: '11px 16px',
  fontFamily: 'DM Mono, ui-monospace, monospace',
  fontSize: 10,
  fontWeight: 600,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  textAlign: 'center',
}

const tdStyle: React.CSSProperties = {
  padding: '9px 16px',
  verticalAlign: 'middle',
}