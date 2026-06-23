'use client'

import { useState, useEffect, useRef } from 'react'

type DayData = {
  date: string
  orders_count: number
  orders_sum: number
  sales_count: number
  sales_revenue: number
  returns_count: number
  returns_amount: number
  logistics: number
  penalties: number
  ad_spend: number
  gross_profit: number
  drr: number | null
  cr_order_sale: number | null
  avg_order_price: number | null
  open_count: number
  cost_per_click: number | null
}

type Totals = {
  orders_count: number
  orders_sum: number
  sales_count: number
  sales_revenue: number
  returns_amount: number
  logistics: number
  ad_spend: number
  gross_profit: number
}

type ApiResponse = {
  byDate: DayData[]
  totals: Totals
  stockTotal: number
  today: string
  lastSyncedAt: string | null
  lastOrdersSync: string | null
  lastAdSync: string | null
}

const ROWS: { key: keyof DayData | 'avg_order_price_budget' | 'potential_profit_pct'; label: string; format: 'money' | 'count' | 'pct' | 'text' | 'placeholder'; full?: boolean }[] = [
  { key: 'orders_sum',               label: 'Сумма по заказам ₽',   format: 'money',       full: true  },
  { key: 'gross_profit',             label: 'Потенц. ЧП',            format: 'placeholder'              },
  { key: 'potential_profit_pct',     label: '% потенц. прибыли',     format: 'placeholder'              },
  { key: 'orders_count',             label: 'Заказов',               format: 'count'                    },
  { key: 'sales_count',              label: 'Продаж',                format: 'count'                    },
  { key: 'open_count',               label: 'Переходов',             format: 'count'                    },
  { key: 'ad_spend',                 label: 'Бюджет ₽',              format: 'money',       full: true  },
  { key: 'drr',                      label: 'ДРР %',                 format: 'pct'                      },
  { key: 'avg_order_price_budget',   label: 'Цена заказа (Б/З)',     format: 'money'                    },
  { key: 'cost_per_click',           label: 'Цена перехода',         format: 'money'                    },
  { key: 'cr_order_sale',            label: 'CR% заказ→продажа',     format: 'pct'                      },
]

function fmt(val: number | null, format: string, full = false): string {
  if (val == null) return '—'
  if (format === 'placeholder') return '—'
  if (format === 'money') {
    const v = Math.round(val)
    if (!full) {
      if (Math.abs(v) >= 1_000_000) return (v / 1_000_000).toFixed(1) + 'М'
      if (Math.abs(v) >= 1_000)    return (v / 1_000).toFixed(0) + 'к'
    }
    return v.toLocaleString('ru')
  }
  if (format === 'pct') return val.toFixed(1) + '%'
  return Math.round(val).toLocaleString('ru')
}

function drrColor(drr: number | null): string {
  if (drr == null) return ''
  if (drr <= 15) return 'bg-green-500/20 text-green-400'
  if (drr <= 25) return 'bg-yellow-500/20 text-yellow-400'
  return 'bg-red-500/20 text-red-400'
}

function profitColor(v: number): string {
  if (v > 0) return 'text-green-400'
  if (v < 0) return 'text-red-400'
  return ''
}

function daysAgo(n: number): string {
  const d = new Date(); d.setDate(d.getDate() - n)
  return d.toISOString().split('T')[0]
}

function todayStr(): string {
  return new Date().toISOString().split('T')[0]
}

const PRESETS = [
  { label: '7д',  from: () => daysAgo(7)  },
  { label: '14д', from: () => daysAgo(14) },
  { label: '30д', from: () => daysAgo(30) },
  { label: '60д', from: () => daysAgo(60) },
  { label: '90д', from: () => daysAgo(90) },
]

