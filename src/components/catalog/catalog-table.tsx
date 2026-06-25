'use client'

import { useState, useMemo, useCallback, useRef, useEffect, useId } from 'react'
import { Hint } from '@/components/ui/hint'
import { useVirtualizer } from '@tanstack/react-virtual'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { GroupBadge } from './group-badge'
import { ProductCardModal } from './product-card-modal'
import { CatalogFiltersPanel } from './catalog-filters'
import { ColumnsModal } from './catalog-columns-modal'
import { GroupsManagerModal } from './groups-manager-modal'

export interface CatalogProduct {
  nm_id: number
  vendor_code: string | null
  brand: string | null
  title: string | null
  subject_name: string | null
  color: string | null
  photo_url: string | null
  cost_price: number | null
  group_id: string | null
  current_stock: number | null
  avg_price_before_spp: number | null
  avg_price_after_spp: number | null
  avg_orders_per_day: number | null
  buyout_rate: number | null
  volume_liters: number | null
  product_groups: { id: string; name: string; color: string } | null
  days_of_stock: number | null
  empty_date: string | null
}

export interface ProductGroup {
  id: string
  name: string
  color: string
  store_id: string
}

export const ALL_COLUMNS = [
  { key: 'photo', label: 'Фото', sortable: false },
  { key: 'article', label: 'Артикул', sortable: true },
  { key: 'subject_name', label: 'Предмет', sortable: true },
  { key: 'group', label: 'Группа', sortable: true },
  { key: 'color', label: 'Цвет', sortable: true },
  { key: 'buyout_rate', label: '% выкупа', sortable: true },
  { key: 'cost_price', label: 'Себестоимость', sortable: true },
  { key: 'avg_price_before_spp', label: 'Цена до СПП', sortable: true },
  { key: 'avg_price_after_spp', label: 'Цена после СПП', sortable: true },
  { key: 'avg_orders_per_day', label: 'Заказов/день', sortable: true },
  { key: 'current_stock', label: 'Остаток', sortable: true },
  { key: 'empty_date', label: 'Пустой склад', sortable: true },
  { key: 'volume_liters', label: 'Объём, л', sortable: true },
  { key: 'stock_cost_value', label: 'Себест. остатков', sortable: true },
  { key: 'stock_retail_value', label: 'Стоим. остатков (до СПП)', sortable: true },
] as const

export type ColumnKey = typeof ALL_COLUMNS[number]['key']

export const DEFAULT_COLUMNS: ColumnKey[] = [
  'photo', 'article', 'subject_name', 'group',
  'buyout_rate', 'avg_price_before_spp', 'avg_price_after_spp', 'avg_orders_per_day',
  'current_stock', 'empty_date', 'stock_cost_value', 'stock_retail_value',
]

export interface Filters {
  search: string
  group_ids: string[]
  subject_names: string[]
  buyout_rate_min: string
  buyout_rate_max: string
  cost_price_min: string
  cost_price_max: string
  avg_price_before_spp_min: string
  avg_price_before_spp_max: string
  avg_price_after_spp_min: string
  avg_price_after_spp_max: string
  avg_orders_per_day_min: string
  avg_orders_per_day_max: string
  current_stock_min: string
  current_stock_max: string
  stock_cost_value_min: string
  stock_cost_value_max: string
  stock_retail_value_min: string
  stock_retail_value_max: string
}

const EMPTY_FILTERS: Filters = {
  search: '', group_ids: [], subject_names: [],
  buyout_rate_min: '', buyout_rate_max: '',
  cost_price_min: '', cost_price_max: '',
  avg_price_before_spp_min: '', avg_price_before_spp_max: '',
  avg_price_after_spp_min: '', avg_price_after_spp_max: '',
  avg_orders_per_day_min: '', avg_orders_per_day_max: '',
  current_stock_min: '', current_stock_max: '',
  stock_cost_value_min: '', stock_cost_value_max: '',
  stock_retail_value_min: '', stock_retail_value_max: '',
}

type SortKey = ColumnKey | null
type SortDir = 'asc' | 'desc'

function num(v: string) { const n = parseFloat(v); return isNaN(n) ? null : n }

