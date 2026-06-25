'use client'

import { useEffect, useState } from 'react'
import type { AbcRow } from './abc-table'

interface WeeklyRevenue {
  week: string
  revenue: number
  orders: number
}

interface Detail {
  revenue_before_spp: number | null
  spp_amount: number | null
  revenue_after_spp: number | null
  cost_price_unit: number | null
  cost_total: number | null
  sold_qty: number
  commission: number
  logistics: number
  storage: number
  ad_spend: number
  penalty: number
  usn_amount: number | null
  usn_pct: number
  vat_amount: number | null
  vat_pct: number
  defect: number | null
  net_profit: number | null
  net_profit_unit: number | null
  margin_pct: number | null
  roi_pct: number | null
  break_even: number
  break_even_unit: number | null
  current_stock: number
  empty_date: string | null
}

const CLASS_LABEL: Record<string, string> = { A: 'Звезда', B: 'Норма', C: 'Аутсайдер' }
const CLASS_COLOR: Record<string, string> = {
  A: 'text-emerald-600 dark:text-emerald-400',
  B: 'text-blue-600 dark:text-blue-400',
  C: 'text-red-500',
}

function fmt(n: number | null, dec = 0) {
  if (n == null) return '—'
  return n.toLocaleString('ru', { minimumFractionDigits: dec, maximumFractionDigits: dec })
}
function fmtRub(n: number | null) { return n == null ? '—' : fmt(n) + ' ₽' }
function fmtPct(n: number | null, dec = 1) { return n == null ? '—' : fmt(n, dec) + '%' }

function profitColor(n: number | null) {
  if (n == null) return 'text-zinc-800 dark:text-zinc-200'
  return n >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500'
}

function Arrow({ curr, prev }: { curr: string | null; prev: string | null }) {
  if (!curr || !prev || curr === prev) return <span className="text-zinc-400 text-xs ml-1">→</span>
  const better = (curr === 'A' && prev !== 'A') || (curr === 'B' && prev === 'C')
  return <span className={`text-xs ml-1 font-medium ${better ? 'text-emerald-500' : 'text-red-500'}`}>{better ? `↑ был ${prev}` : `↓ был ${prev}`}</span>
}

function Row({ label, value, color, sub, bold }: { label: string; value: string; color?: string; sub?: string; bold?: boolean }) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-zinc-100 dark:border-zinc-800 last:border-0">
      <span className="text-xs text-zinc-500">{label}</span>
      <div className="text-right">
        <span className={`text-xs ${bold ? 'font-semibold' : 'font-medium'} ${color ?? 'text-zinc-800 dark:text-zinc-200'}`}>{value}</span>
        {sub && <p className="text-[10px] text-zinc-400">{sub}</p>}
      </div>
    </div>
  )
}

function Section({ title }: { title: string }) {
  return <p className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wide pt-1">{title}</p>
}

