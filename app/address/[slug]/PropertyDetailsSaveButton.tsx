'use client'

export default function PropertyDetailsSaveButton() {
  return (
    <button
      type="button"
      title="Save property"
      style={{
        background: 'none',
        border: 'none',
        cursor: 'pointer',
        padding: 2,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        opacity: 0.7,
        transition: 'opacity 0.15s',
        flexShrink: 0,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.opacity = '1'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.opacity = '0.7'
      }}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.45)" strokeWidth="2">
        <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
      </svg>
    </button>
  )
}
