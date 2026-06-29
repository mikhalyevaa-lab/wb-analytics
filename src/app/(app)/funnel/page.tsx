'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid } from 'recharts'
import { Hint } from '@/components/ui/hint'
import { PageHeader } from '@/components/ui/page-header'

function moscowDate(offsetDays = 0) {
  const d = new Date(Date.now() + 3 * 60 * 60 * 1000)
  d.setUTCDate(d.getUTCDate() - offsetDays)
  return d.toISOString().split('T')[0]
}

const PRESETS = [
  { label: 'Сегодня', days: 0  },
  { label: '7 дн',    days: 7  },
  { label: '14 дн',   days: 14 },
  { label: '30 дн',   days: 30 },
  { label: '90 дн',   days: 90 },
]

function fmtNum(n: number) { return n.toLocaleString('ru', { maximumFractionDigits: 0 }) }
function fmtRub(n: number) { return fmtNum(Math.round(n)) + ' ₽' }
function fmtPct(n: number) { return n.toFixed(1) + '%' }

interface PeriodRow {
  period: string
  open_count: number
  cart_count: number
  order_count: number
  order_sum: number
  buyout_count: number
  buyout_sum: number
  add_to_cart_pct: number
  cart_to_order_pct: number
  buyout_pct: number
}

interface Summary {
  open_count: number
  cart_count: number
  order_count: number
  order_sum: number
  buyout_count: number
  buyout_sum: number
  add_to_cart_pct: number
  cart_to_order_pct: number
  buyout_pct: number
}

interface NmRow {
  nm_id: number
  vendor_code: string | null
  title: string | null
  photo_url: string | null
  open_count: number
  cart_count: number
  order_count: number
  order_sum: number
  buyout_count: number
  buyout_sum: number
  add_to_cart_pct: number
  cart_to_order_pct: number
  buyout_pct: number
}

interface FunnelData {
  byPeriod: PeriodRow[]
  byPeriodPrev: PeriodRow[]
  summary: Summary
  summaryPrev: Summary | null
  byNm: NmRow[]
  hasData: boolean
  lastSyncDate: string | null
  lastSyncAt: string | null
  prevFrom: string | null
  prevTo: string | null
}

type ChartMetric = 'open_count' | 'cart_count' | 'order_count' | 'order_sum'
const CHART_METRICS: { key: ChartMetric; label: string }[] = [
  { key: 'open_count',  label: 'Просмотры' },
  { key: 'cart_count',  label: 'В корзину' },
  { key: 'order_count', label: 'Заказы' },
  { key: 'order_sum',   label: 'Сумма заказов ₽' },
]

