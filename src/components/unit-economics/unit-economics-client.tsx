'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { Hint } from '@/components/ui/hint'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

// ─── Типы ──────────────────────────────────────────────────────────────────────

interface UeRow {
  nm_id: number
  name: string
  vendor_code: string
  photo_url: string | null
  cost_price: number
  current_stock: number
  avg_delivery: number | null
  avg_commission_pct: number | null
  avg_storage: number | null
  avg_buyout_rate: number | null
  price_before_spp: number | null
  spp_pct: number | null
  price_after_spp: number | null
  commission_rub: number | null
  net_profit: number | null
  margin_pct: number | null
  roi_pct: number | null
  break_even: number | null
  potential_profit: number | null
  usn_pct: number
}

// ─── Колонки ───────────────────────────────────────────────────────────────────

const ALL_COLUMNS = [
  { key: 'photo',              label: 'Фото',            hint: '' },
  { key: 'cost_price',         label: 'Себест.',         hint: 'Полная себестоимость из Справочника.' },
  { key: 'avg_buyout_rate',    label: '% выкупа',        hint: 'Средний % выкупа за период из Воронки продаж.' },
  { key: 'avg_commission_pct', label: 'Комис. %',        hint: 'Средний % комиссии WB из финансовых отчётов.' },
  { key: 'logistics',          label: 'Логист.',         hint: 'Логистика с учётом выкупа: (выкуп×лог. + (1−выкуп)×(лог.+55)) / выкуп.' },
  { key: 'avg_storage',        label: 'Хранение',        hint: 'Среднесуточное хранение на складах WB за период.' },
  { key: 'price_before_spp',   label: 'Цена до СПП',    hint: 'Кликните для ввода. Иначе — средняя из истории продаж.' },
  { key: 'spp_pct',            label: '% СПП',           hint: 'Скидка постоянного покупателя. Кликните для ввода.' },
  { key: 'price_after_spp',    label: 'Цена после СПП', hint: 'Цена до СПП × (1 − % СПП / 100).' },
  { key: 'net_profit',         label: 'Прибыль/ед.',    hint: 'Цена до СПП − Себест. − Комиссия − Логист. − Хранение − УСН − Брак 1%.' },
  { key: 'margin_pct',         label: 'Рент. %',         hint: 'Прибыль / Цена до СПП × 100.' },
  { key: 'roi_pct',            label: 'ROI %',           hint: 'Прибыль / Себестоимость × 100.' },
  { key: 'break_even',         label: 'Точка безуб.',   hint: 'Минимальная цена при которой прибыль = 0.' },
  { key: 'current_stock',      label: 'Остаток',         hint: '' },
  { key: 'potential_profit',   label: 'Потенц. прибыль', hint: 'Прибыль/ед. × остаток на складах ВБ.' },
] as const

type ColKey = typeof ALL_COLUMNS[number]['key']

const DEFAULT_COLUMNS: ColKey[] = [
  'photo', 'cost_price', 'avg_buyout_rate', 'avg_commission_pct', 'logistics',
  'avg_storage', 'price_before_spp', 'spp_pct', 'price_after_spp',
  'net_profit', 'margin_pct', 'roi_pct', 'current_stock', 'potential_profit',
]

// ─── Вспомогательные ───────────────────────────────────────────────────────────

function moscowDate(offsetDays = 0): string {
  const d = new Date(Date.now() + 3 * 60 * 60 * 1000)
  d.setUTCDate(d.getUTCDate() - offsetDays)
  return d.toISOString().split('T')[0]
}

const PRESETS = [
  { label: '7 дн',  days: 7  },
  { label: '14 дн', days: 14 },
  { label: '30 дн', days: 30 },
  { label: '90 дн', days: 90 },
]

