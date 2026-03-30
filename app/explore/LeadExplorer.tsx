'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  type ColumnDef as TanStackColumnDef,
  type SortingState,
  type ColumnFiltersState,
  type PaginationState,
  type ColumnOrderState,
  type ColumnSizingState,
} from '@tanstack/react-table'
import { EXPLORE_TABLES, type ColumnDef as AppColumnDef, type TableDef } from '@/lib/explore-tables'

const PBL_TABLE = 'pbl_intelligence_live' as const

type QueryResponse = {
  data: Record<string, unknown>[]
  totalRows: number
  pageCount: number
  error?: string
}

type LeadRow = Record<string, unknown> & {
  pbl_id?: string
  application_id?: number | null
  contact_name?: string | null
  contact_phone?: string | null
  contact_email?: string | null
  contact_revealed_at?: string | null
  status?: string
  notes?: string | null
}

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

function useDebouncedValue<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return debounced
}

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: 'not_started', label: 'Not started' },
  { value: 'letter_sent', label: 'Letter sent' },
  { value: 'called', label: 'Called' },
  { value: 'responded', label: 'Responded' },
  { value: 'converted', label: 'Converted' },
]

type Props = {
  onDrillClick: (lat: number, lng: number, type: 'shvr' | 'airbnb', address: string, flagFilter?: string) => void
}

