'use client'

import { useState, useEffect, useCallback } from 'react'
import type { SmartReportRow, SmartReportResponse } from '@/app/api/reports/rows/route'

type SourceFilter = 'all' | 'weekly' | 'daily' | 'api'

function rub(v: number | null): string {
  if (v == null || v === 0) return '—'
  return Math.round(v).toLocaleString('ru') + ' ₽'
}
function rubColor(v: number | null, positiveGreen = true): string {
  if (v == null || v === 0) return ''
  if (positiveGreen) return v > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500'
  return v > 0 ? 'text-red-500' : 'text-emerald-600 dark:text-emerald-400'
}
function fmtDate(s: string | null): string {
  if (!s) return '—'
  return new Date(s).toLocaleDateString('ru', { day: '2-digit', month: '2-digit', year: '2-digit' })
}
function today(): string { return new Date().toISOString().split('T')[0] }
function daysAgo(n: number): string {
  const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().split('T')[0]
}

const SOURCE_LABELS: Record<string, { short: string; full: string; cls: string }> = {
  weekly: { short: 'нед', full: 'Еженедельный',  cls: 'bg-emerald-500/15 text-emerald-500 dark:text-emerald-400' },
  daily:  { short: 'дн',  full: 'Ежедневный',    cls: 'bg-amber-500/15 text-amber-500 dark:text-amber-400' },
  api:    { short: 'api', full: 'API WB',         cls: 'bg-zinc-500/15 text-zinc-400' },
}

function SourceBadge({ source, superseded }: { source: string; superseded: boolean }) {
  const s = SOURCE_LABELS[source] ?? { short: source, cls: 'bg-zinc-500/15 text-zinc-400' }
  return (
    <span className={`inline-flex items-center justify-center w-10 text-[10px] font-semibold px-1 py-0.5 rounded ${s.cls} ${superseded ? 'opacity-40' : ''}`}>
      {s.short}
    </span>
  )
}

