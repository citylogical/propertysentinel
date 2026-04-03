import { auth } from '@clerk/nextjs/server'
import PortfolioTable from './PortfolioTable'

export const metadata = {
  title: 'Property Sentinel — Portfolio',
}

export default async function PortfolioPage() {
  const { userId } = await auth()

  return (
    <div className="address-page">
      <div className="prop-page-shell">
        <div className="prop-main-content">
          {userId ? (
            <PortfolioTable />
          ) : (
            <div style={{ textAlign: 'center', padding: '80px 24px', color: '#8a94a0' }}>
              <div style={{ fontSize: '14px', fontWeight: 500, color: '#0f2744', marginBottom: 8 }}>
                No saved properties yet
              </div>
              <div style={{ fontSize: '13px', lineHeight: 1.6 }}>
                Search for a Chicago address and click the bookmark icon to save it to your portfolio.
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
