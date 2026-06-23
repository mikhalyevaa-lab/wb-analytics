'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { SkuChart } from '@/components/sku/sku-chart'

function today() { return new Date().toISOString().split('T')[0] }
function daysAgo(n: number) {
  const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().split('T')[0]
}

const PRESETS = [
  { label: '7д', days: 7 },
  { label: '30д', days: 30 },
  { label: '90д', days: 90 },
]

function fmtRub(n: number) { return n.toLocaleString('ru', { maximumFractionDigits: 0 }) + ' ₽' }
function fmtPct(n: number) { return n.toFixed(1) + '%' }

interface SkuData {
  product: {
    nm_id: number; vendor_code: string; brand: string; title: string
    subject_name: string; photo_url: string | null; cost_price: number | null
    current_stock: number; avg_orders_per_day: number | null; buyout_rate: number | null
  } | null
  kpi: {
    orders_count: number; revenue: number; commission: number; commission_pct: number
    delivery_rub: number; cogs: number; marginal_profit: number
    net_profit: number; net_margin_pct: number; has_cost: boolean
  }
  stocks: {
    total: number; days_of_stock: number | null
    warehouses: { warehouse: string; quantity: number; quantity_full: number; tech_size: string }[]
  }
  daily: { date: string; orders: number; revenue: number }[]
  dateFrom: string; dateTo: string
}

const ABC_COLORS: Record<string, string> = {
  AA: 'bg-emerald-100 text-emerald-800', AB: 'bg-green-100 text-green-800',
  BA: 'bg-blue-100 text-blue-800', BB: 'bg-sky-100 text-sky-800',
  BC: 'bg-yellow-100 text-yellow-800', CC: 'bg-red-100 text-red-800',
}

