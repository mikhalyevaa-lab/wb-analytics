'use client'

import { useEffect, useState } from 'react'
import {
  ScatterChart, Scatter, XAxis, YAxis, CartesianGrid,
  Tooltip, ReferenceLine, ResponsiveContainer,
} from 'recharts'
import type { VelocityItem } from '@/app/api/velocity/route'

const DAYS_CRITICAL = 14   // < 14 дней — критичный остаток
const DAYS_SAFE = 60       // > 60 дней — избыток
const SPD_LOW = 0.3        // < 0.3 прод/день — низкая скорость

function dot(item: VelocityItem): string {
  if (item.sales_per_day === 0) return '#71717a'            // нет продаж — серый
  if (item.days_left === null) return '#38bdf8'              // нет остатка но продажи — sky
  if (item.days_left < DAYS_CRITICAL) return '#ef4444'      // критично — красный
  if (item.days_left > DAYS_SAFE && item.sales_per_day < SPD_LOW) return '#f59e0b' // избыток — amber
  return '#4ade80'                                           // норм — зелёный
}

function CustomTooltip({ active, payload }: { active?: boolean; payload?: { payload: VelocityItem }[] }) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  return (
    <div className="bg-zinc-900 text-zinc-100 text-xs rounded-lg px-3 py-2 shadow-lg border border-zinc-700 max-w-[200px]">
      <p className="font-medium truncate">{d.article || `nm ${d.nm_id}`}</p>
      <p className="text-zinc-400">{d.subject}</p>
      <p className="mt-1">Остаток: <span className="text-white font-medium">{d.quantity} шт.</span></p>
      <p>Продаж/день: <span className="text-white font-medium">{d.sales_per_day.toFixed(2)}</span></p>
      <p>Дней до нуля: <span className={d.days_left !== null && d.days_left < DAYS_CRITICAL ? 'text-red-400 font-medium' : 'text-green-400 font-medium'}>
        {d.days_left !== null ? d.days_left : '∞'}
      </span></p>
    </div>
  )
}

export function VelocityMatrix() {
  const [items, setItems] = useState<VelocityItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/velocity')
      .then(r => r.json())
      .then(d => { setItems(Array.isArray(d) ? d : []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  const withSales = items.filter(i => i.sales_per_day > 0)
  const maxSpd = Math.max(...withSales.map(i => i.sales_per_day), 1)
  const maxDays = Math.min(Math.max(...withSales.map(i => i.days_left ?? 0), 90), 180)

  const critical = withSales.filter(i => i.days_left !== null && i.days_left < DAYS_CRITICAL).length
  const overstock = withSales.filter(i => i.days_left !== null && i.days_left > DAYS_SAFE && i.sales_per_day < SPD_LOW).length

  if (loading) return (
    <div className="flex items-center justify-center h-48 text-sm text-zinc-400 animate-pulse">
      Загрузка матрицы…
    </div>
  )

  if (!withSales.length) return (
    <div className="flex items-center justify-center h-48 text-sm text-zinc-400">
      Нет данных о продажах
    </div>
  )

  return (
    <div className="space-y-3">
      {/* Легенда-сводка */}
      <div className="flex items-center gap-4 text-xs">
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-red-400 inline-block" />
          <span className="text-zinc-500">Срочно дозаказать ({critical})</span>
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-amber-400 inline-block" />
          <span className="text-zinc-500">Избыток ({overstock})</span>
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-green-400 inline-block" />
          <span className="text-zinc-500">Норма</span>
        </span>
      </div>

      <ResponsiveContainer width="100%" height={220}>
        <ScatterChart margin={{ top: 4, right: 4, left: 0, bottom: 16 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,.06)" />
          <XAxis
            dataKey="days_left"
            name="Дней остатка"
            type="number"
            domain={[0, maxDays]}
            tick={{ fontSize: 10, fill: '#9ca3af' }}
            tickLine={false}
            axisLine={false}
            label={{ value: 'Дней остатка →', position: 'insideBottomRight', offset: -4, fontSize: 10, fill: '#6b7280' }}
          />
          <YAxis
            dataKey="sales_per_day"
            name="Продаж/день"
            type="number"
            domain={[0, maxSpd * 1.1]}
            tick={{ fontSize: 10, fill: '#9ca3af' }}
            tickLine={false}
            axisLine={false}
            label={{ value: 'Прод/день ↑', angle: -90, position: 'insideTopLeft', offset: 4, fontSize: 10, fill: '#6b7280' }}
          />
          <Tooltip content={<CustomTooltip />} cursor={{ strokeDasharray: '3 3', stroke: 'rgba(255,255,255,.15)' }} />
          {/* Зоны — вертикальные линии */}
          <ReferenceLine x={DAYS_CRITICAL} stroke="#ef4444" strokeDasharray="4 3" strokeWidth={1} label={{ value: `${DAYS_CRITICAL}д`, position: 'top', fontSize: 9, fill: '#f87171' }} />
          <ReferenceLine x={DAYS_SAFE} stroke="#f59e0b" strokeDasharray="4 3" strokeWidth={1} label={{ value: `${DAYS_SAFE}д`, position: 'top', fontSize: 9, fill: '#fbbf24' }} />
          <Scatter
            data={withSales.map(i => ({ ...i, days_left: i.days_left ?? maxDays }))}
            shape={(props: { cx?: number; cy?: number; payload?: VelocityItem }) => {
              const { cx = 0, cy = 0, payload } = props
              return <circle cx={cx} cy={cy} r={4} fill={dot(payload!)} fillOpacity={0.8} stroke="transparent" />
            }}
          />
        </ScatterChart>
      </ResponsiveContainer>

      <p className="text-xs text-zinc-500">
        X = дней до нуля · Y = продаж/день · красная линия = {DAYS_CRITICAL}д · жёлтая = {DAYS_SAFE}д
      </p>
    </div>
  )
}
