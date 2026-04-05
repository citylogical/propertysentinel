'use client'

import { useState, useRef, useEffect, useCallback, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

type Props = {
  children: ReactNode
  content: ReactNode
  variant?: 'navy' | 'red'
  width?: number
}

export default function HoverTooltip({ children, content, variant = 'navy', width = 280 }: Props) {
  const [visible, setVisible] = useState(false)
  const [position, setPosition] = useState({ top: 0, left: 0 })
  const [mounted, setMounted] = useState(false)
  const triggerRef = useRef<HTMLSpanElement>(null)

  useEffect(() => setMounted(true), [])

  const updatePosition = useCallback(() => {
    if (!triggerRef.current) return
    const rect = triggerRef.current.getBoundingClientRect()
    const tooltipWidth = width
    const viewportWidth = window.innerWidth

    let left = rect.left + rect.width / 2 - tooltipWidth / 2
    left = Math.max(8, Math.min(left, viewportWidth - tooltipWidth - 8))

    const top = rect.bottom + 8
    setPosition({ top, left })
  }, [width])

  function handleMouseEnter() {
    updatePosition()
    setVisible(true)
  }

  function handleMouseLeave() {
    setVisible(false)
  }

  useEffect(() => {
    if (!visible) return
    const handler = () => updatePosition()
    window.addEventListener('scroll', handler, true)
    window.addEventListener('resize', handler)
    return () => {
      window.removeEventListener('scroll', handler, true)
      window.removeEventListener('resize', handler)
    }
  }, [visible, updatePosition])

  const bgColor = variant === 'red' ? '#7f1d1d' : '#0f2744'
  const textColor = variant === 'red' ? '#fef2f2' : '#f2f0eb'
  const shadowColor = variant === 'red' ? 'rgba(127, 29, 29, 0.3)' : 'rgba(15, 39, 68, 0.25)'

  const triggerRect = triggerRef.current?.getBoundingClientRect()
  const arrowLeft = triggerRect ? triggerRect.left + triggerRect.width / 2 - position.left : width / 2

  return (
    <>
      <span
        ref={triggerRef}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        style={{
          display: 'inline-block',
          cursor: 'help',
        }}
      >
        {children}
      </span>

      {mounted &&
        visible &&
        createPortal(
          <div
            style={{
              position: 'fixed',
              top: position.top,
              left: position.left,
              width: `${width}px`,
              background: bgColor,
              color: textColor,
              fontFamily: "'Inter', sans-serif",
              fontSize: '11px',
              fontWeight: 400,
              lineHeight: 1.5,
              letterSpacing: 0,
              textTransform: 'none',
              padding: '10px 14px',
              borderRadius: '4px',
              boxShadow: `0 4px 12px ${shadowColor}`,
              textAlign: 'left',
              pointerEvents: 'none',
              zIndex: 9999,
            }}
          >
            <div
              style={{
                position: 'absolute',
                bottom: '100%',
                left: `${arrowLeft}px`,
                transform: 'translateX(-50%)',
                width: 0,
                height: 0,
                borderLeft: '5px solid transparent',
                borderRight: '5px solid transparent',
                borderBottom: `5px solid ${bgColor}`,
              }}
            />
            {content}
          </div>,
          document.body
        )}
    </>
  )
}
