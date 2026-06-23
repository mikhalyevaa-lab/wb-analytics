'use client'

import { useEffect, useState } from 'react'
import type { AbcRow } from './abc-table'

interface WeeklyRevenue {
  week: string
  revenue: number
  orders: number
}

const CLASS_LABEL: Record<string, string> = { A: 'Звезда', B: 'Норма', C: 'Аутсайдер' }
const CLASS_COLOR: Record<string, string> = {
  A: 'text-emerald-600 dark:text-emerald-400',
  B: 'text-blue-600 dark:text-blue-400',
  C: 'text-red-500',
}

function fmt(n: number) { return n.toLocaleString('ru', { maximumFractionDigits: 0 }) }
function fmtRub(n: number) { return fmt(n) + ' ₽' }

function Arrow({ curr, prev }: { curr: string | null; prev: string | null }) {
  if (!curr || !prev || curr === prev) return <span className="text-zinc-400 text-xs ml-1">→</span>
  const better = (curr === 'A' && prev !== 'A') || (curr === 'B' && prev === 'C')
  return (
    <span className={`text-xs ml-1 font-medium ${better ? 'text-emerald-500' : 'text-red-500'}`}>
      {better ? `↑ был ${prev}` : `↓ был ${prev}`}
    </span>
  )
}

