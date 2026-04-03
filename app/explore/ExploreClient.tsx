'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
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

const AIRBNB_NEARBY_TABLE_ID = 'airbnb_nearby' as const
const AIRBNB_COL_IDS = [
  'flag',
  'listing',
  'host',
  'type',
  'price',
  'license',
  'noncompliant',
  'reviews',
  'host_listings',
  'verified_address',
  'notes',
] as const

type AirbnbNearbyColId = (typeof AIRBNB_COL_IDS)[number]

type AirbnbStoredAnnotation = {
  row_key?: string
  status?: string | null
  notes?: string | null
  flagged?: boolean
}

function airbnbAnnotationRowKey(listingId: number): string {
  return `airbnb_${listingId}`
}

/** Pack verified address + freeform notes into lead_annotations.notes (JSON). */
function parseAirbnbPackedNotes(raw: string | null | undefined): { va: string; n: string } {
  if (raw == null || raw === '') return { va: '', n: '' }
  const s = String(raw).trim()
  if (s.startsWith('{')) {
    try {
      const o = JSON.parse(s) as { va?: unknown; n?: unknown }
      return {
        va: o.va != null ? String(o.va) : '',
        n: o.n != null ? String(o.n) : '',
      }
    } catch {
      /* fall through */
    }
  }
  return { va: '', n: s }
}

function airbnbFlagFromAnnotation(ann: AirbnbStoredAnnotation | undefined): string {
  if (!ann) return ''
  if (ann.flagged === true) return 'yes'
  if (ann.status === 'target') return 'maybe'
  if (ann.status === 'new') return 'no'
  return ''
}

function airbnbFlagToApi(flag: string): { flagged: boolean; status: string } {
  if (flag === 'yes') return { flagged: true, status: 'not_started' }
  if (flag === 'maybe') return { flagged: false, status: 'target' }
  if (flag === 'no') return { flagged: false, status: 'new' }
  return { flagged: false, status: 'not_started' }
}

function defaultAirbnbNearbyVisibility(): VisibilityState {
  const v: VisibilityState = {}
  for (const id of AIRBNB_COL_IDS) v[id] = true
  return v
}

/** Row key for PBL application annotations (`lead_annotations.row_key`). */
function pblLeadAnnotationKeyFromRow(row: Record<string, unknown>): string | null {
  const raw = row.application_id ?? row.pin
  if (raw === null || raw === undefined || raw === '') return null
  const n = Number(raw)
  if (Number.isFinite(n)) return `pbl_app_${n}`
  return `pbl_app_${String(raw).trim()}`
}

