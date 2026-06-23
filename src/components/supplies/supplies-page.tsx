'use client'

import { useState, useEffect } from 'react'

const OKRUG_ORDER = ['ЦФО', 'СЗФО', 'ПФО', 'УФО', 'СФО+ДФО', 'ЮФО+СКФО']
const OKRUG_WAREHOUSE: Record<string, string> = {
  'ЦФО':      'Электросталь / Коледино',
  'СЗФО':     'Шушары',
  'ПФО':      'Казань',
  'УФО':      'Екатеринбург',
  'СФО+ДФО':  'Новосибирск',
  'ЮФО+СКФО': 'Краснодар',
}

type SupplyRow = {
  nm_id: number; vendor_code: string; title: string; brand: string
  photo_url: string | null; abc: string; orders_28d: number; orders_per_day: number
  stock: number; transit: number; days_of_stock: number | null; to_ship: number
  okrug_needed: Record<string, number>; storage_fee_28d: number
}

type ApiResponse = {
  toShipRows: SupplyRow[]
  wasteland: SupplyRow[]
  wastelandStorageCost: number
  okrugTotals: Record<string, number>
  kpi: { total_skus: number; need_supply_skus: number; wasteland_skus: number; localization_pct: number; total_to_ship: number }
  leadDays: number
  safetyDays: number
  dataDate: string
}

function abcColor(abc: string) {
  return abc === 'A' ? 'bg-green-500/20 text-green-400' : abc === 'B' ? 'bg-yellow-500/20 text-yellow-400' : 'bg-zinc-500/20 text-zinc-400'
}
function daysColor(d: number | null) {
  if (d == null) return 'text-muted-foreground'
  if (d < 15) return 'text-red-400 font-bold'
  if (d < 30) return 'text-yellow-400'
  return 'text-green-400'
}