export function AbcPanel({ row, onClose, dateFrom, dateTo }: {
  row: AbcRow
  onClose: () => void
  dateFrom: string
  dateTo: string
}) {
  const [weeks,   setWeeks]   = useState<WeeklyRevenue[]>([])
  const [detail,  setDetail]  = useState<Detail | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    setDetail(null)
    Promise.all([
      fetch(`/api/abc/weekly?nm_id=${row.nm_id}&from=${dateFrom}&to=${dateTo}`).then(r => r.ok ? r.json() : { weeks: [] }),
      fetch(`/api/abc/detail?nm_id=${row.nm_id}&from=${dateFrom}&to=${dateTo}`).then(r => r.ok ? r.json() : null),
    ]).then(([w, d]) => {
      setWeeks(w?.weeks ?? [])
      setDetail(d)
    }).finally(() => setLoading(false))
  }, [row.nm_id, dateFrom, dateTo])

  const maxRevenue = Math.max(...weeks.map(w => w.revenue), 1)

  // Дата пустого склада
  function formatEmptyDate(d: string | null) {
    if (!d) return null
    const dt = new Date(d)
    return dt.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: '2-digit' })
  }

  const emptyDateFmt = formatEmptyDate(detail?.empty_date ?? null)

  return (
    <div className="w-[380px] shrink-0 border-l border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 overflow-y-auto flex flex-col text-sm">
      {/* Header */}
      <div className="flex items-start justify-between p-4 border-b border-zinc-100 dark:border-zinc-800 sticky top-0 bg-white dark:bg-zinc-950 z-10">
        <div className="flex items-start gap-3 min-w-0">
          {row.photo_url
            ? <img src={row.photo_url} alt="" className="w-12 h-12 rounded-lg object-cover shrink-0" />
            : <div className="w-12 h-12 rounded-lg bg-zinc-100 dark:bg-zinc-800 shrink-0" />
          }
          <div className="min-w-0">
            <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 line-clamp-2">{row.title || row.vendor_code}</p>
            <p className="text-xs text-zinc-400 mt-0.5">{row.nm_id} · {row.vendor_code}</p>
          </div>
        </div>
        <button onClick={onClose} className="ml-2 shrink-0 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 text-lg leading-none">×</button>
      </div>

      <div className="p-4 space-y-4 flex-1">
        {/* ABC */}
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
              : <span className="text-sm text-zinc-400">нет себест.</span>}
          </div>
        </div>

        {loading && <p className="text-xs text-zinc-400 animate-pulse">Загружаем детализацию...</p>}

        {detail && (
          <>
            {/* П&Л блок */}
            <div className="space-y-0.5">
              <Section title="Выручка" />
              <Row label="Выручка до СПП"   value={fmtRub(detail.revenue_before_spp)} />
              <Row label="СПП"              value={detail.spp_amount != null ? `− ${fmtRub(detail.spp_amount)}` : '—'} color="text-red-400" />
              <Row label="Выручка после СПП" value={fmtRub(detail.revenue_after_spp)} bold
                sub={`${row.revenue_share.toFixed(1)}% от итого · ${detail.sold_qty} шт`} />

              <Section title="Расходы" />
              <Row label={`Себестоимость${detail.cost_price_unit != null ? ` (${fmt(detail.cost_price_unit)} ₽/шт)` : ''}`}
                value={detail.cost_total != null ? `− ${fmtRub(detail.cost_total)}` : '—'} color="text-red-400" />
              <Row label="Комиссия WB"   value={`− ${fmtRub(detail.commission)}`}  color="text-red-400" />
              <Row label="Логистика"     value={`− ${fmtRub(detail.logistics)}`}   color="text-red-400" />
              <Row label="Хранение"      value={`− ${fmtRub(detail.storage)}`}     color="text-red-400" />
              <Row label="Реклама"       value={detail.ad_spend > 0 ? `− ${fmtRub(detail.ad_spend)}` : '—'} color="text-red-400" />
              <Row label={`Налог УСН (${detail.usn_pct}%)`}
                value={detail.usn_amount != null ? `− ${fmtRub(detail.usn_amount)}` : '—'} color="text-red-400"
                sub={detail.vat_pct > 0 ? `база после НДС` : undefined} />
              {detail.vat_pct > 0 && (
                <Row label={`НДС (${detail.vat_pct}%)`}
                  value={detail.vat_amount != null ? `− ${fmtRub(detail.vat_amount)}` : '—'} color="text-red-400" />
              )}
              <Row label="Брак и потери (1%)" value={detail.defect != null ? `− ${fmtRub(detail.defect)}` : '—'} color="text-red-400" />
              {detail.penalty > 0 && (
                <Row label="Штрафы / удержания" value={`− ${fmtRub(detail.penalty)}`} color="text-red-400" />
              )}

              <Section title="Итог" />
              <Row label="Чистая прибыль" value={fmtRub(detail.net_profit)} color={profitColor(detail.net_profit)} bold />
              <Row label="Прибыль на 1 шт" value={fmtRub(detail.net_profit_unit)} color={profitColor(detail.net_profit_unit)} />
              <Row label="% прибыли"       value={fmtPct(detail.margin_pct)} color={profitColor(detail.margin_pct)} />
              <Row label="ROI"             value={fmtPct(detail.roi_pct)}    color={profitColor(detail.roi_pct)} />
              <Row label="Точка безубыточности" value={fmtRub(detail.break_even)} />
              <Row label="Безубыточность / шт"  value={fmtRub(detail.break_even_unit)} />
            </div>

            {/* Остаток */}
            <div className="space-y-1">
              <Section title="Остатки" />
              <div className="bg-zinc-50 dark:bg-zinc-900 rounded-lg p-3 flex items-center justify-between">
                <div>
                  <p className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100">{fmt(detail.current_stock)}</p>
                  <p className="text-xs text-zinc-400">штук на складе</p>
                </div>
                {emptyDateFmt && (
                  <div className={`text-right ${
                    (() => {
                      if (!detail.empty_date) return 'text-zinc-500'
                      const days = Math.round((new Date(detail.empty_date).getTime() - Date.now()) / 86400000)
                      return days < 15 ? 'text-red-500' : days < 30 ? 'text-amber-500' : 'text-zinc-500'
                    })()
                  }`}>
                    <p className="text-lg font-semibold">{emptyDateFmt}</p>
                    <p className="text-xs">дата пустого склада</p>
                  </div>
                )}
              </div>
            </div>
          </>
        )}

        {/* Динамика заказов */}
        <div className="space-y-2">
          <Section title="Динамика по заказам, шт" />
          {loading ? (
            <div className="h-24 flex items-center justify-center text-xs text-zinc-400 animate-pulse">Загружаем...</div>
          ) : weeks.length === 0 ? (
            <div className="h-16 flex items-center justify-center text-xs text-zinc-400">Нет данных</div>
          ) : (
            <div className="space-y-1">
              {weeks.map(w => {
                const [mm, dd] = w.week.split('-')
                const label = `${dd}.${mm}`
                const maxOrders = Math.max(...weeks.map(x => x.orders), 1)
                return (
                  <div key={w.week} className="flex items-center gap-2">
                    <span className="text-xs text-zinc-400 w-10 shrink-0">{label}</span>
                    <div className="flex-1 bg-zinc-100 dark:bg-zinc-800 rounded-full h-2 overflow-hidden">
                      <div className="h-full bg-indigo-500 rounded-full transition-all" style={{ width: `${(w.orders / maxOrders) * 100}%` }} />
                    </div>
                    <span className="text-xs text-zinc-600 dark:text-zinc-400 w-10 text-right shrink-0">{w.orders} шт</span>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Кандидат на вывод */}
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
