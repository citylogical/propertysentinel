import Link from 'next/link'
import HomeSearch from './components/HomeSearch'

export default function Home() {
  return (
    <main className="min-h-screen" style={{ backgroundColor: '#F5F5F5' }}>
      {/* Header */}
      <header style={{ backgroundColor: '#003366' }} className="px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex flex-col gap-0.5">
            <span className="text-white font-semibold text-xl"
              style={{ fontFamily: 'Georgia, serif' }}>
              Property Sentinel
            </span>
            <span
              className="self-end inline-block px-3 py-1 rounded text-sm font-semibold text-white"
              style={{ backgroundColor: '#C8102E', fontFamily: 'Georgia, serif' }}
            >
              by City Logical
            </span>
          </div>
          <nav className="flex items-center gap-6">
            <Link href="/about"
              className="text-slate-300 hover:text-white text-sm transition-colors">
              About
            </Link>
            <Link href="/signup"
              className="px-4 py-2 rounded text-sm font-semibold text-white transition-colors"
              style={{ backgroundColor: '#C8102E' }}>
              Get Started
            </Link>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section className="max-w-6xl mx-auto px-6 py-24 text-center">
        <h1 className="text-5xl font-bold mb-6"
          style={{ color: '#003366', fontFamily: 'Georgia, serif' }}>
          Know what the city knows<br />about your property.
        </h1>
        <p className="text-xl text-slate-600 mb-12 max-w-2xl mx-auto">
          Real-time 311 complaints, building violations, permit history,
          and STR compliance — monitored automatically for every Chicago property.
        </p>

        {/* Search Bar */}
        <HomeSearch apiKey={process.env.NEXT_PUBLIC_GOOGLE_PLACES_KEY} />
      </section>

      {/* Three value props */}
      <section className="max-w-6xl mx-auto px-6 pb-24">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div className="bg-white rounded-xl p-8 shadow-sm">
            <div className="text-3xl mb-4">🔔</div>
            <h3 className="font-bold text-lg mb-2"
              style={{ color: '#003366', fontFamily: 'Georgia, serif' }}>
              Instant Alerts
            </h3>
            <p className="text-slate-500 text-sm">
              Get notified the moment a 311 complaint is filed against
              your property — before the inspector arrives.
            </p>
          </div>
          <div className="bg-white rounded-xl p-8 shadow-sm">
            <div className="text-3xl mb-4">🏠</div>
            <h3 className="font-bold text-lg mb-2"
              style={{ color: '#003366', fontFamily: 'Georgia, serif' }}>
              STR Compliance
            </h3>
            <p className="text-slate-500 text-sm">
              Monitor BACP registration status, SHUOL license expiration,
              and Prohibited Buildings List in real time.
            </p>
          </div>
          <div className="bg-white rounded-xl p-8 shadow-sm">
            <div className="text-3xl mb-4">📊</div>
            <h3 className="font-bold text-lg mb-2"
              style={{ color: '#003366', fontFamily: 'Georgia, serif' }}>
              Property Health Score
            </h3>
            <p className="text-slate-500 text-sm">
              A single score combining complaints, violations, permits,
              and compliance history for any Chicago address.
            </p>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer style={{ backgroundColor: '#003366' }} className="px-6 py-8">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <span className="text-slate-400 text-sm">
            © 2026 City Logical
          </span>
          <span className="text-slate-400 text-sm">
            Chicago, IL
          </span>
        </div>
      </footer>
    </main>
  )
}