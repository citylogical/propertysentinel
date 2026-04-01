'use client'

import { useEffect, useState } from 'react'

type Props = {
  isOpen: boolean
  onClose: (didUnsave: boolean) => void
  displayName: string
  canonicalAddress: string
}

export default function UnsavePropertyModal({
  isOpen,
  onClose,
  displayName,
  canonicalAddress,
}: Props) {
  const [unsaving, setUnsaving] = useState(false)

  useEffect(() => {
    if (isOpen) setUnsaving(false)
  }, [isOpen])

  if (!isOpen) return null

  const handleUnsave = async () => {
    setUnsaving(true)
    try {
      const res = await fetch('/api/portfolio/unsave', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ canonical_address: canonicalAddress }),
      })
      const data = await res.json()
      if (data.unsaved) {
        onClose(true)
      } else {
        console.error('Unsave failed:', data.error)
        setUnsaving(false)
      }
    } catch (err) {
      console.error('Unsave error:', err)
      setUnsaving(false)
    }
  }

  return (
    <div className="building-modal-overlay" role="presentation" onClick={(e) => e.stopPropagation()}>
      <div className="building-modal" style={{ maxWidth: 340 }} role="dialog" aria-modal="true" aria-labelledby="unsave-modal-title">
        <button type="button" className="building-modal-x" onClick={() => onClose(false)} aria-label="Close">
          &times;
        </button>
        <div className="building-modal-title" id="unsave-modal-title" style={{ marginBottom: 8 }}>
          {displayName} is saved.
        </div>
        <div className="building-modal-subtitle" style={{ marginBottom: 16 }}>
          Remove this property from your portfolio?
        </div>
        <div className="building-modal-buttons">
          <button
            type="button"
            className="building-modal-btn"
            style={{
              background: '#c0392b',
              color: '#fff',
            }}
            onClick={handleUnsave}
            disabled={unsaving}
          >
            {unsaving ? 'Removing…' : 'Unsave'}
          </button>
          <button type="button" className="building-modal-btn building-modal-btn-outline" onClick={() => onClose(false)}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
