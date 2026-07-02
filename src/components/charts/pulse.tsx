'use client'

import { ResponsiveContainer, ComposedChart, Line, XAxis, YAxis, Tooltip } from 'recharts'

export interface PulsePoint { date: string; revenue: number; orders: number }

function shortDate(s: string) {
  // date может прийти как "YYYY-MM-DD" или полный timestamp "YYYY-MM-DDTHH:mm:ss+00:00"
  const [, m, d] = s.slice(0, 10).split('-')
  return `${d}.${m}`
}
function fmt(n: number) {
  if (Math.abs(n) >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M'
  if (Math.abs(n) >= 1_000) return (n / 1_000).toFixed(0) + 'k'
  return String(n)
}

/** Диаграмма 1 — Пульс: выручка (rust) + заказы (синий) во времени */
export function Pulse({ data }: { data: PulsePoint[] }) {
  if (!data.length) return <div className="h-[170px] flex items-center justify-center text-[13px]" style={{ color: 'var(--app-graphite)' }}>Нет данных за период</div>
  return (
    <div>
      <ResponsiveContainer width="100%" height={170}>
        <ComposedChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
          <XAxis dataKey="date" tickFormatter={shortDate} tick={{ fontSize: 11, fill: '#8a5a44' }} tickLine={false} axisLine={false} interval={Math.ceil(data.length / 6)} />
          <YAxis yAxisId="revenue" hide domain={['dataMin', 'dataMax']} />
          <YAxis yAxisId="orders" hide domain={[0, 'dataMax']} />
          <Tooltip
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null
              return (
                <div style={{ fontSize: 12, borderRadius: 8, padding: '6px 10px', background: 'var(--app-white)', boxShadow: 'var(--app-shadow-card)' }}>
                  <p style={{ color: 'var(--app-graphite)', marginBottom: 4 }}>{shortDate(String(label))}</p>
                  {payload.map((p, i) => (
                    <p key={i} style={{ color: p.color, margin: '2px 0' }}>
                      {p.name}: {p.dataKey === 'revenue' ? fmt(Number(p.value)) + ' ₽' : Number(p.value) + ' шт'}
                    </p>
                  ))}
                </div>
              )
            }}
          />
          <Line yAxisId="revenue" type="monotone" dataKey="revenue" name="Выручка" stroke="var(--app-rust)" strokeWidth={2.5} dot={false} activeDot={{ r: 4 }} />
          <Line yAxisId="orders" type="monotone" dataKey="orders" name="Заказы" stroke="#4a6fa5" strokeWidth={2} strokeDasharray="4 3" dot={false} activeDot={{ r: 4 }} />
        </ComposedChart>
      </ResponsiveContainer>
      <div className="flex gap-5 mt-2">
        <span className="flex items-center gap-1.5 text-[13px]" style={{ color: '#8a5a44' }}>
          <span className="w-4 h-[3px] rounded-sm" style={{ background: 'var(--app-rust)' }} />Выручка
        </span>
        <span className="flex items-center gap-1.5 text-[13px]" style={{ color: '#8a5a44' }}>
          <span className="w-4 h-[3px] rounded-sm" style={{ background: '#4a6fa5' }} />Заказы
        </span>
      </div>
    </div>
  )
}
