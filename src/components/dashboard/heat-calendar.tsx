'use client'

import { useEffect, useState } from 'react'
import type { HeatDay } from '@/app/api/dashboard/heatmap/route'

const DAYS = 84
const WEEKS = 12
const CELL = 13        // размер ячейки
const GAP = 2          // зазор
const STEP = CELL + GAP

const DAY_LABELS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']

function dateKey(d: Date) {
  return d.toISOString().split('T')[0]
}

function addDays(d: Date, n: number) {
  const r = new Date(d)
  r.setUTCDate(r.getUTCDate() + n)
  return r
}

function fmt(v: number) {
  return new Intl.NumberFormat('ru', { style: 'decimal', maximumFractionDigits: 0 }).format(v)
}

function levelColor(ratio: number): string {
  if (ratio === 0) return 'var(--heat-0, #27272a)'
  if (ratio < 0.25) return 'var(--heat-1, #312e81)'
  if (ratio < 0.5)  return 'var(--heat-2, #4338ca)'
  if (ratio < 0.75) return 'var(--heat-3, #6366f1)'
  return 'var(--heat-4, #a5b4fc)'
}

export function HeatCalendar() {
  const [data, setData] = useState<HeatDay[]>([])
  const [loading, setLoading] = useState(true)
  const [tooltip, setTooltip] = useState<{ x: number; y: number; day: HeatDay } | null>(null)

  useEffect(() => {
    fetch('/api/dashboard/heatmap')
      .then(r => r.json())
      .then(d => { setData(Array.isArray(d) ? d : []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  if (loading) return (
    <div className="h-28 flex items-center justify-center text-xs text-zinc-400 animate-pulse">
      Загрузка календаря…
    </div>
  )

  // Строим сетку: 84 дня назад → сегодня
  const today = new Date(Date.now() + 3 * 60 * 60 * 1000) // Moscow
  today.setUTCHours(0, 0, 0, 0)
  const startDate = addDays(today, -(DAYS - 1))

  // Сдвиг: первый день в недельной сетке (0=Пн)
  const startDow = (startDate.getUTCDay() + 6) % 7  // 0=Mon
  const gridOffset = startDow

  const dataMap: Record<string, HeatDay> = {}
  for (const d of data) dataMap[d.date] = d

  const maxRevenue = Math.max(...data.map(d => d.revenue), 1)

  // Генерируем ячейки: неделя × день
  type Cell = { date: string; day: HeatDay | null; col: number; row: number }
  const cells: Cell[] = []

  for (let i = 0; i < DAYS; i++) {
    const d = addDays(startDate, i)
    const key = dateKey(d)
    const col = Math.floor((i + gridOffset) / 7)
    const row = (i + gridOffset) % 7
    cells.push({ date: key, day: dataMap[key] ?? null, col, row })
  }

  const totalCols = Math.max(...cells.map(c => c.col)) + 1

  // Метки месяцев
  const monthLabels: { col: number; label: string }[] = []
  let lastMonth = -1
  for (const cell of cells) {
    const m = new Date(cell.date).getUTCMonth()
    if (m !== lastMonth && cell.row === 0) {
      const label = new Date(cell.date).toLocaleDateString('ru', { month: 'short' })
      monthLabels.push({ col: cell.col, label })
      lastMonth = m
    }
  }

  const svgW = totalCols * STEP + 30  // +30 для лейблов дней
  const svgH = 7 * STEP + 20          // +20 для месяцев сверху

  const totalRevenue = data.reduce((s, d) => s + d.revenue, 0)
  const activeDays = data.filter(d => d.revenue > 0).length

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs text-zinc-500">
        <span>{activeDays} активных дней из {DAYS}</span>
        <span className="text-zinc-400">{fmt(totalRevenue)} ₽ выкупов за период</span>
      </div>

      <div className="overflow-x-auto" onMouseLeave={() => setTooltip(null)}>
        <svg width={svgW} height={svgH} style={{ display: 'block' }}>
          {/* Месяцы сверху */}
          {monthLabels.map((m, i) => (
            <text key={i} x={30 + m.col * STEP} y={10} fontSize={9} fill="#6b7280">
              {m.label}
            </text>
          ))}

          {/* Лейблы дней */}
          {DAY_LABELS.map((label, row) => (
            <text key={row} x={0} y={18 + row * STEP + CELL / 2 + 3} fontSize={9} fill="#6b7280">
              {label}
            </text>
          ))}

          {/* Ячейки */}
          {cells.map(({ date, day, col, row }) => {
            const revenue = day?.revenue ?? 0
            const ratio = revenue / maxRevenue
            const fill = levelColor(ratio)
            const cx = 30 + col * STEP
            const cy = 16 + row * STEP

            return (
              <rect
                key={date}
                x={cx} y={cy}
                width={CELL} height={CELL}
                rx={2}
                fill={fill}
                style={{ cursor: 'pointer' }}
                onMouseEnter={e => {
                  if (day) setTooltip({ x: cx, y: cy, day })
                }}
              />
            )
          })}

          {/* Tooltip */}
          {tooltip && (() => {
            const tx = Math.min(tooltip.x, svgW - 130)
            const ty = tooltip.y > svgH / 2 ? tooltip.y - 56 : tooltip.y + CELL + 4
            return (
              <g>
                <rect x={tx} y={ty} width={128} height={50} rx={6} fill="#18181b" />
                <text x={tx + 8} y={ty + 16} fontSize={10} fill="#e4e4e7" fontWeight="600">
                  {new Date(tooltip.day.date).toLocaleDateString('ru', { day: 'numeric', month: 'short' })}
                </text>
                <text x={tx + 8} y={ty + 30} fontSize={10} fill="#a1a1aa">
                  Выкупы: {fmt(tooltip.day.revenue)} ₽
                </text>
                <text x={tx + 8} y={ty + 44} fontSize={10} fill="#a1a1aa">
                  Позиций: {tooltip.day.sales}
                </text>
              </g>
            )
          })()}
        </svg>
      </div>

      {/* Легенда насыщенности */}
      <div className="flex items-center gap-1.5 text-xs text-zinc-500">
        <span>Меньше</span>
        {[0, 0.2, 0.45, 0.7, 1].map((r, i) => (
          <rect key={i} width={12} height={12} rx={2} fill={levelColor(r)}
            style={{ display: 'inline-block', width: 12, height: 12, borderRadius: 2 }} />
        ))}
        <span>Больше</span>
      </div>
    </div>
  )
}
