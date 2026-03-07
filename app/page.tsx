import Link from 'next/link'
import HomeSearch from './components/HomeSearch'
import HowItWorks from './components/HowItWorks'
import LiveTimestamp from './components/LiveTimestamp'

export default function Home() {
  return (
    <>
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
          <h1 className="hero-headline">
            Know what the city
            <br />
            knows. <em>First.</em>
          </h1>

          <div className="text-center">
            <p className="hero-sub mb-0">Public property records and <LiveTimestamp /></p>
            <p className="hero-sub">…finally combined into real-time alerts and analytics for every Chicago property.</p>
          </div>

          <HomeSearch apiKey={process.env.NEXT_PUBLIC_GOOGLE_PLACES_KEY} />
        </div>
      </section>

      <HowItWorks />

      <footer className="landing-footer">City Logical LLC &nbsp; © 2026</footer>
    </>
  )
}