export function AbcPanel({ row, onClose, dateFrom, dateTo }: {
  row: AbcRow
  onClose: () => void
  dateFrom: string
  dateTo: string
}) {
  const [weeks, setWeeks] = useState<WeeklyRevenue[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    fetch(`/api/abc/weekly?nm_id=${row.nm_id}&from=${dateFrom}&to=${dateTo}`)
      .then(r => r.ok ? r.json() : { weeks: [] })
      .then(d => { setWeeks(d.weeks ?? []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [row.nm_id, dateFrom, dateTo])

  const maxRevenue = Math.max(...weeks.map(w => w.revenue), 1)

  return (
    <div className="w-[420px] shrink-0 border-l border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 overflow-y-auto flex flex-col">
      {/* Header */}
      <div className="flex items-start justify-between p-4 border-b border-zinc-100 dark:border-zinc-800">
        <div className="flex items-start gap-3 min-w-0">
          {row.photo_url
            ? <img src={row.photo_url} alt="" className="w-12 h-12 rounded-lg object-cover shrink-0" />
            : <div className="w-12 h-12 rounded-lg bg-zinc-100 dark:bg-zinc-800 shrink-0" />
          }
          <div className="min-w-0">
            <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 truncate">{row.title || row.vendor_code}</p>
            <p className="text-xs text-zinc-400 mt-0.5">{row.nm_id} · {row.vendor_code}</p>
          </div>
        </div>
        <button onClick={onClose}
          className="ml-2 shrink-0 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 text-lg leading-none">×</button>
      </div>

      <div className="p-4 space-y-5 flex-1">
        {/* ABC classes */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-zinc-50 dark:bg-zinc-900 rounded-lg p-3">
            <p className="text-xs text-zinc-400 mb-1">ABC по выручке</p>
            <div className="flex items-baseline gap-1">
              <span className={`text-2xl font-bold ${CLASS_COLOR[row.abc_r] ?? ''}`}>{row.abc_r}</span>
              <span className="text-xs text-zinc-400">{CLASS_LABEL[row.abc_r]}</span>
              <Arrow curr={row.abc_r} prev={row.abc_r_prev} />
            </div>
          </div>
          <div className="bg-zinc-50 dark:bg-zinc-900 rounded-lg p-3">
            <p className="text-xs text-zinc-400 mb-1">ABC по марже</p>
            {row.abc_m
              ? <span className={`text-2xl font-bold ${CLASS_COLOR[row.abc_m] ?? ''}`}>{row.abc_m} <span className="text-xs font-normal text-zinc-400">{CLASS_LABEL[row.abc_m]}</span></span>
              : <span className="text-sm text-zinc-400">нет себест.</span>
            }
          </div>
        </div>

        {/* Key metrics */}
        <div className="space-y-2">
          <p className="text-xs font-medium text-zinc-500 uppercase tracking-wide">Показатели за период</p>
          {[
            { label: 'Выручка', value: fmtRub(row.revenue), sub: `${row.revenue_share.toFixed(1)}% от итого` },
            { label: 'Маржинальность', value: `${row.margin_pct.toFixed(1)}%`, color: row.margin_pct >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500' },
            row.net_profit != null && { label: 'Чистая прибыль', value: fmtRub(row.net_profit), color: row.net_profit >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500' },
            { label: 'Заказов', value: String(row.orders_count) },
          ].filter(Boolean).map((item: unknown) => {
            const i = item as { label: string; value: string; sub?: string; color?: string }
            return (
              <div key={i.label} className="flex items-center justify-between py-1.5 border-b border-zinc-100 dark:border-zinc-800">
                <span className="text-sm text-zinc-500">{i.label}</span>
                <div className="text-right">
                  <span className={`text-sm font-medium ${i.color ?? 'text-zinc-800 dark:text-zinc-200'}`}>{i.value}</span>
                  {i.sub && <p className="text-xs text-zinc-400">{i.sub}</p>}
                </div>
              </div>
            )
          })}
        </div>

        {/* Stock */}
        <div className="space-y-2">
          <p className="text-xs font-medium text-zinc-500 uppercase tracking-wide">Остатки</p>
          <div className="bg-zinc-50 dark:bg-zinc-900 rounded-lg p-3 flex items-center justify-between">
            <div>
              <p className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100">{fmt(row.current_stock)}</p>
              <p className="text-xs text-zinc-400">штук на складе</p>
            </div>
            {row.days_of_stock != null && (
              <div className={`text-right ${
                row.days_of_stock < 15 ? 'text-red-500'
                : row.days_of_stock < 30 ? 'text-amber-500'
                : 'text-zinc-500'
              }`}>
                <p className="text-2xl font-semibold">{row.days_of_stock}</p>
                <p className="text-xs">дней остатков</p>
              </div>
            )}
          </div>
        </div>

        {/* Weekly chart */}
        <div className="space-y-2">
          <p className="text-xs font-medium text-zinc-500 uppercase tracking-wide">Динамика выручки</p>
          {loading ? (
            <div className="h-24 flex items-center justify-center text-xs text-zinc-400 animate-pulse">Загружаем...</div>
          ) : weeks.length === 0 ? (
            <div className="h-16 flex items-center justify-center text-xs text-zinc-400">Нет данных</div>
          ) : (
            <div className="space-y-1">
              {weeks.map(w => (
                <div key={w.week} className="flex items-center gap-2">
                  <span className="text-xs text-zinc-400 w-20 shrink-0">{w.week}</span>
                  <div className="flex-1 bg-zinc-100 dark:bg-zinc-800 rounded-full h-2 overflow-hidden">
                    <div
                      className="h-full bg-indigo-500 rounded-full transition-all"
                      style={{ width: `${(w.revenue / maxRevenue) * 100}%` }}
                    />
                  </div>
                  <span className="text-xs text-zinc-600 dark:text-zinc-400 w-20 text-right shrink-0">
                    {w.revenue >= 1000 ? (w.revenue / 1000).toFixed(0) + 'к' : String(w.revenue)} ₽
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Candidate warning */}
        {row.is_candidate && (
          <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-lg p-3">
            <p className="text-xs font-medium text-red-700 dark:text-red-400 mb-1">🚨 Кандидат на вывод</p>
            <ul className="text-xs text-red-600 dark:text-red-500 space-y-0.5 list-disc list-inside">
              {row.orders_count === 0 && <li>0 заказов за период</li>}
              {row.margin_pct < 0 && <li>Отрицательная маржа ({row.margin_pct.toFixed(1)}%)</li>}
              {row.days_of_stock != null && row.days_of_stock > 90 && <li>Остатки на {row.days_of_stock} дней — заморожены деньги</li>}
            </ul>
          </div>
        )}
      </div>
    </div>
  )
}
