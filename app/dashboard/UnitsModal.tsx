'use client'

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
} from 'react'
import { createPortal } from 'react-dom'
import type { PortfolioUnit } from './types'

type Props = {
  isOpen: boolean
  onClose: () => void
  propertyDisplayName: string
  units: PortfolioUnit[]
  /** Called after any successful edit so the parent can refresh detail/list. */
  onUnitsChanged?: () => void
}

type DiscoveryEntry = { name: string; count: number }
type FieldKey = 'tag' | 'status'

function formatDate(s: string | null): string {
  if (!s) return '—'
  const d = new Date(s)
  if (Number.isNaN(d.getTime())) return s
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function formatRent(n: number | null): string {
  if (n == null || !Number.isFinite(n)) return '—'
  return `$${n.toLocaleString()}`
}

export default function UnitsModal({
  isOpen,
  onClose,
  propertyDisplayName,
  units: unitsProp,
  onUnitsChanged,
}: Props) {
  // Local copy so we can do optimistic updates without waiting for parent re-render
  const [units, setUnits] = useState<PortfolioUnit[]>(unitsProp)
  const [tagOptions, setTagOptions] = useState<DiscoveryEntry[]>([])
  const [statusOptions, setStatusOptions] = useState<DiscoveryEntry[]>([])
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [editing, setEditing] = useState<{ unitId: string; field: FieldKey } | null>(null)
  const [bulkEditing, setBulkEditing] = useState<FieldKey | null>(null)
  const [saving, setSaving] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  // Sync local units with prop on (re)open
  useEffect(() => {
    if (!isOpen) return
    setUnits(unitsProp)
    setSelectedIds(new Set())
    setEditing(null)
    setBulkEditing(null)
    setErrorMsg(null)
  }, [isOpen, unitsProp])

  // Fetch tag/status discovery
  useEffect(() => {
    if (!isOpen) return
    let cancelled = false
    fetch('/api/dashboard/units/tags')
      .then((r) => r.json())
      .then((data: { tags?: DiscoveryEntry[]; statuses?: DiscoveryEntry[]; error?: string }) => {
        if (cancelled) return
        if (data.error) return
        setTagOptions(data.tags ?? [])
        setStatusOptions(data.statuses ?? [])
      })
      .catch(() => {
        /* dropdowns work with empty discovery */
      })
    return () => {
      cancelled = true
    }
  }, [isOpen])

  // Esc to close
  useEffect(() => {
    if (!isOpen) return
    const h = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape' && !editing && !bulkEditing) onClose()
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [isOpen, onClose, editing, bulkEditing])

  // Body scroll lock
  useEffect(() => {
    if (!isOpen) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [isOpen])

  const sortedUnits = useMemo(() => {
    return [...units].sort((a, b) => {
      const al = a.unit_label ?? ''
      const bl = b.unit_label ?? ''
      return al.localeCompare(bl, undefined, { numeric: true, sensitivity: 'base' })
    })
  }, [units])

  const allSelected = sortedUnits.length > 0 && selectedIds.size === sortedUnits.length

  const toggleRow = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleAll = () => {
    setSelectedIds(allSelected ? new Set() : new Set(sortedUnits.map((u) => u.id)))
  }

  // Per-field optimistic save
  const saveField = useCallback(
    async (unitId: string, field: FieldKey, value: string | null) => {
      const original = units.find((u) => u.id === unitId)
      const prevValue = (original?.[field] as string | null | undefined) ?? null
      if (value === prevValue) return

      setSaving(true)
      setErrorMsg(null)

      // optimistic
      setUnits((prev) => prev.map((u) => (u.id === unitId ? { ...u, [field]: value } : u)))

      try {
        const res = await fetch('/api/dashboard/unit/update', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ unit_id: unitId, patch: { [field]: value ?? '' } }),
        })
        if (!res.ok) {
          const j = (await res.json()) as { error?: string }
          throw new Error(j.error || 'Save failed')
        }
        // refresh discovery (counts may have shifted)
        void fetch('/api/dashboard/units/tags')
          .then((r) => r.json())
          .then((d: { tags?: DiscoveryEntry[]; statuses?: DiscoveryEntry[] }) => {
            setTagOptions(d.tags ?? [])
            setStatusOptions(d.statuses ?? [])
          })
          .catch(() => {})
        if (onUnitsChanged) onUnitsChanged()
      } catch (err) {
        // rollback
        setUnits((prev) => prev.map((u) => (u.id === unitId ? { ...u, [field]: prevValue } : u)))
        setErrorMsg(err instanceof Error ? err.message : 'Save failed')
      } finally {
        setSaving(false)
      }
    },
    [units, onUnitsChanged]
  )

  // Bulk save
  const saveBulk = useCallback(
    async (field: FieldKey, value: string | null) => {
      if (selectedIds.size === 0) return
      const ids = Array.from(selectedIds)
      const prevSnapshot = new Map(units.map((u) => [u.id, u[field] as string | null | undefined]))

      setSaving(true)
      setErrorMsg(null)

      // optimistic
      setUnits((prev) =>
        prev.map((u) => (selectedIds.has(u.id) ? { ...u, [field]: value } : u))
      )

      try {
        const res = await fetch('/api/dashboard/units/bulk-update', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ unit_ids: ids, patch: { [field]: value ?? '' } }),
        })
        if (!res.ok) {
          const j = (await res.json()) as { error?: string }
          throw new Error(j.error || 'Bulk update failed')
        }
        void fetch('/api/dashboard/units/tags')
          .then((r) => r.json())
          .then((d: { tags?: DiscoveryEntry[]; statuses?: DiscoveryEntry[] }) => {
            setTagOptions(d.tags ?? [])
            setStatusOptions(d.statuses ?? [])
          })
          .catch(() => {})
        if (onUnitsChanged) onUnitsChanged()
      } catch (err) {
        // rollback
        setUnits((prev) =>
          prev.map((u) =>
            selectedIds.has(u.id) ? { ...u, [field]: prevSnapshot.get(u.id) ?? null } : u
          )
        )
        setErrorMsg(err instanceof Error ? err.message : 'Bulk update failed')
      } finally {
        setSaving(false)
        setBulkEditing(null)
      }
    },
    [selectedIds, units, onUnitsChanged]
  )

  if (!isOpen) return null
  if (typeof document === 'undefined') return null

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="units-modal-title"
      onClick={() => !editing && !bulkEditing && onClose()}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.45)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: 24,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#fff',
          borderRadius: 6,
          width: '100%',
          maxWidth: 1080,
          maxHeight: '85vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 18px 60px rgba(0,0,0,0.22)',
          position: 'relative',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid #ece8dd',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
          }}
        >
          <div>
            <div id="units-modal-title" style={{ fontSize: 14, fontWeight: 600, color: '#1a1a1a' }}>
              {propertyDisplayName}
            </div>
            <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>
              {units.length} unit{units.length === 1 ? '' : 's'}
              {saving ? ' · Saving…' : ''}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{
              background: 'transparent',
              border: 'none',
              fontSize: 22,
              lineHeight: 1,
              cursor: 'pointer',
              color: '#666',
              padding: 4,
            }}
          >
            ×
          </button>
        </div>

        {/* Error */}
        {errorMsg ? (
          <div
            style={{
              padding: '10px 20px',
              background: '#fbeeee',
              color: '#7a1a26',
              fontSize: 12,
              borderBottom: '1px solid #f1d6d6',
            }}
          >
            {errorMsg}
          </div>
        ) : null}

        {/* Table */}
        <div style={{ overflow: 'auto', flex: 1 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr
                style={{
                  background: '#faf8f3',
                  borderBottom: '1px solid #ece8dd',
                  position: 'sticky',
                  top: 0,
                  zIndex: 1,
                }}
              >
                <th style={{ ...th, width: 36 }}>
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={toggleAll}
                    aria-label="Select all units"
                  />
                </th>
                <th style={th}>Unit</th>
                <th style={th}>BD/BA</th>
                <th style={th}>Tag</th>
                <th style={th}>Status</th>
                <th style={{ ...th, textAlign: 'right' }}>Rent</th>
                <th style={th}>Lease From</th>
                <th style={th}>Lease To</th>
                <th style={th}>Move-in</th>
                <th style={th}>Move-out</th>
                <th style={th}>OB</th>
              </tr>
            </thead>
            <tbody>
              {sortedUnits.length === 0 ? (
                <tr>
                  <td
                    colSpan={11}
                    style={{ padding: 28, textAlign: 'center', color: '#999', fontSize: 13 }}
                  >
                    No units recorded for this property.
                  </td>
                </tr>
              ) : (
                sortedUnits.map((u) => {
                  const isSelected = selectedIds.has(u.id)
                  return (
                    <tr
                      key={u.id}
                      style={{
                        borderBottom: '1px solid #f0ede5',
                        background: isSelected ? '#faf8f3' : 'transparent',
                      }}
                    >
                      <td style={{ ...td, width: 36 }}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleRow(u.id)}
                          aria-label={`Select unit ${u.unit_label ?? u.id}`}
                        />
                      </td>
                      <td style={td}>{u.unit_label || '—'}</td>
                      <td style={td}>{u.bd_ba || '—'}</td>
                      <td
                        style={{ ...td, ...editableCell }}
                        onClick={() => setEditing({ unitId: u.id, field: 'tag' })}
                      >
                        {editing && editing.unitId === u.id && editing.field === 'tag' ? (
                          <AutocompleteDropdown
                            value={u.tag}
                            options={tagOptions}
                            allowCreate={true}
                            placeholder="Type a tag…"
                            onCommit={(val) => {
                              setEditing(null)
                              void saveField(u.id, 'tag', val)
                            }}
                            onCancel={() => setEditing(null)}
                          />
                        ) : (
                          <span>{u.tag || <span style={cellPlaceholder}>—</span>}</span>
                        )}
                      </td>
                      <td
                        style={{ ...td, ...editableCell }}
                        onClick={() => setEditing({ unitId: u.id, field: 'status' })}
                      >
                        {editing && editing.unitId === u.id && editing.field === 'status' ? (
                          <AutocompleteDropdown
                            value={u.status}
                            options={statusOptions}
                            allowCreate={true}
                            placeholder="Type a status…"
                            onCommit={(val) => {
                              setEditing(null)
                              void saveField(u.id, 'status', val)
                            }}
                            onCancel={() => setEditing(null)}
                          />
                        ) : (
                          <span>{u.status || <span style={cellPlaceholder}>—</span>}</span>
                        )}
                      </td>
                      <td
                        style={{
                          ...td,
                          textAlign: 'right',
                          fontFamily: 'var(--font-mono, ui-monospace, monospace)',
                        }}
                      >
                        {formatRent(u.rent)}
                      </td>
                      <td style={td}>{formatDate(u.lease_from)}</td>
                      <td style={td}>{formatDate(u.lease_to)}</td>
                      <td style={td}>{formatDate(u.move_in)}</td>
                      <td style={td}>{formatDate(u.move_out)}</td>
                      <td style={td}>{formatDate(u.ob_date)}</td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Bulk action bar */}
        {selectedIds.size > 0 ? (
          <div
            style={{
              padding: '10px 20px',
              borderTop: '1px solid #ece8dd',
              background: '#faf8f3',
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              fontSize: 13,
              position: 'relative',
            }}
          >
            <span style={{ color: '#1a1a1a', fontWeight: 500 }}>
              {selectedIds.size} unit{selectedIds.size === 1 ? '' : 's'} selected
            </span>
            <span style={{ color: '#ccc' }}>·</span>
            <button
              type="button"
              onClick={() => setBulkEditing(bulkEditing === 'tag' ? null : 'tag')}
              style={bulkBtn}
            >
              Set tag ▾
            </button>
            <button
              type="button"
              onClick={() => setBulkEditing(bulkEditing === 'status' ? null : 'status')}
              style={bulkBtn}
            >
              Set status ▾
            </button>
            <button
              type="button"
              onClick={() => {
                setSelectedIds(new Set())
                setBulkEditing(null)
              }}
              style={{ ...bulkBtn, color: '#888' }}
            >
              Clear selection
            </button>
            {bulkEditing ? (
              <div
                style={{
                  position: 'absolute',
                  bottom: '100%',
                  left: bulkEditing === 'tag' ? 180 : 260,
                  marginBottom: 4,
                  zIndex: 10,
                }}
              >
                <AutocompleteDropdown
                  value={null}
                  options={bulkEditing === 'tag' ? tagOptions : statusOptions}
                  allowCreate={true}
                  placeholder={
                    bulkEditing === 'tag' ? `Set tag for ${selectedIds.size} units…` : `Set status for ${selectedIds.size} units…`
                  }
                  onCommit={(val) => {
                    void saveBulk(bulkEditing, val)
                  }}
                  onCancel={() => setBulkEditing(null)}
                />
              </div>
            ) : null}
          </div>
        ) : null}

        {/* Footer hint */}
        <div
          style={{
            padding: '10px 20px',
            borderTop: '1px solid #ece8dd',
            fontSize: 11,
            color: '#888',
            fontStyle: 'italic',
          }}
        >
          Click any tag or status cell to edit. Use checkboxes for bulk updates.
        </div>
      </div>
    </div>,
    document.body
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// AutocompleteDropdown — filterable list + free-text create + clear
// ─────────────────────────────────────────────────────────────────────────────

type AutocompleteProps = {
  value: string | null
  options: DiscoveryEntry[]
  allowCreate: boolean
  placeholder: string
  onCommit: (value: string | null) => void
  onCancel: () => void
}

function AutocompleteDropdown({
  value,
  options,
  allowCreate,
  placeholder,
  onCommit,
  onCancel,
}: AutocompleteProps) {
  const [query, setQuery] = useState(value ?? '')
  const [highlight, setHighlight] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [])

  // Click-away closes
  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) {
        onCancel()
      }
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [onCancel])

  const lowerQ = query.trim().toLowerCase()
  const filtered = options.filter((o) => o.name.toLowerCase().includes(lowerQ))
  const exactMatch = options.some((o) => o.name.toLowerCase() === lowerQ)
  const showCreate = allowCreate && lowerQ.length > 0 && !exactMatch

  // Build the row list, including the create row and clear row
  type Row = { kind: 'option'; entry: DiscoveryEntry } | { kind: 'create' } | { kind: 'clear' }
  const rows: Row[] = [
    ...filtered.map((entry) => ({ kind: 'option' as const, entry })),
  ]
  if (showCreate) rows.push({ kind: 'create' })
  if (value != null) rows.push({ kind: 'clear' })

  const commitRow = (row: Row) => {
    if (row.kind === 'option') onCommit(row.entry.name)
    else if (row.kind === 'create') onCommit(query.trim())
    else onCommit(null)
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (rows.length === 0) return
      setHighlight((h) => Math.min(rows.length - 1, h + 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      if (rows.length === 0) return
      setHighlight((h) => Math.max(0, h - 1))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (rows[highlight]) {
        commitRow(rows[highlight])
      } else if (showCreate) {
        onCommit(query.trim())
      } else if (lowerQ.length === 0 && value != null) {
        onCommit(null)
      }
    } else if (e.key === 'Escape') {
      e.preventDefault()
      onCancel()
    }
  }

  return (
    <div
      ref={rootRef}
      style={{
        position: 'relative',
        background: '#fff',
        border: '1px solid #1e3a5f',
        borderRadius: 4,
        boxShadow: '0 4px 12px rgba(0,0,0,0.12)',
        minWidth: 220,
        zIndex: 100,
      }}
    >
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value)
          setHighlight(0)
        }}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        style={{
          width: '100%',
          padding: '8px 10px',
          border: 'none',
          borderBottom: rows.length > 0 ? '1px solid #ece8dd' : 'none',
          fontSize: 13,
          outline: 'none',
          fontFamily: 'inherit',
        }}
      />
      {rows.length > 0 ? (
        <div style={{ maxHeight: 240, overflowY: 'auto' }}>
          {rows.map((row, i) => {
            const isHi = i === highlight
            const bg = isHi ? '#eef4fb' : 'transparent'
            if (row.kind === 'option') {
              return (
                <div
                  key={`opt-${row.entry.name}`}
                  onMouseEnter={() => setHighlight(i)}
                  onClick={() => commitRow(row)}
                  style={{
                    padding: '7px 10px',
                    background: bg,
                    cursor: 'pointer',
                    fontSize: 13,
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: 8,
                  }}
                >
                  <span>{row.entry.name}</span>
                  <span style={{ color: '#888', fontSize: 11 }}>×{row.entry.count}</span>
                </div>
              )
            }
            if (row.kind === 'create') {
              return (
                <div
                  key="create-row"
                  onMouseEnter={() => setHighlight(i)}
                  onClick={() => commitRow(row)}
                  style={{
                    padding: '7px 10px',
                    background: bg,
                    cursor: 'pointer',
                    fontSize: 13,
                    color: '#1e3a5f',
                    borderTop: '1px solid #f0ede5',
                    fontStyle: 'italic',
                  }}
                >
                  + Create &quot;{query.trim()}&quot;
                </div>
              )
            }
            return (
              <div
                key="clear-row"
                onMouseEnter={() => setHighlight(i)}
                onClick={() => commitRow(row)}
                style={{
                  padding: '7px 10px',
                  background: bg,
                  cursor: 'pointer',
                  fontSize: 13,
                  color: '#888',
                  borderTop: '1px solid #f0ede5',
                }}
              >
                — Clear
              </div>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────

const th: CSSProperties = {
  textAlign: 'left',
  padding: '10px 12px',
  fontSize: 11,
  fontWeight: 500,
  color: '#666',
  letterSpacing: '0.04em',
  textTransform: 'uppercase',
}

const td: CSSProperties = {
  padding: '10px 12px',
  color: '#1a1a1a',
  whiteSpace: 'nowrap',
  verticalAlign: 'top',
}

const editableCell: CSSProperties = {
  cursor: 'pointer',
  position: 'relative',
}

const cellPlaceholder: CSSProperties = {
  color: '#bbb',
}

const bulkBtn: CSSProperties = {
  background: '#fff',
  border: '1px solid #d9d3c2',
  borderRadius: 4,
  padding: '6px 10px',
  fontSize: 12,
  cursor: 'pointer',
  fontFamily: 'inherit',
  color: '#1a1a1a',
}
