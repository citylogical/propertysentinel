'use client'

import { useEffect, useRef } from 'react'

export default function HowItWorks() {
  const stepsRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const steps = stepsRef.current?.querySelectorAll('[data-step]')
    if (!steps?.length) return

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry, i) => {
          if (entry.isIntersecting) {
            setTimeout(() => entry.target.classList.add('visible'), i * 120)
            observer.unobserve(entry.target)
          }
        })
      },
      { threshold: 0.15 }
    )

    steps.forEach((el) => observer.observe(el))
    return () => observer.disconnect()
  }, [])

  return (
    <section className="how-section">
      <div className="how-inner">
        <div className="how-kicker">How it works</div>
        <div className="how-steps" ref={stepsRef}>
          <div className="how-step" data-step>
            <span className="step-label step-label-analyze">Analyze</span>
            <p className="step-body">
              20+ years of all public records on any Chicago address, <em>assembled in one place.</em>
            </p>
          </div>
          <div className="how-step" data-step>
            <span className="step-label step-label-monitor">Monitor</span>
            <p className="step-body">
              We track every city feed 24/7 with pattern detection <em>to predict what comes next.</em>
            </p>
          </div>
          <div className="how-step" data-step>
            <span className="step-label step-label-protect">Protect</span>
            <p className="step-body">
              You get a text the moment something changes. <em>Before the inspector knocks.</em>
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}
