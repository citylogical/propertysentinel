import type { Metadata } from 'next'
import LeadsClient from './LeadsClient'

export const metadata: Metadata = {
  title: '311 Service Leads — Property Sentinel',
  description: 'Recent 311 complaints by trade category. Unlock contact info to claim a lead.',
}

export default function LeadsPage() {
  return <LeadsClient />
}