function applyFilters(products: CatalogProduct[], filters: Filters): CatalogProduct[] {
  return products.filter(p => {
    if (filters.search) {
      const q = filters.search.toLowerCase()
      const match = [p.nm_id?.toString(), p.vendor_code, p.title, p.subject_name, p.brand, p.color]
        .some(v => v?.toLowerCase().includes(q))
      if (!match) return false
    }
    if (filters.subject_names.length > 0) {
      if (!p.subject_name || !filters.subject_names.includes(p.subject_name)) return false
    }
    if (filters.group_ids.length > 0) {
      const hasNone = filters.group_ids.includes('__none__')
      const ids = filters.group_ids.filter(g => g !== '__none__')
      const match = (hasNone && !p.group_id) || (ids.length > 0 && p.group_id != null && ids.includes(p.group_id))
      if (!match) return false
    }
    const stockCostVal = (p.current_stock ?? 0) * (p.cost_price ?? 0)
    const stockRetailVal = (p.current_stock ?? 0) * (p.avg_price_before_spp ?? 0)
    const checks: [number | null, string, string][] = [
      [p.buyout_rate, filters.buyout_rate_min, filters.buyout_rate_max],
      [p.cost_price, filters.cost_price_min, filters.cost_price_max],
      [p.avg_price_before_spp, filters.avg_price_before_spp_min, filters.avg_price_before_spp_max],
      [p.avg_price_after_spp, filters.avg_price_after_spp_min, filters.avg_price_after_spp_max],
      [p.avg_orders_per_day, filters.avg_orders_per_day_min, filters.avg_orders_per_day_max],
      [p.current_stock, filters.current_stock_min, filters.current_stock_max],
      [stockCostVal, filters.stock_cost_value_min, filters.stock_cost_value_max],
      [stockRetailVal, filters.stock_retail_value_min, filters.stock_retail_value_max],
    ]
    for (const [val, minStr, maxStr] of checks) {
      const mn = num(minStr), mx = num(maxStr)
      if (mn !== null && (val ?? 0) < mn) return false
      if (mx !== null && (val ?? 0) > mx) return false
    }
    return true
  })
}

function computedVal(p: CatalogProduct, key: ColumnKey): number | null {
  if (key === 'stock_cost_value') return p.cost_price != null ? (p.current_stock ?? 0) * p.cost_price : null
  if (key === 'stock_retail_value') return p.avg_price_before_spp != null ? (p.current_stock ?? 0) * p.avg_price_before_spp : null
  if (key === 'empty_date') return p.days_of_stock
  return null
}

function sortProducts(products: CatalogProduct[], key: SortKey, dir: SortDir): CatalogProduct[] {
  if (!key) return products
  return [...products].sort((a, b) => {
    let av: unknown, bv: unknown
    if (key === 'article') { av = a.vendor_code ?? a.nm_id.toString(); bv = b.vendor_code ?? b.nm_id.toString() }
    else if (key === 'group') { av = a.product_groups?.name ?? ''; bv = b.product_groups?.name ?? '' }
    else if (key === 'stock_cost_value' || key === 'stock_retail_value' || key === 'empty_date') { av = computedVal(a, key); bv = computedVal(b, key) }
    else { av = (a as unknown as Record<string, unknown>)[key]; bv = (b as unknown as Record<string, unknown>)[key] }
    if (av == null && bv == null) return 0
    if (av == null) return 1
    if (bv == null) return -1
    const cmp = av < bv ? -1 : av > bv ? 1 : 0
    return dir === 'asc' ? cmp : -cmp
  })
}

const COLUMN_HINTS: Partial<Record<ColumnKey, string>> = {
  article:             'Артикул поставщика (основной) и артикул WB (nm_id) под ним. Клик по строке открывает карточку товара.',
  buyout_rate:         '% выкупа = выкупленные заказы / все заказы × 100%. Рассчитывается по данным wb_sales за последние 30 дней.',
  avg_orders_per_day:  'Среднее количество заказов в день за последние 30 дней по данным воронки продаж WB.',
  empty_date:          'Прогноз даты, когда закончится текущий остаток. Красный — менее 15 дней, жёлтый — менее 30.',
  volume_liters:       'Объём упаковки в литрах (Д × Ш × В / 1 000 000). Источник: данные хранения WB (wb_storage_daily).',
  stock_cost_value:    'Себестоимость × текущий остаток. Требует заполненной себестоимости в карточке товара.',
  stock_retail_value:  'Цена до СПП × текущий остаток. Показывает розничную стоимость склада.',
  avg_price_before_spp:'Средняя цена товара до применения скидки постоянного покупателя (СПП).',
  avg_price_after_spp: 'Средняя цена, которую реально платит покупатель после применения СПП.',
}

