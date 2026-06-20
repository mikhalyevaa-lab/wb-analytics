'use client'

import {
  ResponsiveContainer,
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts'
import { Card, CardContent } from '@/components/ui/card'
import type { DailySales } from '@/lib/queries'

function fmtRub(n: number) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M'
  if (n >= 1_000) return (n / 1_000).toFixed(0) + 'K'
  return n.toString()
}

function shortDate(s: string) {
  const [, m, d] = s.split('-')
  return `${d}.${m}`
}

export function SalesChart({ data }: { data: DailySales[] }) {
  if (!data.length) {
    return (
      <Card>
        <CardContent className="p-5 flex items-center justify-center h-48 text-zinc-400 text-sm">
          Нет данных — дождитесь первой синхронизации
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardContent className="p-5">
        <p className="text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-4">
          Динамика заказов — 30 дней
        </p>
        <ResponsiveContainer width="100%" height={240}>
          <ComposedChart data={data} margin={{ top: 4, right: 48, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id="revenueGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor="#6366f1" stopOpacity={0.2} />
                <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
              </linearGradient>
            </defs>

            <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" />

            <XAxis
              dataKey="date"
              tickFormatter={shortDate}
              tick={{ fontSize: 11, fill: '#71717a' }}
              tickLine={false}
              axisLine={false}
              interval={4}
            />

            {/* Левая ось — сумма заказов */}
            <YAxis
              yAxisId="left"
              tickFormatter={fmtRub}
              tick={{ fontSize: 11, fill: '#6366f1' }}
              tickLine={false}
              axisLine={false}
              width={48}
            />

            {/* Правая ось — заказы шт */}
            <YAxis
              yAxisId="right"
              orientation="right"
              tick={{ fontSize: 11, fill: '#f59e0b' }}
              tickLine={false}
              axisLine={false}
              width={40}
            />

            <Tooltip
              content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null
                return (
                  <div style={{ fontSize: 12, border: '1px solid #e4e4e7', borderRadius: 8, padding: '6px 10px', background: '#fff' }}>
                    <p style={{ color: '#71717a', marginBottom: 4 }}>{shortDate(String(label))}</p>
                    {payload.map((p, i) => (
                      <p key={i} style={{ color: p.color, margin: '2px 0' }}>
                        {p.name}: {p.dataKey === 'revenue'
                          ? (Number(p.value) || 0).toLocaleString('ru') + ' ₽'
                          : (Number(p.value) || 0).toLocaleString('ru') + ' шт'}
                      </p>
                    ))}
                  </div>
                )
              }}
            />

            <Legend
              formatter={(value) => value === 'revenue' ? 'Сумма заказов' : 'Заказы, шт'}
              wrapperStyle={{ fontSize: 12 }}
            />

            {/* Сумма заказов — area, левая ось */}
            <Area
              yAxisId="left"
              type="monotone"
              dataKey="revenue"
              name="revenue"
              stroke="#6366f1"
              strokeWidth={2}
              fill="url(#revenueGrad)"
              dot={false}
              activeDot={{ r: 4, fill: '#6366f1' }}
            />

            {/* Заказы шт — line, правая ось */}
            <Line
              yAxisId="right"
              type="monotone"
              dataKey="orders"
              name="orders"
              stroke="#f59e0b"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, fill: '#f59e0b' }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}
