'use client'

import { useEffect, useState } from 'react'
import {
  ResponsiveContainer,
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
} from 'recharts'
import { Card, CardContent } from '@/components/ui/card'

interface TrendPoint {
  week_start: string
  sales: number
  returns: number
  buyout_pct: number | null
}

interface Summary {
  sales: number
  returns: number
  buyout_pct: number | null
}

interface TrendResponse {
  days84: TrendPoint[]
  summary28d: Summary
  summary84d: Summary
}

function shortDate(s: string) {
  const [, m, d] = s.split('-')
  return `${d}.${m}`
}

function buyoutColor(pct: number | null) {
  if (pct == null) return 'text-zinc-400'
  if (pct >= 95) return 'text-emerald-500'
  if (pct >= 85) return 'text-amber-500'
  return 'text-red-500'
}

type Period = '28d' | '84d'

const PERIOD_WEEKS: Record<Period, number> = { '28d': 4, '84d': 12 }

export function BuyoutTrend() {
  const [data, setData]     = useState<TrendResponse | null>(null)
  const [period, setPeriod] = useState<Period>('28d')

  useEffect(() => {
    fetch('/api/returns/trend')
      .then(r => r.json())
      .then(setData)
      .catch(() => {})
  }, [])

  if (!data) {
    return (
      <Card>
        <CardContent className="p-5">
          <div className="h-48 bg-zinc-100 dark:bg-zinc-800 rounded animate-pulse" />
        </CardContent>
      </Card>
    )
  }

  const weeks = PERIOD_WEEKS[period]
  const points = data.days84.slice(-weeks)
  const summary = period === '28d' ? data.summary28d : data.summary84d

  // Средний % выкупа за период как reference line
  const avgBuyout = summary.buyout_pct

  const CustomTooltip = ({ active, payload, label }: { active?: boolean; payload?: { value: number }[]; label?: string }) => {
    if (!active || !payload?.length) return null
    const pct = payload[0]?.value as number | undefined
    return (
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg px-3 py-2 text-xs shadow-lg">
        <p className="font-medium text-zinc-600 dark:text-zinc-400 mb-1">Неделя {label}</p>
        {pct != null && (
          <p className={`font-bold text-base ${buyoutColor(pct)}`}>{pct.toFixed(1)}% выкупа</p>
        )}
        {payload[1] && <p className="text-zinc-500">Продаж: {payload[1].value}</p>}
        {payload[2] && <p className="text-red-500">Возвратов: {payload[2].value}</p>}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Заголовок + переключатель периода */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">Тренд % выкупа</h2>
          <p className="text-xs text-zinc-400 mt-0.5">Понедельная динамика · из wb_sales</p>
        </div>
        <div className="flex items-center">
          {(['28d', '84d'] as Period[]).map(p => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-3 py-1.5 text-xs font-medium transition-colors first:rounded-l-lg last:rounded-r-lg border ${
                period === p
                  ? 'bg-indigo-600 text-white border-indigo-600'
                  : 'bg-white dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 border-zinc-200 dark:border-zinc-700 hover:text-zinc-800 dark:hover:text-zinc-200'
              }`}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      {/* Сводные цифры */}
      <div className="flex gap-6">
        <div>
          <p className="text-xs text-zinc-400">% выкупа за период</p>
          <p className={`text-2xl font-bold ${buyoutColor(summary.buyout_pct)}`}>
            {summary.buyout_pct != null ? summary.buyout_pct.toFixed(1) + '%' : '—'}
          </p>
        </div>
        <div>
          <p className="text-xs text-zinc-400">Продаж</p>
          <p className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">{summary.sales.toLocaleString('ru')}</p>
        </div>
        <div>
          <p className="text-xs text-zinc-400">Возвратов</p>
          <p className="text-2xl font-bold text-red-500">{summary.returns.toLocaleString('ru')}</p>
        </div>
      </div>

      {/* График */}
      <div className="h-52">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={points} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-zinc-100 dark:stroke-zinc-800" />
            <XAxis
              dataKey="week_start"
              tickFormatter={shortDate}
              tick={{ fontSize: 11 }}
              className="text-zinc-400"
            />
            <YAxis
              yAxisId="pct"
              domain={[80, 100]}
              tickFormatter={v => v + '%'}
              tick={{ fontSize: 11 }}
              className="text-zinc-400"
            />
            <Tooltip content={<CustomTooltip />} />
            {avgBuyout != null && (
              <ReferenceLine
                yAxisId="pct"
                y={avgBuyout}
                stroke="#6366f1"
                strokeDasharray="4 2"
                strokeWidth={1.5}
              />
            )}
            {/* Зелёный ориентир — хороший выкуп */}
            <ReferenceLine yAxisId="pct" y={95} stroke="#22c55e" strokeDasharray="2 4" strokeWidth={1} />
            <Area
              yAxisId="pct"
              type="monotone"
              dataKey="buyout_pct"
              stroke="#6366f1"
              strokeWidth={2}
              fill="#6366f115"
              dot={{ r: 3, fill: '#6366f1' }}
              activeDot={{ r: 5 }}
              name="% выкупа"
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Легенда */}
      <div className="flex items-center gap-4 text-xs text-zinc-400">
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-4 h-0.5 bg-indigo-500" /> % выкупа
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-4 h-0.5 bg-indigo-500 opacity-40" style={{ borderTop: '2px dashed' }} /> среднее за период
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-4 h-0.5 bg-emerald-500 opacity-60" style={{ borderTop: '2px dashed' }} /> ориентир 95%
        </span>
      </div>
    </div>
  )
}
