import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import PortfolioTable from './PortfolioTable'

export const metadata = {
  title: 'Property Sentinel — Portfolio',
}

export default async function PortfolioPage() {
  const { userId } = await auth()

  if (!userId) {
    redirect('/sign-in')
  }

  return (
    <div className="address-page">
      <div className="prop-page-shell">
        <div className="prop-main-content">
          <PortfolioTable />
        </div>
      </div>
    </div>
  )
}
