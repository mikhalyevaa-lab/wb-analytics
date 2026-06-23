'use client'

interface DayStat {
  date: string
  orders: number
  revenue: number
}

interface Props {
  data: DayStat[]
}

export function OrdersChart({ data }: Props) {
  if (!data.length) return null

  const maxOrders = Math.max(...data.map(d => d.orders), 1)
  const maxRev = Math.max(...data.map(d => d.revenue), 1)

  const totalOrders = data.reduce((s, d) => s + d.orders, 0)
  const totalRev = data.reduce((s, d) => s + d.revenue, 0)

  const W = 700, H = 140, PL = 8, PR = 8, PT = 8, PB = 24
  const innerW = W - PL - PR
  const innerH = H - PT - PB
  const n = data.length

  const xOf = (i: number) => PL + (i / (n - 1)) * innerW
  const yOfOrders = (v: number) => PT + innerH - (v / maxOrders) * innerH
  const yOfRev = (v: number) => PT + innerH - (v / maxRev) * innerH

  const ordersPath = data
    .map((d, i) => `${i === 0 ? 'M' : 'L'} ${xOf(i).toFixed(1)} ${yOfOrders(d.orders).toFixed(1)}`)
    .join(' ')

  const revPath = data
    .map((d, i) => `${i === 0 ? 'M' : 'L'} ${xOf(i).toFixed(1)} ${yOfRev(d.revenue).toFixed(1)}`)
    .join(' ')

  // Month tick labels
  const ticks: { i: number; label: string }[] = []
  data.forEach((d, i) => {
    if (i === 0 || d.date.slice(8, 10) === '01' || i === n - 1) {
      const dt = new Date(d.date)
      ticks.push({ i, label: dt.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }) })
    }
  })

  const fmtRub = (n: number) => n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1_000 ? `${(n / 1_000).toFixed(0)}k` : String(n)

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Заказы · 28 дней</h2>
        <div className="flex gap-4 text-xs text-muted-foreground">
          <span><span className="inline-block w-3 h-0.5 bg-blue-500 mr-1 align-middle" />Заказы {totalOrders} шт</span>
          <span><span className="inline-block w-3 h-0.5 bg-emerald-500 mr-1 align-middle" />Выручка {fmtRub(totalRev)} ₽</span>
        </div>
      </div>
      <div className="rounded-xl border border-border bg-card p-4">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
          {/* Grid lines */}
          {[0, 0.25, 0.5, 0.75, 1].map(p => (
            <line
              key={p}
              x1={PL} y1={PT + innerH * (1 - p)}
              x2={W - PR} y2={PT + innerH * (1 - p)}
              stroke="currentColor" strokeOpacity={0.06} strokeWidth={1}
            />
          ))}

          {/* Revenue area fill */}
          <path
            d={`${revPath} L ${xOf(n - 1).toFixed(1)} ${PT + innerH} L ${xOf(0).toFixed(1)} ${PT + innerH} Z`}
            fill="#10b981" fillOpacity={0.08}
          />
          <path d={revPath} fill="none" stroke="#10b981" strokeWidth={1.5} strokeLinejoin="round" />

          {/* Orders line */}
          <path d={ordersPath} fill="none" stroke="#3b82f6" strokeWidth={2} strokeLinejoin="round" />

          {/* Axis labels */}
          {ticks.map(t => (
            <text
              key={t.i}
              x={xOf(t.i)}
              y={H - 4}
              textAnchor="middle"
              fontSize={9}
              fill="currentColor"
              fillOpacity={0.5}
            >
              {t.label}
            </text>
          ))}
        </svg>
      </div>
    </div>
  )
}