function AirbnbNearbyDrillTable({
  rows,
  countSourceRows,
  parentApplicationId,
  onPblCountsSaved,
}: {
  rows: Record<string, unknown>[]
  /** Full nearby listing set (unfiltered) for Yes/Maybe recounts */
  countSourceRows: Record<string, unknown>[]
  parentApplicationId: number | null
  onPblCountsSaved?: (rowKey: string, annotation: Record<string, unknown>) => void
}) {
  const [prefsReady, setPrefsReady] = useState(false)
  const [layoutSaveReady, setLayoutSaveReady] = useState(false)
  const [annotations, setAnnotations] = useState<Record<string, AirbnbStoredAnnotation>>({})
  const annotationsRef = useRef<Record<string, AirbnbStoredAnnotation>>({})
  const prefSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [sorting, setSorting] = useState<SortingState>([])
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>(defaultAirbnbNearbyVisibility)
  const [columnSizing, setColumnSizing] = useState<ColumnSizingState>({})
  const [columnOrder, setColumnOrder] = useState<ColumnOrderState>([])
  const dragCol = useRef<string | null>(null)
  const [dragOverCol, setDragOverCol] = useState<string | null>(null)
  const [showColumnPicker, setShowColumnPicker] = useState(false)
  const colPickerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    annotationsRef.current = annotations
  }, [annotations])

  const rowByListingId = useMemo(() => {
    const m = new Map<number, Record<string, unknown>>()
    for (const r of rows) {
      const id = Number(r.id)
      if (Number.isFinite(id)) m.set(id, r)
    }
    return m
  }, [rows])

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

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const [annRes, prefRes] = await Promise.all([
          fetch('/api/leads/annotations').then((r) => r.json()),
          fetch(`/api/leads/preferences?table_id=${encodeURIComponent(AIRBNB_NEARBY_TABLE_ID)}`).then((r) =>
            r.json()
          ),
        ])
        if (cancelled) return
        if (
          annRes &&
          typeof annRes === 'object' &&
          'annotations' in annRes &&
          annRes.annotations &&
          typeof annRes.annotations === 'object' &&
          !('error' in annRes && annRes.error)
        ) {
          const next: Record<string, AirbnbStoredAnnotation> = {}
          for (const [k, v] of Object.entries(annRes.annotations as Record<string, AirbnbStoredAnnotation>)) {
            if (k.startsWith('airbnb_')) next[k] = v
          }
          setAnnotations(next)
          annotationsRef.current = next
        }
        const prefs = prefRes.preferences as
          | {
              column_order?: string[] | null
              column_visibility?: VisibilityState | null
              column_widths?: ColumnSizingState | null
              sort_state?: SortingState | null
            }
          | null
          | undefined
        if (prefs) {
          const valid = new Set<string>(AIRBNB_COL_IDS)
          if (prefs.column_visibility && typeof prefs.column_visibility === 'object') {
            setColumnVisibility({ ...defaultAirbnbNearbyVisibility(), ...prefs.column_visibility })
          }
          if (prefs.column_order && Array.isArray(prefs.column_order) && prefs.column_order.length > 0) {
            setColumnOrder(prefs.column_order.filter((k) => valid.has(k)))
          }
          if (prefs.column_widths && typeof prefs.column_widths === 'object') {
            setColumnSizing(prefs.column_widths)
          }
          if (prefs.sort_state && Array.isArray(prefs.sort_state)) {
            setSorting(prefs.sort_state as SortingState)
          }
        }
      } catch (e) {
        console.error('[airbnb nearby] Failed to load workspace state:', e)
      } finally {
        if (!cancelled) {
          setPrefsReady(true)
          setLayoutSaveReady(true)
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!prefsReady || !layoutSaveReady) return
    if (prefSaveTimer.current) clearTimeout(prefSaveTimer.current)
    prefSaveTimer.current = setTimeout(async () => {
      try {
        await fetch('/api/leads/preferences', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            table_id: AIRBNB_NEARBY_TABLE_ID,
            column_order: columnOrder.length > 0 ? columnOrder : null,
            column_visibility: columnVisibility,
            column_widths: Object.keys(columnSizing).length > 0 ? columnSizing : null,
            sort_state: sorting.length > 0 ? sorting : null,
            filters: null,
          }),
        })
      } catch (e) {
        console.error('[airbnb nearby] Failed to save preferences:', e)
      }
    }, 500)
    return () => {
      if (prefSaveTimer.current) clearTimeout(prefSaveTimer.current)
    }
  }, [prefsReady, layoutSaveReady, columnVisibility, columnOrder, columnSizing, sorting])

  const savePblListingFlagCounts = useCallback(() => {
    if (parentApplicationId == null || !Number.isFinite(parentApplicationId)) return
    window.setTimeout(async () => {
      const map = annotationsRef.current
      let yesCount = 0
      let maybeCount = 0
      for (const listing of countSourceRows) {
        const id = Number(listing.id)
        if (!Number.isFinite(id)) continue
        const key = airbnbAnnotationRowKey(id)
        const flag = airbnbFlagFromAnnotation(map[key])
        if (flag === 'yes') yesCount++
        else if (flag === 'maybe') maybeCount++
      }
      const pblKey = `pbl_app_${parentApplicationId}`
      try {
        const res = await fetch('/api/leads/annotations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            row_key: pblKey,
            flagged_count: yesCount,
            maybe_count: maybeCount,
          }),
        })
        const json = (await res.json()) as { annotation?: Record<string, unknown>; error?: string }
        if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`)
        if (json.annotation && onPblCountsSaved) onPblCountsSaved(pblKey, json.annotation)
      } catch (e) {
        console.error('[airbnb nearby] Failed to save PBL flag counts:', e)
      }
    }, 100)
  }, [parentApplicationId, countSourceRows, onPblCountsSaved])

  const saveAnnotation = useCallback(
    async (listingId: number, patch: Partial<{ flag: string; va: string | null; notesText: string | null }>) => {
      if (!Number.isFinite(listingId)) return
      const rowKey = airbnbAnnotationRowKey(listingId)
      const row = rowByListingId.get(listingId) ?? {}
      const cur = annotationsRef.current[rowKey]
      const flag =
        patch.flag !== undefined
          ? patch.flag
          : cur
            ? airbnbFlagFromAnnotation(cur)
            : String(row.flag ?? '')
      const curPacked = parseAirbnbPackedNotes((cur?.notes as string) ?? null)
      const va =
        patch.va !== undefined
          ? (patch.va ?? '')
          : cur != null
            ? curPacked.va
            : String(row.verified_address ?? '')
      const n =
        patch.notesText !== undefined
          ? (patch.notesText ?? '')
          : cur != null
            ? curPacked.n
            : String(row.notes ?? '')
      const { flagged, status } = airbnbFlagToApi(flag)
      const notesOut = va === '' && n === '' ? null : JSON.stringify({ va, n })
      const merged: AirbnbStoredAnnotation = {
        row_key: rowKey,
        status,
        notes: notesOut,
        flagged,
      }
      setAnnotations((prev) => ({ ...prev, [rowKey]: merged }))
      annotationsRef.current = { ...annotationsRef.current, [rowKey]: merged }
      try {
        const res = await fetch('/api/leads/annotations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            row_key: rowKey,
            status: merged.status ?? 'not_started',
            notes: merged.notes ?? null,
            flagged: merged.flagged ?? false,
          }),
        })
        if (!res.ok) {
          const errJson = (await res.json().catch(() => ({}))) as { error?: string }
          throw new Error(errJson.error || `HTTP ${res.status}`)
        }
        savePblListingFlagCounts()
      } catch (e) {
        console.error('[airbnb nearby] Failed to save annotation:', e)
      }
    },
    [rowByListingId, savePblListingFlagCounts]
  )

  const airbnbColLabels: Record<AirbnbNearbyColId, string> = {
    flag: 'Flag',
    listing: 'Listing',
    host: 'Host',
    type: 'Type',
    price: 'Price',
    license: 'License',
    noncompliant: 'Noncompliant',
    reviews: 'Reviews',
    host_listings: 'Host Listings',
    verified_address: 'Verified Address',
    notes: 'Notes',
  }

  const columns = useMemo<TanStackColumnDef<Record<string, unknown>>[]>(() => {
    const base: TanStackColumnDef<Record<string, unknown>>[] = [
      {
        id: 'flag',
        accessorFn: (r) => r.id,
        header: 'Flag',
        size: 100,
        cell: ({ row }) => {
          const listingId = Number(row.original.id)
          const rowKey = airbnbAnnotationRowKey(listingId)
          const ann = annotations[rowKey]
          const effFlag = ann ? airbnbFlagFromAnnotation(ann) : String(row.original.flag ?? '')
          return (
            <select
              className={`explore-annotation-select ${
                effFlag === 'yes' ? 'ann-yes' : effFlag === 'maybe' ? 'ann-maybe' : effFlag === 'no' ? 'ann-no' : ''
              }`}
              value={effFlag}
              onChange={(e) => {
                if (!Number.isFinite(listingId)) return
                void saveAnnotation(listingId, { flag: e.target.value })
              }}
            >
              <option value="">—</option>
              <option value="yes">Yes</option>
              <option value="maybe">Maybe</option>
              <option value="no">No</option>
            </select>
          )
        },
        enableSorting: false,
        meta: { type: 'text', sticky: false },
      },
      {
        id: 'listing',
        accessorKey: 'id',
        header: 'Listing',
        size: 96,
        cell: ({ row }) => {
          const id = row.original.id
          return row.original.listing_url ? (
            <a
              href={String(row.original.listing_url)}
              target="_blank"
              rel="noopener noreferrer"
              className="explore-drill-link"
            >
              {String(id ?? '—')}
            </a>
          ) : (
            String(id ?? '—')
          )
        },
        meta: { type: 'text', sticky: false },
      },
      {
        id: 'host',
        accessorKey: 'host_name',
        header: 'Host',
        size: 140,
        cell: (info) => String(info.row.original.host_name ?? '—'),
        meta: { type: 'text', sticky: false },
      },
      {
        id: 'type',
        accessorKey: 'property_type',
        header: 'Type',
        size: 120,
        cell: (info) => String(info.row.original.property_type ?? '—'),
        meta: { type: 'text', sticky: false },
      },
      {
        id: 'price',
        accessorKey: 'price',
        header: 'Price',
        size: 80,
        cell: (info) => String(info.row.original.price ?? '—'),
        meta: { type: 'text', sticky: false },
      },
      {
        id: 'license',
        accessorKey: 'license',
        header: 'License',
        size: 140,
        cell: (info) => (
          <span style={{ display: 'block', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {String(info.row.original.license ?? '—')}
          </span>
        ),
        meta: { type: 'text', sticky: false },
      },
      {
        id: 'noncompliant',
        accessorKey: 'is_potentially_noncompliant',
        header: 'Noncompliant',
        size: 110,
        cell: ({ row }) => (
          <span
            className={`explore-modal-badge ${row.original.is_potentially_noncompliant ? 'badge-open' : 'badge-closed'}`}
          >
            {row.original.is_potentially_noncompliant ? 'Yes' : 'No'}
          </span>
        ),
        meta: { type: 'text', sticky: false },
      },
      {
        id: 'reviews',
        accessorKey: 'number_of_reviews',
        header: 'Reviews',
        size: 88,
        cell: (info) =>
          info.row.original.number_of_reviews != null
            ? Number(info.row.original.number_of_reviews).toLocaleString()
            : '—',
        meta: { type: 'number', sticky: false },
      },
      {
        id: 'host_listings',
        accessorKey: 'host_listings_count',
        header: 'Host Listings',
        size: 110,
        cell: (info) =>
          info.row.original.host_listings_count != null ? String(info.row.original.host_listings_count) : '—',
        meta: { type: 'number', sticky: false },
      },
      {
        id: 'verified_address',
        accessorFn: (r) => r.id,
        header: 'Verified Address',
        size: 200,
        cell: ({ row }) => {
          const listingId = Number(row.original.id)
          const rowKey = airbnbAnnotationRowKey(listingId)
          const ann = annotations[rowKey]
          const packed = parseAirbnbPackedNotes((ann?.notes as string) ?? null)
          const v =
            ann != null
              ? packed.va
              : String(row.original.verified_address ?? '')
          return (
            <input
              key={`${rowKey}-va-${v}`}
              type="text"
              className="explore-annotation-input"
              defaultValue={v}
              placeholder="Address…"
              onKeyDown={(e) => {
                if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
              }}
              onBlur={(e) => {
                if (!Number.isFinite(listingId)) return
                const next = e.target.value
                if (next === v) return
                void saveAnnotation(listingId, { va: next || null })
              }}
            />
          )
        },
        enableSorting: false,
        meta: { type: 'text', sticky: false },
      },
      {
        id: 'notes',
        accessorFn: (r) => r.id,
        header: 'Notes',
        size: 160,
        cell: ({ row }) => {
          const listingId = Number(row.original.id)
          const rowKey = airbnbAnnotationRowKey(listingId)
          const ann = annotations[rowKey]
          const packed = parseAirbnbPackedNotes((ann?.notes as string) ?? null)
          const v = ann != null ? packed.n : String(row.original.notes ?? '')
          return (
            <input
              key={`${rowKey}-n-${v}`}
              type="text"
              className="explore-annotation-input explore-annotation-notes"
              defaultValue={v}
              placeholder="Notes…"
              onKeyDown={(e) => {
                if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
              }}
              onBlur={(e) => {
                if (!Number.isFinite(listingId)) return
                const next = e.target.value
                if (next === v) return
                void saveAnnotation(listingId, { notesText: next || null })
              }}
            />
          )
        },
        enableSorting: false,
        meta: { type: 'text', sticky: false },
      },
    ]

    const byId = new Map<string, TanStackColumnDef<Record<string, unknown>>>()
    for (const c of base) {
      if (c.id) byId.set(c.id, c)
    }

    const defaultOrder: string[] = [...AIRBNB_COL_IDS]
    let orderedIds: string[] = defaultOrder
    if (columnOrder.length > 0) {
      const seen = new Set<string>()
      orderedIds = []
      for (const id of columnOrder) {
        if (byId.has(id) && columnVisibility[id] !== false && !seen.has(id)) {
          orderedIds.push(id)
          seen.add(id)
        }
      }
      for (const id of defaultOrder) {
        if (columnVisibility[id] !== false && !seen.has(id)) {
          orderedIds.push(id)
          seen.add(id)
        }
      }
    } else {
      orderedIds = defaultOrder.filter((id) => columnVisibility[id] !== false)
    }

    const result = orderedIds
      .map((id) => byId.get(id))
      .filter((c): c is TanStackColumnDef<Record<string, unknown>> => Boolean(c))
    return result.length > 0 ? result : base
  }, [annotations, saveAnnotation, columnVisibility, columnOrder])

  const table = useReactTable({
    data: rows,
    columns,
    state: { sorting, columnSizing, columnOrder },
    onSortingChange: setSorting,
    onColumnSizingChange: setColumnSizing,
    onColumnOrderChange: setColumnOrder,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    enableColumnResizing: true,
    columnResizeMode: 'onChange',
  })

  const colVisible = AIRBNB_COL_IDS.filter((id) => columnVisibility[id] !== false).length

  if (!prefsReady) {
    return <div className="explore-modal-loading">Loading…</div>
  }

  return (
    <>
      <div className="explore-toolbar explore-lead-toolbar" style={{ marginBottom: 8 }}>
        <div className="explore-toolbar-left">
          <div className="explore-col-picker-wrap" ref={colPickerRef}>
            <button
              type="button"
              className="explore-btn"
              onClick={() => setShowColumnPicker(!showColumnPicker)}
            >
              Columns {colVisible}/{AIRBNB_COL_IDS.length}
            </button>
            {showColumnPicker && (
              <div className="explore-col-picker">
                <div className="explore-col-picker-header">
                  <span>Toggle columns</span>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                    <button
                      type="button"
                      className="explore-col-picker-action"
                      onClick={() => {
                        setColumnVisibility(defaultAirbnbNearbyVisibility())
                      }}
                    >
                      All
                    </button>
                    <button
                      type="button"
                      className="explore-col-picker-action"
                      onClick={() => {
                        const none: VisibilityState = {}
                        for (const id of AIRBNB_COL_IDS) none[id] = false
                        setColumnVisibility(none)
                      }}
                    >
                      None
                    </button>
                  </div>
                </div>
                <div className="explore-col-picker-list">
                  {AIRBNB_COL_IDS.map((id) => (
                    <label key={id} className="explore-col-picker-item">
                      <input
                        type="checkbox"
                        checked={columnVisibility[id] !== false}
                        onChange={(e) =>
                          setColumnVisibility((prev) => ({
                            ...prev,
                            [id]: e.target.checked,
                          }))
                        }
                      />
                      <span>{airbnbColLabels[id]}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="explore-table-wrap explore-modal-table-wrap">
        <table
          className="explore-table explore-modal-table"
          style={
            table.getState().columnSizing && Object.keys(table.getState().columnSizing).length > 0
              ? { tableLayout: 'fixed' as const, width: table.getTotalSize() }
              : undefined
          }
        >
          <thead>
            <tr>
              {table.getHeaderGroups()[0]?.headers.map((header) => {
                const sortDir = header.column.getIsSorted()
                return (
                  <th
                    key={header.id}
                    className={`explore-th ${dragOverCol === header.id ? 'explore-th-dragover' : ''}`}
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
          </thead>
          <tbody>
            {table.getRowModel().rows.map((rrow, rowIdx) => (
              <tr key={rrow.id} className={rowIdx % 2 === 0 ? 'explore-row-even' : 'explore-row-odd'}>
                {rrow.getVisibleCells().map((cell) => {
                  const sizing = table.getState().columnSizing
                  const hasSizing = sizing && Object.keys(sizing).length > 0
                  return (
                    <td
                      key={cell.id}
                      className="explore-td"
                      style={hasSizing ? { width: cell.column.getSize() } : undefined}
                    >
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
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
    parentApplicationId: number | null
  }>({ open: false, type: 'shvr', address: '', data: [], loading: false, parentApplicationId: null })

  /** Lead annotations for PBL grid cells (Flagged Yes / Maybe). */
  const [pblExploreAnnotations, setPblExploreAnnotations] = useState<
    Record<string, Record<string, unknown>>
  >({})

  /** Notify Lead Explorer to merge an annotation row updated from the Airbnb modal. */
  const [leadModalAnnMerge, setLeadModalAnnMerge] = useState<{
    rowKey: string
    annotation: Record<string, unknown>
  } | null>(null)

  const clearLeadModalAnnMerge = useCallback(() => setLeadModalAnnMerge(null), [])

  const handlePblCountsSavedFromModal = useCallback((rowKey: string, annotation: Record<string, unknown>) => {
    setPblExploreAnnotations((prev) => ({ ...prev, [rowKey]: { ...prev[rowKey], ...annotation } }))
    setLeadModalAnnMerge({ rowKey, annotation })
  }, [])

  // Debounce filters so we don't fire on every keystroke
  const debouncedFilters = useDebouncedValue(columnFilters, 400)

  useEffect(() => {
    if (activeExploreTab !== 'data' || selectedTable !== 'pbl_intelligence_live') return
    let cancelled = false
    fetch('/api/leads/annotations')
      .then((r) => r.json())
      .then((json: { annotations?: Record<string, Record<string, unknown>>; error?: unknown }) => {
        if (cancelled || json.error) return
        if (json.annotations && typeof json.annotations === 'object') {
          setPblExploreAnnotations(json.annotations)
        }
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [activeExploreTab, selectedTable])

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
    (
      lat: number,
      lng: number,
      type: 'shvr' | 'airbnb',
      address: string,
      flagFilter?: string,
      parentApplicationId?: number
    ) => {
      setDrillModal({
        open: true,
        type,
        address,
        data: [],
        loading: true,
        flagFilter,
        parentApplicationId:
          parentApplicationId != null && Number.isFinite(parentApplicationId) ? parentApplicationId : null,
      })
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

  const closeDrillModal = useCallback(() => {
    setDrillModal((p) => ({ ...p, open: false }))
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
        const row = info.row.original
        const annKey = isPbl ? pblLeadAnnotationKeyFromRow(row) : null
        const pblAnn = annKey ? pblExploreAnnotations[annKey] : null

        let displayValue: unknown = value
        if (isPbl && col.key === 'flagged_yes') {
          displayValue =
            pblAnn?.flagged_count !== undefined && pblAnn?.flagged_count !== null
              ? pblAnn.flagged_count
              : value
        } else if (isPbl && col.key === 'flagged_maybe') {
          displayValue =
            pblAnn?.maybe_count !== undefined && pblAnn?.maybe_count !== null
              ? pblAnn.maybe_count
              : value
        }

        const numDisplay = Number(displayValue ?? 0)
        const canDrillAirbnb =
          isPbl &&
          (col.key === 'nearby_airbnb_count' ||
            col.key === 'flagged_yes' ||
            col.key === 'flagged_maybe') &&
          numDisplay > 0
        const canDrillShvr = isPbl && col.key === 'shvr_total' && Number(value) > 0

        if (canDrillShvr || canDrillAirbnb) {
          const type = col.key === 'shvr_total' ? 'shvr' : 'airbnb'
          const ff = col.key === 'flagged_yes' ? 'yes' : col.key === 'flagged_maybe' ? 'maybe' : undefined
          const appId = Number(row.application_id)
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
                  ff,
                  Number.isFinite(appId) ? appId : undefined
                )
              }}
            >
              {formatCell(displayValue, col.type)}
            </button>
          )
        }
        return formatCell(displayValue, col.type)
      },
      enableSorting: true,
      meta: { type: col.type, sticky: col.sticky },
    }))
  }, [tableDef, selectedTable, handleDrillClick, pblExploreAnnotations])

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
            <LeadExplorer
              onDrillClick={handleDrillClick}
              modalAnnotationMerge={leadModalAnnMerge}
              clearModalAnnotationMerge={clearLeadModalAnnMerge}
            />
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
                  <AirbnbNearbyDrillTable
                    rows={displayData}
                    countSourceRows={drillModal.data}
                    parentApplicationId={drillModal.parentApplicationId}
                    onPblCountsSaved={handlePblCountsSavedFromModal}
                  />
                )}
              </div>
              <div className="explore-modal-footer">
                <span>
                  {displayData.length} {drillModal.type === 'shvr' ? 'complaint' : 'listing'}
                  {displayData.length !== 1 ? 's' : ''} within {drillModal.type === 'shvr' ? '40m' : '150m'}
                  {drillModal.flagFilter ? ` (filtered: ${drillModal.flagFilter})` : ''}
                </span>
              </div>
            </div>
          </div>
        )
      })()}
    </div>
  )
}