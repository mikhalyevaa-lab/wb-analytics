'use client'

import { useEffect, useState } from 'react'
import {
  RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  Radar, ResponsiveContainer, Tooltip,
} from 'recharts'

interface ProductItem {
  nm_id: number
  article: string
  title: string | null
  sales_nd: number
  returns_nd: number
  return_rate: number
  returns_sum: number
}

interface RadarPoint {
  article: string
  value: number
  nm_id: number
  returns_nd: number
  return_rate: number
}

const MAX_SPOKES = 14

type Tab = 'count' | 'rate'

function returnCountColor(n: number, max: number) {
  const ratio = max > 0 ? n / max : 0
  if (ratio > 0.6) return '#ef4444'
  if (ratio > 0.3) return '#f59e0b'
  return '#22c55e'
}

function returnRateColor(pct: number) {
  if (pct > 7)  return '#ef4444'
  if (pct > 3)  return '#f59e0b'
  return '#22c55e'
}

function avgColor(points: RadarPoint[], tab: Tab) {
  if (!points.length) return '#6366f1'
  if (tab === 'count') {
    const max = Math.max(...points.map(p => p.value))
    const avg = points.reduce((s, p) => s + p.value, 0) / points.length
    return returnCountColor(avg, max)
  }
  const avg = points.reduce((s, p) => s + p.value, 0) / points.length
  return returnRateColor(avg)
}

const CustomTooltip = ({ active, payload, tab }: {
  active?: boolean
  payload?: { payload: RadarPoint }[]
  tab: Tab
}) => {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  return (
    <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg px-3 py-2 text-xs shadow-lg">
      <p className="font-medium text-zinc-700 dark:text-zinc-300">{d.article}</p>
      <p className="text-zinc-500 mt-0.5">Возвратов: <span className="text-red-500 font-medium">{d.returns_nd}</span></p>
      <p className="text-zinc-500">% возврата: <span className={`font-medium ${d.return_rate > 7 ? 'text-red-500' : d.return_rate > 3 ? 'text-amber-500' : 'text-emerald-500'}`}>{d.return_rate.toFixed(1)}%</span></p>
    </div>
  )
}

export function ReturnsRadar({ dateFrom, dateTo }: { dateFrom: string; dateTo: string }) {
  const [tab, setTab]   = useState<Tab>('count')
  const [topN, setTopN] = useState(10)
  const [items, setItems] = useState<ProductItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    const sort = tab === 'count' ? 'returns' : 'return_rate'
    fetch(`/api/returns/products?sort=${sort}&filter=none&min_sales=3&limit=${MAX_SPOKES}&from=${dateFrom}&to=${dateTo}`)
      .then(r => r.json())
      .then(d => { setItems(d.items ?? []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [dateFrom, dateTo, tab])

  if (loading) {
    return <div className="h-72 bg-zinc-100 dark:bg-zinc-800 rounded-xl animate-pulse" />
  }

  if (!items.length) {
    return (
      <div className="h-72 flex items-center justify-center text-zinc-400 text-sm">
        Нет данных за выбранный период
      </div>
    )
  }

  const visible = items.slice(0, topN)
  const maxCount = Math.max(...visible.map(i => i.returns_nd))

  const points: RadarPoint[] = visible.map(item => ({
    article:    item.article.length > 18 ? item.article.slice(0, 16) + '…' : item.article,
    value:      tab === 'count' ? item.returns_nd : item.return_rate,
    nm_id:      item.nm_id,
    returns_nd: item.returns_nd,
    return_rate: item.return_rate,
  }))

  const color  = avgColor(points, tab)
  const domain: [number, number] = tab === 'count'
    ? [0, Math.max(maxCount, 1)]
    : [0, Math.min(100, Math.max(...points.map(p => p.value)) * 1.2)]

  const fill = tab === 'count'
    ? '#ef444440'
    : (points.reduce((s, p) => s + p.value, 0) / points.length) > 7
      ? '#ef444440' : '#f59e0b40'

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">Радар возврата</h2>
          <p className="text-xs text-zinc-400 mt-0.5">топ артикулы · мин. 3 операции · {dateFrom} — {dateTo}</p>
        </div>
        <div className="flex items-center gap-2">
          {/* Вкладки По кол-ву / По % */}
          <div className="flex rounded-lg border border-zinc-200 dark:border-zinc-700 overflow-hidden text-xs">
            {([['count', 'По кол-ву'], ['rate', 'По %']] as [Tab, string][]).map(([t, label]) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`px-3 py-1.5 font-medium transition-colors ${
                  tab === t
                    ? 'bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900'
                    : 'bg-white dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <select
            value={topN}
            onChange={e => setTopN(Number(e.target.value))}
            className="h-7 text-xs px-2 rounded border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400"
          >
            {[6, 8, 10, 12, 14].map(n => (
              <option key={n} value={n}>Топ-{n}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <RadarChart data={points} margin={{ top: 10, right: 30, bottom: 10, left: 30 }}>
            <PolarGrid gridType="polygon" className="stroke-zinc-200 dark:stroke-zinc-700" />
            <PolarAngleAxis
              dataKey="article"
              tick={{ fontSize: 10, fill: 'currentColor' }}
              className="text-zinc-500 dark:text-zinc-400"
            />
            <PolarRadiusAxis
              angle={90}
              domain={domain}
              tick={{ fontSize: 9 }}
              tickFormatter={v => tab === 'rate' ? v + '%' : String(v)}
              tickCount={4}
              className="text-zinc-400"
            />
            <Radar
              name={tab === 'count' ? 'Возвратов' : '% возврата'}
              dataKey="value"
              stroke={color}
              fill={fill}
              strokeWidth={2}
              dot={{ r: 3, fill: color }}
            />
            <Tooltip content={<CustomTooltip tab={tab} />} />
          </RadarChart>
        </ResponsiveContainer>
      </div>

      <div className="flex items-center gap-4 text-xs text-zinc-400 justify-center">
        {tab === 'rate' ? (
          <>
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-red-400 inline-block" /> &gt; 7%</span>
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-amber-400 inline-block" /> 3–7%</span>
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-emerald-400 inline-block" /> ≤ 3%</span>
          </>
        ) : (
          <span className="text-zinc-400">Топ артикулов по абсолютному числу возвратов</span>
        )}
      </div>
    </div>
  )
}