export function CatalogTable({
  products: initialProducts,
  groups: initialGroups,
  savedColumns,
  storeId,
  syncedAt,
}: {
  products: CatalogProduct[]
  groups: ProductGroup[]
  savedColumns: ColumnKey[] | null
  storeId: string
  syncedAt?: string
}) {
  const [products, setProducts] = useState(initialProducts)
  const [groups, setGroups] = useState(initialGroups)
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS)
  const [visibleColumns, setVisibleColumns] = useState<ColumnKey[]>(savedColumns ?? DEFAULT_COLUMNS)
  const [sortKey, setSortKey] = useState<SortKey>(null)
  const [sortDir, setSortDir] = useState<SortDir>('asc')
  const [selectedProduct, setSelectedProduct] = useState<CatalogProduct | null>(null)
  const [showFilters, setShowFilters] = useState(false)
  const [showColumns, setShowColumns] = useState(false)
  const [showGroups, setShowGroups] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadResult, setUploadResult] = useState<{ updated: number; total: number } | null>(null)
  const fileInputId = useId()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const filtered = useMemo(() => applyFilters(products, filters), [products, filters])
  const sorted = useMemo(() => sortProducts(filtered, sortKey, sortDir), [filtered, sortKey, sortDir])

  const parentRef = useRef<HTMLDivElement>(null)
  const virtualizer = useVirtualizer({
    count: sorted.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 48,
    overscan: 10,
  })

  const handleSort = (key: ColumnKey) => {
    if (!ALL_COLUMNS.find(c => c.key === key)?.sortable) return
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('asc') }
  }

  const handleColumnsChange = async (cols: ColumnKey[]) => {
    setVisibleColumns(cols)
    await fetch('/api/user/columns', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ page: 'catalog', columns: cols }),
    })
  }

  const handleProductUpdate = useCallback((updated: CatalogProduct) => {
    setProducts(prev => prev.map(p => p.nm_id === updated.nm_id ? updated : p))
    if (selectedProduct?.nm_id === updated.nm_id) setSelectedProduct(updated)
  }, [selectedProduct])

  const handleGroupsChange = (updated: ProductGroup[]) => {
    setGroups(updated)
  }

  const cols = ALL_COLUMNS.filter(c => visibleColumns.includes(c.key))
  const hasFilters = filters.group_ids.length > 0 || filters.subject_names.length > 0 || Object.entries(filters).some(([k, v]) => k !== 'group_ids' && k !== 'subject_names' && v !== '')

  const exportToExcel = () => {
    import('xlsx').then(XLSX => {
      const exportCols = cols.filter(c => c.key !== 'photo')
      const header = exportCols.map(c => c.label)
      const rows = sorted.map(p => exportCols.map(c => {
        switch (c.key) {
          case 'article': return `${p.vendor_code ?? ''} (${p.nm_id})`
          case 'subject_name': return p.subject_name ?? ''
          case 'group': return p.product_groups?.name ?? ''
          case 'color': return p.color ?? ''
          case 'buyout_rate': return p.buyout_rate ?? ''
          case 'cost_price': return p.cost_price ?? ''
          case 'avg_price_before_spp': return p.avg_price_before_spp ?? ''
          case 'avg_price_after_spp': return p.avg_price_after_spp ?? ''
          case 'avg_orders_per_day': return p.avg_orders_per_day ?? ''
          case 'current_stock': return p.current_stock ?? 0
          case 'volume_liters': return p.volume_liters != null ? Number(p.volume_liters) : ''
          case 'stock_cost_value': return p.cost_price != null ? (p.current_stock ?? 0) * p.cost_price : ''
          case 'stock_retail_value': return p.avg_price_before_spp != null ? (p.current_stock ?? 0) * p.avg_price_before_spp : ''
          default: return ''
        }
      }))
      const ws = XLSX.utils.aoa_to_sheet([header, ...rows])
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'Справочник')
      XLSX.writeFile(wb, `catalog_${new Date().toISOString().split('T')[0]}.xlsx`)
    })
  }

  const totals = useMemo(() => ({
    qty: products.reduce((s, p) => s + (p.current_stock ?? 0), 0),
    costValue: products.reduce((s, p) => s + (p.current_stock ?? 0) * (p.cost_price ?? 0), 0),
    retailValue: products.reduce((s, p) => s + (p.current_stock ?? 0) * (p.avg_price_before_spp ?? 0), 0),
  }), [products])

  function fmtMoney(n: number) {
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + ' млн ₽'
    if (n >= 1_000) return (n / 1_000).toFixed(0) + ' тыс ₽'
    return n.toLocaleString('ru') + ' ₽'
  }

  const downloadTemplate = () => {
    import('xlsx').then(XLSX => {
      const header = ['Артикул WB (nm_id)', 'Артикул поставщика', 'Себестоимость, ₽']
      const rows = products.map(p => [p.nm_id, p.vendor_code ?? '', p.cost_price ?? ''])
      const ws = XLSX.utils.aoa_to_sheet([header, ...rows])
      ws['!cols'] = [{ wch: 18 }, { wch: 30 }, { wch: 20 }]
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'Себестоимость')
      XLSX.writeFile(wb, 'cost_price_template.xlsx')
    })
  }

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    setUploading(true)
    setUploadResult(null)
    try {
      const XLSX = await import('xlsx')
      const buf = await file.arrayBuffer()
      const wb = XLSX.read(buf, { type: 'array' })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const raw: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1 })
      // Skip header row, parse nm_id + cost_price (columns 0 and 2)
      const rows = raw.slice(1)
        .map(r => ({ nm_id: Number(r[0]), cost_price: Number(r[2]) }))
        .filter(r => Number.isFinite(r.nm_id) && r.nm_id > 0 && Number.isFinite(r.cost_price) && r.cost_price > 0)
      if (!rows.length) { alert('Не найдено корректных строк в файле'); setUploading(false); return }
      const res = await fetch('/api/catalog/bulk-cost', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows }),
      })
      const data = await res.json()
      if (res.ok) {
        setUploadResult(data)
        // Update local state
        const costMap: Record<number, number> = {}
        for (const r of rows) costMap[r.nm_id] = r.cost_price
        setProducts(prev => prev.map(p => costMap[p.nm_id] != null ? { ...p, cost_price: costMap[p.nm_id] } : p))
      } else {
        alert('Ошибка: ' + (data.error ?? 'unknown'))
      }
    } catch {
      alert('Не удалось разобрать файл')
    }
    setUploading(false)
  }

  return (
    <div className="flex flex-col gap-3 h-[calc(100vh-160px)]">
      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-lg border bg-card px-4 py-3">
          <p className="text-xs text-muted-foreground">Остатки, шт</p>
          <p className="text-xl font-semibold mt-0.5">{totals.qty.toLocaleString('ru')}</p>
        </div>
        <div className="rounded-lg border bg-card px-4 py-3">
          <p className="text-xs text-muted-foreground">Себестоимость остатков</p>
          <p className="text-xl font-semibold mt-0.5">{totals.costValue > 0 ? fmtMoney(totals.costValue) : '—'}</p>
        </div>
        <div className="rounded-lg border bg-card px-4 py-3">
          <p className="text-xs text-muted-foreground">Стоимость остатков (до СПП)</p>
          <p className="text-xl font-semibold mt-0.5">{totals.retailValue > 0 ? fmtMoney(totals.retailValue) : '—'}</p>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-2 flex-wrap">
        <Input
          placeholder="Поиск по артикулу, названию, цвету…"
          value={filters.search}
          onChange={e => setFilters(f => ({ ...f, search: e.target.value }))}
          className="w-72"
        />
        <Button
          variant={showFilters ? 'default' : 'outline'}
          size="sm"
          onClick={() => setShowFilters(v => !v)}
        >
          Фильтры {hasFilters && <Badge variant="secondary" className="ml-1 h-4 px-1 text-xs">{(filters.group_ids.length > 0 ? 1 : 0) + (filters.subject_names.length > 0 ? 1 : 0) + Object.entries(filters).filter(([k, v]) => k !== 'group_ids' && k !== 'subject_names' && k !== 'search' && v !== '').length}</Badge>}
        </Button>
        <Button variant="outline" size="sm" onClick={() => setShowColumns(true)}>⚙ Колонки</Button>
        <Button variant="outline" size="sm" onClick={() => setShowGroups(true)}>Группы</Button>
        <Button variant="outline" size="sm" onClick={exportToExcel}>↓ Excel</Button>
        <Button variant="outline" size="sm" onClick={downloadTemplate}>↓ Шаблон для Себестоимости</Button>
        <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
          {uploading ? 'Загружаю…' : '↑ Загрузить Себестоимость'}
        </Button>
        <input
          ref={fileInputRef}
          id={fileInputId}
          type="file"
          accept=".xlsx,.xls"
          className="hidden"
          onChange={handleUpload}
        />
        {uploadResult && (
          <span className="text-xs text-emerald-600">
            Обновлено {uploadResult.updated} из {uploadResult.total}
          </span>
        )}
        <span className="ml-auto text-sm text-muted-foreground">{sorted.length} из {products.length}</span>
        {syncedAt && (
          <span className="text-xs text-muted-foreground border-l pl-3 flex items-center gap-1">
            Обновлено: {new Date(syncedAt).toLocaleString('ru', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
            <Hint width={280}>
              Дата последнего обновления карточек товаров из WB Content API. Чтобы обновить — запустите синхронизацию в Настройках → Синхронизация данных → Товары.
            </Hint>
          </span>
        )}
      </div>

      <div className="flex gap-3 flex-1 min-h-0">
        {/* Filters panel */}
        {showFilters && (
          <CatalogFiltersPanel
            filters={filters}
            groups={groups}
            products={products}
            onChange={setFilters}
            onReset={() => setFilters(EMPTY_FILTERS)}
          />
        )}

        {/* Table */}
        <div className="flex-1 flex flex-col min-w-0 border rounded-lg overflow-hidden">
          {/* Header */}
          <div className="flex bg-muted/50 border-b text-xs font-medium text-muted-foreground sticky top-0 z-10">
            {cols.map(col => (
              <div
                key={col.key}
                className={`px-3 py-3 select-none flex items-center gap-1 ${colWidth(col.key)} ${col.sortable ? 'cursor-pointer hover:text-foreground' : ''}`}
                onClick={() => col.sortable && handleSort(col.key)}
              >
                <span>{col.label}{sortKey === col.key && <span className="ml-1">{sortDir === 'asc' ? '↑' : '↓'}</span>}</span>
                {COLUMN_HINTS[col.key] && (
                  <span onClick={e => e.stopPropagation()}>
                    <Hint width={260}>{COLUMN_HINTS[col.key]}</Hint>
                  </span>
                )}
              </div>
            ))}
          </div>

          {/* Virtualized body */}
          <div ref={parentRef} className="flex-1 overflow-auto">
            {sorted.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full min-h-[200px] text-center px-4 gap-2">
                {products.length === 0 ? (
                  <>
                    <span className="text-2xl">📦</span>
                    <p className="text-sm font-medium text-zinc-600 dark:text-zinc-300">Товары не загружены</p>
                    <p className="text-xs text-zinc-400">Дождитесь первой синхронизации — она подтянет карточки из WB Content API</p>
                  </>
                ) : (
                  <>
                    <span className="text-2xl">🔍</span>
                    <p className="text-sm font-medium text-zinc-600 dark:text-zinc-300">Ничего не найдено</p>
                    <p className="text-xs text-zinc-400">Попробуйте изменить фильтры или поисковый запрос</p>
                  </>
                )}
              </div>
            )}
            <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
              {virtualizer.getVirtualItems().map(vi => {
                const p = sorted[vi.index]
                return (
                  <div
                    key={p.nm_id}
                    style={{ position: 'absolute', top: vi.start, left: 0, right: 0, height: vi.size }}
                    className="flex items-center border-b hover:bg-muted/30 cursor-pointer text-sm"
                    onClick={() => setSelectedProduct(p)}
                  >
                    {cols.map(col => (
                      <div key={col.key} className={`px-3 truncate ${colWidth(col.key)}`}>
                        <CellValue col={col.key} product={p} />
                      </div>
                    ))}
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Modals */}
      {selectedProduct && (
        <ProductCardModal
          product={selectedProduct}
          groups={groups}
          onClose={() => setSelectedProduct(null)}
          onUpdate={handleProductUpdate}
        />
      )}
      {showColumns && (
        <ColumnsModal
          visible={visibleColumns}
          onChange={handleColumnsChange}
          onClose={() => setShowColumns(false)}
        />
      )}
      {showGroups && (
        <GroupsManagerModal
          groups={groups}
          storeId={storeId}
          onClose={() => setShowGroups(false)}
          onChange={handleGroupsChange}
        />
      )}
    </div>
  )
}

function colWidth(key: ColumnKey): string {
  const widths: Partial<Record<ColumnKey, string>> = {
    photo: 'w-14 flex-none',
    article: 'w-44 flex-none',
    subject_name: 'w-36 flex-none',
    group: 'w-28 flex-none',
    color: 'w-24 flex-none',
    buyout_rate: 'w-20 flex-none text-right',
    cost_price: 'w-28 flex-none text-right',
    avg_price_before_spp: 'w-28 flex-none text-right',
    avg_price_after_spp: 'w-28 flex-none text-right',
    avg_orders_per_day: 'w-24 flex-none text-right',
    current_stock: 'w-20 flex-none text-right',
    empty_date: 'w-32 flex-none text-right',
    stock_cost_value: 'w-36 flex-none text-right',
    volume_liters: 'w-24 flex-none text-right',
    stock_retail_value: 'w-40 flex-none text-right',
  }
  return widths[key] ?? 'flex-1'
}

function fmt(n: number | null, decimals = 0): string {
  if (n == null) return '—'
  return n.toLocaleString('ru', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
}

function CellValue({ col, product: p }: { col: ColumnKey; product: CatalogProduct }) {
  switch (col) {
    case 'photo':
      return p.photo_url
        ? <img src={p.photo_url} alt="" className="h-10 w-8 object-cover rounded" />
        : <div className="h-10 w-8 bg-muted rounded" />
    case 'article':
      return (
        <div>
          <span className="font-medium text-sm text-zinc-800 dark:text-zinc-100 truncate block">
            {p.vendor_code ?? '—'}
          </span>
          <span className="font-mono text-[10px] text-zinc-400">{p.nm_id}</span>
        </div>
      )
    case 'subject_name': return <>{p.subject_name ?? '—'}</>
    case 'group':
      return p.product_groups
        ? <GroupBadge name={p.product_groups.name} color={p.product_groups.color} />
        : <span className="text-muted-foreground text-xs">—</span>
    case 'color': return <>{p.color ?? '—'}</>
    case 'buyout_rate': return <>{p.buyout_rate != null ? `${fmt(p.buyout_rate, 1)}%` : '—'}</>
    case 'cost_price': return <>{p.cost_price != null ? `${fmt(p.cost_price)} ₽` : '—'}</>
    case 'avg_price_before_spp': return <>{p.avg_price_before_spp != null ? `${fmt(p.avg_price_before_spp)} ₽` : '—'}</>
    case 'avg_price_after_spp': return <>{p.avg_price_after_spp != null ? `${fmt(p.avg_price_after_spp)} ₽` : '—'}</>
    case 'avg_orders_per_day': return <>{p.avg_orders_per_day != null ? fmt(p.avg_orders_per_day, 1) : '—'}</>
    case 'current_stock': return <>{fmt(p.current_stock)}</>
    case 'empty_date': {
      if (p.days_of_stock === null) return <span className="text-muted-foreground text-xs">∞</span>
      if (p.days_of_stock === 0) return <span className="font-semibold text-red-600 text-xs">Пусто</span>
      const colorClass = p.days_of_stock < 15
        ? 'text-red-600 font-semibold'
        : p.days_of_stock < 30
          ? 'text-yellow-600 font-medium'
          : 'text-green-600'
      const dateLabel = p.empty_date
        ? new Date(p.empty_date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })
        : '—'
      return (
        <span className={`text-xs ${colorClass}`} title={`${p.days_of_stock} дн.`}>
          {dateLabel}
        </span>
      )
    }
    case 'volume_liters':
      return <>{p.volume_liters != null ? `${Number(p.volume_liters).toFixed(3)} л` : '—'}</>
    case 'stock_cost_value': {
      const v = computedVal(p, 'stock_cost_value')
      return <>{v != null && v > 0 ? `${fmt(v)} ₽` : '—'}</>
    }
    case 'stock_retail_value': {
      const v = computedVal(p, 'stock_retail_value')
      return <>{v != null && v > 0 ? `${fmt(v)} ₽` : '—'}</>
    }
    default: return null
  }
}
