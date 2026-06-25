'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { Hint } from '@/components/ui/hint'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

export interface AbcRow {
  nm_id: number
  vendor_code: string
  brand: string
  title: string
  photo_url: string | null
  cost_price: number | null
  current_stock: number
  days_of_stock: number | null
  orders_count: number
  revenue: number
  for_pay: number
  net_profit: number | null
  margin_pct: number
  revenue_share: number
  has_cost: boolean
  abc_r: string
  abc_m: string | null
  abc_group: string
  abc_r_prev: string | null
  orders_prev: number
  revenue_prev: number
  is_candidate: boolean
}

// ─── Колонки ───────────────────────────────────────────────────────────────────

const ALL_COLUMNS = [
  { key: 'photo',         label: 'Фото',      hint: '' },
  { key: 'abc_r',         label: 'R',         hint: 'ABC по выручке. A = топ-товары, B = средние, C = хвост. Стрелка ↑↓ — изменение класса.' },
  { key: 'abc_m',         label: 'M',         hint: 'ABC по маржинальности. Рассчитывается только если заполнена себестоимость.' },
  { key: 'revenue',       label: 'Выручка',   hint: 'Сумма выкупов (for_pay > 0) за период. Источник: wb_sales.' },
  { key: 'revenue_share', label: 'Выр. %',    hint: 'Доля этого товара в суммарной выручке за период.' },
  { key: 'margin_pct',    label: 'Маржа %',   hint: 'Маржинальность = (Выручка − Себестоимость) ÷ Выручка × 100%.' },
  { key: 'net_profit',    label: 'Прибыль',   hint: 'Чистая прибыль = Выручка − Себестоимость × кол-во заказов.' },
  { key: 'orders_count',  label: 'Заказы',    hint: 'Количество оформленных заказов за период.' },
  { key: 'current_stock', label: 'Остаток',   hint: 'Текущий остаток на складах WB.' },
  { key: 'days_of_stock', label: 'Дней',      hint: 'Прогноз дней до обнуления склада = остаток ÷ среднее заказов в день.' },
] as const

type ColKey = typeof ALL_COLUMNS[number]['key']

const DEFAULT_COLUMNS: ColKey[] = [
  'photo', 'abc_r', 'abc_m', 'revenue', 'revenue_share',
  'margin_pct', 'net_profit', 'orders_count', 'current_stock', 'days_of_stock',
]

// ─── Вспомогательные ───────────────────────────────────────────────────────────

const CLASS_COLORS: Record<string, string> = {
  A: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300',
  B: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
  C: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
}

function fmt(n: number)    { return n.toLocaleString('ru', { maximumFractionDigits: 0 }) }
function fmtRub(n: number) { return fmt(n) + ' ₽' }
function fmtPct(n: number) { return n.toFixed(1) + '%' }

type SortKey = 'revenue' | 'orders_count' | 'margin_pct' | 'net_profit' | 'current_stock' | 'days_of_stock' | 'revenue_share'
type SortDir = 'asc' | 'desc'

function Arrow({ curr, prev }: { curr: string | null; prev: string | null }) {
  if (!curr || !prev || curr === prev) return null
  const better = (curr === 'A' && prev !== 'A') || (curr === 'B' && prev === 'C')
  return <span className={`ml-1 text-xs ${better ? 'text-emerald-500' : 'text-red-500'}`}>{better ? '↑' : '↓'}</span>
}

// ─── Фильтры ───────────────────────────────────────────────────────────────────

interface Filters {
  search: string
  abc_r: string[]
  abc_m: string[]
  candidates: boolean
  revenue_min: string;  revenue_max: string
  margin_min: string;   margin_max: string
  profit_min: string;   profit_max: string
  orders_min: string;   orders_max: string
  stock_min: string;    stock_max: string
  days_min: string;     days_max: string
}

const EMPTY_FILTERS: Filters = {
  search: '', abc_r: [], abc_m: [], candidates: false,
  revenue_min: '', revenue_max: '', margin_min: '', margin_max: '',
  profit_min: '', profit_max: '', orders_min: '', orders_max: '',
  stock_min: '', stock_max: '', days_min: '', days_max: '',
}