export function SuppliesPage() {
  const [data, setData] = useState<ApiResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [abcFilter, setAbcFilter] = useState<string>('all')
  const [sortCol, setSortCol] = useState<'to_ship' | 'stock' | 'days_of_stock' | 'orders_28d'>('to_ship')

  useEffect(() => {
    fetch('/api/supplies')
      .then(r => r.json())
      .then((d: ApiResponse) => { setData(d); setLoading(false) })
  }, [])

  if (loading) return <div className="text-center py-16 text-muted-foreground">Рассчитываем поставки…</div>
  if (!data) return null

  const { toShipRows, wasteland, wastelandStorageCost, okrugTotals, kpi, leadDays, safetyDays, dataDate } = data

  const filtered = toShipRows
    .filter(r => abcFilter === 'all' || r.abc === abcFilter)
    .filter(r => !search || r.vendor_code.toLowerCase().includes(search.toLowerCase()) || String(r.nm_id).includes(search) || r.title.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => {
      if (sortCol === 'days_of_stock') return (a.days_of_stock ?? 999) - (b.days_of_stock ?? 999)
      return b[sortCol] - a[sortCol]
    })

  const maxOkrug = Math.max(1, ...Object.values(okrugTotals))

  return (
    <div className="space-y-6">
      {/* Шапка */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Поставки</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Данные на {dataDate} · Срок поставки {leadDays}д + страховой запас {safetyDays}д
            <span className="ml-2 px-2 py-0.5 rounded bg-yellow-500/10 text-yellow-400 text-xs border border-yellow-500/30">предв.</span>
          </p>
        </div>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {[
          { label: 'Нужна поставка',  value: kpi.need_supply_skus + ' SKU',    sub: `всего к отгрузке ${kpi.total_to_ship.toLocaleString('ru')} шт` },
          { label: 'К отгрузке итого', value: kpi.total_to_ship.toLocaleString('ru') + ' шт', sub: `по ${kpi.need_supply_skus} артикулам` },
          { label: 'Залежи',           value: kpi.wasteland_skus + ' SKU',       sub: `хранение ${Math.round(wastelandStorageCost / 1000)}к ₽/28д`, red: kpi.wasteland_skus > 0 },
          { label: 'Локализация',      value: kpi.localization_pct + '%',        sub: 'остатки вне ЦФО' },
          { label: 'Всего артикулов',  value: kpi.total_skus.toLocaleString('ru'), sub: 'активных SKU' },
        ].map(c => (
          <div key={c.label} className="rounded-xl border border-border bg-card p-4">
            <p className="text-xs text-muted-foreground">{c.label}</p>
            <p className={`text-xl font-bold mt-0.5 ${c.red ? 'text-red-400' : ''}`}>{c.value}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{c.sub}</p>
          </div>
        ))}
      </div>

      {/* Бар-чарт по округам */}
      <div className="rounded-xl border border-border bg-card p-5">
        <h2 className="text-sm font-semibold mb-4">Догрузка по округам · шт к отгрузке</h2>
        <div className="space-y-2">
          {OKRUG_ORDER.map(okrug => {
            const qty = okrugTotals[okrug] ?? 0
            const pct = qty > 0 ? Math.round(qty / maxOkrug * 100) : 0
            return (
              <div key={okrug} className="flex items-center gap-3">
                <div className="w-24 text-xs text-muted-foreground shrink-0">{okrug}</div>
                <div className="flex-1 bg-muted/20 rounded-full h-5 overflow-hidden">
                  <div
                    className="h-full bg-blue-500/70 rounded-full transition-all"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <div className="w-28 text-xs text-right">
                  {qty > 0 ? (
                    <><span className="font-semibold">{qty} шт</span> <span className="text-muted-foreground">→ {OKRUG_WAREHOUSE[okrug]}</span></>
                  ) : <span className="text-muted-foreground">— не нужно</span>}
                </div>
              </div>
            )
          })}
        </div>
        <p className="text-xs text-muted-foreground mt-4">
          * Рекомендуемый склад назначения для каждого округа. К отгрузке = скорость продаж × ({leadDays}+{safetyDays}д) − остаток − в пути
        </p>
      </div>

      {/* Таблица поставок */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 p-4 border-b border-border">
          <h2 className="text-sm font-semibold flex-1">Что и сколько допоставить</h2>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Поиск по артикулу..."
            className="bg-background border border-border rounded-lg px-3 py-1.5 text-sm w-48"
          />
          {['all', 'A', 'B', 'C'].map(v => (
            <button key={v} onClick={() => setAbcFilter(v)}
              className={`px-3 py-1 rounded-lg text-sm border transition-colors ${abcFilter === v ? 'bg-white text-black border-white' : 'border-border text-muted-foreground hover:border-white/50'}`}
            >
              {v === 'all' ? 'Все' : `ABC: ${v}`}
            </button>
          ))}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-border text-xs text-muted-foreground">
              <tr>
                <th className="text-left px-4 py-2 w-10">Фото</th>
                <th className="text-left px-3 py-2">Артикул</th>
                <th className="text-center px-3 py-2">ABC</th>
                <th className="text-right px-3 py-2 cursor-pointer hover:text-white" onClick={() => setSortCol('stock')}>
                  Остаток {sortCol === 'stock' && '↓'}
                </th>
                <th className="text-right px-3 py-2">В пути</th>
                <th className="text-right px-3 py-2 cursor-pointer hover:text-white" onClick={() => setSortCol('days_of_stock')}>
                  Дней {sortCol === 'days_of_stock' && '↑'}
                </th>
                <th className="text-right px-3 py-2 cursor-pointer hover:text-white" onClick={() => setSortCol('orders_28d')}>
                  Заказов 28д {sortCol === 'orders_28d' && '↓'}
                </th>
                <th className="text-right px-3 py-2 cursor-pointer hover:text-white" onClick={() => setSortCol('to_ship')}>
                  К отгрузке {sortCol === 'to_ship' && '↓'}
                </th>
                {OKRUG_ORDER.map(o => (
                  <th key={o} className="text-right px-2 py-2 text-[10px]">{o}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan={8 + OKRUG_ORDER.length} className="text-center py-8 text-muted-foreground">Нет данных</td></tr>
              )}
              {filtered.map(r => (
                <tr key={r.nm_id} className="border-b border-border/30 hover:bg-muted/10">
                  <td className="px-4 py-2">
                    {r.photo_url
                      ? <img src={r.photo_url} alt="" className="w-8 h-10 object-cover rounded" />
                      : <div className="w-8 h-10 bg-muted rounded" />}
                  </td>
                  <td className="px-3 py-2">
                    <a href={`/catalog/${r.nm_id}`} className="font-medium hover:text-blue-400 text-sm">{r.vendor_code}</a>
                    <p className="text-xs text-muted-foreground truncate max-w-[180px]">{r.title || r.brand}</p>
                    <p className="text-[10px] text-zinc-500">{r.nm_id} · {r.orders_per_day}/д</p>
                  </td>
                  <td className="px-3 py-2 text-center">
                    <span className={`px-2 py-0.5 rounded text-xs font-bold ${abcColor(r.abc)}`}>{r.abc}</span>
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-sm">{r.stock.toLocaleString('ru')}</td>
                  <td className="px-3 py-2 text-right text-sm text-muted-foreground">{r.transit > 0 ? r.transit : '—'}</td>
                  <td className={`px-3 py-2 text-right text-sm font-mono ${daysColor(r.days_of_stock)}`}>
                    {r.days_of_stock != null ? r.days_of_stock + 'д' : '∞'}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-sm">{r.orders_28d}</td>
                  <td className="px-3 py-2 text-right">
                    <span className="font-bold text-white bg-blue-500/20 px-2 py-0.5 rounded">{r.to_ship} шт</span>
                  </td>
                  {OKRUG_ORDER.map(o => (
                    <td key={o} className="px-2 py-2 text-right text-xs text-muted-foreground">
                      {r.okrug_needed[o] ? <span className="text-white">{r.okrug_needed[o]}</span> : '—'}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Залежи */}
      {wasteland.length > 0 && (
        <div className="rounded-xl border border-red-500/30 bg-card overflow-hidden">
          <div className="flex items-center gap-3 p-4 border-b border-red-500/20 bg-red-500/5">
            <span className="text-xl">⚠️</span>
            <div>
              <h2 className="text-sm font-semibold text-red-400">Залежи — неликвидные остатки</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                {wasteland.length} SKU · хранение за 28д: <span className="text-red-400 font-semibold">{Math.round(wastelandStorageCost / 1000)}к ₽</span>
                <span className="ml-2">· Нулевые заказы за 28 дней при положительном остатке</span>
              </p>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-border text-xs text-muted-foreground">
                <tr>
                  <th className="text-left px-4 py-2 w-10">Фото</th>
                  <th className="text-left px-3 py-2">Артикул</th>
                  <th className="text-right px-3 py-2">Остаток</th>
                  <th className="text-right px-3 py-2 text-red-400">Хранение 28д ₽</th>
                  <th className="text-right px-3 py-2">Заказов 28д</th>
                </tr>
              </thead>
              <tbody>
                {wasteland.sort((a, b) => b.storage_fee_28d - a.storage_fee_28d).map(r => (
                  <tr key={r.nm_id} className="border-b border-border/30 hover:bg-muted/10">
                    <td className="px-4 py-2">
                      {r.photo_url
                        ? <img src={r.photo_url} alt="" className="w-8 h-10 object-cover rounded" />
                        : <div className="w-8 h-10 bg-muted rounded" />}
                    </td>
                    <td className="px-3 py-2">
                      <a href={`/catalog/${r.nm_id}`} className="font-medium hover:text-blue-400">{r.vendor_code}</a>
                      <p className="text-xs text-muted-foreground truncate max-w-[200px]">{r.title || r.brand}</p>
                      <p className="text-[10px] text-zinc-500">{r.nm_id}</p>
                    </td>
                    <td className="px-3 py-2 text-right font-mono">{r.stock.toLocaleString('ru')}</td>
                    <td className="px-3 py-2 text-right text-red-400 font-semibold">
                      {r.storage_fee_28d > 0 ? r.storage_fee_28d.toLocaleString('ru') : '—'}
                    </td>
                    <td className="px-3 py-2 text-right text-muted-foreground">0</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