export function RnpMatrix() {
  const [from, setFrom] = useState(daysAgo(30))
  const [to,   setTo]   = useState(todayStr)
  const [data, setData] = useState<ApiResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const scrollRef = useRef<HTMLDivElement>(null)

  async function load(f: string, t: string) {
    setLoading(true)
    try {
      const res = await fetch(`/api/rnp?from=${f}&to=${t}`)
      const json = await res.json() as ApiResponse
      setData(json)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load(from, to) }, [])

  // Scroll to today column after load
  useEffect(() => {
    if (!data || !scrollRef.current) return
    const todayIndex = data.byDate.findIndex(d => d.date === data.today)
    if (todayIndex >= 0) {
      const colW = 80
      scrollRef.current.scrollLeft = Math.max(0, todayIndex * colW - 200)
    }
  }, [data])

  function applyPreset(f: string) {
    const t = todayStr()
    setFrom(f); setTo(t)
    load(f, t)
  }

  const dates = data?.byDate ?? []
  const totals = data?.totals

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-2">
        {PRESETS.map(p => (
          <button
            key={p.label}
            onClick={() => applyPreset(p.from())}
            className={`px-3 py-1 rounded-lg text-sm font-medium border transition-colors ${
              from === p.from()
                ? 'bg-white text-black border-white'
                : 'border-border text-muted-foreground hover:border-white/50'
            }`}
          >
            {p.label}
          </button>
        ))}
        <div className="flex items-center gap-1 ml-2 text-sm">
          <input
            type="date"
            value={from}
            onChange={e => setFrom(e.target.value)}
            className="bg-card border border-border rounded px-2 py-1 text-sm"
          />
          <span className="text-muted-foreground">—</span>
          <input
            type="date"
            value={to}
            onChange={e => setTo(e.target.value)}
            className="bg-card border border-border rounded px-2 py-1 text-sm"
          />
          <button
            onClick={() => load(from, to)}
            className="ml-1 px-3 py-1 bg-white text-black rounded text-sm font-medium hover:bg-white/90"
          >
            Применить
          </button>
        </div>
      </div>

      {/* Summary cards */}
      {totals && (() => {
        const todayData = data?.byDate.find(d => d.date === data.today)
        const cards = [
          { label: 'Сумма заказов', val: totals.orders_sum,         money: true  },
          { label: 'Заказов',       val: todayData?.orders_count ?? null, money: false, hint: 'за сегодня' },
          { label: 'Продаж',        val: todayData?.sales_count  ?? null, money: false, hint: 'за сегодня' },
          { label: 'Потенц. ЧП',    val: null as number | null,    money: true, placeholder: true },
          { label: 'Бюджет РК',     val: totals.ad_spend,          money: true  },
          { label: 'ДРР общий',     val: totals.orders_sum > 0 ? Math.round(totals.ad_spend / totals.orders_sum * 1000) / 10 : null, money: false, pct: true },
          { label: 'Остаток ВБ',    val: data?.stockTotal ?? 0,    money: false, unit: 'шт' },
        ] as Array<{ label: string; val: number | null; money: boolean; placeholder?: boolean; pct?: boolean; unit?: string; hint?: string }>
        return (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {cards.map(c => (
              <div key={c.label} className="bg-card rounded-xl border border-border p-3">
                <p className="text-xs text-muted-foreground">{c.label}{c.hint && <span className="ml-1 opacity-50">{c.hint}</span>}</p>
                <p className={`text-xl font-bold mt-0.5 tabular-nums ${c.label === 'Потенц. ЧП' ? profitColor(c.val ?? 0) : ''}`}>
                  {c.placeholder ? '—'
                    : c.val == null ? '—'
                    : c.pct ? c.val.toFixed(1) + '%'
                    : c.money ? fmt(c.val, 'money', true) + ' ₽'
                    : Math.round(c.val).toLocaleString('ru') + (c.unit ? ' ' + c.unit : '')}
                </p>
              </div>
            ))}
          </div>
        )
      })()}

      {/* Matrix */}
      {loading && (
        <div className="text-center py-12 text-muted-foreground">Загружаем данные...</div>
      )}
      {!loading && dates.length > 0 && (
        <div className="rounded-xl border border-border overflow-hidden bg-card">
          <div ref={scrollRef} className="overflow-x-auto">
            <table className="text-sm border-collapse min-w-max">
              <thead>
                <tr className="border-b border-border">
                  <th className="sticky left-0 z-10 bg-card w-36 min-w-36 text-left px-3 py-2 font-semibold text-muted-foreground border-r border-border">
                    Показатель
                  </th>
                  {dates.map(d => {
                    const dow = new Date(d.date + 'T00:00:00Z').getUTCDay() // 0=вс, 6=сб
                    const isWeekend = dow === 0 || dow === 6
                    const DOW_LABELS = ['вс','пн','вт','ср','чт','пт','сб']
                    const isToday = d.date === data?.today
                    return (
                      <th
                        key={d.date}
                        className={`w-20 min-w-20 text-center px-1 py-2 font-medium border-r border-border/50 ${
                          isToday ? 'bg-white/10 text-white'
                          : isWeekend ? 'bg-orange-500/8 text-muted-foreground'
                          : 'text-muted-foreground'
                        }`}
                      >
                        <span className="block">{d.date.slice(8) + '.' + d.date.slice(5, 7)}</span>
                        <span className={`block mt-0.5 ${isToday ? 'text-[10px] font-bold text-blue-400' : isWeekend ? 'text-[9px] text-orange-400' : 'text-[9px] text-muted-foreground/50'}`}>
                          {isToday ? `сегодня ${d.date.slice(8)}.${d.date.slice(5,7)}` : DOW_LABELS[dow]}
                        </span>
                      </th>
                    )
                  })}
                  <th className="w-24 min-w-24 text-center px-1 py-2 font-semibold border-l border-border bg-zinc-800/50 text-white">
                    Итого
                  </th>
                </tr>
              </thead>
              <tbody>
                {ROWS.map((row, ri) => (
                  <tr
                    key={row.key}
                    className={`border-b border-border/30 ${ri % 2 === 0 ? 'bg-black/10' : ''}`}
                  >
                    <td className="sticky left-0 z-10 bg-card px-3 py-1.5 font-medium text-muted-foreground border-r border-border whitespace-nowrap">
                      {row.label}
                    </td>
                    {dates.map(d => {
                      const isToday = d.date === data?.today
                      const isDrr = row.key === 'drr'
                      const dow = new Date(d.date + 'T00:00:00Z').getUTCDay()
                      const isWeekend = dow === 0 || dow === 6

                      let val: number | null = null
                      if (row.key === 'avg_order_price_budget') {
                        val = d.orders_count > 0 ? d.ad_spend / d.orders_count : null
                      } else if (row.key === 'potential_profit_pct') {
                        val = null
                      } else {
                        val = (d[row.key as keyof DayData] as number | null)
                      }

                      return (
                        <td
                          key={d.date}
                          className={`text-center px-1 py-1.5 border-r border-border/30 tabular-nums text-sm font-medium ${
                            isToday ? 'bg-white/5' : isWeekend ? 'bg-orange-500/5' : ''
                          } ${isDrr ? drrColor(val) : ''}`}
                        >
                          {row.format === 'placeholder' ? '—' : fmt(val, row.format, row.full)}
                        </td>
                      )
                    })}
                    {/* Итого */}
                    <td className="text-center px-1 py-1.5 font-semibold border-l border-border bg-zinc-800/30 tabular-nums text-sm">
                      {totals && (() => {
                        if (row.format === 'placeholder') return '—'
                        switch (row.key) {
                          case 'orders_sum':             return fmt(totals.orders_sum, 'money', true)
                          case 'orders_count':           return Math.round(totals.orders_count).toLocaleString('ru')
                          case 'sales_count':            return Math.round(totals.sales_count).toLocaleString('ru')
                          case 'ad_spend':               return fmt(totals.ad_spend, 'money', true)
                          case 'drr':                    return totals.orders_sum > 0 ? (totals.ad_spend / totals.orders_sum * 100).toFixed(1) + '%' : '—'
                          case 'avg_order_price_budget': return totals.orders_count > 0 ? fmt(Math.round(totals.ad_spend / totals.orders_count), 'money', true) : '—'
                          case 'cr_order_sale':          return totals.orders_count > 0 ? (totals.sales_count / totals.orders_count * 100).toFixed(1) + '%' : '—'
                          default: return '—'
                        }
                      })()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {!loading && dates.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">Нет данных за выбранный период</div>
      )}

      {/* Время последнего обновления */}
      {!loading && data && (
        <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground/60 pt-1">
          {data.lastOrdersSync && (
            <span>
              Заказы: {new Date(data.lastOrdersSync).toLocaleString('ru', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit', timeZone:'Europe/Moscow' })} МСК
            </span>
          )}
          {data.lastAdSync && (
            <span>
              Реклама: {new Date(data.lastAdSync + 'T00:00:00').toLocaleDateString('ru', { day:'2-digit', month:'2-digit', year:'numeric', timeZone:'Europe/Moscow' })}
            </span>
          )}
          <span>Страница загружена: {new Date(data.lastSyncedAt ?? '').toLocaleString('ru', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit', timeZone:'Europe/Moscow' })} МСК</span>
        </div>
      )}
    </div>
  )
}
