import HomeSearch from './components/HomeSearch'
import HowItWorks from './components/HowItWorks'
import LiveTimestamp from './components/LiveTimestamp'

export default function Home() {
  return (
    <div className="landing-page homepage home-container homepage-wrapper">
      <section className="landing-hero">
        <div className="hero-inner">
          <h1 className="hero-headline">
            Know what the city
            <br />
            knows. <em>First.</em>
          </h1>

          <p className="hero-sub text-center leading-tight">
            Property records, public listings, and <LiveTimestamp />…finally combined into real-time alerts and analytics for every Chicago address
          </p>

          <HomeSearch apiKey={process.env.NEXT_PUBLIC_GOOGLE_PLACES_KEY} />
        </div>
      </section>

      <HowItWorks />

      <footer className="landing-footer">City Logical LLC &nbsp; © 2026</footer>
    </div>
  )
}