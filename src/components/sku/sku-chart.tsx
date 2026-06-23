'use client'

import { useState } from 'react'

interface DayPoint { date: string; orders: number; revenue: number }

const METRICS = [
  { key: 'orders', label: 'Заказы (шт)', color: '#6366f1' },
  { key: 'revenue', label: 'Выручка (₽)', color: '#10b981' },
] as const

type MetricKey = typeof METRICS[number]['key']

function fmt(n: number, key: MetricKey) {
  if (key === 'revenue') return n.toLocaleString('ru', { maximumFractionDigits: 0 }) + ' ₽'
  return String(n)
}

export function SkuChart({ daily }: { daily: DayPoint[] }) {
  const [active, setActive] = useState<MetricKey[]>(['orders', 'revenue'])
  const [hoverIdx, setHoverIdx] = useState<number | null>(null)

  if (!daily.length) return (
    <div className="h-40 flex items-center justify-center text-sm text-zinc-400">Нет данных за период</div>
  )

  const W = 800, H = 180, PAD = { top: 10, right: 16, bottom: 28, left: 48 }
  const innerW = W - PAD.left - PAD.right
  const innerH = H - PAD.top - PAD.bottom
  const n = daily.length

  function getLine(key: MetricKey) {
    const vals = daily.map(d => d[key] as number)
    const max = Math.max(...vals, 1)
    return vals.map((v, i) => {
      const x = PAD.left + (i / Math.max(n - 1, 1)) * innerW
      const y = PAD.top + innerH - (v / max) * innerH
      return `${x},${y}`
    }).join(' ')
  }

  function getArea(key: MetricKey) {
    const vals = daily.map(d => d[key] as number)
    const max = Math.max(...vals, 1)
    const pts = vals.map((v, i) => {
      const x = PAD.left + (i / Math.max(n - 1, 1)) * innerW
      const y = PAD.top + innerH - (v / max) * innerH
      return `${x},${y}`
    })
    const first = `${PAD.left},${PAD.top + innerH}`
    const last = `${PAD.left + innerW},${PAD.top + innerH}`
    return `${first} ${pts.join(' ')} ${last}`
  }

  // X labels — show ~6 evenly spaced dates
  const labelStep = Math.max(1, Math.floor(n / 6))
  const xLabels = daily
    .map((d, i) => ({ i, label: d.date.slice(5) }))
    .filter((_, i) => i % labelStep === 0 || i === n - 1)

  const hovered = hoverIdx !== null ? daily[hoverIdx] : null

  return (
    <div className="space-y-3">
      {/* Metric toggles */}
      <div className="flex items-center gap-2">
        {METRICS.map(m => (
          <button
            key={m.key}
            onClick={() => setActive(prev =>
              prev.includes(m.key)
                ? prev.filter(k => k !== m.key)
                : [...prev, m.key]
            )}
            className={`flex items-center gap-1.5 px-3 py-1 text-xs rounded-full border transition-all ${
              active.includes(m.key)
                ? 'border-transparent text-white'
                : 'border-zinc-200 dark:border-zinc-700 text-zinc-400 bg-transparent'
            }`}
            style={active.includes(m.key) ? { backgroundColor: m.color } : {}}
          >
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: m.color }} />
            {m.label}
          </button>
        ))}
        {hovered && (
          <div className="ml-auto flex gap-4 text-xs text-zinc-500">
            <span className="font-medium text-zinc-700 dark:text-zinc-300">{hovered.date}</span>
            {METRICS.filter(m => active.includes(m.key)).map(m => (
              <span key={m.key} style={{ color: m.color }}>
                {m.label.split(' ')[0]}: <strong>{fmt(hovered[m.key], m.key)}</strong>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* SVG chart */}
      <div className="w-full overflow-hidden relative">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="w-full"
          onMouseLeave={() => setHoverIdx(null)}
          onMouseMove={e => {
            const rect = (e.currentTarget as SVGSVGElement).getBoundingClientRect()
            const x = ((e.clientX - rect.left) / rect.width) * W - PAD.left
            const idx = Math.round((x / innerW) * (n - 1))
            setHoverIdx(Math.max(0, Math.min(n - 1, idx)))
          }}
        >
          {/* Grid lines */}
          {[0, 0.25, 0.5, 0.75, 1].map(t => (
            <line
              key={t}
              x1={PAD.left} y1={PAD.top + innerH * (1 - t)}
              x2={PAD.left + innerW} y2={PAD.top + innerH * (1 - t)}
              stroke="currentColor" strokeOpacity={0.07} strokeWidth={1}
              className="text-zinc-500"
            />
          ))}

          {/* Areas + lines */}
          {METRICS.filter(m => active.includes(m.key)).map(m => (
            <g key={m.key}>
              <polygon points={getArea(m.key)} fill={m.color} fillOpacity={0.06} />
              <polyline points={getLine(m.key)} fill="none" stroke={m.color} strokeWidth={1.5}
                strokeLinecap="round" strokeLinejoin="round" />
            </g>
          ))}

          {/* Hover line */}
          {hoverIdx !== null && (
            <>
              <line
                x1={PAD.left + (hoverIdx / Math.max(n - 1, 1)) * innerW}
                y1={PAD.top}
                x2={PAD.left + (hoverIdx / Math.max(n - 1, 1)) * innerW}
                y2={PAD.top + innerH}
                stroke="#94a3b8" strokeWidth={1} strokeDasharray="3,3"
              />
              {METRICS.filter(m => active.includes(m.key)).map(m => {
                const vals = daily.map(d => d[m.key] as number)
                const max = Math.max(...vals, 1)
                const v = daily[hoverIdx][m.key] as number
                const cx = PAD.left + (hoverIdx / Math.max(n - 1, 1)) * innerW
                const cy = PAD.top + innerH - (v / max) * innerH
                return <circle key={m.key} cx={cx} cy={cy} r={3.5} fill={m.color} />
              })}
            </>
          )}

          {/* X axis labels */}
          {xLabels.map(({ i, label }) => (
            <text
              key={i}
              x={PAD.left + (i / Math.max(n - 1, 1)) * innerW}
              y={H - 6}
              textAnchor="middle"
              fontSize={10}
              fill="currentColor"
              fillOpacity={0.4}
              className="text-zinc-500"
            >
              {label}
            </text>
          ))}
        </svg>
      </div>
    </div>
  )
}