export default function LeadExplorer({ onDrillClick }: Props) {
  const tableDef: TableDef = EXPLORE_TABLES[PBL_TABLE]
  const defaultColKeys = useMemo(
    () => tableDef.columns.filter((c) => c.defaultVisible === true).map((c) => c.key),
    [tableDef]
  )

  const [sorting, setSorting] = useState<SortingState>([
    { id: tableDef.defaultSort, desc: tableDef.defaultSortDesc ?? false },
  ])
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([])
  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 50 })

  const [data, setData] = useState<Record<string, unknown>[]>([])
  const [totalRows, setTotalRows] = useState(0)
  const [pageCount, setPageCount] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [leadsByAppId, setLeadsByAppId] = useState<Map<number, LeadRow>>(new Map())
  const [revealLoading, setRevealLoading] = useState<number | null>(null)
  const [columnSizing, setColumnSizing] = useState<ColumnSizingState>({})
  const [columnOrder, setColumnOrder] = useState<ColumnOrderState>([])
  const dragCol = useRef<string | null>(null)
  const [dragOverCol, setDragOverCol] = useState<string | null>(null)

  const debouncedFilters = useDebouncedValue(columnFilters, 400)

  const refreshLeads = useCallback(() => {
    fetch('/api/explore/pbl-lead')
      .then((r) => r.json())
      .then((json: { leads?: LeadRow[]; error?: string }) => {
        if (json.error) return
        const m = new Map<number, LeadRow>()
        for (const L of json.leads ?? []) {
          const aid = L.application_id
          if (aid != null && Number.isFinite(Number(aid))) m.set(Number(aid), L)
        }
        setLeadsByAppId(m)
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    refreshLeads()
  }, [refreshLeads])

  const queryColumns = useMemo(
    () => [...new Set([...defaultColKeys, 'lat', 'lng'])],
    [defaultColKeys]
  )

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)

    const filterCols = debouncedFilters.map((f) => f.id)
    const allCols = [...new Set([...queryColumns, ...filterCols])]

    const body = {
      table: PBL_TABLE,
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

    return () => {
      cancelled = true
    }
  }, [pagination, sorting, debouncedFilters, queryColumns])

  const saveLead = useCallback(
    async (applicationId: number, patch: { status?: string; notes?: string | null; reveal_contact?: boolean }) => {
      const res = await fetch('/api/explore/pbl-lead', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ application_id: applicationId, ...patch }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Save failed')
      const lead = json.lead as LeadRow
      const aid = lead.application_id ?? applicationId
      if (aid != null && Number.isFinite(Number(aid))) {
        setLeadsByAppId((prev) => {
          const next = new Map(prev)
          next.set(Number(aid), { ...lead, application_id: Number(aid) })
          return next
        })
      }
      return lead
    },
    []
  )

  const pblColumns = useMemo(() => {
    return defaultColKeys
      .map((key) => tableDef.columns.find((c) => c.key === key))
      .filter((c): c is AppColumnDef => Boolean(c))
  }, [defaultColKeys, tableDef.columns])

  const columns = useMemo<TanStackColumnDef<Record<string, unknown>>[]>(() => {
    const base: TanStackColumnDef<Record<string, unknown>>[] = pblColumns.map((col) => ({
      id: col.key,
      accessorKey: col.key,
      header: col.label,
      cell: (info: { getValue: () => unknown; row: { original: Record<string, unknown> } }) => {
        const value = info.getValue()
        const drillCols = ['shvr_total', 'nearby_airbnb_count', 'flagged_yes', 'flagged_maybe']
        if (drillCols.includes(col.key) && Number(value) > 0) {
          const row = info.row.original
          const type = col.key === 'shvr_total' ? 'shvr' : 'airbnb'
          const ff = col.key === 'flagged_yes' ? 'yes' : col.key === 'flagged_maybe' ? 'maybe' : undefined
          return (
            <button
              type="button"
              className="explore-drill-link"
              onClick={(e) => {
                e.stopPropagation()
                onDrillClick(
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

    const leadContact: TanStackColumnDef<Record<string, unknown>> = {
      id: 'lead_contact',
      accessorFn: (row) => row.application_id,
      header: 'Contact',
      cell: ({ row }) => {
        const appId = Number(row.original.application_id)
        const lead = leadsByAppId.get(appId)
        const loadingThis = revealLoading === appId
        if (lead?.contact_revealed_at && (lead.contact_name || lead.contact_phone)) {
          return (
            <div className="explore-lead-revealed">
              <div>{lead.contact_name ?? '—'}</div>
              <div>{lead.contact_phone ?? '—'}</div>
            </div>
          )
        }
        return (
          <button
            type="button"
            className="explore-lead-reveal-btn"
            disabled={loadingThis || !Number.isFinite(appId)}
            onClick={() => {
              if (!Number.isFinite(appId)) return
              setRevealLoading(appId)
              saveLead(appId, { reveal_contact: true })
                .catch(() => {})
                .finally(() => setRevealLoading(null))
            }}
          >
            {loadingThis ? '…' : 'Reveal · $0.07'}
          </button>
        )
      },
      enableSorting: false,
      meta: { type: 'text', sticky: false },
    }

    const leadStatus: TanStackColumnDef<Record<string, unknown>> = {
      id: 'lead_status',
      accessorFn: (row) => row.application_id,
      header: 'Status',
      cell: ({ row }) => {
        const appId = Number(row.original.application_id)
        const lead = leadsByAppId.get(appId)
        const status = (lead?.status as string) || 'not_started'
        return (
          <select
            className={`explore-lead-status explore-lead-status-${status}`}
            value={status}
            onChange={(e) => {
              if (!Number.isFinite(appId)) return
              saveLead(appId, { status: e.target.value }).catch(() => {})
            }}
          >
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        )
      },
      enableSorting: false,
      meta: { type: 'text', sticky: false },
    }

    const leadNotes: TanStackColumnDef<Record<string, unknown>> = {
      id: 'lead_notes',
      accessorFn: (row) => row.application_id,
      header: 'Notes',
      cell: ({ row }) => {
        const appId = Number(row.original.application_id)
        const lead = leadsByAppId.get(appId)
        const v = (lead?.notes as string) ?? ''
        return (
          <input
            key={appId}
            type="text"
            className="explore-lead-notes-input"
            defaultValue={v}
            placeholder="Notes…"
            onBlur={(e) => {
              if (!Number.isFinite(appId)) return
              const next = e.target.value
              if (next === v) return
              saveLead(appId, { notes: next || null }).catch(() => {})
            }}
          />
        )
      },
      enableSorting: false,
      meta: { type: 'text', sticky: false },
    }

    return [...base, leadContact, leadStatus, leadNotes]
  }, [pblColumns, leadsByAppId, onDrillClick, revealLoading, saveLead])

  const table = useReactTable({
    data,
    columns,
    pageCount,
    state: { pagination, sorting, columnFilters, columnSizing, columnOrder },
    onPaginationChange: setPagination,
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnSizingChange: setColumnSizing,
    onColumnOrderChange: setColumnOrder,
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
    manualSorting: true,
    manualFiltering: true,
    enableColumnResizing: true,
    columnResizeMode: 'onChange',
  })

  const getFilterValue = (colId: string): string => {
    const f = columnFilters.find((x) => x.id === colId)
    return f ? String(f.value) : ''
  }

  const setFilterValue = (colId: string, value: string) => {
    setColumnFilters((prev) => {
      const existing = prev.filter((f) => f.id !== colId)
      if (value.trim() === '') return existing
      return [...existing, { id: colId, value }]
    })
    setPagination((prev) => ({ ...prev, pageIndex: 0 }))
  }

  return (
    <>
      <div className="explore-toolbar explore-lead-toolbar">
        <div className="explore-toolbar-left">
          <span className="explore-row-count explore-lead-title">PBL Intelligence — leads</span>
          <span className="explore-row-count">{loading ? '…' : totalRows.toLocaleString()} rows</span>
        </div>
      </div>

      {error && <div className="explore-error">Error: {error}</div>}

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
            <tr>
              {table.getHeaderGroups()[0]?.headers.map((header) => {
                const meta = header.column.columnDef.meta as { type?: string; sticky?: boolean } | undefined
                const sortDir = header.column.getIsSorted()
                return (
                  <th
                    key={header.id}
                    className={`explore-th ${meta?.sticky ? 'explore-sticky-col' : ''} ${dragOverCol === header.id ? 'explore-th-dragover' : ''}`}
                    onClick={header.column.getCanSort() ? header.column.getToggleSortingHandler() : undefined}
                    style={{
                      cursor: header.column.getCanSort() ? 'pointer' : 'default',
                      userSelect: 'none',
                      width: header.getSize(),
                    }}
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
                      dragCol.current = null
                    }}
                    onDragEnd={() => {
                      dragCol.current = null
                      setDragOverCol(null)
                    }}
                  >
                    <div className="explore-th-inner">
                      <span>{flexRender(header.column.columnDef.header, header.getContext())}</span>
                      {header.column.getCanSort() && (
                        <span className="explore-sort-icon">
                          {sortDir === 'asc' ? '↑' : sortDir === 'desc' ? '↓' : '⇅'}
                        </span>
                      )}
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
            <tr className="explore-filter-row">
              {table.getHeaderGroups()[0]?.headers.map((header) => {
                const meta = header.column.columnDef.meta as { type?: string; sticky?: boolean } | undefined
                const colKey = header.id
                const pblCol = pblColumns.find((c) => c.key === colKey)
                if (!pblCol) {
                  return (
                    <th
                      key={`filter-${header.id}`}
                      className={`explore-filter-th ${meta?.sticky ? 'explore-sticky-col' : ''}`}
                      style={{ width: header.getSize() }}
                    />
                  )
                }
                const placeholder =
                  pblCol.type === 'number' ? 'e.g. >100' : pblCol.type === 'date' ? 'YYYY-MM-DD' : 'Filter…'
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
              table.getRowModel().rows.map((rrow, rowIdx) => (
                <tr key={rrow.id} className={rowIdx % 2 === 0 ? 'explore-row-even' : 'explore-row-odd'}>
                  {rrow.getVisibleCells().map((cell) => {
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

      <div className="explore-pagination">
        <div className="explore-pagination-left">
          <select
            className="explore-page-size-select"
            value={pagination.pageSize}
            onChange={(e) => setPagination({ pageIndex: 0, pageSize: Number(e.target.value) })}
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
        </div>
      </div>
    </>
  )
}