function ConvBar({ value, max = 100, color }: { value: number; max?: number; color: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 rounded-full bg-zinc-100 dark:bg-zinc-800 overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${Math.min((value / max) * 100, 100)}%`, backgroundColor: color }} />
      </div>
      <span className="text-xs font-medium tabular-nums w-10 text-right" style={{ color }}>{fmtPct(value)}</span>
    </div>
  )
}

export default function FunnelPage() {
  const [dateFrom, setDateFrom] = useState(moscowDate(7))
  const [dateTo, setDateTo] = useState(moscowDate(0))
  const [activePreset, setActivePreset] = useState('7 дн')

  const [aggLevel, setAggLevel] = useState<'day' | 'week'>('day')
  const [data, setData] = useState<FunnelData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [chartMetric, setChartMetric] = useState<ChartMetric>('open_count')
  const [nmSearch, setNmSearch] = useState('')
  const [nmSort, setNmSort] = useState<{ key: keyof NmRow; dir: 'asc' | 'desc' }>({ key: 'order_sum', dir: 'desc' })

  const load = useCallback(async (from: string, to: string, agg: string) => {
    setLoading(true); setError('')
    try {
      const res = await fetch(`/api/funnel?from=${from}&to=${to}&agg=${agg}`)
      const d = await res.json()
      if (!res.ok) throw new Error(d.error ?? 'Ошибка')
      setData(d)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка')
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { load(dateFrom, dateTo, aggLevel) }, []) // eslint-disable-line

  function applyPreset(label: string, days: number) {
    const from = moscowDate(days)
    const to = moscowDate(0)
    setDateFrom(from); setDateTo(to); setActivePreset(label)
    load(from, to, aggLevel)
  }

  function toggleAgg(agg: 'day' | 'week') {
    setAggLevel(agg)
    load(dateFrom, dateTo, agg)
  }

  const syncLabel = (() => {
    if (!data?.lastSyncDate) return null
    const dateStr = new Date(data.lastSyncDate).toLocaleDateString('ru', { day: 'numeric', month: 'long' })
    if (!data.lastSyncAt) return dateStr
    const moscowTime = new Date(new Date(data.lastSyncAt).getTime() + 3 * 60 * 60 * 1000)
    const timeStr = moscowTime.toISOString().slice(11, 16) + ' мск'
    return `${dateStr}, ${timeStr}`
  })()

  const filteredNm = useMemo(() => {
    const q = nmSearch.trim().toLowerCase()
    const rows = (data?.byNm ?? []).filter(nm =>
      !q ||
      String(nm.nm_id).includes(q) ||
      (nm.vendor_code ?? '').toLowerCase().includes(q)
    )
    return [...rows].sort((a, b) => {
      const av = a[nmSort.key] ?? 0
      const bv = b[nmSort.key] ?? 0
      const cmp = typeof av === 'string'
        ? (av as string).localeCompare(bv as string)
        : (av as number) - (bv as number)
      return nmSort.dir === 'asc' ? cmp : -cmp
    })
  }, [data?.byNm, nmSearch, nmSort])

  function toggleNmSort(key: keyof NmRow) {
    setNmSort(prev => prev.key === key
      ? { key, dir: prev.dir === 'desc' ? 'asc' : 'desc' }
      : { key, dir: 'desc' }
    )
  }

  const s = data?.summary

  return (
    <div className="p-6 space-y-6 max-w-[1100px]">
      <PageHeader picto="funnel" title="Воронка продаж" subtitle="Просмотры → Корзина → Заказы">
        <Hint width={340}>
          <strong>Воронка продаж WB</strong><br /><br />
          Показывает путь покупателя: Просмотр карточки → Добавление в корзину → Заказ → Выкуп.<br /><br />
          <strong>Источник:</strong> метод аналитики WB (nmReportDetail). Данные агрегируются по дням и хранятся в таблице wb_funnel.<br /><br />
          <strong>Важно:</strong> WB отдаёт данные с задержкой 1–2 дня. Данные за сегодня могут быть неполными.
        </Hint>
        {syncLabel && <span className="text-xs text-zinc-500">данные по {syncLabel}</span>}
        {PRESETS.map(p => (
          <button key={p.label} onClick={() => applyPreset(p.label, p.days)}
            className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${
              activePreset === p.label
                ? 'bg-zinc-900 border-zinc-900 text-white dark:bg-zinc-100 dark:border-zinc-100 dark:text-zinc-900'
                : 'border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800'
            }`}>
            {p.label}
          </button>
        ))}
        <div className="flex items-center gap-1">
          <input type="date" value={dateFrom}
            onChange={e => { setDateFrom(e.target.value); setActivePreset('') }}
            className="px-2 py-1.5 text-sm border border-zinc-200 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <span className="text-zinc-400">—</span>
          <input type="date" value={dateTo}
            onChange={e => { setDateTo(e.target.value); setActivePreset('') }}
            className="px-2 py-1.5 text-sm border border-zinc-200 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          {!activePreset && (
            <button onClick={() => load(dateFrom, dateTo, aggLevel)}
              className="px-3 py-1.5 text-sm bg-zinc-900 hover:bg-zinc-800 dark:bg-zinc-100 dark:hover:bg-zinc-200 dark:text-zinc-900 text-white rounded-lg transition-colors">
              Применить
            </button>
          )}
        </div>
      </PageHeader>

      {error && (
        <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-lg px-4 py-3 text-sm text-red-700 dark:text-red-400">{error}</div>
      )}

      {!loading && data && !data.hasData && (
        <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg px-4 py-4 text-sm">
          <p className="font-medium text-amber-800 dark:text-amber-300">Нет данных воронки за период</p>
          <p className="text-amber-700 dark:text-amber-400 mt-1">
            Данные обновляются автоматически каждые 2 часа. Попробуйте выбрать другой период.
          </p>
        </div>
      )}

      {/* Summary KPIs */}
      {!loading && s && data?.hasData && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              {
                label: 'Просмотры', value: fmtNum(s.open_count), sub: 'кол-во', color: '',
                hint: 'Суммарное количество просмотров карточек товаров за выбранный период. Один уникальный пользователь может засчитываться несколько раз.',
              },
              {
                label: 'В корзину', value: fmtNum(s.cart_count), sub: fmtPct(s.add_to_cart_pct) + ' из просм.', color: 'text-blue-600 dark:text-blue-400',
                hint: `Количество добавлений товаров в корзину. Конверсия ${fmtPct(s.add_to_cart_pct)} считается как: В корзину ÷ Просмотры × 100%.`,
              },
              {
                label: 'Заказы', value: fmtNum(s.order_count), sub: fmtPct(s.cart_to_order_pct) + ' из корзины', color: 'text-indigo-600 dark:text-indigo-400',
                hint: `Количество оформленных заказов. Конверсия ${fmtPct(s.cart_to_order_pct)} считается как: Заказы ÷ В корзину × 100%. Не все заказы будут выкуплены.`,
              },
              {
                label: 'Сумма заказов', value: fmtRub(s.order_sum), sub: 'руб.', color: '',
                hint: 'Суммарная стоимость всех оформленных заказов за период. Это не выручка — часть заказов будет отменена или возвращена.',
              },
            ].map(card => (
              <div key={card.label} className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-4">
                <div className="flex items-center gap-1">
                  <p className="text-xs text-zinc-500 uppercase tracking-wide">{card.label}</p>
                  <Hint width={280}>{card.hint}</Hint>
                </div>
                <p className={`text-lg font-bold mt-1 ${card.color || 'text-zinc-900 dark:text-zinc-100'}`}>{card.value}</p>
                <p className="text-xs text-zinc-400 mt-0.5">{card.sub}</p>
              </div>
            ))}
          </div>

          {/* Conversion funnel visual */}
          {(() => {
            const sp = data?.summaryPrev
            function Delta({ cur, prev }: { cur: number; prev?: number }) {
              if (!prev || prev === 0) return null
              const diff = cur - prev
              const pct  = (diff / prev) * 100
              const up   = diff > 0
              const zero = Math.abs(pct) < 0.05
              if (zero) return <span className="text-xs text-zinc-400">0%</span>
              return (
                <span className={`inline-flex items-center gap-0.5 text-xs font-medium ${up ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400'}`}>
                  {up ? '↑' : '↓'}{Math.abs(pct).toFixed(1)}%
                </span>
              )
            }
            const byNm = data?.byNm ?? []
            const bestCart  = byNm.filter(n => n.open_count >= 50).sort((a, b) => b.add_to_cart_pct   - a.add_to_cart_pct)[0]  ?? null
            const bestOrder = byNm.filter(n => n.cart_count >= 10).sort((a, b) => b.cart_to_order_pct - a.cart_to_order_pct)[0] ?? null

            const convRows = [
              { label: 'Просмотры → Корзина', cur: s.add_to_cart_pct,   prev: sp?.add_to_cart_pct,   color: '#6366f1', bgFrom: 'from-indigo-50 dark:from-indigo-950/20', best: bestCart,  bestVal: bestCart?.add_to_cart_pct },
              { label: 'Корзина → Заказ',      cur: s.cart_to_order_pct, prev: sp?.cart_to_order_pct, color: '#3b82f6', bgFrom: 'from-blue-50 dark:from-blue-950/20',   best: bestOrder, bestVal: bestOrder?.cart_to_order_pct },
            ]

            return (
              <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 overflow-hidden">
                <div className="px-5 py-3 border-b border-zinc-100 dark:border-zinc-800 flex items-center gap-1.5">
                  <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Конверсии</p>
                  <Hint width={320}>
                    <strong>Конверсии воронки</strong><br /><br />
                    <strong>Просмотры → Корзина:</strong> какая доля просмотров заканчивается добавлением в корзину. Зависит от фото, цены и позиции в выдаче.<br /><br />
                    <strong>Корзина → Заказ:</strong> какая доля добавленных в корзину заканчивается оформлением заказа. Зависит от цены и доверия к продавцу.<br /><br />
                    Серая полоска под основной — показатель за предыдущий период (для сравнения). Стрелки ↑↓ показывают изменение к предыдущему периоду.<br /><br />
                    <strong>★ Лучший</strong> — артикул с наибольшей конверсией на этом шаге (минимум 50 просмотров / 10 корзин).
                  </Hint>
                </div>
                <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
                  {convRows.map(row => (
                    <div key={row.label} className={`flex items-center gap-0 bg-gradient-to-r ${row.bgFrom} to-transparent`}>
                      {/* Left: label + bar */}
                      <div className="flex-1 px-5 py-4 min-w-0">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-medium text-zinc-500 uppercase tracking-wide">{row.label}</span>
                          <div className="flex items-center gap-2">
                            <span className="text-lg font-bold tabular-nums" style={{ color: row.color }}>{fmtPct(row.cur)}</span>
                            {sp && <Delta cur={row.cur} prev={row.prev} />}
                          </div>
                        </div>
                        <div className="h-2 rounded-full bg-zinc-100 dark:bg-zinc-800 overflow-hidden">
                          <div className="h-full rounded-full transition-all duration-500" style={{ width: `${Math.min(row.cur, 100)}%`, backgroundColor: row.color, opacity: 0.85 }} />
                        </div>
                        {sp && row.prev !== undefined && (
                          <div className="mt-1 h-1 rounded-full bg-zinc-100 dark:bg-zinc-800 overflow-hidden">
                            <div className="h-full rounded-full opacity-30" style={{ width: `${Math.min(row.prev, 100)}%`, backgroundColor: row.color }} />
                          </div>
                        )}
                      </div>

                      {/* Right: best article */}
                      {row.best && row.bestVal !== undefined ? (
                        <a href={`/catalog/${row.best.nm_id}`}
                          className="w-64 shrink-0 px-5 py-4 border-l border-zinc-100 dark:border-zinc-800 flex items-center gap-4 hover:bg-white/60 dark:hover:bg-zinc-800/40 transition-colors group">
                          {row.best.photo_url ? (
                            <img src={row.best.photo_url} alt="" className="w-10 h-13 object-cover rounded-lg shrink-0 shadow ring-1 ring-black/5" style={{height:'52px'}} />
                          ) : (
                            <div className="w-10 shrink-0 h-13 rounded-lg bg-zinc-100 dark:bg-zinc-800" style={{height:'52px'}} />
                          )}
                          <div className="min-w-0 flex-1">
                            <p className="text-[10px] uppercase tracking-widest font-semibold mb-1" style={{ color: row.color }}>★ Лучший</p>
                            <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-100 truncate group-hover:underline">{row.best.vendor_code ?? row.best.nm_id}</p>
                            <p className="text-xl font-black tabular-nums mt-0.5" style={{ color: row.color }}>{fmtPct(row.bestVal)}</p>
                          </div>
                        </a>
                      ) : (
                        <div className="w-64 shrink-0" />
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )
          })()}

          {/* Bar chart: current vs previous period */}
          {(() => {
            const cur = data?.byPeriod ?? []
            const prev = data?.byPeriodPrev ?? []
            if (!cur.length) return null

            // Align prev by index (same position = same relative day)
            const chartData = cur.map((row, i) => {
              const prevRow = prev[i]
              const label = row.period.slice(5) // MM-DD
              return {
                label,
                current: row[chartMetric],
                previous: prevRow?.[chartMetric] ?? null,
              }
            })

            const metricLabel = CHART_METRICS.find(m => m.key === chartMetric)?.label ?? ''
            const prevLabel = data?.prevFrom && data?.prevTo
              ? `${data.prevFrom.slice(5)} – ${data.prevTo.slice(5)}`
              : 'Пред. период'

            return (
              <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-5">
                <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                  <div className="flex items-center gap-1.5">
                    <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Динамика по периодам</p>
                    <Hint width={300}>
                      <strong>График сравнения периодов</strong><br /><br />
                      <span style={{color:'#6366f1'}}>■</span> Текущий период — тёмный столбик.<br />
                      <span style={{color:'#e5e7eb'}}>■</span> Предыдущий период той же длины — светлый столбик.<br /><br />
                      Переключайте метрику кнопками справа: Просмотры, В корзину, Заказы или Сумма заказов.
                    </Hint>
                  </div>
                  <div className="flex gap-1 flex-wrap">
                    {CHART_METRICS.map(m => (
                      <button key={m.key} onClick={() => setChartMetric(m.key)}
                        className={`px-2.5 py-1 text-xs rounded-lg border transition-colors ${
                          chartMetric === m.key
                            ? 'bg-zinc-900 border-zinc-900 text-white dark:bg-zinc-100 dark:border-zinc-100 dark:text-zinc-900'
                            : 'border-zinc-200 dark:border-zinc-700 text-zinc-500 hover:bg-zinc-50 dark:hover:bg-zinc-800'
                        }`}>
                        {m.label}
                      </button>
                    ))}
                  </div>
                </div>
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={chartData} barGap={2} barCategoryGap="25%">
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(128,128,128,0.15)" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#9ca3af' }} tickLine={false} axisLine={false}
                      interval={Math.max(0, Math.floor(chartData.length / 12) - 1)} />
                    <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} tickLine={false} axisLine={false}
                      tickFormatter={v => v >= 1000000 ? (v/1000000).toFixed(1)+'M' : v >= 1000 ? (v/1000).toFixed(0)+'K' : String(v)} />
                    <Tooltip
                      contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid rgba(0,0,0,0.1)', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                      formatter={(value, name) => [
                        typeof value === 'number' ? value.toLocaleString('ru') : '—',
                        name === 'current' ? metricLabel : prevLabel,
                      ]}
                      labelFormatter={l => `Дата: ${l}`}
                    />
                    <Legend formatter={v => v === 'current' ? metricLabel : prevLabel}
                      wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
                    <Bar dataKey="previous" name="previous" fill="#e5e7eb" radius={[3,3,0,0]} />
                    <Bar dataKey="current"  name="current"  fill="#6366f1" radius={[3,3,0,0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )
          })()}
        </>
      )}

      {/* Table by period */}
      {!loading && (data?.byPeriod?.length ?? 0) > 0 && (
        <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 overflow-hidden">
          <div className="px-5 py-3 border-b border-zinc-100 dark:border-zinc-800 flex items-center gap-1.5">
            <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
              По {aggLevel === 'week' ? 'неделям' : 'дням'}
            </p>
            <Hint width={300}>
              Каждая строка — один день (или неделя). Данные отсортированы от новых к старым.<br /><br />
              <strong>→ %</strong> (первый) — конверсия Просмотры → Корзина.<br />
              <strong>→ %</strong> (второй) — конверсия Корзина → Заказ.
            </Hint>
          </div>
          <div className="overflow-x-auto max-h-96 overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="bg-zinc-50 dark:bg-zinc-900/50 sticky top-0">
                <tr>
                  <th className="text-left px-4 py-2.5 text-xs text-zinc-500 font-medium whitespace-nowrap">Период</th>
                  <th className="text-right px-4 py-2.5 text-xs text-zinc-500 font-medium">Просмотры</th>
                  <th className="text-right px-4 py-2.5 text-xs text-zinc-500 font-medium">Корзина</th>
                  <th className="text-right px-4 py-2.5 text-xs text-zinc-500 font-medium">→ %</th>
                  <th className="text-right px-4 py-2.5 text-xs text-zinc-500 font-medium">Заказы</th>
                  <th className="text-right px-4 py-2.5 text-xs text-zinc-500 font-medium">→ %</th>
                  <th className="text-right px-4 py-2.5 text-xs text-zinc-500 font-medium">Сумма заказов</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {[...(data?.byPeriod ?? [])].reverse().map(row => (
                  <tr key={row.period} className="hover:bg-zinc-50 dark:hover:bg-zinc-900/50 transition-colors">
                    <td className="px-4 py-2.5 font-mono text-xs text-zinc-500">{row.period}</td>
                    <td className="px-4 py-2.5 text-right text-zinc-700 dark:text-zinc-300">{fmtNum(row.open_count)}</td>
                    <td className="px-4 py-2.5 text-right text-zinc-700 dark:text-zinc-300">{fmtNum(row.cart_count)}</td>
                    <td className="px-4 py-2.5 text-right text-indigo-500">{fmtPct(row.add_to_cart_pct)}</td>
                    <td className="px-4 py-2.5 text-right text-zinc-700 dark:text-zinc-300">{fmtNum(row.order_count)}</td>
                    <td className="px-4 py-2.5 text-right text-blue-500">{fmtPct(row.cart_to_order_pct)}</td>
                    <td className="px-4 py-2.5 text-right text-zinc-700 dark:text-zinc-300">{fmtRub(row.order_sum)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Table by nm_id */}
      {!loading && (data?.byNm?.length ?? 0) > 0 && (
        <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 overflow-hidden">
          <div className="px-5 py-3 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-1.5">
              <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                По артикулам
                {nmSearch && <span className="ml-2 text-xs text-zinc-400">{filteredNm.length} из {data?.byNm?.length}</span>}
              </p>
              <Hint width={320}>
                <strong>Таблица по артикулам</strong><br /><br />
                Каждая строка — один товар (nm_id). Клик по строке переходит на страницу товара.<br /><br />
                <strong>→ %</strong> (первый) — конверсия Просмотры → Корзина для этого товара.<br />
                <strong>→ %</strong> (второй) — конверсия Корзина → Заказ для этого товара.<br /><br />
                Сортировка по любому столбцу — клик по заголовку. Повторный клик меняет направление.
              </Hint>
            </div>
            <input
              type="text"
              value={nmSearch}
              onChange={e => setNmSearch(e.target.value)}
              placeholder="Поиск по артикулу…"
              className="px-3 py-1.5 text-sm border border-zinc-200 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 w-56"
            />
          </div>
          <div className="overflow-x-auto max-h-[480px] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="bg-zinc-50 dark:bg-zinc-900/50 sticky top-0 z-10">
                <tr>
                  {(() => {
                    function SortTh({ label, k, align = 'right' }: { label: string; k: keyof NmRow; align?: 'left' | 'right' }) {
                      const active = nmSort.key === k
                      return (
                        <th
                          onClick={() => toggleNmSort(k)}
                          className={`px-4 py-2.5 text-xs font-medium whitespace-nowrap cursor-pointer select-none transition-colors hover:text-zinc-800 dark:hover:text-zinc-200 ${align === 'left' ? 'text-left' : 'text-right'} ${active ? 'text-zinc-800 dark:text-zinc-200' : 'text-zinc-500'}`}
                        >
                          {label}{active ? (nmSort.dir === 'desc' ? ' ↓' : ' ↑') : ''}
                        </th>
                      )
                    }
                    return (
                      <>
                        <SortTh label="Артикул"       k="vendor_code"       align="left" />
                        <SortTh label="Просмотры"     k="open_count" />
                        <SortTh label="Корзина"       k="cart_count" />
                        <SortTh label="→ %"           k="add_to_cart_pct" />
                        <SortTh label="Заказы"        k="order_count" />
                        <SortTh label="→ %"           k="cart_to_order_pct" />
                        <SortTh label="Сумма заказов" k="order_sum" />
                      </>
                    )
                  })()}
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {filteredNm.length === 0 ? (
                  <tr><td colSpan={7} className="px-4 py-8 text-center text-sm text-zinc-400">Ничего не найдено</td></tr>
                ) : filteredNm.map(nm => (
                  <tr key={nm.nm_id} className="hover:bg-zinc-50 dark:hover:bg-zinc-900/50 transition-colors">
                    <td className="px-4 py-2.5">
                      <a href={`/catalog/${nm.nm_id}`} className="flex items-center gap-2.5 group">
                        {nm.photo_url && (
                          <img src={nm.photo_url} alt="" className="w-7 h-9 object-cover rounded shrink-0" />
                        )}
                        <div className="min-w-0">
                          <p className="text-xs font-medium text-zinc-700 dark:text-zinc-300 truncate max-w-[160px] group-hover:text-indigo-600 dark:group-hover:text-indigo-400 group-hover:underline">{nm.vendor_code ?? nm.nm_id}</p>
                          {nm.title && <p className="text-xs text-zinc-400 truncate max-w-[160px]">{nm.title}</p>}
                        </div>
                      </a>
                    </td>
                    <td className="px-4 py-2.5 text-right text-zinc-700 dark:text-zinc-300">{fmtNum(nm.open_count)}</td>
                    <td className="px-4 py-2.5 text-right text-zinc-700 dark:text-zinc-300">{fmtNum(nm.cart_count)}</td>
                    <td className="px-4 py-2.5 text-right text-indigo-500">{fmtPct(nm.add_to_cart_pct)}</td>
                    <td className="px-4 py-2.5 text-right text-zinc-700 dark:text-zinc-300">{fmtNum(nm.order_count)}</td>
                    <td className="px-4 py-2.5 text-right text-blue-500">{fmtPct(nm.cart_to_order_pct)}</td>
                    <td className="px-4 py-2.5 text-right text-zinc-700 dark:text-zinc-300">{fmtRub(nm.order_sum)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center py-24 text-sm text-zinc-400">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 border-2 border-zinc-400 border-t-transparent rounded-full animate-spin" />
            Загружаем воронку…
          </div>
        </div>
      )}
    </div>
  )
}