export default function SkuPage() {
  const { nm_id } = useParams<{ nm_id: string }>()
  const [dateFrom, setDateFrom] = useState(daysAgo(30))
  const [dateTo, setDateTo] = useState(today())
  const [activePreset, setActivePreset] = useState('30д')
  const [data, setData] = useState<SkuData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async (from: string, to: string) => {
    setLoading(true); setError('')
    try {
      const res = await fetch(`/api/sku/${nm_id}?from=${from}&to=${to}`)
      if (!res.ok) throw new Error(await res.text())
      setData(await res.json())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка')
    } finally { setLoading(false) }
  }, [nm_id])

  useEffect(() => { load(dateFrom, dateTo) }, [])

  function applyPreset(label: string, days: number) {
    const from = daysAgo(days), to = today()
    setDateFrom(from); setDateTo(to); setActivePreset(label)
    load(from, to)
  }

  const { product, kpi, stocks } = data ?? {}

  return (
    <div className="p-6 space-y-6 max-w-[1100px]">
      {/* Header */}
      <div className="flex items-start gap-4">
        <Link href="/abc" className="mt-1 text-sm text-zinc-400 hover:text-zinc-600 transition-colors shrink-0">
          ← ABC
        </Link>

        {product?.photo_url && (
          <img src={product.photo_url} alt="" className="w-16 h-16 rounded-xl object-cover shrink-0" />
        )}

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 truncate">
              {product?.title ?? `nmId ${nm_id}`}
            </h1>
          </div>
          <p className="text-sm text-zinc-400 mt-0.5">
            {nm_id} · {product?.brand} · {product?.subject_name}
          </p>
        </div>

        {/* Period selector */}
        <div className="flex items-center gap-2 flex-wrap shrink-0">
          {PRESETS.map(p => (
            <button key={p.label} onClick={() => applyPreset(p.label, p.days)}
              className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${
                activePreset === p.label
                  ? 'bg-indigo-600 border-indigo-600 text-white'
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
              <button onClick={() => load(dateFrom, dateTo)}
                className="px-3 py-1.5 text-sm bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors">
                Применить
              </button>
            )}
          </div>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-lg px-4 py-3 text-sm text-red-700 dark:text-red-400">{error}</div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-24 text-sm text-zinc-400">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
            Загружаем данные…
          </div>
        </div>
      ) : (
        <>
          {/* Section 1: KPI */}
          <div className="space-y-3">
            <h2 className="text-sm font-semibold text-zinc-500 uppercase tracking-wide">Сводка</h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: 'Заказы', value: kpi?.orders_count?.toLocaleString('ru') ?? '—', sub: 'шт за период' },
                { label: 'Выручка', value: kpi ? fmtRub(kpi.revenue) : '—', sub: 'по заказам' },
                { label: 'Логистика', value: kpi ? fmtRub(kpi.delivery_rub) : '—', sub: 'доставка WB' },
                { label: 'Комиссия WB', value: kpi ? fmtRub(kpi.commission) : '—', sub: kpi ? fmtPct(kpi.commission_pct) + ' от выручки' : '—' },
                { label: 'Себестоимость', value: kpi?.has_cost ? fmtRub(kpi.cogs) : '—', sub: kpi?.has_cost ? `${product?.cost_price} ₽/шт` : 'не задана' },
                { label: 'Марж. прибыль', value: kpi ? fmtRub(kpi.marginal_profit) : '—', sub: 'без себест. и рекл.', positive: (kpi?.marginal_profit ?? 0) >= 0 },
                { label: 'Чистая прибыль', value: kpi?.has_cost ? fmtRub(kpi.net_profit) : '—', sub: kpi?.has_cost ? fmtPct(kpi.net_margin_pct) + ' рентаб.' : 'нет себест.', positive: (kpi?.net_profit ?? 0) >= 0 },
                { label: 'Выкуп', value: product?.buyout_rate != null ? fmtPct(product.buyout_rate) : '—', sub: 'средний % выкупа' },
              ].map(card => (
                <div key={card.label} className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-4">
                  <p className="text-xs text-zinc-500 uppercase tracking-wide">{card.label}</p>
                  <p className={`text-xl font-bold mt-1 ${
                    card.positive === false ? 'text-red-500'
                    : card.positive === true ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-zinc-900 dark:text-zinc-100'
                  }`}>
                    {card.value}
                  </p>
                  <p className="text-xs text-zinc-400 mt-0.5">{card.sub}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Section 2: Stocks */}
          <div className="space-y-3">
            <h2 className="text-sm font-semibold text-zinc-500 uppercase tracking-wide">Остатки</h2>
            <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-5">
              <div className="flex items-center gap-8 mb-4">
                <div>
                  <p className="text-3xl font-bold text-zinc-900 dark:text-zinc-100">{stocks?.total ?? 0} шт</p>
                  <p className="text-sm text-zinc-400 mt-0.5">на складах WB</p>
                </div>
                {stocks?.days_of_stock != null && (
                  <div>
                    <p className={`text-3xl font-bold ${stocks.days_of_stock < 14 ? 'text-red-500' : stocks.days_of_stock < 30 ? 'text-amber-500' : 'text-emerald-500'}`}>
                      {stocks.days_of_stock} дн
                    </p>
                    <p className="text-sm text-zinc-400 mt-0.5">дней запаса</p>
                  </div>
                )}
              </div>
              {(stocks?.warehouses?.length ?? 0) > 0 && (
                <div className="space-y-1.5">
                  <p className="text-xs text-zinc-500 uppercase tracking-wide mb-2">По складам</p>
                  {stocks!.warehouses.filter(w => w.quantity_full > 0).slice(0, 8).map((w, i) => (
                    <div key={i} className="flex items-center justify-between text-sm">
                      <span className="text-zinc-600 dark:text-zinc-400 truncate max-w-[60%]">{w.warehouse}</span>
                      <span className="text-zinc-900 dark:text-zinc-100 font-medium">{w.quantity_full} шт</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Section 3: Chart */}
          <div className="space-y-3">
            <h2 className="text-sm font-semibold text-zinc-500 uppercase tracking-wide">
              Динамика по дням — {dateFrom} / {dateTo}
            </h2>
            <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-5">
              <SkuChart daily={data?.daily ?? []} />
            </div>
          </div>
        </>
      )}
    </div>
  )
}
