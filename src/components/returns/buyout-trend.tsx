'use client'

import { useEffect, useState } from 'react'
import {
  ResponsiveContainer,
  ComposedChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
} from 'recharts'

interface TrendPoint {
  week_start: string
  sales: number
  returns: number
  buyout_pct: number | null
}

interface TrendResponse {
  points: TrendPoint[]
  summary: { sales: number; returns: number; buyout_pct: number | null }
}

function shortDate(s: string) {
  const [, m, d] = s.split('-')
  return `${d}.${m}`
}

function returnRateFromBuyout(buyout: number | null): number | null {
  return buyout != null ? Math.round((100 - buyout) * 10) / 10 : null
}

function returnColor(pct: number | null) {
  if (pct == null) return 'text-zinc-400'
  if (pct <= 3) return 'text-emerald-500'
  if (pct <= 7) return 'text-amber-500'
  return 'text-red-500'
}

export function BuyoutTrend({ dateFrom, dateTo }: { dateFrom: string; dateTo: string }) {
  const [data, setData] = useState<TrendResponse | null>(null)

  useEffect(() => {
    setData(null)
    fetch(`/api/returns/trend?from=${dateFrom}&to=${dateTo}`)
      .then(r => r.json())
      .then(setData)
      .catch(() => {})
  }, [dateFrom, dateTo])

  if (!data) {
    return <div className="h-48 bg-zinc-100 dark:bg-zinc-800 rounded animate-pulse" />
  }

  const points = data.points.map(p => ({
    ...p,
    return_rate: returnRateFromBuyout(p.buyout_pct),
  }))

  const avgReturnRate = returnRateFromBuyout(data.summary.buyout_pct)
  const maxRate = Math.max(...points.map(p => p.return_rate ?? 0), avgReturnRate ?? 0, 3)
  const yMax = Math.ceil(maxRate * 1.25 * 10) / 10

  const CustomTooltip = ({ active, payload, label }: { active?: boolean; payload?: { value: number }[]; label?: string }) => {
    if (!active || !payload?.length) return null
    const pct = payload[0]?.value as number | undefined
    return (
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg px-3 py-2 text-xs shadow-lg">
        <p className="font-medium text-zinc-600 dark:text-zinc-400 mb-1">Неделя {label}</p>
        {pct != null && (
          <p className={`font-bold text-base ${returnColor(pct)}`}>{pct.toFixed(1)}% возврата</p>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">Тренд % возврата</h2>
        <p className="text-xs text-zinc-400 mt-0.5">Понедельная динамика · из wb_sales · {dateFrom} — {dateTo}</p>
      </div>

      {/* Сводные цифры */}
      <div className="flex gap-6">
        <div>
          <p className="text-xs text-zinc-400">% возврата за период</p>
          <p className={`text-2xl font-bold ${returnColor(avgReturnRate)}`}>
            {avgReturnRate != null ? avgReturnRate.toFixed(1) + '%' : '—'}
          </p>
        </div>
        <div>
          <p className="text-xs text-zinc-400">Продаж</p>
          <p className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">{data.summary.sales.toLocaleString('ru')}</p>
        </div>
        <div>
          <p className="text-xs text-zinc-400">Возвратов</p>
          <p className="text-2xl font-bold text-red-500">{data.summary.returns.toLocaleString('ru')}</p>
        </div>
      </div>

      {points.length === 0 ? (
        <p className="text-sm text-zinc-400 text-center py-8">Нет данных за выбранный период</p>
      ) : (
        <>
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
                  domain={[0, yMax]}
                  tickFormatter={v => v + '%'}
                  tick={{ fontSize: 11 }}
                  className="text-zinc-400"
                />
                <Tooltip content={<CustomTooltip />} />
                {avgReturnRate != null && (
                  <ReferenceLine
                    yAxisId="pct"
                    y={avgReturnRate}
                    stroke="#6366f1"
                    strokeDasharray="4 2"
                    strokeWidth={1.5}
                  />
                )}
                <ReferenceLine yAxisId="pct" y={3} stroke="#22c55e" strokeDasharray="2 4" strokeWidth={1} />
                <Area
                  yAxisId="pct"
                  type="monotone"
                  dataKey="return_rate"
                  stroke="#ef4444"
                  strokeWidth={2}
                  fill="#ef444415"
                  dot={{ r: 3, fill: '#ef4444' }}
                  activeDot={{ r: 5 }}
                  name="% возврата"
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          <div className="flex items-center gap-4 text-xs text-zinc-400">
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-4 h-0.5 bg-red-500" /> % возврата
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-4 h-0.5 bg-indigo-500 opacity-60" style={{ borderTop: '2px dashed' }} /> среднее за период
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-4 h-0.5 bg-emerald-500 opacity-60" style={{ borderTop: '2px dashed' }} /> норма ≤ 3%
            </span>
          </div>
        </>
      )}
    </div>
  )
}
