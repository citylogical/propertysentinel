'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  type ColumnDef as TanStackColumnDef,
  type SortingState,
  type ColumnFiltersState,
  type VisibilityState,
  type PaginationState,
  type ColumnOrderState,
  type ColumnSizingState,
} from '@tanstack/react-table'
import {
  EXPLORE_TABLE_LIST,
  EXPLORE_TABLES,
  getDefaultVisibleColumns,
  type ColumnDef as AppColumnDef,
  type TableDef,
} from '@/lib/explore-tables'
import LeadExplorer from './LeadExplorer'

// ─── Types ───────────────────────────────────────────────────────────────────
type QueryResponse = {
  data: Record<string, unknown>[]
  totalRows: number
  pageCount: number
  error?: string
}

// ─── Cell formatting ─────────────────────────────────────────────────────────
function formatCell(value: unknown, type: string): string {
  if (value === null || value === undefined) return '—'
  if (type === 'date') {
    const s = String(value)
    if (s.length >= 10) return s.slice(0, 10)
    return s
  }
  if (type === 'number') {
    const n = Number(value)
    if (!Number.isFinite(n)) return String(value)
    if (Number.isInteger(n)) return n.toLocaleString('en-US')
    return n.toLocaleString('en-US', { maximumFractionDigits: 4 })
  }
  if (type === 'boolean') {
    if (value === true || value === 'true' || value === 1) return 'Yes'
    if (value === false || value === 'false' || value === 0) return 'No'
    return String(value)
  }
  if (type === 'json') return JSON.stringify(value).slice(0, 80)
  const s = String(value)
  return s.length > 120 ? s.slice(0, 117) + '…' : s
}

// ─── Debounce hook ───────────────────────────────────────────────────────────
function useDebouncedValue<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return debounced
}

const FIRST_EXPLORE_TABLE = EXPLORE_TABLE_LIST[0].name

type ExploreTablePrefs = {
  visibleKeys: string[]
  columnOrder: string[]
  columnWidths: Record<string, number>
}

function readExploreTablePrefs(table: string): ExploreTablePrefs | null {
  try {
    const raw = localStorage.getItem(`ps-explore-cols-${table}`)
    if (!raw) return null
    return JSON.parse(raw) as ExploreTablePrefs
  } catch {
    return null
  }
}

function exploreVisibilityFromKeys(def: TableDef, keys: string[]): VisibilityState {
  const vis: VisibilityState = {}
  for (const c of def.columns) {
    vis[c.key] = keys.includes(c.key)
  }
  return vis
}

