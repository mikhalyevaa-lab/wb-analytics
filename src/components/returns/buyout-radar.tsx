'use client'

import { useEffect, useState } from 'react'
import {
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  ResponsiveContainer,
  Tooltip,
} from 'recharts'

interface RadarItem {
  nm_id: number
  article: string
  title: string | null
  sales_28d: number
  returns_28d: number
  buyout_rate: number
  returns_sum: number
}

interface RadarPoint {
  article: string
  buyout_rate: number
  nm_id: number
}

// Количество спиц — не более 14
const MAX_SPOKES = 14

function buyoutFill(pct: number) {
  if (pct < 85) return '#ef444460'
  if (pct < 95) return '#f59e0b60'
  return '#22c55e60'
}

function buyoutStroke(pct: number) {
  if (pct < 85) return '#ef4444'
  if (pct < 95) return '#f59e0b'
  return '#22c55e'
}

// Получаем цвет по среднему значению
function avgColor(points: RadarPoint[]) {
  if (!points.length) return '#6366f1'
  const avg = points.reduce((s, p) => s + p.buyout_rate, 0) / points.length
  return buyoutStroke(avg)
}

const CustomTooltip = ({ active, payload }: { active?: boolean; payload?: { payload: RadarPoint; value: number }[] }) => {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  return (
    <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg px-3 py-2 text-xs shadow-lg">
      <p className="font-medium text-zinc-700 dark:text-zinc-300">{d.article}</p>
      <p className={`font-bold text-base mt-0.5 ${d.buyout_rate < 85 ? 'text-red-500' : d.buyout_rate < 95 ? 'text-amber-500' : 'text-emerald-500'}`}>
        {d.buyout_rate.toFixed(1)}% выкупа
      </p>
    </div>
  )
}

export function BuyoutRadar() {
  const [items, setItems] = useState<RadarItem[]>([])
  const [loading, setLoading] = useState(true)
  // Показывать топ-N худших (min_sales=5, threshold=100 = все)
  const [topN, setTopN] = useState(10)

  useEffect(() => {
    setLoading(true)
    fetch(`/api/returns/products?threshold=100&min_sales=5&limit=${MAX_SPOKES}`)
      .then(r => r.json())
      .then(d => { setItems(d.items ?? []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="h-72 bg-zinc-100 dark:bg-zinc-800 rounded-xl animate-pulse" />
    )
  }

  if (!items.length) {
    return (
      <div className="h-72 flex items-center justify-center text-zinc-400 text-sm">
        Нет данных за 28 дней
      </div>
    )
  }

  // Показываем topN худших (уже отсортированы по buyout_rate ASC)
  const visible = items.slice(0, topN)

  const points: RadarPoint[] = visible.map(item => ({
    article:     item.article.length > 18 ? item.article.slice(0, 16) + '…' : item.article,
    buyout_rate: item.buyout_rate,
    nm_id:       item.nm_id,
  }))

  const color = avgColor(points)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">Радар выкупа по SKU</h2>
          <p className="text-xs text-zinc-400 mt-0.5">% выкупа · худшие артикулы · мин. 5 продаж за 28д</p>
        </div>
        <select
          value={topN}
          onChange={e => setTopN(Number(e.target.value))}
          className="h-7 text-xs px-2 rounded border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400"
        >
          {[6, 8, 10, 12, 14].map(n => (
            <option key={n} value={n}>Топ-{n} SKU</option>
          ))}
        </select>
      </div>

      <div className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <RadarChart data={points} margin={{ top: 10, right: 30, bottom: 10, left: 30 }}>
            <PolarGrid
              gridType="polygon"
              className="stroke-zinc-200 dark:stroke-zinc-700"
            />
            <PolarAngleAxis
              dataKey="article"
              tick={{ fontSize: 10, fill: 'currentColor' }}
              className="text-zinc-500 dark:text-zinc-400"
            />
            <PolarRadiusAxis
              angle={90}
              domain={[0, 100]}
              tick={{ fontSize: 9 }}
              tickFormatter={v => v + '%'}
              tickCount={5}
              className="text-zinc-400"
            />
            <Radar
              name="% выкупа"
              dataKey="buyout_rate"
              stroke={color}
              fill={buyoutFill(
                points.reduce((s, p) => s + p.buyout_rate, 0) / (points.length || 1)
              )}
              strokeWidth={2}
              dot={{ r: 3, fill: color }}
            />
            <Tooltip content={<CustomTooltip />} />
          </RadarChart>
        </ResponsiveContainer>
      </div>

      {/* Шкала цветов */}
      <div className="flex items-center gap-4 text-xs text-zinc-400 justify-center">
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-red-400 inline-block" /> ниже 85%
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-amber-400 inline-block" /> 85–95%
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 inline-block" /> выше 95%
        </span>
      </div>
    </div>
  )
}