function DocTypeBadge({ doc }: { doc: string | null }) {
  if (!doc) return <span className="text-zinc-400">—</span>
  const cls =
    doc === 'Продажа' ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
    : doc === 'Возврат' ? 'bg-red-500/15 text-red-500'
    : 'bg-zinc-500/10 text-zinc-500'
  return <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${cls}`}>{doc}</span>
}

const FILTER_OPTIONS: { value: SourceFilter; label: string }[] = [
  { value: 'all',    label: 'Все' },
  { value: 'weekly', label: 'Еженедельные' },
  { value: 'daily',  label: 'Ежедневные' },
  { value: 'api',    label: 'API WB' },
]

const LIMIT = 50

export function SmartDetailTable() {
  const [source, setSource]     = useState<SourceFilter>('all')
  const [dateFrom, setDateFrom] = useState(daysAgo(90))
  const [dateTo, setDateTo]     = useState(today())
  const [nmId, setNmId]         = useState('')
  const [page, setPage]         = useState(1)
  const [data, setData]         = useState<SmartReportResponse | null>(null)
  const [loading, setLoading]   = useState(false)
  const [detail, setDetail]     = useState<SmartReportRow | null>(null)

  const load = useCallback(async (p = 1) => {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        source,
        page: String(p),
        limit: String(LIMIT),
        show_superseded: '1',
      })
      if (dateFrom) params.set('date_from', dateFrom)
      if (dateTo)   params.set('date_to', dateTo)
      if (nmId)     params.set('nm_id', nmId)
      const res = await fetch(`/api/reports/rows?${params}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setData(await res.json() as SmartReportResponse)
      setPage(p)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [source, dateFrom, dateTo, nmId])

  useEffect(() => { load(1) }, [source, dateFrom, dateTo]) // eslint-disable-line

  const rows = data?.rows ?? []
  const totals = data?.totals
  const total = data?.total ?? 0
  const totalPages = Math.ceil(total / LIMIT)
  const coverage = data?.coverage

  const activeRows = rows.filter(r => !r.superseded)
  const hasWeekly = (coverage?.weekly_periods?.length ?? 0) > 0
  const hasDaily  = (coverage?.daily_periods?.length ?? 0) > 0

  return (
    <div className="space-y-4">

      {/* Источники и период */}
      <div className="flex flex-wrap gap-3 items-center justify-between">
        <div className="flex items-center gap-2 flex-wrap">
          {FILTER_OPTIONS.map(f => (
            <button
              key={f.value}
              onClick={() => { setSource(f.value); setPage(1) }}
              className={`px-3 py-1.5 text-xs rounded-lg border transition-colors whitespace-nowrap ${
                source === f.value
                  ? 'bg-indigo-600 border-indigo-600 text-white'
                  : 'border-zinc-200 dark:border-zinc-700 text-zinc-500 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Легенда источников */}
        <div className="flex items-center gap-3 text-xs text-zinc-500">
          {hasWeekly && <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />Еженедельный (финальный)</span>}
          {hasDaily  && <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-400 inline-block" />Ежедневный (оперативный)</span>}
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-zinc-400 inline-block" />API WB (fallback)</span>
        </div>
      </div>

      {/* Фильтры периода */}
      <div className="flex items-center gap-2 flex-wrap">
        <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
          className="h-8 text-sm px-2 border border-zinc-200 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
        <span className="text-zinc-400 text-sm">—</span>
        <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
          className="h-8 text-sm px-2 border border-zinc-200 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
        <input type="number" value={nmId} onChange={e => setNmId(e.target.value)} placeholder="Артикул WB"
          className="h-8 text-sm px-2 w-36 border border-zinc-200 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
        <button onClick={() => load(1)} className="h-8 px-3 text-sm bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors">
          Применить
        </button>
      </div>

      {/* KPI карточки */}
      {totals && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {[
            { label: 'К выплате',  val: totals.for_pay,    pos: true  },
            { label: 'Логистика',  val: totals.delivery,   pos: false },
            { label: 'Хранение',   val: totals.storage,    pos: false },
            { label: 'Штрафы',     val: totals.fines,      pos: false },
            { label: 'Удержания',  val: totals.deductions, pos: false },
            { label: 'Приёмка',    val: totals.acceptance, pos: false },
          ].map(c => (
            <div key={c.label} className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-3">
              <p className="text-xs text-zinc-400 mb-1">{c.label}</p>
              <p className={`text-base font-bold tabular-nums ${rubColor(c.val, c.pos)}`}>{rub(c.val)}</p>
              <p className="text-[10px] text-zinc-500 mt-0.5">{activeRows.length} активных строк</p>
            </div>
          ))}
        </div>
      )}

      {/* Таблица */}
      <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-100 dark:border-zinc-800">
          <p className="text-sm text-zinc-500">
            {loading ? 'Загрузка…' : `${total.toLocaleString('ru')} строк`}
            {!loading && rows.some(r => r.superseded) && (
              <span className="ml-2 text-xs text-zinc-400">· замещённые показаны приглушёнными</span>
            )}
          </p>
          {totalPages > 1 && (
            <div className="flex items-center gap-2 text-sm">
              <button onClick={() => load(page - 1)} disabled={page <= 1 || loading}
                className="px-2 py-1 rounded border border-zinc-200 dark:border-zinc-700 disabled:opacity-40">←</button>
              <span className="text-zinc-500 text-xs">{page} / {totalPages}</span>
              <button onClick={() => load(page + 1)} disabled={page >= totalPages || loading}
                className="px-2 py-1 rounded border border-zinc-200 dark:border-zinc-700 disabled:opacity-40">→</button>
            </div>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-100 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/50">
                <th className="text-center px-3 py-2 text-xs font-medium text-zinc-400 w-14">Источник</th>
                <th className="text-left px-3 py-2 text-xs font-medium text-zinc-400 whitespace-nowrap">Период</th>
                <th className="text-left px-3 py-2 text-xs font-medium text-zinc-400 whitespace-nowrap">Артикул / Товар</th>
                <th className="text-left px-3 py-2 text-xs font-medium text-zinc-400 whitespace-nowrap">Тип</th>
                <th className="text-right px-3 py-2 text-xs font-medium text-zinc-400 whitespace-nowrap">К выплате</th>
                <th className="text-right px-3 py-2 text-xs font-medium text-zinc-400 whitespace-nowrap">Логистика</th>
                <th className="text-right px-3 py-2 text-xs font-medium text-zinc-400 whitespace-nowrap">Хранение</th>
                <th className="text-right px-3 py-2 text-xs font-medium text-zinc-400 whitespace-nowrap">Штрафы</th>
                <th className="text-left px-3 py-2 text-xs font-medium text-zinc-400 whitespace-nowrap">Дата продажи</th>
              </tr>
            </thead>
            <tbody>
              {!loading && rows.length === 0 && (
                <tr><td colSpan={9} className="py-12 text-center text-zinc-400 text-sm">
                  Нет данных. Загрузите отчёты через <a href="/import" className="text-indigo-400 hover:underline">Импорт</a>.
                </td></tr>
              )}
              {rows.map(r => (
                <tr
                  key={r.id}
                  onClick={() => setDetail(r)}
                  className={`border-b border-zinc-50 dark:border-zinc-800 cursor-pointer transition-colors ${
                    r.superseded
                      ? 'opacity-35 hover:opacity-60'
                      : 'hover:bg-zinc-50 dark:hover:bg-zinc-800/50'
                  }`}
                >
                  <td className="px-3 py-2 text-center">
                    <SourceBadge source={r.source} superseded={r.superseded} />
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    <span className="text-xs text-indigo-500 dark:text-indigo-400 font-medium">№{r.report_number}</span>
                    <br />
                    <span className="text-xs text-zinc-400">{fmtDate(r.date_from)}–{fmtDate(r.date_to)}</span>
                  </td>
                  <td className="px-3 py-2">
                    <div className={`text-xs font-medium ${r.superseded ? 'line-through' : 'text-zinc-900 dark:text-zinc-100'}`}>
                      {r.supplier_article ?? '—'}
                    </div>
                    <div className="text-xs text-zinc-400">{r.nm_id ?? ''}</div>
                  </td>
                  <td className="px-3 py-2">
                    <DocTypeBadge doc={r.doc_type ?? r.payment_reason} />
                  </td>
                  <td className={`px-3 py-2 text-right text-xs tabular-nums font-medium ${r.superseded ? 'line-through text-zinc-400' : rubColor(r.for_pay_seller)}`}>
                    {rub(r.for_pay_seller)}
                  </td>
                  <td className={`px-3 py-2 text-right text-xs tabular-nums ${r.superseded ? 'line-through text-zinc-400' : rubColor(r.delivery_service_cost, false)}`}>
                    {rub(r.delivery_service_cost)}
                  </td>
                  <td className={`px-3 py-2 text-right text-xs tabular-nums ${r.superseded ? 'line-through text-zinc-400' : rubColor(r.row_storage_cost, false)}`}>
                    {rub(r.row_storage_cost)}
                  </td>
                  <td className={`px-3 py-2 text-right text-xs tabular-nums ${r.superseded ? 'line-through text-zinc-400' : rubColor(r.total_fines, false)}`}>
                    {rub(r.total_fines)}
                  </td>
                  <td className="px-3 py-2 text-xs text-zinc-500 whitespace-nowrap">{fmtDate(r.sale_date)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Детальная панель */}
      {detail && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-4" onClick={() => setDetail(null)}>
          <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-100 dark:border-zinc-800 sticky top-0 bg-white dark:bg-zinc-900">
              <div>
                <p className="font-semibold text-zinc-900 dark:text-zinc-100">{detail.supplier_article ?? '—'}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  <SourceBadge source={detail.source} superseded={detail.superseded} />
                  <p className="text-xs text-zinc-400">nm_id: {detail.nm_id}</p>
                  {detail.superseded && <span className="text-xs text-amber-500">замещена</span>}
                </div>
              </div>
              <button onClick={() => setDetail(null)} className="text-zinc-400 hover:text-zinc-600 text-2xl leading-none">×</button>
            </div>
            <div className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                {[
                  ['Отчёт №', detail.report_number],
                  ['Период', `${fmtDate(detail.date_from)} — ${fmtDate(detail.date_to)}`],
                  ['Источник', SOURCE_LABELS[detail.source]?.full ?? detail.source],
                  ['Баркод', detail.barcode],
                  ['Тип операции', detail.doc_type],
                  ['Обоснование', detail.payment_reason],
                  ['Количество', detail.quantity],
                  ['Склад', detail.warehouse],
                  ['Дата продажи', fmtDate(detail.sale_date)],
                  ['SRID', detail.srid],
                ].map(([label, value]) => (
                  <div key={String(label)}>
                    <p className="text-xs text-zinc-400">{label}</p>
                    <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100 break-all">{value ?? '—'}</p>
                  </div>
                ))}
              </div>
              <div className="border-t border-zinc-100 dark:border-zinc-800 pt-4">
                <p className="text-xs font-medium text-zinc-400 uppercase tracking-wide mb-3">Финансы</p>
                <div className="space-y-2">
                  {[
                    ['К выплате', detail.for_pay_seller, true],
                    ['Логистика', detail.delivery_service_cost, false],
                    ['Хранение', detail.row_storage_cost, false],
                    ['Штрафы', detail.total_fines, false],
                    ['Удержания', detail.deductions, false],
                    ['Приёмка', detail.acceptance_operations, false],
                  ].map(([label, value, positive]) => (
                    <div key={String(label)} className="flex items-center justify-between">
                      <span className="text-sm text-zinc-500">{label as string}</span>
                      <span className={`text-sm font-medium tabular-nums ${rubColor(value as number | null, positive as boolean)}`}>
                        {rub(value as number | null)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