function fmt(v: number | null, decimals = 0, suffix = '') {
  if (v == null) return '—'
  return v.toLocaleString('ru-RU', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }) + suffix
}
function fmtRub(v: number | null) {
  if (v == null) return '—'
  return v.toLocaleString('ru-RU', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + ' ₽'
}
function profitColor(v: number | null) {
  if (v == null) return ''
  if (v > 0) return 'text-emerald-600 dark:text-emerald-400'
  if (v < 0) return 'text-red-500'
  return ''
}

function logisticAdj(delivery: number, buyoutPct: number): number {
  const b = buyoutPct / 100
  return (b * delivery + (1 - b) * (delivery + 55)) / b
}

// ─── Inline-ячейка ─────────────────────────────────────────────────────────────

function EditCell({ value, suffix, onSave }: { value: number | null; suffix?: string; onSave: (v: number | null) => void }) {
  const [editing, setEditing] = useState(false)
  const [input, setInput]     = useState('')
  const ref = useRef<HTMLInputElement>(null)

  function startEdit() { setInput(value != null ? String(value) : ''); setEditing(true); setTimeout(() => ref.current?.select(), 0) }
  function commit() { const n = parseFloat(input.replace(',', '.')); onSave(isNaN(n) ? null : n); setEditing(false) }

  if (editing) return (
    <input ref={ref} autoFocus
      className="w-20 border border-primary rounded px-1 py-0 text-xs text-right bg-white dark:bg-zinc-800 focus:outline-none"
      value={input} onChange={e => setInput(e.target.value)}
      onBlur={commit} onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(false) }}
    />
  )
  return (
    <span className="cursor-pointer rounded px-1 hover:bg-primary/10 transition-colors text-xs" onClick={startEdit} title="Нажмите для редактирования">
      {value != null ? `${value}${suffix ?? ''}` : <span className="text-zinc-400 italic">ввод</span>}
    </span>
  )
}

// ─── Модаль колонок ────────────────────────────────────────────────────────────

function ColumnsModal({ visible, onChange, onClose }: { visible: Set<ColKey>; onChange: (s: Set<ColKey>) => void; onClose: () => void }) {
  const [sel, setSel] = useState<Set<ColKey>>(new Set(visible))
  const toggle = (k: ColKey) => setSel(prev => { const n = new Set(prev); n.has(k) ? n.delete(k) : n.add(k); return n })
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-background rounded-lg p-6 w-80 shadow-xl">
        <h2 className="text-base font-semibold mb-4">Настройка колонок</h2>
        <div className="space-y-2 mb-4 max-h-80 overflow-y-auto">
          {ALL_COLUMNS.map(col => (
            <label key={col.key} className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={sel.has(col.key)} onChange={() => toggle(col.key)} className="rounded h-3.5 w-3.5" />
              <span className="text-sm">{col.label}</span>
            </label>
          ))}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setSel(new Set(DEFAULT_COLUMNS))}>По умолчанию</Button>
          <div className="flex-1" />
          <Button variant="outline" size="sm" onClick={onClose}>Отмена</Button>
          <Button size="sm" onClick={() => { onChange(sel); onClose() }}>Сохранить</Button>
        </div>
      </div>
    </div>
  )
}

// ─── Фильтры ───────────────────────────────────────────────────────────────────

interface Filters {
  search: string
  margin_min: string; margin_max: string
  roi_min: string;    roi_max: string
  profit_min: string; profit_max: string
  cost_min: string;   cost_max: string
  price_min: string;  price_max: string
  stock_min: string;  stock_max: string
}

const EMPTY_FILTERS: Filters = {
  search: '', margin_min: '', margin_max: '', roi_min: '', roi_max: '',
  profit_min: '', profit_max: '', cost_min: '', cost_max: '',
  price_min: '', price_max: '', stock_min: '', stock_max: '',
}

function RangeFilter({ label, fMin, fMax, filters, onChange }: { label: string; fMin: keyof Filters; fMax: keyof Filters; filters: Filters; onChange: (f: Filters) => void }) {
  return (
    <div>
      <p className="text-xs font-medium mb-1">{label}</p>
      <div className="flex gap-1">
        <Input placeholder="от" value={filters[fMin]} onChange={e => onChange({ ...filters, [fMin]: e.target.value })} className="h-7 text-xs" />
        <Input placeholder="до" value={filters[fMax]} onChange={e => onChange({ ...filters, [fMax]: e.target.value })} className="h-7 text-xs" />
      </div>
    </div>
  )
}

