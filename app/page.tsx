import Link from 'next/link'
import { Suspense } from 'react'
import HomeSearch from './components/HomeSearch'
import HowItWorks from './components/HowItWorks'
import LiveTimestamp from './components/LiveTimestamp'
import AuthErrorBanner from './components/AuthErrorBanner'
import AuthCodeRedirect from './components/AuthCodeRedirect'

export default function Home() {
  return (
    <>
      <Suspense fallback={null}>
        <AuthCodeRedirect />
      </Suspense>
      <nav className="landing-nav">
        <Link className="nav-brand" href="/">
          Property Sentinel
        </Link>
        <button type="button" className="nav-menu-btn" aria-label="Menu">
          <span />
          <span />
          <span />
        </button>
      </nav>

      <section className="landing-hero">
        <div className="hero-inner">
          <Suspense fallback={null}>
            <AuthErrorBanner />
          </Suspense>
          <h1 className="hero-headline">
            Know what the city
            <br />
            knows. <em>First.</em>
          </h1>

          <p className="hero-sub text-center leading-tight">
            Public property records and <LiveTimestamp /> …finally combined into real-time alerts and analytics for every Chicago property.
          </p>

          <HomeSearch apiKey={process.env.NEXT_PUBLIC_GOOGLE_PLACES_KEY} />
        </div>
      </section>

      <HowItWorks />

      <footer className="landing-footer">City Logical LLC &nbsp; © 2026</footer>
    </>
  )
}