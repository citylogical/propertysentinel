'use client'

import { useEffect, useRef, useState } from 'react'
import type { PropertyTypeLabel } from '@/lib/property-type'

const SKELETON_MIN_MS = 250

export type DossierRevealProps = {
  /** Property type label that determines which variant renders */
  propertyType: PropertyTypeLabel | null | undefined
  /** Skip-traced person name (residential/apartment) OR business entity / association name (condo/commercial/exempt) */
  ownerName: string
  /** Phone number — null for condo/commercial/exempt where no phone exists */
  phone: string | null
  /** Email — null when Tracerfy returned no email or for non-residential variants */
  email: string | null
  /** Mailing address (commercial/exempt show this; residential/apartment do not) */
  mailingAddress: string | null
  /** Multi-owner buildings: total PIN count and distinct taxpayer count */
  unitCount?: number | null
  taxpayerCount?: number | null
  /** Number of additional units this individual landlord owns (apartment variant only) */
  landlordUnitCount?: number | null
  /** Tracerfy skipped — show directory-style header without PIN counts */
  multiOwnerDirectoryOnly?: boolean
  /** Called when user clicks "See All Info" — opens property page or contacts modal */
  onSeeAllInfo: () => void
}

export default function DossierReveal(props: DossierRevealProps) {
  const [phase, setPhase] = useState<'loading' | 'revealing' | 'done'>('loading')
  const [skeletonTimeElapsed, setSkeletonTimeElapsed] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const prevPhaseRef = useRef(phase)

  const isMultiOwnerVariant =
    props.propertyType === 'condo_building' ||
    props.propertyType === 'commercial' ||
    props.propertyType === 'exempt'

  useEffect(() => {
    const t1 = setTimeout(() => {
      setSkeletonTimeElapsed(true)
    }, SKELETON_MIN_MS)
    return () => clearTimeout(t1)
  }, [])

  useEffect(() => {
    if (phase !== 'loading') return
    if (!skeletonTimeElapsed) return
    if (!props.ownerName || props.ownerName.trim() === '') return
    setPhase('revealing')
  }, [phase, skeletonTimeElapsed, props.ownerName])

  useEffect(() => {
    const enteredRevealing = prevPhaseRef.current === 'loading' && phase === 'revealing'
    prevPhaseRef.current = phase
    if (!enteredRevealing) return
    if (!containerRef.current) return

    const root = containerRef.current
    const timers: ReturnType<typeof setTimeout>[] = []

    const schedule = (selector: string, delay: number) => {
      timers.push(
        setTimeout(() => {
          const el = root.querySelector(selector)
          if (el) el.classList.add('show')
        }, delay)
      )
    }

    const stagger: Array<[string, number]> = [
      ['.dossier-label', 30],
      ['.dossier-name', 130],
    ]

    if (isMultiOwnerVariant) {
      const hasCount =
        props.propertyType === 'condo_building' &&
        props.unitCount != null &&
        props.unitCount > 0 &&
        props.taxpayerCount != null &&
        props.taxpayerCount > 0
      if (hasCount) stagger.push(['.dossier-count', 250])
      if (props.mailingAddress) stagger.push(['.dossier-address', hasCount ? 380 : 250])
    } else {
      if (props.phone) stagger.push(['.dossier-phone', 250])
      if (props.email) stagger.push(['.dossier-email', props.phone ? 380 : 250])
    }

    for (const [sel, ms] of stagger) schedule(sel, ms)

    timers.push(
      setTimeout(() => {
        const footer = root.querySelector('.dossier-footer')
        if (footer) footer.classList.add('show')
      }, 530)
    )
    timers.push(
      setTimeout(() => {
        setPhase('done')
      }, 700)
    )

    return () => {
      for (const t of timers) clearTimeout(t)
    }
  }, [phase, isMultiOwnerVariant, props.phone, props.email, props.mailingAddress, props.propertyType, props.unitCount, props.taxpayerCount])

  const getStatus = (): { text: string; cls: string } => {
    if (phase === 'loading') {
      return { text: 'Retrieving owner record', cls: '' }
    }
    if (props.propertyType === 'condo_building') {
      if (props.unitCount != null && props.unitCount > 0) {
        return {
          text: `${props.unitCount} unit owners on file`,
          cls: 'multi-owner',
        }
      }
      if (props.multiOwnerDirectoryOnly) {
        return { text: 'Unit owners on file', cls: 'multi-owner' }
      }
      return { text: 'Unit owners on file', cls: 'multi-owner' }
    }
    if (props.propertyType === 'commercial') {
      return { text: 'Business entity identified', cls: 'multi-owner' }
    }
    if (props.propertyType === 'exempt') {
      return { text: 'Tax-exempt institution', cls: 'multi-owner' }
    }
    return { text: 'Owner verified', cls: 'verified' }
  }

  const getOwnerLabel = (): string => {
    if (props.propertyType === 'condo_building') return 'Condominium association'
    if (props.propertyType === 'commercial') return 'Tax assessor — business entity'
    if (props.propertyType === 'exempt') return 'Institutional owner'
    if (
      props.propertyType === 'apartment' &&
      props.landlordUnitCount &&
      props.landlordUnitCount > 1
    ) {
      return `Skip-traced owner · ${props.landlordUnitCount} units`
    }
    return 'Skip-traced owner'
  }

  const status = getStatus()

  if (phase === 'loading') {
    return (
      <div className="dossier" ref={containerRef}>
        <div className="dossier-status">
          <span>
            <span className="blink"></span>
            {status.text}
          </span>
        </div>
        <div className="dossier-skel-row">
          <div className="dossier-skel-bar name"></div>
          <div className="dossier-skel-bar phone"></div>
          {!isMultiOwnerVariant && props.email ? <div className="dossier-skel-bar email"></div> : null}
        </div>
      </div>
    )
  }

  const showCondoCount =
    props.propertyType === 'condo_building' &&
    props.unitCount != null &&
    props.unitCount > 0 &&
    props.taxpayerCount != null &&
    props.taxpayerCount > 0

  return (
    <div className="dossier revealed" ref={containerRef}>
      <div className={`dossier-status ${status.cls}`}>
        <span>{status.text}</span>
      </div>

      <div className="dossier-label">{getOwnerLabel()}</div>
      <div className="dossier-name">{props.ownerName || '—'}</div>

      {isMultiOwnerVariant ? (
        <>
          {showCondoCount ? (
            <div className="dossier-count">
              {props.unitCount} unit owners · {props.taxpayerCount} unique taxpayers
            </div>
          ) : null}
          {props.mailingAddress ? <div className="dossier-address">{props.mailingAddress}</div> : null}
        </>
      ) : (
        <>
          {props.phone ? <div className="dossier-phone">{props.phone}</div> : null}
          {props.email ? <div className="dossier-email">{props.email}</div> : null}
        </>
      )}

      <div className="dossier-footer">
        <button
          type="button"
          className="dossier-see-all"
          onClick={(e) => {
            e.stopPropagation()
            props.onSeeAllInfo()
          }}
        >
          See All Info →
        </button>
      </div>
    </div>
  )
}