function FiltersPanel({ filters, onChange, onReset }: { filters: Filters; onChange: (f: Filters) => void; onReset: () => void }) {
  return (
    <div className="w-52 flex-none border border-border rounded-lg p-3 overflow-y-auto space-y-3 bg-background">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">Фильтры</span>
        <button onClick={onReset} className="text-xs text-zinc-400 hover:text-zinc-700">Сбросить</button>
      </div>
      <div>
        <p className="text-xs font-medium mb-1">Поиск</p>
        <Input placeholder="Артикул, название…" value={filters.search} onChange={e => onChange({ ...filters, search: e.target.value })} className="h-7 text-xs" />
      </div>
      <RangeFilter label="Рентабельность, %" fMin="margin_min" fMax="margin_max" filters={filters} onChange={onChange} />
      <RangeFilter label="ROI, %"              fMin="roi_min"    fMax="roi_max"    filters={filters} onChange={onChange} />
      <RangeFilter label="Прибыль/ед., ₽"     fMin="profit_min" fMax="profit_max" filters={filters} onChange={onChange} />
      <RangeFilter label="Себестоимость, ₽"   fMin="cost_min"   fMax="cost_max"   filters={filters} onChange={onChange} />
      <RangeFilter label="Цена до СПП, ₽"     fMin="price_min"  fMax="price_max"  filters={filters} onChange={onChange} />
      <RangeFilter label="Остаток, шт"        fMin="stock_min"  fMax="stock_max"  filters={filters} onChange={onChange} />
      <Button variant="outline" size="sm" className="w-full" onClick={onReset}>Сбросить все</Button>
    </div>
  )
}

// ─── Главный компонент ─────────────────────────────────────────────────────────