function RangeFilter({ label, fMin, fMax, f, onChange }: {
  label: string; fMin: keyof Filters; fMax: keyof Filters; f: Filters; onChange: (f: Filters) => void
}) {
  return (
    <div>
      <p className="text-xs font-medium mb-1">{label}</p>
      <div className="flex gap-1">
        <Input placeholder="от" value={f[fMin] as string} onChange={e => onChange({ ...f, [fMin]: e.target.value })} className="h-7 text-xs" />
        <Input placeholder="до" value={f[fMax] as string} onChange={e => onChange({ ...f, [fMax]: e.target.value })} className="h-7 text-xs" />
      </div>
    </div>
  )
}

function FiltersPanel({ f, onChange, onReset, candidateCount }: {
  f: Filters; onChange: (f: Filters) => void; onReset: () => void; candidateCount: number
}) {
  function toggleAbcR(cls: string) {
    const next = f.abc_r.includes(cls) ? f.abc_r.filter(c => c !== cls) : [...f.abc_r, cls]
    onChange({ ...f, abc_r: next })
  }
  function toggleAbcM(cls: string) {
    const next = f.abc_m.includes(cls) ? f.abc_m.filter(c => c !== cls) : [...f.abc_m, cls]
    onChange({ ...f, abc_m: next })
  }

  return (
    <div className="w-52 flex-none border border-border rounded-lg p-3 overflow-y-auto space-y-3 bg-background" style={{ maxHeight: 'calc(100vh - 320px)' }}>
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">Фильтры</span>
        <button onClick={onReset} className="text-xs text-zinc-400 hover:text-zinc-700">Сбросить</button>
      </div>

      <div>
        <p className="text-xs font-medium mb-1">Поиск</p>
        <Input placeholder="Артикул, название…" value={f.search} onChange={e => onChange({ ...f, search: e.target.value })} className="h-7 text-xs" />
      </div>

      <div>
        <p className="text-xs font-medium mb-1">ABC-R (выручка)</p>
        <div className="flex gap-1 flex-wrap">
          {(['A', 'B', 'C'] as const).map(cls => (
            <button key={cls} onClick={() => toggleAbcR(cls)}
              className={`px-2.5 py-0.5 text-xs font-bold rounded transition-all ${f.abc_r.includes(cls) ? CLASS_COLORS[cls] : 'bg-zinc-100 text-zinc-400 dark:bg-zinc-800 dark:text-zinc-500'}`}>
              {cls}
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="text-xs font-medium mb-1">ABC-M (маржа)</p>
        <div className="flex gap-1 flex-wrap">
          {(['A', 'B', 'C'] as const).map(cls => (
            <button key={cls} onClick={() => toggleAbcM(cls)}
              className={`px-2.5 py-0.5 text-xs font-bold rounded transition-all ${f.abc_m.includes(cls) ? CLASS_COLORS[cls] : 'bg-zinc-100 text-zinc-400 dark:bg-zinc-800 dark:text-zinc-500'}`}>
              {cls}
            </button>
          ))}
        </div>
      </div>

      {candidateCount > 0 && (
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={f.candidates} onChange={e => onChange({ ...f, candidates: e.target.checked })} className="h-3.5 w-3.5 rounded" />
          <span className="text-xs text-red-500">Кандидаты на вывод ({candidateCount})</span>
        </label>
      )}

      <RangeFilter label="Выручка, ₽"   fMin="revenue_min" fMax="revenue_max" f={f} onChange={onChange} />
      <RangeFilter label="Маржа, %"      fMin="margin_min"  fMax="margin_max"  f={f} onChange={onChange} />
      <RangeFilter label="Прибыль, ₽"   fMin="profit_min"  fMax="profit_max"  f={f} onChange={onChange} />
      <RangeFilter label="Заказы, шт"   fMin="orders_min"  fMax="orders_max"  f={f} onChange={onChange} />
      <RangeFilter label="Остаток, шт"  fMin="stock_min"   fMax="stock_max"   f={f} onChange={onChange} />
      <RangeFilter label="Дней запаса"  fMin="days_min"    fMax="days_max"    f={f} onChange={onChange} />

      <Button variant="outline" size="sm" className="w-full" onClick={onReset}>Сбросить все</Button>
    </div>
  )
}

// ─── Модаль колонок ────────────────────────────────────────────────────────────

function ColumnsModal({ visible, onChange, onClose }: { visible: Set<ColKey>; onChange: (s: Set<ColKey>) => void; onClose: () => void }) {
  const [sel, setSel] = useState<Set<ColKey>>(new Set(visible))
  const toggle = (k: ColKey) => setSel(prev => { const n = new Set(prev); n.has(k) ? n.delete(k) : n.add(k); return n })
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-background rounded-lg p-6 w-72 shadow-xl">
        <h2 className="text-base font-semibold mb-4">Настройка колонок</h2>
        <div className="space-y-2 mb-4">
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

// ─── Главный компонент ─────────────────────────────────────────────────────────

export function AbcTable({ rows, missingCost, dateFrom, dateTo, onRowClick, selectedNmId }: {
  rows: AbcRow[]
  missingCost: number
  dateFrom: string
  dateTo: string
  onRowClick: (row: AbcRow) => void
  selectedNmId: number | null
}) {
  const [filters, setFilters]         = useState<Filters>(EMPTY_FILTERS)
  const [sort, setSort]               = useState<{ key: SortKey; dir: SortDir }>({ key: 'revenue', dir: 'desc' })
  const [visibleCols, setVisibleCols] = useState<Set<ColKey>>(new Set(DEFAULT_COLUMNS))
  const [showColModal, setShowColModal] = useState(false)

  const candidates = rows.filter(r => r.is_candidate).length

  const filtered = useMemo(() => {
    const n = (s: string) => s === '' ? null : parseFloat(s)
    let r = rows
    if (filters.search) {
      const q = filters.search.toLowerCase()
      r = r.filter(row => row.title?.toLowerCase().includes(q) || row.vendor_code?.toLowerCase().includes(q) || String(row.nm_id).includes(q))
    }
    if (filters.abc_r.length)  r = r.filter(row => filters.abc_r.includes(row.abc_r))
    if (filters.abc_m.length)  r = r.filter(row => row.abc_m != null && filters.abc_m.includes(row.abc_m))
    if (filters.candidates)    r = r.filter(row => row.is_candidate)
    if (n(filters.revenue_min) != null) r = r.filter(row => row.revenue >= n(filters.revenue_min)!)
    if (n(filters.revenue_max) != null) r = r.filter(row => row.revenue <= n(filters.revenue_max)!)
    if (n(filters.margin_min)  != null) r = r.filter(row => row.margin_pct >= n(filters.margin_min)!)
    if (n(filters.margin_max)  != null) r = r.filter(row => row.margin_pct <= n(filters.margin_max)!)
    if (n(filters.profit_min)  != null) r = r.filter(row => (row.net_profit ?? -Infinity) >= n(filters.profit_min)!)
    if (n(filters.profit_max)  != null) r = r.filter(row => (row.net_profit ?? Infinity)  <= n(filters.profit_max)!)
    if (n(filters.orders_min)  != null) r = r.filter(row => row.orders_count >= n(filters.orders_min)!)
    if (n(filters.orders_max)  != null) r = r.filter(row => row.orders_count <= n(filters.orders_max)!)
    if (n(filters.stock_min)   != null) r = r.filter(row => row.current_stock >= n(filters.stock_min)!)
    if (n(filters.stock_max)   != null) r = r.filter(row => row.current_stock <= n(filters.stock_max)!)
    if (n(filters.days_min)    != null) r = r.filter(row => (row.days_of_stock ?? -Infinity) >= n(filters.days_min)!)
    if (n(filters.days_max)    != null) r = r.filter(row => (row.days_of_stock ?? Infinity)  <= n(filters.days_max)!)
    return [...r].sort((a, b) => {
      const av = (a[sort.key] ?? -Infinity) as number
      const bv = (b[sort.key] ?? -Infinity) as number
      return sort.dir === 'desc' ? bv - av : av - bv
    })
  }, [rows, filters, sort])

  function toggleSort(key: SortKey) {
    setSort(prev => prev.key === key ? { key, dir: prev.dir === 'desc' ? 'asc' : 'desc' } : { key, dir: 'desc' })
  }

  function exportCsv() {
    const header = ['nmId', 'Артикул', 'Название', 'ABC-R', 'ABC-M', 'Выручка', 'Выручка%', 'Маржа%', 'Чист.прибыль', 'Заказы', 'Остаток', 'Дней'].join(';')
    const body = filtered.map(r => [
      r.nm_id, r.vendor_code, r.title, r.abc_r, r.abc_m ?? '',
      r.revenue, r.revenue_share, r.margin_pct, r.net_profit ?? '',
      r.orders_count, r.current_stock, r.days_of_stock ?? '',
    ].join(';')).join('\n')
    const blob = new Blob(['﻿' + header + '\n' + body], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `abc_${dateFrom}_${dateTo}.csv`; a.click()
  }

  function SortTh({ k, label, hint, center }: { k: SortKey; label: string; hint?: string; center?: boolean }) {
    return (
      <th onClick={() => toggleSort(k)}
        className={`px-3 py-2.5 text-xs font-medium text-zinc-500 cursor-pointer hover:text-zinc-900 dark:hover:text-zinc-100 whitespace-nowrap select-none ${center ? 'text-center' : 'text-right'}`}>
        <span className={`inline-flex items-center gap-1 ${center ? 'justify-center' : 'justify-end'}`}>
          {label}{sort.key === k ? (sort.dir === 'desc' ? ' ↓' : ' ↑') : ''}
          {hint && <span onClick={e => e.stopPropagation()}><Hint width={260}>{hint}</Hint></span>}
        </span>
      </th>
    )
  }

  const activeCols = ALL_COLUMNS.filter(c => visibleCols.has(c.key))

  return (
    <div className="space-y-3">
      {missingCost > 0 && (
        <div className="flex items-center gap-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg px-4 py-3 text-sm">
          <span className="text-amber-500">⚠</span>
          <span className="text-amber-800 dark:text-amber-300 flex-1">{missingCost} SKU без себестоимости — ABC по маржинальности неточный</span>
          <Link href="/catalog" className="shrink-0 px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-white rounded-md text-xs font-medium">Заполнить →</Link>
        </div>
      )}

      {/* Тулбар */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-zinc-400">{filtered.length} / {rows.length} SKU</span>
        <div className="ml-auto flex gap-2">
          <Button variant="outline" size="sm" className="text-xs" onClick={() => setShowColModal(true)}>Колонки</Button>
          <button onClick={exportCsv} className="px-3 py-1.5 text-xs border border-zinc-200 dark:border-zinc-700 rounded-lg text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800">↓ CSV</button>
        </div>
      </div>

      {/* Фильтры + таблица */}
      <div className="flex gap-4 items-start">
        <FiltersPanel f={filters} onChange={setFilters} onReset={() => setFilters(EMPTY_FILTERS)} candidateCount={candidates} />

        <div className="flex-1 min-w-0 rounded-xl border border-zinc-200 dark:border-zinc-800 overflow-auto" style={{ maxHeight: 'calc(100vh - 320px)' }}>
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-20">
              <tr className="bg-zinc-50 dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800">
                <th className="sticky left-0 z-30 bg-zinc-50 dark:bg-zinc-900 text-left px-3 py-2.5 text-xs font-medium text-zinc-500 min-w-[200px]">Товар</th>

                {activeCols.filter(c => c.key !== 'photo').map(col => {
                  const sortable = ['revenue', 'revenue_share', 'margin_pct', 'net_profit', 'orders_count', 'current_stock', 'days_of_stock'].includes(col.key)
                  const center   = ['abc_r', 'abc_m'].includes(col.key)
                  if (sortable) return <SortTh key={col.key} k={col.key as SortKey} label={col.label} hint={col.hint || undefined} center={center} />
                  return (
                    <th key={col.key} className={`px-3 py-2.5 text-xs font-medium text-zinc-500 whitespace-nowrap ${center ? 'text-center' : 'text-right'}`}>
                      <span className={`inline-flex items-center gap-1 ${center ? 'justify-center' : 'justify-end'}`}>
                        {col.label}
                        {col.hint && <Hint width={260}>{col.hint}</Hint>}
                      </span>
                    </th>
                  )
                })}
              </tr>
            </thead>

            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {filtered.length === 0 && (
                <tr><td colSpan={activeCols.length + 1} className="py-12 text-center text-sm text-zinc-400">Нет данных</td></tr>
              )}
              {filtered.map(row => (
                <tr key={row.nm_id}
                  onClick={() => onRowClick(row)}
                  className={`hover:bg-zinc-50 dark:hover:bg-zinc-900/50 transition-colors cursor-pointer ${selectedNmId === row.nm_id ? 'bg-indigo-50 dark:bg-indigo-950/30' : ''} ${row.is_candidate ? 'border-l-2 border-l-red-400' : ''}`}>

                  {/* Товар (sticky) */}
                  <td className="sticky left-0 z-10 bg-white dark:bg-zinc-950 px-3 py-2">
                    <div className="flex items-center gap-2 min-w-0">
                      {visibleCols.has('photo') && (
                        row.photo_url
                          ? <img src={row.photo_url} alt="" className="w-8 h-8 rounded object-cover shrink-0" />
                          : <div className="w-8 h-8 rounded bg-zinc-100 dark:bg-zinc-800 shrink-0" />
                      )}
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-zinc-900 dark:text-zinc-100 truncate max-w-[160px]">{row.title || row.vendor_code}</p>
                        <p className="text-xs text-zinc-400 truncate">{row.nm_id} · {row.brand || row.vendor_code}</p>
                      </div>
                    </div>
                  </td>

                  {/* Динамические колонки */}
                  {activeCols.filter(c => c.key !== 'photo').map(col => {
                    switch (col.key) {
                      case 'abc_r': return (
                        <td key={col.key} className="px-2 py-2 text-center">
                          <span className={`inline-flex items-center px-1.5 py-0.5 text-xs font-bold rounded ${CLASS_COLORS[row.abc_r] ?? ''}`}>
                            {row.abc_r}<Arrow curr={row.abc_r} prev={row.abc_r_prev} />
                          </span>
                        </td>
                      )
                      case 'abc_m': return (
                        <td key={col.key} className="px-2 py-2 text-center">
                          {row.abc_m
                            ? <span className={`inline-flex px-1.5 py-0.5 text-xs font-bold rounded ${CLASS_COLORS[row.abc_m] ?? ''}`}>{row.abc_m}</span>
                            : <span className="text-zinc-300 dark:text-zinc-600 text-xs">—</span>}
                        </td>
                      )
                      case 'revenue':       return <td key={col.key} className="px-3 py-2 text-right text-xs text-zinc-700 dark:text-zinc-300">{fmtRub(row.revenue)}</td>
                      case 'revenue_share': return <td key={col.key} className="px-3 py-2 text-right text-xs text-zinc-400">{fmtPct(row.revenue_share)}</td>
                      case 'margin_pct':    return <td key={col.key} className={`px-3 py-2 text-right text-xs font-medium ${row.margin_pct >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500'}`}>{fmtPct(row.margin_pct)}</td>
                      case 'net_profit':    return (
                        <td key={col.key} className={`px-3 py-2 text-right text-xs ${row.net_profit == null ? 'text-zinc-300 dark:text-zinc-600' : row.net_profit >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500'}`}>
                          {row.net_profit != null ? fmtRub(row.net_profit) : '—'}
                        </td>
                      )
                      case 'orders_count':  return <td key={col.key} className="px-3 py-2 text-right text-xs text-zinc-700 dark:text-zinc-300">{fmt(row.orders_count)}</td>
                      case 'current_stock': return <td key={col.key} className="px-3 py-2 text-right text-xs text-zinc-700 dark:text-zinc-300">{fmt(row.current_stock)}</td>
                      case 'days_of_stock': return (
                        <td key={col.key} className={`px-3 py-2 text-right text-xs ${row.days_of_stock == null ? 'text-zinc-300' : row.days_of_stock < 15 ? 'text-red-500 font-medium' : row.days_of_stock < 30 ? 'text-amber-500' : 'text-zinc-500'}`}>
                          {row.days_of_stock != null ? row.days_of_stock + 'д' : '—'}
                        </td>
                      )
                      default: return null
                    }
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showColModal && (
        <ColumnsModal visible={visibleCols} onChange={setVisibleCols} onClose={() => setShowColModal(false)} />
      )}
    </div>
  )
}
