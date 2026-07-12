'use client'

import { useRef, useState } from 'react'
import { createPortal } from 'react-dom'

type Props = {
  isOpen: boolean
  onClose: () => void
}

export default function AddPropertyModal({ isOpen, onClose }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [dragOver, setDragOver] = useState(false)

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

  const handOffFile = (file: File) => {
    onClose()
    // Defer so this modal unmounts before the import modal opens.
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent('ps:open-import', { detail: { file } }))
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

          <div
            className={`addprop-half addprop-drop${dragOver ? ' addprop-drop-over' : ''}`}
            onDragOver={(e) => {
              e.preventDefault()
              setDragOver(true)
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault()
              setDragOver(false)
              const file = e.dataTransfer.files?.[0]
              if (file) handOffFile(file)
            }}
          >
            <div className="addprop-half-title">Have a portfolio?</div>
            <div className="addprop-half-sub">Drop in your rent roll — we&apos;ll pull out every address.</div>
            <button
              type="button"
              className="addprop-import-btn"
              onClick={() => fileInputRef.current?.click()}
            >
              Upload your rent roll
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.xlsx,.xls"
              style={{ display: 'none' }}
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) handOffFile(file)
                e.target.value = ''
              }}
            />
            <div className="addprop-import-note">
              CSV or Excel, any format. Prefer email? jim@propertysentinel.io
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body
  )
}
