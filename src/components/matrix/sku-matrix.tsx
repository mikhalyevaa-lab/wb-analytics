'use client'

import { useState, useEffect, useRef, useCallback } from 'react'

type DayData = {
  date: string
  orders_count: number
  orders_sum: number
  avg_price: number | null
  ad_spend: number
  drr: number | null
  margin: number | null
  margin_pct: number | null
  storage_cost: number | null
  storage_per_unit: number | null
  plan_orders: number | null
  action_log: string | null
}

type TotalDay = {
  date: string
  orders_count: number
  orders_sum: number
  ad_spend: number
  drr: number | null
  storage_cost: number | null
  storage_per_unit: number | null
  plan_orders: number | null
  action_log: string | null
}

type SizeRow = {
  barcode: string
  techsize: string
  currentStock: number
  byDate: DayData[]
}

type Product = {
  nm_id: number
  vendor_code: string
  brand: string
  title: string
  photo_url: string | null
  cost_price: number | null
  strategy: string | null
}

type ApiResponse = {
  product: Product | null
  barcodes: string[]
  sizes: SizeRow[]
  totalByDate: TotalDay[]
  dates: string[]
  today: string
  totalStock: number
}

function daysAgo(n: number) {
  const d = new Date(); d.setDate(d.getDate() - n)
  return d.toISOString().split('T')[0]
}
function todayStr() { return new Date().toISOString().split('T')[0] }

function drrCls(drr: number | null) {
  if (drr == null) return ''
  if (drr <= 15) return 'bg-green-500/20 text-green-400'
  if (drr <= 25) return 'bg-yellow-500/20 text-yellow-400'
  return 'bg-red-500/20 text-red-400'
}
function marginCls(pct: number | null) {
  if (pct == null) return ''
  if (pct >= 20) return 'text-green-400'
  if (pct >= 10) return 'text-yellow-400'
  return 'text-red-400'
}
function fmt(v: number | null, pfx = '') {
  if (v == null) return '—'
  if (Math.abs(v) >= 1000) return pfx + (v / 1000).toFixed(0) + 'к'
  return pfx + v.toLocaleString('ru')
}

const PRESETS = [
  { label: '14д', from: () => daysAgo(14) },
  { label: '30д', from: () => daysAgo(30) },
  { label: '60д', from: () => daysAgo(60) },
]

