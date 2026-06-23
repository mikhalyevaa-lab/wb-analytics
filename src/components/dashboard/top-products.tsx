'use client'

import { useState, useEffect, useCallback } from 'react'

interface ProductRow {
  nm_id: number
  title: string
  vendor_code: string
  brand: string
  subject_name: string
  photo_url: string | null
  orders: number
  revenue: number
}

function fmtRub(n: number) { return n.toLocaleString('ru', { maximumFractionDigits: 0 }) + ' ₽' }

const PRESETS = [
  { label: '7д', days: 7 },
  { label: '30д', days: 30 },
  { label: '90д', days: 90 },
]

function today() { return new Date().toISOString().split('T')[0] }
function daysAgo(n: number) {
  const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().split('T')[0]
}

function TopList({ rows, metric }: { rows: ProductRow[]; metric: 'orders' | 'revenue' }) {
  const max = rows[0]?.[metric] ?? 1
  return (
    <div className="space-y-2">
      {rows.map((row, i) => {
        const val = row[metric]
        const pct = max > 0 ? (val / max) * 100 : 0
        return (
          <div
            key={row.nm_id}
            className="flex items-center gap-3 cursor-pointer group"
            onClick={() => window.location.href = `/sku/${row.nm_id}`}
          >
            <span className="text-xs text-zinc-400 w-4 shrink-0 text-right">{i + 1}</span>
            {row.photo_url ? (
              <img src={row.photo_url} alt="" className="w-8 h-8 rounded object-cover shrink-0" />
            ) : (
              <div className="w-8 h-8 rounded bg-zinc-100 dark:bg-zinc-800 shrink-0" />
            )}
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-zinc-800 dark:text-zinc-200 truncate group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                {row.title || row.vendor_code}
              </p>
              <div className="flex items-center gap-2 mt-0.5">
                <p className="text-xs text-zinc-400 truncate">{row.subject_name || row.brand}</p>
                <div className="flex-1 h-1 rounded-full bg-zinc-100 dark:bg-zinc-800 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-indigo-400 dark:bg-indigo-500"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            </div>
            <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 shrink-0 tabular-nums">
              {metric === 'revenue' ? fmtRub(val) : `${val.toLocaleString('ru')} шт`}
            </span>
          </div>
        )
      })}
    </div>
  )
}

export function TopProducts() {
  const [activePreset, setActivePreset] = useState('30д')
  const [dateFrom, setDateFrom] = useState(daysAgo(30))
  const [topByOrders, setTopByOrders] = useState<ProductRow[]>([])
  const [topByRevenue, setTopByRevenue] = useState<ProductRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async (from: string) => {
    setLoading(true); setError('')
    try {
      const res = await fetch(`/api/top-products?from=${from}&to=${today()}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Ошибка')
      setTopByOrders(data.topByOrders ?? [])
      setTopByRevenue(data.topByRevenue ?? [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка')
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { load(dateFrom) }, [])

  function applyPreset(label: string, days: number) {
    const from = daysAgo(days)
    setDateFrom(from); setActivePreset(label)
    load(from)
  }

  const presetBar = (
    <div className="flex gap-1">
      {PRESETS.map(p => (
        <button key={p.label} onClick={() => applyPreset(p.label, p.days)}
          className={`px-2.5 py-1 text-xs rounded-lg border transition-colors ${
            activePreset === p.label
              ? 'bg-indigo-600 border-indigo-600 text-white'
              : 'border-zinc-200 dark:border-zinc-700 text-zinc-500 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800'
          }`}>
          {p.label}
        </button>
      ))}
    </div>
  )

  if (error) return (
    <div className="col-span-2 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-lg px-4 py-3 text-sm text-red-700 dark:text-red-400">{error}</div>
  )

  const skeleton = (
    <div className="space-y-3">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 animate-pulse">
          <div className="w-4 h-3 bg-zinc-100 dark:bg-zinc-800 rounded" />
          <div className="w-8 h-8 bg-zinc-100 dark:bg-zinc-800 rounded" />
          <div className="flex-1 space-y-1.5">
            <div className="h-3 bg-zinc-100 dark:bg-zinc-800 rounded w-3/4" />
            <div className="h-2 bg-zinc-100 dark:bg-zinc-800 rounded w-1/2" />
          </div>
          <div className="w-16 h-3 bg-zinc-100 dark:bg-zinc-800 rounded" />
        </div>
      ))}
    </div>
  )

  return (
    <>
      {/* Top by Orders */}
      <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">Топ-10 по заказам</h2>
          {presetBar}
        </div>
        {loading ? skeleton : <TopList rows={topByOrders} metric="orders" />}
        {!loading && topByOrders.length === 0 && (
          <p className="text-sm text-zinc-400 text-center py-6">Нет данных за период</p>
        )}
      </div>

      {/* Top by Revenue */}
      <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">Топ-10 по выручке</h2>
          {presetBar}
        </div>
        {loading ? skeleton : <TopList rows={topByRevenue} metric="revenue" />}
        {!loading && topByRevenue.length === 0 && (
          <p className="text-sm text-zinc-400 text-center py-6">Нет данных за период</p>
        )}
      </div>
    </>
  )
}
