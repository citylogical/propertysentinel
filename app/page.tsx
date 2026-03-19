import HomeSearch from './components/HomeSearch'
import HowItWorks from './components/HowItWorks'
import LiveTimestamp from './components/LiveTimestamp'
import LandingNav from './components/LandingNav'

export default function Home() {
  return (
    <>
      <LandingNav apiKey={process.env.NEXT_PUBLIC_GOOGLE_PLACES_KEY} />

      <section className="landing-hero">
        <div className="hero-inner">
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