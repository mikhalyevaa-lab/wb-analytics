'use client'

import {
  BarChart, Bar, Cell, XAxis, YAxis, Tooltip,
  ReferenceLine, ResponsiveContainer, CartesianGrid,
} from 'recharts'
import type { PnLSummary } from '@/lib/queries'

interface Props {
  wb: PnLSummary
  manualTotal: number
}

function fmt(v: number) {
  return new Intl.NumberFormat('ru', { style: 'decimal', maximumFractionDigits: 0 }).format(v)
}

function buildWaterfall(wb: PnLSummary, manualTotal: number) {
  const steps: { name: string; base: number; bar: number; type: 'start' | 'neg' | 'sub' | 'end'; value: number }[] = []

  let running = 0

  function add(name: string, value: number, type: 'start' | 'neg' | 'sub' | 'end') {
    if (type === 'start' || type === 'sub' || type === 'end') {
      steps.push({ name, base: 0, bar: value, type, value })
      running = value
    } else {
      // negative step: bar sits on top of new_running
      const newRunning = running + value
      steps.push({ name, base: Math.min(running, newRunning), bar: Math.abs(value), type, value })
      running = newRunning
    }
  }

  add('Выручка', wb.sale, 'start')
  if (wb.commission > 0)       add('Комиссия WB', -wb.commission, 'neg')
  if (wb.logistics > 0)        add('Логистика', -wb.logistics, 'neg')
  if (wb.storage > 0)          add('Хранение', -wb.storage, 'neg')
  if (wb.penalties > 0)        add('Штрафы', -wb.penalties, 'neg')
  const others = wb.otherDeductions + wb.correction
  if (others > 1)              add('Прочие', -others, 'neg')
  if (wb.totalToPay > 0)       add('К выплате', wb.totalToPay, 'sub')
  if (wb.adSpend > 0)          add('Реклама', -wb.adSpend, 'neg')
  if (manualTotal > 0)         add('Затраты', -manualTotal, 'neg')

  const netProfit = wb.totalToPay - wb.adSpend - manualTotal
  steps.push({ name: 'Прибыль', base: 0, bar: Math.abs(netProfit), type: netProfit >= 0 ? 'end' : 'neg', value: netProfit })

  return steps
}

const COLORS = {
  start: '#818cf8',  // indigo
  neg:   '#f87171',  // red
  sub:   '#94a3b8',  // slate (subtotal)
  end:   '#4ade80',  // green (profit) — red if negative
}

function CustomTooltip({ active, payload }: { active?: boolean; payload?: { payload: ReturnType<typeof buildWaterfall>[0] }[] }) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  const sign = d.value >= 0 ? '+' : ''
  return (
    <div className="bg-zinc-900 text-zinc-100 text-xs rounded-lg px-3 py-2 shadow-lg border border-zinc-700">
      <p className="font-medium">{d.name}</p>
      <p className={d.value < 0 ? 'text-red-400' : 'text-green-400'}>{sign}{fmt(d.value)} ₽</p>
    </div>
  )
}

export function WaterfallChart({ wb, manualTotal }: Props) {
  if (wb.sale === 0) return (
    <div className="flex items-center justify-center h-48 text-sm text-zinc-400">
      Нет данных за период
    </div>
  )

  const data = buildWaterfall(wb, manualTotal)
  const netProfit = wb.totalToPay - wb.adSpend - manualTotal
  const margin = wb.sale > 0 ? (netProfit / wb.sale * 100).toFixed(1) : '0'

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-xs text-zinc-500">
        <span>Выручка → Прибыль</span>
        <span className={netProfit >= 0 ? 'text-green-500 font-medium' : 'text-red-500 font-medium'}>
          {fmt(netProfit)} ₽ · {margin}% маржа
        </span>
      </div>

      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 20 }} barSize={32}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,.06)" vertical={false} />
          <XAxis
            dataKey="name"
            tick={{ fontSize: 10, fill: '#9ca3af' }}
            angle={-35}
            textAnchor="end"
            interval={0}
            tickLine={false}
            axisLine={false}
          />
          <YAxis hide />
          <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,.04)' }} />
          <ReferenceLine y={0} stroke="rgba(255,255,255,.1)" />
          {/* Прозрачная база (спейсер) */}
          <Bar dataKey="base" stackId="a" fill="transparent" />
          {/* Видимая часть */}
          <Bar dataKey="bar" stackId="a" radius={[3, 3, 0, 0]}>
            {data.map((d, i) => (
              <Cell
                key={i}
                fill={d.type === 'end' && d.value < 0 ? '#f87171' : COLORS[d.type]}
                fillOpacity={0.85}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
