'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'

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

const CLASS_COLORS: Record<string, string> = {
  A: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300',
  B: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
  C: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
}

function fmt(n: number) { return n.toLocaleString('ru', { maximumFractionDigits: 0 }) }
function fmtRub(n: number) { return fmt(n) + ' ₽' }
function fmtPct(n: number) { return n.toFixed(1) + '%' }

type SortKey = 'revenue' | 'orders_count' | 'margin_pct' | 'net_profit' | 'current_stock' | 'days_of_stock'
type SortDir = 'asc' | 'desc'

function Arrow({ curr, prev }: { curr: string | null; prev: string | null }) {
  if (!curr || !prev || curr === prev) return null
  const better = (curr === 'A' && prev !== 'A') || (curr === 'B' && prev === 'C')
  return <span className={`ml-1 text-xs ${better ? 'text-emerald-500' : 'text-red-500'}`}>{better ? '↑' : '↓'}</span>
}

export function AbcTable({ rows, missingCost, dateFrom, dateTo, onRowClick, selectedNmId }: {
  rows: AbcRow[]
  missingCost: number
  dateFrom: string
  dateTo: string
  onRowClick: (row: AbcRow) => void
  selectedNmId: number | null
}) {
  const [search, setSearch]       = useState('')
  const [filterR, setFilterR]     = useState<string>('')
  const [sort, setSort]           = useState<{ key: SortKey; dir: SortDir }>({ key: 'revenue', dir: 'desc' })
  const [showCandidates, setShowCandidates] = useState(false)

  const filtered = useMemo(() => {
    let r = rows
    if (search) {
      const q = search.toLowerCase()
      r = r.filter(row =>
        row.title?.toLowerCase().includes(q) ||
        row.vendor_code?.toLowerCase().includes(q) ||
        String(row.nm_id).includes(q)
      )
    }
    if (filterR) r = r.filter(row => row.abc_r === filterR)
    if (showCandidates) r = r.filter(row => row.is_candidate)
    return [...r].sort((a, b) => {
      const av = (a[sort.key] ?? -Infinity) as number
      const bv = (b[sort.key] ?? -Infinity) as number
      return sort.dir === 'desc' ? bv - av : av - bv
    })
  }, [rows, search, filterR, sort, showCandidates])

  const candidates = rows.filter(r => r.is_candidate).length

  function setSort2(key: SortKey) {
    setSort(prev => prev.key === key
      ? { key, dir: prev.dir === 'desc' ? 'asc' : 'desc' }
      : { key, dir: 'desc' })
  }

  function exportCsv() {
    const header = ['nmId', 'Артикул', 'Название', 'ABC-R', 'ABC-M', 'Выручка', 'Выручка%', 'Маржа%', 'Чист.прибыль', 'Заказы', 'Остаток', 'Дней'].join(';')
    const body = filtered.map(r => [
      r.nm_id, r.vendor_code, r.title, r.abc_r, r.abc_m ?? '',
      r.revenue, r.revenue_share, r.margin_pct, r.net_profit ?? '',
      r.orders_count, r.current_stock, r.days_of_stock ?? '',
    ].join(';')).join('\n')
    const blob = new Blob(['﻿' + header + '\n' + body], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob)
    a.download = `abc_${dateFrom}_${dateTo}.csv`; a.click()
  }

  const Th = ({ k, label }: { k: SortKey; label: string }) => (
    <th className="text-right px-3 py-2.5 text-xs font-medium text-zinc-500 cursor-pointer hover:text-zinc-900 dark:hover:text-zinc-100 whitespace-nowrap select-none"
      onClick={() => setSort2(k)}>
      {label}{sort.key === k ? (sort.dir === 'desc' ? ' ↓' : ' ↑') : ''}
    </th>
  )

  return (
    <div className="space-y-3">
      {missingCost > 0 && (
        <div className="flex items-center gap-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg px-4 py-3 text-sm">
          <span className="text-amber-500">⚠</span>
          <span className="text-amber-800 dark:text-amber-300 flex-1">{missingCost} SKU без себестоимости — ABC по маржинальности неточный</span>
          <Link href="/catalog" className="shrink-0 px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-white rounded-md text-xs font-medium">Заполнить →</Link>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Артикул, название, nm_id..."
          className="w-52 px-3 py-2 text-sm border border-zinc-200 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500" />

        {/* ABC-R filter */}
        <div className="flex items-center gap-1">
          {['', 'A', 'B', 'C'].map(cls => (
            <button key={cls} onClick={() => setFilterR(cls)}
              className={`px-2.5 py-1 text-xs font-semibold rounded transition-all ${
                filterR === cls
                  ? cls ? CLASS_COLORS[cls] : 'bg-zinc-200 dark:bg-zinc-700 text-zinc-700 dark:text-zinc-300'
                  : 'bg-zinc-100 text-zinc-400 dark:bg-zinc-800 dark:text-zinc-500'
              }`}>
              {cls || 'Все'}
            </button>
          ))}
        </div>

        {candidates > 0 && (
          <button onClick={() => setShowCandidates(s => !s)}
            className={`px-3 py-1 text-xs rounded-lg border transition-colors ${
              showCandidates
                ? 'bg-red-100 border-red-300 text-red-700 dark:bg-red-900/30 dark:border-red-700 dark:text-red-400'
                : 'border-red-200 text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30'
            }`}>
            🚨 Кандидаты на вывод ({candidates})
          </button>
        )}

        <span className="text-xs text-zinc-400 ml-auto">{filtered.length} / {rows.length} SKU</span>
        <button onClick={exportCsv} className="px-3 py-1.5 text-xs border border-zinc-200 dark:border-zinc-700 rounded-lg text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800">
          ↓ CSV
        </button>
      </div>

      <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-800">
        <table className="w-full text-sm">
          <thead className="bg-zinc-50 dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800">
            <tr>
              <th className="text-left px-3 py-2.5 text-xs font-medium text-zinc-500 min-w-[200px]">Товар</th>
              <th className="text-center px-3 py-2.5 text-xs font-medium text-zinc-500">R</th>
              <th className="text-center px-3 py-2.5 text-xs font-medium text-zinc-500">M</th>
              <Th k="revenue" label="Выручка" />
              <Th k="revenue" label="Выр.%" />
              <Th k="margin_pct" label="Маржа%" />
              <Th k="net_profit" label="Прибыль" />
              <Th k="orders_count" label="Заказы" />
              <Th k="current_stock" label="Остаток" />
              <Th k="days_of_stock" label="Дней" />
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {filtered.map(row => (
              <tr key={row.nm_id}
                onClick={() => onRowClick(row)}
                className={`hover:bg-zinc-50 dark:hover:bg-zinc-900/50 transition-colors cursor-pointer ${
                  selectedNmId === row.nm_id ? 'bg-indigo-50 dark:bg-indigo-950/30' : ''
                } ${row.is_candidate ? 'border-l-2 border-l-red-400' : ''}`}>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-2 min-w-0">
                    {row.photo_url
                      ? <img src={row.photo_url} alt="" className="w-8 h-8 rounded object-cover shrink-0" />
                      : <div className="w-8 h-8 rounded bg-zinc-100 dark:bg-zinc-800 shrink-0" />
                    }
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-zinc-900 dark:text-zinc-100 truncate max-w-[160px]">{row.title || row.vendor_code}</p>
                      <p className="text-xs text-zinc-400 truncate">{row.nm_id} · {row.brand || row.vendor_code}</p>
                    </div>
                  </div>
                </td>
                <td className="px-2 py-2 text-center">
                  <span className={`inline-flex items-center px-1.5 py-0.5 text-xs font-bold rounded ${CLASS_COLORS[row.abc_r] ?? ''}`}>
                    {row.abc_r}
                    <Arrow curr={row.abc_r} prev={row.abc_r_prev} />
                  </span>
                </td>
                <td className="px-2 py-2 text-center">
                  {row.abc_m
                    ? <span className={`inline-flex px-1.5 py-0.5 text-xs font-bold rounded ${CLASS_COLORS[row.abc_m] ?? ''}`}>{row.abc_m}</span>
                    : <span className="text-zinc-300 dark:text-zinc-600 text-xs">—</span>
                  }
                </td>
                <td className="px-3 py-2 text-right text-zinc-700 dark:text-zinc-300 text-xs">{fmtRub(row.revenue)}</td>
                <td className="px-3 py-2 text-right text-zinc-400 text-xs">{fmtPct(row.revenue_share)}</td>
                <td className={`px-3 py-2 text-right text-xs font-medium ${row.margin_pct >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500'}`}>
                  {fmtPct(row.margin_pct)}
                </td>
                <td className={`px-3 py-2 text-right text-xs ${
                  row.net_profit == null ? 'text-zinc-300 dark:text-zinc-600'
                  : row.net_profit >= 0 ? 'text-emerald-600 dark:text-emerald-400'
                  : 'text-red-500'
                }`}>
                  {row.net_profit != null ? fmtRub(row.net_profit) : '—'}
                </td>
                <td className="px-3 py-2 text-right text-zinc-700 dark:text-zinc-300 text-xs">{fmt(row.orders_count)}</td>
                <td className="px-3 py-2 text-right text-zinc-700 dark:text-zinc-300 text-xs">{fmt(row.current_stock)}</td>
                <td className={`px-3 py-2 text-right text-xs ${
                  row.days_of_stock == null ? 'text-zinc-300'
                  : row.days_of_stock < 15 ? 'text-red-500 font-medium'
                  : row.days_of_stock < 30 ? 'text-amber-500'
                  : 'text-zinc-500'
                }`}>
                  {row.days_of_stock != null ? row.days_of_stock + 'д' : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <div className="py-12 text-center text-sm text-zinc-400">Нет данных</div>
        )}
      </div>
    </div>
  )
}
