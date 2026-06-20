import type { Metadata } from 'next'
import ComplaintFlowDiagram from './ComplaintFlowDiagram'

export const metadata: Metadata = {
  title: 'Owner-Relevant 311 Complaints — Property Sentinel',
  description:
    'Every Chicago 311 service-request type, grouped by the department that owns it, whether it carries citizen or city responsibility, and whether a property owner needs to act on it.',
}

export default function PublicComplaintFlowPage() {
  return (
    <div style={{ width: '100%', padding: '20px 32px 40px' }}>
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
        Owner-relevant 311 complaints
      </h1>
      <div style={{ fontSize: 13, color: '#888', marginTop: 8, marginBottom: 24, maxWidth: 820 }}>
        Every Chicago 311 service-request type, grouped by the department that owns it, whether it
        carries citizen or city responsibility, and whether it&apos;s something a property owner
        needs to act on. Owner-relevant codes show the enforcement exposure and the Municipal Code
        section behind it.
      </div>
      <ComplaintFlowDiagram isAdmin={false} />
    </div>
  )
}