export function UnitEconomicsClient() {
  const [activePreset, setActivePreset] = useState('30 дн')
  const [dateFrom, setDateFrom] = useState(moscowDate(30))
  const [dateTo,   setDateTo]   = useState(moscowDate(0))
  const [rows,     setRows]     = useState<UeRow[]>([])
  const [loading,  setLoading]  = useState(false)
  const [saving,   setSaving]   = useState<Set<number>>(new Set())
  const [filters,  setFilters]  = useState<Filters>(EMPTY_FILTERS)
  const [visibleCols, setVisibleCols] = useState<Set<ColKey>>(new Set(DEFAULT_COLUMNS))
  const [showColModal, setShowColModal] = useState(false)

  function applyPreset(p: typeof PRESETS[0]) {
    setActivePreset(p.label)
    setDateFrom(moscowDate(p.days))
    setDateTo(moscowDate(0))
  }

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/unit-economics?date_from=${dateFrom}&date_to=${dateTo}`)
      const data = await res.json()
      setRows(data.rows ?? [])
    } finally {
      setLoading(false)
    }
  }, [dateFrom, dateTo])

  useEffect(() => { fetchData() }, [fetchData])

  async function saveOverride(nmId: number, field: 'price_before_spp' | 'spp_pct', value: number | null) {
    setSaving(prev => new Set(prev).add(nmId))
    try {
      const row = rows.find(r => r.nm_id === nmId)
      await fetch('/api/unit-economics', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nm_id: nmId,
          price_before_spp: field === 'price_before_spp' ? value : row?.price_before_spp,
          spp_pct:          field === 'spp_pct'          ? value : row?.spp_pct,
        }),
      })
      await fetchData()
    } finally {
      setSaving(prev => { const s = new Set(prev); s.delete(nmId); return s })
    }
  }

  // Фильтрация
  const filtered = useMemo(() => {
    const n = (s: string) => s === '' ? null : parseFloat(s)
    return rows.filter(r => {
      const q = filters.search.toLowerCase()
      if (q && !r.name?.toLowerCase().includes(q) && !r.vendor_code?.toLowerCase().includes(q) && !String(r.nm_id).includes(q)) return false
      if (n(filters.margin_min) != null && (r.margin_pct ?? -Infinity) < n(filters.margin_min)!) return false
      if (n(filters.margin_max) != null && (r.margin_pct ?? Infinity)  > n(filters.margin_max)!) return false
      if (n(filters.roi_min)    != null && (r.roi_pct    ?? -Infinity) < n(filters.roi_min)!)    return false
      if (n(filters.roi_max)    != null && (r.roi_pct    ?? Infinity)  > n(filters.roi_max)!)    return false
      if (n(filters.profit_min) != null && (r.net_profit ?? -Infinity) < n(filters.profit_min)!) return false
      if (n(filters.profit_max) != null && (r.net_profit ?? Infinity)  > n(filters.profit_max)!) return false
      if (n(filters.cost_min)   != null && (r.cost_price ?? -Infinity) < n(filters.cost_min)!)   return false
      if (n(filters.cost_max)   != null && (r.cost_price ?? Infinity)  > n(filters.cost_max)!)   return false
      if (n(filters.price_min)  != null && (r.price_before_spp ?? -Infinity) < n(filters.price_min)!) return false
      if (n(filters.price_max)  != null && (r.price_before_spp ?? Infinity)  > n(filters.price_max)!) return false
      if (n(filters.stock_min)  != null && (r.current_stock ?? 0) < n(filters.stock_min)!) return false
      if (n(filters.stock_max)  != null && (r.current_stock ?? 0) > n(filters.stock_max)!) return false
      return true
    })
  }, [rows, filters])

  // KPI
  const withProfit    = filtered.filter(r => r.net_profit != null)
  const totalPotential = filtered.reduce((s, r) => s + (r.potential_profit ?? 0), 0)
  const avgMargin     = withProfit.length ? withProfit.reduce((s, r) => s + (r.margin_pct ?? 0), 0) / withProfit.length : null
  const avgRoi        = withProfit.length ? withProfit.reduce((s, r) => s + (r.roi_pct ?? 0), 0) / withProfit.length : null

  const activeCols = ALL_COLUMNS.filter(c => visibleCols.has(c.key))

  return (
    <div className="space-y-4">
      {/* Пресеты */}
      <div className="flex items-center gap-2 flex-wrap">
        {PRESETS.map(p => (
          <button key={p.label} onClick={() => applyPreset(p)}
            className={`px-3 py-1.5 text-xs rounded-md border font-medium transition-colors ${activePreset === p.label ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-zinc-500 hover:bg-muted'}`}>
            {p.label}
          </button>
        ))}
        <div className="flex items-center gap-1 ml-2">
          <input type="date" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setActivePreset('') }} className="border border-border rounded px-2 py-1 text-xs bg-background" />
          <span className="text-zinc-400 text-xs">—</span>
          <input type="date" value={dateTo} onChange={e => { setDateTo(e.target.value); setActivePreset('') }} className="border border-border rounded px-2 py-1 text-xs bg-background" />
        </div>
        <div className="ml-auto">
          <Button variant="outline" size="sm" className="text-xs" onClick={() => setShowColModal(true)}>Колонки</Button>
        </div>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center gap-1.5 text-xs text-zinc-500 mb-1">
            Потенц. прибыль (остаток)
            <Hint>Чистая прибыль/ед. × остаток на складах ВБ.</Hint>
          </div>
          <div className={`text-2xl font-bold tabular-nums ${profitColor(totalPotential)}`}>{fmtRub(totalPotential)}</div>
          <div className="text-xs text-zinc-400 mt-0.5">{filtered.length} SKU</div>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center gap-1.5 text-xs text-zinc-500 mb-1">Средняя рентабельность<Hint>Прибыль / Цена до СПП. Средняя по SKU с заданной ценой.</Hint></div>
          <div className={`text-2xl font-bold tabular-nums ${profitColor(avgMargin)}`}>{fmt(avgMargin, 1, '%')}</div>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center gap-1.5 text-xs text-zinc-500 mb-1">Средний ROI<Hint>Прибыль / Себестоимость. Средняя по SKU с заданной ценой.</Hint></div>
          <div className={`text-2xl font-bold tabular-nums ${profitColor(avgRoi)}`}>{fmt(avgRoi, 1, '%')}</div>
        </div>
      </div>

      {/* Таблица + фильтры */}
      <div className="flex gap-4 items-start">
        <FiltersPanel filters={filters} onChange={setFilters} onReset={() => setFilters(EMPTY_FILTERS)} />

        <div className="flex-1 min-w-0 rounded-xl border border-border overflow-auto max-h-[calc(100vh-320px)]">
          <table className="w-full text-xs">
            <thead className="sticky top-0 z-20">
              <tr className="bg-zinc-50 dark:bg-zinc-900 border-b border-border">
                {/* Товар — всегда */}
                <th className="sticky left-0 z-30 bg-zinc-50 dark:bg-zinc-900 px-3 py-2.5 text-left font-medium text-zinc-500 min-w-[200px] whitespace-nowrap">
                  Товар
                </th>
                {activeCols.filter(c => c.key !== 'photo').map(col => (
                  <th key={col.key} className="px-3 py-2.5 font-medium text-zinc-500 whitespace-nowrap text-right">
                    <span className={`flex items-center justify-end gap-1`}>
                      {col.label}
                      {col.hint && <Hint>{col.hint}</Hint>}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading && <tr><td colSpan={activeCols.length + 1} className="px-3 py-8 text-center text-zinc-400">Загрузка...</td></tr>}
              {!loading && filtered.length === 0 && (
                <tr><td colSpan={activeCols.length + 1} className="px-3 py-8 text-center text-zinc-400">
                  {rows.length === 0 ? 'Нет товаров с заполненной себестоимостью. Заполните в Справочнике.' : 'Нет товаров по фильтрам.'}
                </td></tr>
              )}
              {filtered.map(row => {
                const logAdj = row.avg_delivery != null && row.avg_buyout_rate != null && row.avg_buyout_rate > 0
                  ? logisticAdj(row.avg_delivery, row.avg_buyout_rate) : null
                const isSaving = saving.has(row.nm_id)
                return (
                  <tr key={row.nm_id} className={`hover:bg-zinc-50 dark:hover:bg-zinc-900/50 transition-colors ${isSaving ? 'opacity-60' : ''}`}>
                    {/* Товар (sticky) */}
                    <td className="sticky left-0 z-10 bg-white dark:bg-zinc-950 px-3 py-2">
                      <div className="flex items-center gap-2 min-w-0">
                        {visibleCols.has('photo') && row.photo_url && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={row.photo_url} alt="" className="w-8 h-8 object-cover rounded shrink-0" />
                        )}
                        <div className="min-w-0">
                          <div className="font-medium text-zinc-800 dark:text-zinc-100 truncate max-w-[160px]">{row.name || row.vendor_code}</div>
                          <div className="text-zinc-400 text-[10px]">{row.vendor_code} · {row.nm_id}</div>
                        </div>
                      </div>
                    </td>
                    {/* Динамические колонки */}
                    {activeCols.filter(c => c.key !== 'photo').map(col => {
                      switch (col.key) {
                        case 'cost_price':         return <td key={col.key} className="px-3 py-2 text-right tabular-nums">{fmtRub(row.cost_price)}</td>
                        case 'avg_buyout_rate':    return <td key={col.key} className="px-3 py-2 text-right tabular-nums">{fmt(row.avg_buyout_rate, 0, '%')}</td>
                        case 'avg_commission_pct': return <td key={col.key} className="px-3 py-2 text-right tabular-nums">{fmt(row.avg_commission_pct, 1, '%')}</td>
                        case 'logistics':          return <td key={col.key} className="px-3 py-2 text-right tabular-nums">{fmtRub(logAdj)}</td>
                        case 'avg_storage':        return <td key={col.key} className="px-3 py-2 text-right tabular-nums">{fmt(row.avg_storage, 1, ' ₽')}</td>
                        case 'price_before_spp':   return <td key={col.key} className="px-3 py-2 text-center"><EditCell value={row.price_before_spp} suffix=" ₽" onSave={v => saveOverride(row.nm_id, 'price_before_spp', v)} /></td>
                        case 'spp_pct':            return <td key={col.key} className="px-3 py-2 text-center"><EditCell value={row.spp_pct} suffix="%" onSave={v => saveOverride(row.nm_id, 'spp_pct', v)} /></td>
                        case 'price_after_spp':    return <td key={col.key} className="px-3 py-2 text-right tabular-nums">{fmtRub(row.price_after_spp)}</td>
                        case 'net_profit':         return <td key={col.key} className={`px-3 py-2 text-right tabular-nums font-medium ${profitColor(row.net_profit)}`}>{fmtRub(row.net_profit)}</td>
                        case 'margin_pct':         return <td key={col.key} className={`px-3 py-2 text-right tabular-nums ${profitColor(row.margin_pct)}`}>{fmt(row.margin_pct, 1, '%')}</td>
                        case 'roi_pct':            return <td key={col.key} className={`px-3 py-2 text-right tabular-nums ${profitColor(row.roi_pct)}`}>{fmt(row.roi_pct, 1, '%')}</td>
                        case 'break_even':         return <td key={col.key} className="px-3 py-2 text-right tabular-nums text-zinc-500">{fmtRub(row.break_even)}</td>
                        case 'current_stock':      return <td key={col.key} className="px-3 py-2 text-right tabular-nums">{row.current_stock ?? 0}</td>
                        case 'potential_profit':   return <td key={col.key} className={`px-3 py-2 text-right tabular-nums font-semibold ${profitColor(row.potential_profit)}`}>{fmtRub(row.potential_profit)}</td>
                        default: return null
                      }
                    })}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-[11px] text-zinc-400">
        УСН {rows[0]?.usn_pct ?? 6}% · Брак 1% · Логистика и комиссия — средние за период · Остатки актуальны на момент последней синхронизации.
      </p>

      {showColModal && (
        <ColumnsModal visible={visibleCols} onChange={setVisibleCols} onClose={() => setShowColModal(false)} />
      )}
    </div>
  )
}
