'use client'

import { createPortal } from 'react-dom'

type Props = {
  isOpen: boolean
  onClose: () => void
}

export default function AddPropertyModal({ isOpen, onClose }: Props) {
  if (!isOpen) return null
  if (typeof window === 'undefined') return null

  const triggerSearch = () => {
    onClose()
    // Defer so the modal unmounts before the sidebar search opens.
    setTimeout(() => {
      window.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true })
      )
    }, 0)
  }

  return createPortal(
    <div className="addprop-backdrop" onClick={onClose} role="presentation">
      <div
        className="addprop-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Add a property"
      >
        <button type="button" className="addprop-close" onClick={onClose} aria-label="Close">
          &times;
        </button>

        <div className="addprop-split">
          <div className="addprop-half">
            <div className="addprop-half-title">Search for an address</div>
            <div className="addprop-half-sub">Find any Chicago property and save it to your dashboard.</div>
            <button type="button" className="addprop-search-btn" onClick={triggerSearch}>
              Search an address
            </button>
          </div>

          <div className="addprop-divider" aria-hidden="true" />

          <div className="addprop-half">
            <div className="addprop-half-title">Have a portfolio?</div>
            <div className="addprop-half-sub">Add many properties at once.</div>
            <a
              className="addprop-import-btn"
              href="mailto:jim@propertysentinel.io?subject=Address%20import"
            >
              Email us your list
            </a>
            <div className="addprop-import-note">
              Email a rent roll in any format to jim@propertysentinel.io
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body
  )
}