// ─── Component ───────────────────────────────────────────────────────────────
export default function ExploreClient() {
  const [activeExploreTab, setActiveExploreTab] = useState<'data' | 'leads'>('data')

  // Table selection
  const [selectedTable, setSelectedTable] = useState<string>(FIRST_EXPLORE_TABLE)
  const tableDef: TableDef = EXPLORE_TABLES[selectedTable]

  // TanStack state
  const [sorting, setSorting] = useState<SortingState>(() => {
    const def = EXPLORE_TABLES[FIRST_EXPLORE_TABLE]
    return [{ id: def.defaultSort, desc: def.defaultSortDesc ?? false }]
  })
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([])
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>(() => {
    const prefs = readExploreTablePrefs(FIRST_EXPLORE_TABLE)
    const def = EXPLORE_TABLES[FIRST_EXPLORE_TABLE]
    if (prefs?.visibleKeys?.length) {
      return exploreVisibilityFromKeys(def, prefs.visibleKeys)
    }
    return getDefaultVisibleColumns(FIRST_EXPLORE_TABLE)
  })
  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 50 })

  // Data
  const [data, setData] = useState<Record<string, unknown>[]>([])
  const [totalRows, setTotalRows] = useState(0)
  const [pageCount, setPageCount] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Column visibility popover
  const [showColumnPicker, setShowColumnPicker] = useState(false)
  const colPickerRef = useRef<HTMLDivElement>(null)
  const widthSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Column resizing & reordering
  const [columnSizing, setColumnSizing] = useState<ColumnSizingState>(() => {
    const prefs = readExploreTablePrefs(FIRST_EXPLORE_TABLE)
    return prefs?.columnWidths ?? {}
  })
  const [columnOrder, setColumnOrder] = useState<ColumnOrderState>(() => {
    const prefs = readExploreTablePrefs(FIRST_EXPLORE_TABLE)
    const def = EXPLORE_TABLES[FIRST_EXPLORE_TABLE]
    if (prefs?.columnOrder?.length) {
      return prefs.columnOrder.filter((k) => def.columns.some((c) => c.key === k))
    }
    return []
  })
  const dragCol = useRef<string | null>(null)
  const [dragOverCol, setDragOverCol] = useState<string | null>(null)

  // Drill-down modal
  const [drillModal, setDrillModal] = useState<{
    open: boolean
    type: 'shvr' | 'airbnb'
    address: string
    data: Record<string, unknown>[]
    loading: boolean
    flagFilter?: string
  }>({ open: false, type: 'shvr', address: '', data: [], loading: false })

  const [pendingAnnotations, setPendingAnnotations] = useState<
    Record<number, { flag?: string; verified_address?: string; notes?: string }>
  >({})
  const [annotationSaving, setAnnotationSaving] = useState(false)
  const [annotationSaved, setAnnotationSaved] = useState(false)

  // Debounce filters so we don't fire on every keystroke
  const debouncedFilters = useDebouncedValue(columnFilters, 400)

  // ── Reset state on table change ──────────────────────────────────────
  const handleTableChange = useCallback((tableName: string) => {
    const def = EXPLORE_TABLES[tableName]
    if (!def) return
    const prefs = readExploreTablePrefs(tableName)
    setSelectedTable(tableName)
    if (prefs?.visibleKeys?.length) {
      setColumnVisibility(exploreVisibilityFromKeys(def, prefs.visibleKeys))
    } else {
      setColumnVisibility(getDefaultVisibleColumns(tableName))
    }
    setColumnFilters([])
    setSorting([{ id: def.defaultSort, desc: def.defaultSortDesc ?? false }])
    setPagination({ pageIndex: 0, pageSize: 50 })
    setData([])
    setTotalRows(0)
    setPageCount(0)
    if (prefs?.columnOrder?.length) {
      setColumnOrder(prefs.columnOrder.filter((k) => def.columns.some((c) => c.key === k)))
    } else {
      setColumnOrder([])
    }
    setColumnSizing(prefs?.columnWidths ?? {})
  }, [])

  // ── Drill-down handler ───────────────────────────────────────────────
  const handleDrillClick = useCallback(
    (lat: number, lng: number, type: 'shvr' | 'airbnb', address: string, flagFilter?: string) => {
      setDrillModal({ open: true, type, address, data: [], loading: true, flagFilter })
      fetch('/api/explore/pbl-nearby', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lat, lng, type }),
      })
        .then((res) => res.json())
        .then((json) => {
          setDrillModal((prev) => ({ ...prev, data: json.data ?? [], loading: false }))
        })
        .catch(() => {
          setDrillModal((prev) => ({ ...prev, loading: false }))
        })
    },
    []
  )

  const updatePendingAnnotation = useCallback(
    (listingId: number, field: 'flag' | 'verified_address' | 'notes', value: string) => {
      setPendingAnnotations((prev) => ({
        ...prev,
        [listingId]: {
          ...prev[listingId],
          [field]: value,
        },
      }))
      setAnnotationSaved(false)
    },
    []
  )

  const saveAllAnnotations = useCallback(async () => {
    const snapshot = pendingAnnotations
    const entries = Object.entries(snapshot)
    if (entries.length === 0) return

    const rowById = new Map(drillModal.data.map((r) => [Number(r.id), r]))

    setAnnotationSaving(true)
    try {
      const results = await Promise.allSettled(
        entries.map(async ([listingId, fields]) => {
          const id = Number(listingId)
          const row = rowById.get(id) ?? {}
          const flagRaw =
            fields.flag !== undefined ? fields.flag : String(row.flag ?? '')
          const addrRaw =
            fields.verified_address !== undefined
              ? fields.verified_address
              : String(row.verified_address ?? '')
          const notesRaw =
            fields.notes !== undefined ? fields.notes : String(row.notes ?? '')
          const res = await fetch('/api/explore/pbl-annotate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              listing_id: id,
              flag: flagRaw ? flagRaw : null,
              verified_address: addrRaw ? addrRaw : null,
              notes: notesRaw ? notesRaw : null,
            }),
          })
          const json = (await res.json().catch(() => ({}))) as { error?: string }
          if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`)
          return Number(listingId)
        })
      )

      const ok: number[] = []
      const failed: number[] = []
      results.forEach((r, i) => {
        const id = Number(entries[i][0])
        if (r.status === 'fulfilled') ok.push(id)
        else failed.push(id)
      })
      if (failed.length > 0) {
        console.error(`[annotations] ${failed.length} saves failed`)
      }

      if (ok.length > 0) {
        setDrillModal((prev) => ({
          ...prev,
          data: prev.data.map((row) => {
            const id = Number(row.id)
            if (!ok.includes(id)) return row
            const patch = snapshot[id] ?? {}
            return { ...row, ...patch }
          }),
        }))
        setPendingAnnotations((prev) => {
          const next = { ...prev }
          for (const id of ok) delete next[id]
          return next
        })
        setAnnotationSaved(true)
        setTimeout(() => setAnnotationSaved(false), 3000)
      }
    } catch (err) {
      console.error('[annotations] Save failed:', err)
    } finally {
      setAnnotationSaving(false)
    }
  }, [pendingAnnotations, drillModal.data])

  const closeDrillModal = useCallback(() => {
    setDrillModal((p) => ({ ...p, open: false }))
    setPendingAnnotations({})
    setAnnotationSaved(false)
  }, [])

  // ── Fetch data ───────────────────────────────────────────────────────
  useEffect(() => {
    if (activeExploreTab !== 'data') return
    let cancelled = false
    setLoading(true)
    setError(null)

    const visibleCols = Object.entries(columnVisibility)
      .filter(([, vis]) => vis)
      .map(([key]) => key)

    // Include any filtered columns even if not visible
    const filterCols = debouncedFilters.map((f) => f.id)
    // Always include lat/lng for PBL drill-down even if columns are hidden
    const extraCols = selectedTable === 'pbl_intelligence_live' ? ['lat', 'lng'] : []
    const allCols = [...new Set([...visibleCols, ...filterCols, ...extraCols])]

    const body = {
      table: selectedTable,
      columns: allCols,
      pageIndex: pagination.pageIndex,
      pageSize: pagination.pageSize,
      sorting,
      filters: debouncedFilters.map((f) => ({ id: f.id, value: String(f.value) })),
    }

    fetch('/api/explore/query', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
      .then((res) => res.json())
      .then((json: QueryResponse) => {
        if (cancelled) return
        if (json.error) {
          setError(json.error)
          setData([])
        } else {
          setData(json.data)
          setTotalRows(json.totalRows)
          setPageCount(json.pageCount)
        }
      })
      .catch((err) => {
        if (!cancelled) setError(String(err))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => { cancelled = true }
  }, [activeExploreTab, selectedTable, pagination, sorting, debouncedFilters, columnVisibility])

  // ── Close column picker on outside click ─────────────────────────────
  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (colPickerRef.current && !colPickerRef.current.contains(e.target as Node)) {
        setShowColumnPicker(false)
      }
    }
    if (showColumnPicker) {
      document.addEventListener('mousedown', onClickOutside)
      return () => document.removeEventListener('mousedown', onClickOutside)
    }
  }, [showColumnPicker])

  // ── Persist column visibility (Data explorer) ───────────────────────
  useEffect(() => {
    if (activeExploreTab !== 'data') return
    const keys = tableDef.columns.filter((c) => columnVisibility[c.key]).map((c) => c.key)
    try {
      const key = `ps-explore-cols-${selectedTable}`
      const existing = JSON.parse(localStorage.getItem(key) || '{}')
      localStorage.setItem(key, JSON.stringify({ ...existing, visibleKeys: keys }))
    } catch {
      /* ignore */
    }
  }, [columnVisibility, selectedTable, tableDef.columns, activeExploreTab])

  // ── Debounced column width persistence ───────────────────────────────
  useEffect(() => {
    if (activeExploreTab !== 'data') return
    if (widthSaveTimer.current) clearTimeout(widthSaveTimer.current)
    widthSaveTimer.current = setTimeout(() => {
      if (Object.keys(columnSizing).length > 0) {
        try {
          const key = `ps-explore-cols-${selectedTable}`
          const existing = JSON.parse(localStorage.getItem(key) || '{}')
          localStorage.setItem(key, JSON.stringify({ ...existing, columnWidths: columnSizing }))
        } catch {
          /* ignore */
        }
      }
    }, 500)
    return () => {
      if (widthSaveTimer.current) clearTimeout(widthSaveTimer.current)
    }
  }, [columnSizing, selectedTable, activeExploreTab])

  // ── Build TanStack columns ───────────────────────────────────────────
  const columns = useMemo<TanStackColumnDef<Record<string, unknown>>[]>(() => {
    return tableDef.columns.map((col: AppColumnDef) => ({
      id: col.key,
      accessorKey: col.key,
      header: col.label,
      cell: (info: { getValue: () => unknown; row: { original: Record<string, unknown> } }) => {
        const value = info.getValue()
        const isPbl = selectedTable === 'pbl_intelligence_live'
        const drillCols = ['shvr_total', 'nearby_airbnb_count', 'flagged_yes', 'flagged_maybe']
        if (isPbl && drillCols.includes(col.key) && Number(value) > 0) {
          const row = info.row.original
          const type = col.key === 'shvr_total' ? 'shvr' : 'airbnb'
          const ff = col.key === 'flagged_yes' ? 'yes' : col.key === 'flagged_maybe' ? 'maybe' : undefined
          return (
            <button
              type="button"
              className="explore-drill-link"
              onClick={(e) => {
                e.stopPropagation()
                handleDrillClick(
                  Number(row.lat),
                  Number(row.lng),
                  type as 'shvr' | 'airbnb',
                  String(row.address_normalized ?? ''),
                  ff
                )
              }}
            >
              {formatCell(value, col.type)}
            </button>
          )
        }
        return formatCell(info.getValue(), col.type)
      },
      enableSorting: true,
      meta: { type: col.type, sticky: col.sticky },
    }))
  }, [tableDef, selectedTable, handleDrillClick])

  // ── TanStack table instance ──────────────────────────────────────────
  const table = useReactTable({
    data,
    columns,
    pageCount,
    state: { pagination, sorting, columnFilters, columnVisibility, columnSizing, columnOrder },
    onPaginationChange: setPagination,
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    onColumnSizingChange: setColumnSizing,
    onColumnOrderChange: setColumnOrder,
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
    manualSorting: true,
    manualFiltering: true,
    enableColumnResizing: true,
    columnResizeMode: 'onChange',
  })

  // ── CSV export ───────────────────────────────────────────────────────
  const handleExport = useCallback(() => {
    if (data.length === 0) return
    const visibleCols = tableDef.columns.filter((c) => columnVisibility[c.key])
    const header = visibleCols.map((c) => c.label).join(',')
    const rows = data.map((row) =>
      visibleCols
        .map((c) => {
          const val = row[c.key]
          if (val === null || val === undefined) return ''
          const s = String(val)
          return s.includes(',') || s.includes('"') || s.includes('\n')
            ? `"${s.replace(/"/g, '""')}"`
            : s
        })
        .join(',')
    )
    const csv = [header, ...rows].join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${selectedTable}_export.csv`
    a.click()
    URL.revokeObjectURL(url)
  }, [data, tableDef, columnVisibility, selectedTable])

  // ── Filter input per column ──────────────────────────────────────────
  const getFilterValue = (colId: string): string => {
    const f = columnFilters.find((f) => f.id === colId)
    return f ? String(f.value) : ''
  }

  const setFilterValue = (colId: string, value: string) => {
    setColumnFilters((prev) => {
      const existing = prev.filter((f) => f.id !== colId)
      if (value.trim() === '') return existing
      return [...existing, { id: colId, value }]
    })
    // Reset to first page when filtering
    setPagination((prev) => ({ ...prev, pageIndex: 0 }))
  }

  // ── Visible column count ─────────────────────────────────────────────
  const visibleCount = Object.values(columnVisibility).filter(Boolean).length
  const totalColCount = tableDef.columns.length

  const activeFilterCount = columnFilters.filter((f) => String(f.value).trim() !== '').length

  return (
    <div className="explore-client-root">
      <div className="explore-tab-bar">
        <button
          type="button"
          className={`explore-tab ${activeExploreTab === 'data' ? 'explore-tab-active' : ''}`}
          onClick={() => setActiveExploreTab('data')}
        >
          Data explorer
        </button>
        <button
          type="button"
          className={`explore-tab ${activeExploreTab === 'leads' ? 'explore-tab-active' : ''}`}
          onClick={() => setActiveExploreTab('leads')}
        >
          Lead explorer
        </button>
      </div>

      <div className="explore-content-area">
        {activeExploreTab === 'data' && (
          <div className="explore-card">
      {/* ── Toolbar ─────────────────────────────────────────────────── */}
      <div className="explore-toolbar">
        <div className="explore-toolbar-left">
          <select
            className="explore-table-select"
            value={selectedTable}
            onChange={(e) => handleTableChange(e.target.value)}
          >
            {EXPLORE_TABLE_LIST.map((t) => (
              <option key={t.name} value={t.name}>
                {t.label} ({t.rowEstimate})
              </option>
            ))}
          </select>

          <span className="explore-row-count">
            {loading ? '…' : totalRows.toLocaleString()} rows
          </span>
        </div>

        <div className="explore-toolbar-right">
          {activeFilterCount > 0 && (
            <button
              type="button"
              className="explore-btn explore-btn-clear"
              onClick={() => { setColumnFilters([]); setPagination((p) => ({ ...p, pageIndex: 0 })) }}
            >
              Clear filters ({activeFilterCount})
            </button>
          )}

          <div className="explore-col-picker-wrap" ref={colPickerRef}>
            <button
              type="button"
              className="explore-btn"
              onClick={() => setShowColumnPicker(!showColumnPicker)}
            >
              Columns {visibleCount}/{totalColCount}
            </button>
            {showColumnPicker && (
              <div className="explore-col-picker">
                <div className="explore-col-picker-header">
                  <span>Toggle Columns</span>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                    <button
                      type="button"
                      className="explore-col-picker-action"
                      onClick={() => {
                        const all: VisibilityState = {}
                        tableDef.columns.forEach((c) => { all[c.key] = true })
                        setColumnVisibility(all)
                      }}
                    >
                      All
                    </button>
                    <button
                      type="button"
                      className="explore-col-picker-action"
                      onClick={() => setColumnVisibility(getDefaultVisibleColumns(selectedTable))}
                    >
                      Default
                    </button>
                    <button
                      type="button"
                      className="explore-col-picker-action"
                      onClick={() => {
                        const none: VisibilityState = {}
                        tableDef.columns.forEach((c) => { none[c.key] = false })
                        setColumnVisibility(none)
                      }}
                    >
                      None
                    </button>
                    <button
                      type="button"
                      className="explore-reset-cols-btn"
                      title="Reset column layout"
                      onClick={() => {
                        localStorage.removeItem(`ps-explore-cols-${selectedTable}`)
                        window.location.reload()
                      }}
                    >
                      Reset columns
                    </button>
                  </div>
                </div>
                <div className="explore-col-picker-list">
                  {tableDef.columns.map((col) => (
                    <label key={col.key} className="explore-col-picker-item">
                      <input
                        type="checkbox"
                        checked={columnVisibility[col.key] ?? false}
                        onChange={(e) =>
                          setColumnVisibility((prev) => ({ ...prev, [col.key]: e.target.checked }))
                        }
                      />
                      <span>{col.label}</span>
                      <span className="explore-col-picker-type">{col.type}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>

          <button type="button" className="explore-btn" onClick={handleExport} disabled={data.length === 0}>
            Export CSV
          </button>
        </div>
      </div>

      {/* ── Error ───────────────────────────────────────────────────── */}
      {error && <div className="explore-error">Error: {error}</div>}

      {/* ── Table ───────────────────────────────────────────────────── */}
      <div className="explore-table-wrap">
        <table
          className="explore-table"
          style={
            table.getState().columnSizing && Object.keys(table.getState().columnSizing).length > 0
              ? { tableLayout: 'fixed' as const, width: table.getTotalSize() }
              : undefined
          }
        >
          <thead>
            {/* Header row */}
            <tr>
              {table.getHeaderGroups()[0]?.headers.map((header) => {
                const meta = header.column.columnDef.meta as { type?: string; sticky?: boolean } | undefined
                const sortDir = header.column.getIsSorted()
                return (
                  <th
                    key={header.id}
                    className={`explore-th ${meta?.sticky ? 'explore-sticky-col' : ''} ${dragOverCol === header.id ? 'explore-th-dragover' : ''}`}
                    onClick={header.column.getToggleSortingHandler()}
                    style={{ cursor: 'pointer', userSelect: 'none', width: header.getSize() }}
                    draggable
                    onDragStart={(e) => {
                      dragCol.current = header.id
                      e.dataTransfer.effectAllowed = 'move'
                    }}
                    onDragOver={(e) => {
                      e.preventDefault()
                      if (dragCol.current && dragCol.current !== header.id) {
                        setDragOverCol(header.id)
                      }
                    }}
                    onDragLeave={() => setDragOverCol(null)}
                    onDrop={(e) => {
                      e.preventDefault()
                      setDragOverCol(null)
                      if (!dragCol.current || dragCol.current === header.id) return
                      const allCols = table.getAllLeafColumns().map((c) => c.id)
                      const currentOrder = columnOrder.length > 0 ? [...columnOrder] : [...allCols]
                      const fromIdx = currentOrder.indexOf(dragCol.current)
                      const toIdx = currentOrder.indexOf(header.id)
                      if (fromIdx === -1 || toIdx === -1) return
                      currentOrder.splice(fromIdx, 1)
                      currentOrder.splice(toIdx, 0, dragCol.current)
                      setColumnOrder(currentOrder)
                      try {
                        const key = `ps-explore-cols-${selectedTable}`
                        const existing = JSON.parse(localStorage.getItem(key) || '{}')
                        localStorage.setItem(
                          key,
                          JSON.stringify({ ...existing, columnOrder: currentOrder })
                        )
                      } catch {
                        /* ignore */
                      }
                      dragCol.current = null
                    }}
                    onDragEnd={() => {
                      dragCol.current = null
                      setDragOverCol(null)
                    }}
                  >
                    <div className="explore-th-inner">
                      <span>{flexRender(header.column.columnDef.header, header.getContext())}</span>
                      <span className="explore-sort-icon">
                        {sortDir === 'asc' ? '↑' : sortDir === 'desc' ? '↓' : '⇅'}
                      </span>
                    </div>
                    <div
                      onMouseDown={header.getResizeHandler()}
                      onTouchStart={header.getResizeHandler()}
                      className={`explore-resize-handle ${header.column.getIsResizing() ? 'isResizing' : ''}`}
                      onClick={(e) => e.stopPropagation()}
                    />
                  </th>
                )
              })}
            </tr>
            {/* Filter row */}
            <tr className="explore-filter-row">
              {table.getHeaderGroups()[0]?.headers.map((header) => {
                const meta = header.column.columnDef.meta as { type?: string; sticky?: boolean } | undefined
                const colDef = tableDef.columns.find((c) => c.key === header.id)
                const placeholder = colDef?.type === 'number' ? 'e.g. >100' : colDef?.type === 'date' ? 'YYYY-MM-DD' : 'Filter…'
                return (
                  <th
                    key={`filter-${header.id}`}
                    className={`explore-filter-th ${meta?.sticky ? 'explore-sticky-col' : ''}`}
                    style={{ width: header.getSize() }}
                  >
                    <input
                      type="text"
                      className="explore-filter-input"
                      placeholder={placeholder}
                      value={getFilterValue(header.id)}
                      onChange={(e) => setFilterValue(header.id, e.target.value)}
                    />
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {loading && data.length === 0 ? (
              <tr>
                <td colSpan={table.getVisibleFlatColumns().length} className="explore-empty-cell">
                  Loading…
                </td>
              </tr>
            ) : data.length === 0 ? (
              <tr>
                <td colSpan={table.getVisibleFlatColumns().length} className="explore-empty-cell">
                  No results
                </td>
              </tr>
            ) : (
              table.getRowModel().rows.map((row, rowIdx) => (
                <tr key={row.id} className={rowIdx % 2 === 0 ? 'explore-row-even' : 'explore-row-odd'}>
                  {row.getVisibleCells().map((cell) => {
                    const meta = cell.column.columnDef.meta as { type?: string; sticky?: boolean } | undefined
                    const sizing = table.getState().columnSizing
                    const hasSizing = sizing && Object.keys(sizing).length > 0
                    return (
                      <td
                        key={cell.id}
                        className={`explore-td ${meta?.sticky ? 'explore-sticky-col' : ''}`}
                        style={hasSizing ? { width: cell.column.getSize() } : undefined}
                      >
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    )
                  })}
                </tr>
              ))
            )}
          </tbody>
        </table>
        {loading && data.length > 0 && <div className="explore-loading-overlay" />}
      </div>

      {/* ── Pagination ──────────────────────────────────────────────── */}
      <div className="explore-pagination">
        <div className="explore-pagination-left">
          <select
            className="explore-page-size-select"
            value={pagination.pageSize}
            onChange={(e) =>
              setPagination({ pageIndex: 0, pageSize: Number(e.target.value) })
            }
          >
            {[25, 50, 100, 200].map((size) => (
              <option key={size} value={size}>
                {size} / page
              </option>
            ))}
          </select>
          <span className="explore-page-info">
            Page {pagination.pageIndex + 1} of {pageCount || 1}
          </span>
        </div>
        <div className="explore-pagination-right">
          <button
            type="button"
            className="explore-page-btn"
            disabled={pagination.pageIndex === 0}
            onClick={() => setPagination((p) => ({ ...p, pageIndex: 0 }))}
          >
            ««
          </button>
          <button
            type="button"
            className="explore-page-btn"
            disabled={pagination.pageIndex === 0}
            onClick={() => setPagination((p) => ({ ...p, pageIndex: Math.max(0, p.pageIndex - 1) }))}
          >
            «
          </button>
          <button
            type="button"
            className="explore-page-btn"
            disabled={pagination.pageIndex >= pageCount - 1}
            onClick={() =>
              setPagination((p) => ({
                ...p,
                pageIndex: Math.min(pageCount - 1, p.pageIndex + 1),
              }))
            }
          >
            »
          </button>
          <button
            type="button"
            className="explore-page-btn"
            disabled={pagination.pageIndex >= pageCount - 1}
            onClick={() => setPagination((p) => ({ ...p, pageIndex: Math.max(0, pageCount - 1) }))}
          >
            »»
          </button>
          <input
            type="number"
            className="explore-page-jump"
            min={1}
            max={pageCount || 1}
            placeholder="Go…"
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                const val = Number((e.target as HTMLInputElement).value)
                if (Number.isFinite(val) && val >= 1 && val <= pageCount) {
                  setPagination((p) => ({ ...p, pageIndex: val - 1 }))
                }
              }
            }}
          />
        </div>
      </div>
          </div>
        )}

        {activeExploreTab === 'leads' && (
          <div className="explore-card">
            <LeadExplorer onDrillClick={handleDrillClick} />
          </div>
        )}
      </div>

      {/* ── Drill-down modal ────────────────────────────────────────── */}
      {drillModal.open && (() => {
        const displayData = drillModal.flagFilter
          ? drillModal.data.filter((r) => String(r.flag) === drillModal.flagFilter)
          : drillModal.data
        const filterLabel = drillModal.flagFilter
          ? `Flagged "${drillModal.flagFilter}" Airbnb Listings near`
          : drillModal.type === 'shvr'
            ? 'SHVR Complaints near'
            : 'Airbnb Listings near'
        return (
          <div className="explore-modal-backdrop" onClick={closeDrillModal}>
            <div className="explore-modal" onClick={(e) => e.stopPropagation()}>
              <div className="explore-modal-header">
                <div>
                  <div className="explore-modal-title">{filterLabel}</div>
                  <div className="explore-modal-address">{drillModal.address}</div>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  {drillModal.flagFilter && (
                    <button
                      type="button"
                      className="explore-btn"
                      style={{ fontSize: 9, padding: '4px 8px' }}
                      onClick={() => setDrillModal((p) => ({ ...p, flagFilter: undefined }))}
                    >
                      Show all
                    </button>
                  )}
                  <button
                    type="button"
                    className="explore-modal-close"
                    onClick={closeDrillModal}
                  >
                    ✕
                  </button>
                </div>
              </div>
              <div className="explore-modal-body">
                {drillModal.loading ? (
                  <div className="explore-modal-loading">Loading…</div>
                ) : displayData.length === 0 ? (
                  <div className="explore-modal-loading">No results</div>
                ) : drillModal.type === 'shvr' ? (
                  <table className="explore-modal-table">
                    <thead>
                      <tr>
                        <th>SR Number</th>
                        <th>Address</th>
                        <th>Status</th>
                        <th>Type</th>
                        <th>Filed</th>
                        <th>Closed</th>
                      </tr>
                    </thead>
                    <tbody>
                      {displayData.map((row, i) => (
                        <tr key={i}>
                          <td>{String(row.sr_number ?? '—')}</td>
                          <td>{String(row.address ?? '—')}</td>
                          <td>
                            <span className={`explore-modal-badge ${String(row.status ?? '').toUpperCase() === 'OPEN' ? 'badge-open' : 'badge-closed'}`}>
                              {String(row.status ?? '—')}
                            </span>
                          </td>
                          <td>{String(row.sr_type ?? '—')}</td>
                          <td>{row.created_date ? String(row.created_date).slice(0, 10) : '—'}</td>
                          <td>{row.closed_date ? String(row.closed_date).slice(0, 10) : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <table className="explore-modal-table">
                    <thead>
                      <tr>
                        <th>Flag</th>
                        <th>Listing</th>
                        <th>Host</th>
                        <th>Type</th>
                        <th>Price</th>
                        <th>License</th>
                        <th>Noncompliant</th>
                        <th>Reviews</th>
                        <th>Host Listings</th>
                        <th>Verified Address</th>
                        <th>Notes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {displayData.map((row) => {
                        const rowId = Number(row.id)
                        const effFlag =
                            pendingAnnotations[rowId]?.flag ?? String(row.flag ?? '')
                        return (
                        <tr key={rowId}>
                          <td>
                            <select
                              className={`explore-annotation-select ${
                                effFlag === 'yes' ? 'ann-yes' : effFlag === 'maybe' ? 'ann-maybe' : effFlag === 'no' ? 'ann-no' : ''
                              }`}
                              value={effFlag}
                              onChange={(e) => updatePendingAnnotation(rowId, 'flag', e.target.value)}
                            >
                              <option value="">—</option>
                              <option value="yes">Yes</option>
                              <option value="maybe">Maybe</option>
                              <option value="no">No</option>
                            </select>
                          </td>
                          <td>
                            {row.listing_url ? (
                              <a href={String(row.listing_url)} target="_blank" rel="noopener noreferrer" className="explore-drill-link">
                                {String(row.id ?? '—')}
                              </a>
                            ) : (
                              String(row.id ?? '—')
                            )}
                          </td>
                          <td>{String(row.host_name ?? '—')}</td>
                          <td>{String(row.property_type ?? '—')}</td>
                          <td>{String(row.price ?? '—')}</td>
                          <td style={{ maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {String(row.license ?? '—')}
                          </td>
                          <td>
                            <span className={`explore-modal-badge ${row.is_potentially_noncompliant ? 'badge-open' : 'badge-closed'}`}>
                              {row.is_potentially_noncompliant ? 'Yes' : 'No'}
                            </span>
                          </td>
                          <td>{row.number_of_reviews != null ? Number(row.number_of_reviews).toLocaleString() : '—'}</td>
                          <td>{row.host_listings_count != null ? String(row.host_listings_count) : '—'}</td>
                          <td>
                            <input
                              type="text"
                              className="explore-annotation-input"
                              value={
                                pendingAnnotations[rowId]?.verified_address ??
                                String(row.verified_address ?? '')
                              }
                              placeholder="Address…"
                              onChange={(e) =>
                                updatePendingAnnotation(rowId, 'verified_address', e.target.value)
                              }
                            />
                          </td>
                          <td>
                            <input
                              type="text"
                              className="explore-annotation-input explore-annotation-notes"
                              value={
                                pendingAnnotations[rowId]?.notes ?? String(row.notes ?? '')
                              }
                              placeholder="Notes…"
                              onChange={(e) => updatePendingAnnotation(rowId, 'notes', e.target.value)}
                            />
                          </td>
                        </tr>
                        )
                      })}
                    </tbody>
                  </table>
                )}
              </div>
              <div className="explore-modal-footer">
                <span>
                  {displayData.length} {drillModal.type === 'shvr' ? 'complaint' : 'listing'}
                  {displayData.length !== 1 ? 's' : ''} within {drillModal.type === 'shvr' ? '40m' : '150m'}
                  {drillModal.flagFilter ? ` (filtered: ${drillModal.flagFilter})` : ''}
                </span>
                {drillModal.type === 'airbnb' && (
                  <div className="explore-modal-save-row">
                    {Object.keys(pendingAnnotations).length > 0 && !annotationSaved && (
                      <span className="explore-modal-unsaved">
                        {Object.keys(pendingAnnotations).length} unsaved{' '}
                        {Object.keys(pendingAnnotations).length === 1 ? 'change' : 'changes'}
                      </span>
                    )}
                    {annotationSaved && (
                      <span className="explore-modal-saved">Saved ✓</span>
                    )}
                    <button
                      type="button"
                      className="explore-modal-save-btn"
                      onClick={saveAllAnnotations}
                      disabled={
                        annotationSaving || Object.keys(pendingAnnotations).length === 0
                      }
                    >
                      {annotationSaving ? 'Saving…' : 'Save all'}
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )
      })()}
    </div>
  )
}