export function SkuMatrix({ nmId }: { nmId: number }) {
  const [from, setFrom] = useState(daysAgo(30))
  const [to,   setTo]   = useState(todayStr)
  const [data, setData] = useState<ApiResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [strategy, setStrategy] = useState('')
  const [editLog, setEditLog] = useState<{ date: string; value: string } | null>(null)
  const [editPlan, setEditPlan] = useState<{ date: string; value: string } | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  const load = useCallback(async (f: string, t: string) => {
    setLoading(true)
    try {
      const res = await fetch(`/api/catalog/${nmId}/matrix?from=${f}&to=${t}`)
      const json = await res.json() as ApiResponse
      setData(json)
      setStrategy(json.product?.strategy ?? '')
    } finally {
      setLoading(false)
    }
  }, [nmId])

  useEffect(() => { load(from, to) }, [load])

  useEffect(() => {
    if (!data || !scrollRef.current) return
    const idx = data.dates.findIndex(d => d === data.today)
    if (idx >= 0) scrollRef.current.scrollLeft = Math.max(0, idx * 88 - 200)
  }, [data])

  async function saveStrategy() {
    await fetch(`/api/catalog/${nmId}/matrix`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ strategy }),
    })
  }

  async function saveNote(date: string, action_log?: string, plan_orders?: number | null) {
    await fetch(`/api/catalog/${nmId}/matrix`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date, action_log, plan_orders }),
    })
    await load(from, to)
  }

  if (loading) return <div className="text-center py-12 text-muted-foreground">Загружаем матрицу…</div>
  if (!data) return <div className="text-center py-12 text-red-400">Ошибка загрузки</div>

  const { product, sizes, totalByDate, dates, today } = data

  return (
    <div className="space-y-5">
      {/* Шапка продукта */}
      {product && (
        <div className="flex items-start gap-4 p-4 rounded-xl border border-border bg-card">
          {product.photo_url && (
            <img src={product.photo_url} alt="" className="w-16 h-16 rounded-lg object-cover shrink-0" />
          )}
          <div className="flex-1 min-w-0">
            <p className="font-bold text-lg truncate">{product.title || product.vendor_code}</p>
            <p className="text-sm text-muted-foreground">{product.brand} · {product.vendor_code} · nm_id {product.nm_id}</p>
            <p className="text-sm text-muted-foreground mt-0.5">Остаток: <span className="text-white">{data.totalStock} шт</span> · Себест.: <span className="text-white">{product.cost_price ?? '—'} ₽</span></p>
          </div>
        </div>
      )}

      {/* Стратегия */}
      <div className="flex items-start gap-2">
        <div className="flex-1">
          <label className="text-xs text-muted-foreground mb-1 block">Стратегия</label>
          <textarea
            value={strategy}
            onChange={e => setStrategy(e.target.value)}
            onBlur={saveStrategy}
            rows={2}
            placeholder="Введите стратегию по артикулу…"
            className="w-full bg-card border border-border rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-white/20"
          />
        </div>
      </div>

      {/* Период */}
      <div className="flex flex-wrap items-center gap-2">
        {PRESETS.map(p => (
          <button
            key={p.label}
            onClick={() => { const f = p.from(); setFrom(f); setTo(todayStr()); load(f, todayStr()) }}
            className={`px-3 py-1 rounded-lg text-sm border transition-colors ${from === p.from() ? 'bg-white text-black border-white' : 'border-border text-muted-foreground hover:border-white/50'}`}
          >
            {p.label}
          </button>
        ))}
        <input type="date" value={from} onChange={e => setFrom(e.target.value)}
          className="bg-card border border-border rounded px-2 py-1 text-sm" />
        <span className="text-muted-foreground text-sm">—</span>
        <input type="date" value={to} onChange={e => setTo(e.target.value)}
          className="bg-card border border-border rounded px-2 py-1 text-sm" />
        <button onClick={() => load(from, to)}
          className="px-3 py-1 bg-white text-black rounded text-sm font-medium">
          Применить
        </button>
      </div>

      {/* Матрица */}
      <div className="rounded-xl border border-border overflow-hidden bg-card">
        <div ref={scrollRef} className="overflow-x-auto">
          <table className="text-xs border-collapse min-w-max">
            <thead>
              <tr className="border-b border-border">
                <th className="sticky left-0 z-10 bg-zinc-900 w-44 min-w-44 text-left px-3 py-2 font-semibold text-muted-foreground border-r border-border">
                  Баркод / Размер
                </th>
                <th className="sticky left-44 z-10 bg-zinc-900 w-24 min-w-24 text-left px-2 py-2 font-semibold text-muted-foreground border-r border-border">
                  Метрика
                </th>
                {dates.map(d => (
                  <th key={d}
                    className={`w-22 min-w-22 text-center px-1 py-2 font-medium border-r border-border/50 ${d === today ? 'bg-white/10 text-white' : 'text-muted-foreground'}`}
                  >
                    <span className="block">{d.slice(5).replace('-', '.')}</span>
                    {d === today && <span className="block text-[9px] text-blue-400 mt-0.5">сегодня</span>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {/* Строки по размерам */}
              {sizes.map((size, si) => {
                const metrics: { label: string; fn: (d: DayData, _idx?: number) => React.ReactNode }[] = [
                  { label: 'Plan / Факт', fn: d => (
                    <div className="flex flex-col items-center gap-0.5">
                      <PlanCell
                        value={d.plan_orders}
                        date={d.date}
                        onSave={v => saveNote(d.date, undefined, v)}
                        active={editPlan?.date === d.date}
                        onActivate={() => setEditPlan({ date: d.date, value: String(d.plan_orders ?? '') })}
                        editState={editPlan}
                        setEditState={setEditPlan}
                      />
                      <span className={`font-bold ${d.orders_count > 0 ? 'text-white' : 'text-zinc-600'}`}>{d.orders_count}</span>
                    </div>
                  )},
                  { label: 'Цена заказа', fn: d => d.avg_price != null ? fmt(d.avg_price, '') + ' ₽' : '—' },
                  { label: 'Остаток ВБ',  fn: (_d, idx) => idx === 0 ? size.currentStock.toLocaleString('ru') : '' },
                  { label: 'Бюджет РК',    fn: d => d.ad_spend > 0 ? fmt(d.ad_spend, '') + ' ₽' : '—' },
                  { label: 'ДРР %',         fn: d => <span className={`px-1 rounded ${drrCls(d.drr)}`}>{d.drr != null ? d.drr.toFixed(1) + '%' : '—'}</span> },
                  { label: 'Маржа %',       fn: d => <span className={marginCls(d.margin_pct)}>{d.margin_pct != null ? d.margin_pct.toFixed(1) + '%' : '—'}</span> },
                  { label: 'Хранение ₽',    fn: d => d.storage_cost != null ? fmt(d.storage_cost, '') + ' ₽' : '—' },
                  { label: 'Хран./шт ₽',   fn: d => d.storage_per_unit != null ? d.storage_per_unit.toFixed(2) + ' ₽' : '—' },
                  { label: 'Лог',          fn: d => (
                    <LogCell
                      value={d.action_log}
                      date={d.date}
                      active={editLog?.date === d.date}
                      onActivate={() => setEditLog({ date: d.date, value: d.action_log ?? '' })}
                      editState={editLog}
                      setEditState={setEditLog}
                      onSave={v => saveNote(d.date, v, undefined)}
                    />
                  )},
                ]

                return metrics.map((metric, mi) => (
                  <tr key={`${si}-${mi}`}
                    className={`border-b border-border/30 ${mi === 0 ? 'border-t border-border' : ''} ${mi % 2 === 0 ? 'bg-black/10' : ''}`}
                  >
                    {mi === 0 ? (
                      <td className="sticky left-0 z-10 bg-zinc-900 px-3 py-1 font-semibold text-white border-r border-border"
                        rowSpan={metrics.length}>
                        <div className="text-xs">{size.techsize}</div>
                        <div className="text-[10px] text-zinc-400 font-normal truncate max-w-[140px]">{size.barcode}</div>
                      </td>
                    ) : null}
                    <td className="sticky left-44 z-10 bg-zinc-900 px-2 py-1 text-muted-foreground border-r border-border whitespace-nowrap text-[10px]">
                      {metric.label}
                    </td>
                    {size.byDate.map((d, di) => (
                      <td key={d.date}
                        className={`text-center px-1 py-1 border-r border-border/30 tabular-nums ${d.date === today ? 'bg-white/5' : ''}`}
                      >
                        {metric.fn(d, di)}
                      </td>
                    ))}
                  </tr>
                ))
              })}

              {/* Итоговая строка */}
              {['Итого заказов', 'Бюджет ₽', 'ДРР %', 'Хранение ₽', 'Лог / План'].map((label, li) => (
                <tr key={`total-${li}`}
                  className={`border-b border-border/30 ${li === 0 ? 'border-t-2 border-border' : ''} bg-zinc-800/30`}
                >
                  {li === 0 && (
                    <td className="sticky left-0 z-10 bg-zinc-900 px-3 py-1 font-bold text-white border-r border-border" rowSpan={5}>
                      Итого
                    </td>
                  )}
                  <td className="sticky left-44 z-10 bg-zinc-900 px-2 py-1 text-muted-foreground border-r border-border text-[10px] whitespace-nowrap">
                    {label}
                  </td>
                  {totalByDate.map(d => (
                    <td key={d.date}
                      className={`text-center px-1 py-1 border-r border-border/30 tabular-nums font-semibold ${d.date === today ? 'bg-white/5' : ''}`}
                    >
                      {li === 0 && (d.orders_count > 0 ? d.orders_count : '—')}
                      {li === 1 && (d.ad_spend > 0 ? fmt(d.ad_spend, '') : '—')}
                      {li === 2 && <span className={`px-1 rounded ${drrCls(d.drr)}`}>{d.drr != null ? d.drr.toFixed(1) + '%' : '—'}</span>}
                      {li === 3 && (d.storage_cost != null ? fmt(d.storage_cost, '') + ' ₽' : '—')}
                      {li === 4 && (
                        <div className="flex flex-col items-center gap-0.5 text-[9px]">
                          {d.plan_orders != null && <span className="text-blue-400">p:{d.plan_orders}</span>}
                          {d.action_log && <span className="text-yellow-400" title={d.action_log}>📝</span>}
                        </div>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// ─── Редактируемая ячейка плана ───────────────────────
function PlanCell({ value, date, onSave, active, onActivate, editState, setEditState }: {
  value: number | null; date: string
  onSave: (v: number | null) => void
  active: boolean
  onActivate: () => void
  editState: { date: string; value: string } | null
  setEditState: (v: { date: string; value: string } | null) => void
}) {
  if (active && editState) {
    return (
      <input
        autoFocus
        type="number"
        value={editState.value}
        onChange={e => setEditState({ date, value: e.target.value })}
        onBlur={() => { onSave(editState.value !== '' ? parseInt(editState.value) : null); setEditState(null) }}
        onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
        className="w-12 text-center bg-zinc-800 border border-blue-500 rounded text-xs text-blue-400 focus:outline-none"
      />
    )
  }
  return (
    <span
      onClick={onActivate}
      className="cursor-pointer text-blue-400 text-[10px] hover:underline"
      title="Нажмите для редактирования плана"
    >
      {value != null ? `p:${value}` : '+'}
    </span>
  )
}

// ─── Редактируемая ячейка лога ────────────────────────
function LogCell({ value, date, onSave, active, onActivate, editState, setEditState }: {
  value: string | null; date: string
  onSave: (v: string) => void
  active: boolean
  onActivate: () => void
  editState: { date: string; value: string } | null
  setEditState: (v: { date: string; value: string } | null) => void
}) {
  if (active && editState) {
    return (
      <textarea
        autoFocus
        value={editState.value}
        onChange={e => setEditState({ date, value: e.target.value })}
        onBlur={() => { onSave(editState.value); setEditState(null) }}
        rows={3}
        className="w-28 bg-zinc-800 border border-yellow-500 rounded text-[10px] p-1 focus:outline-none resize-none"
      />
    )
  }
  return (
    <span
      onClick={onActivate}
      className="cursor-pointer"
      title={value ?? 'Добавить запись'}
    >
      {value ? <span className="text-yellow-400">📝</span> : <span className="text-zinc-600 hover:text-zinc-400">+</span>}
    </span>
  )
}
