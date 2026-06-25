'use client'

import { useState, useEffect, useCallback } from 'react'
import { Hint } from '@/components/ui/hint'

interface ReportRow {
  realizationreport_id: number
  date_from: string
  date_to: string
  rrd_id: number
  nm_id: number | null
  sa_name: string | null
  brand_name: string | null
  barcode: string | null
  doc_type_name: string | null
  supplier_oper_name: string | null
  quantity: number | null
  sale_dt: string | null
  order_dt: string | null
  retail_price: number | null
  retail_price_withdisc_rub: number | null
  retail_amount: number | null
  ppvz_for_pay: number | null
  ppvz_sales_commission: number | null
  delivery_rub: number | null
  penalty: number | null
  additional_payment: number | null
  storage_fee: number | null
  deduction: number | null
  acceptance: number | null
  srid: string | null
  office_name: string | null
  ts_name: string | null
}

interface Totals {
  'ppvz_for_pay.sum': number | null
  'penalty.sum': number | null
  'storage_fee.sum': number | null
  'delivery_rub.sum': number | null
  'acceptance.sum': number | null
  'deduction.sum': number | null
  'additional_payment.sum': number | null
}

interface ReportOption { id: number; date_from: string; date_to: string }

interface ApiResponse {
  rows: ReportRow[]
  total: number
  totals: Totals | null
  reports: ReportOption[]
}

function rub(v: number | null) {
  if (v == null) return '—'
  return Math.round(v).toLocaleString('ru') + ' ₽'
}

function rubColor(v: number | null, positiveGreen = true) {
  if (v == null || v === 0) return ''
  if (positiveGreen) return v > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500'
  return v > 0 ? 'text-red-500' : 'text-emerald-600 dark:text-emerald-400'
}

function fmtDate(s: string | null) {
  if (!s) return '—'
  return new Date(s).toLocaleDateString('ru', { day: '2-digit', month: '2-digit', year: '2-digit' })
}

export function FinReportsClient() {
  // Фильтры
  const [dateFrom,   setDateFrom]   = useState('')
  const [dateTo,     setDateTo]     = useState('')
  const [nmId,       setNmId]       = useState('')
  const [barcode,    setBarcode]    = useState('')
  const [reportId,   setReportId]   = useState('')
  const [docType,    setDocType]    = useState('')

  // Данные
  const [rows,       setRows]       = useState<ReportRow[]>([])
  const [totals,     setTotals]     = useState<Totals | null>(null)
  const [reports,    setReports]    = useState<ReportOption[]>([])
  const [total,      setTotal]      = useState(0)
  const [page,       setPage]       = useState(1)
  const [loading,    setLoading]    = useState(false)

  // Детали строки
  const [detail,     setDetail]     = useState<ReportRow | null>(null)

  const LIMIT = 50

  const load = useCallback(async (p = 1) => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ page: String(p), limit: String(LIMIT) })
      if (dateFrom)  params.set('date_from', dateFrom)
      if (dateTo)    params.set('date_to', dateTo)
      if (nmId)      params.set('nm_id', nmId)
      if (barcode)   params.set('barcode', barcode)
      if (reportId)  params.set('report_id', reportId)
      if (docType)   params.set('doc_type', docType)

      const res = await fetch(`/api/finance-reports/rows?${params}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = await res.json() as ApiResponse
      setRows(json.rows)
      setTotal(json.total)
      setTotals(json.totals)
      setReports(json.reports)
      setPage(p)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [dateFrom, dateTo, nmId, barcode, reportId, docType])

  useEffect(() => { load(1) }, []) // eslint-disable-line

  function applyFilters() { load(1) }
  function resetFilters() {
    setDateFrom(''); setDateTo(''); setNmId(''); setBarcode(''); setReportId(''); setDocType('')
    setTimeout(() => load(1), 0)
  }

  const totalPages = Math.ceil(total / LIMIT)

  return (
    <div className="space-y-4">

      {/* ── Фильтры ── */}
      <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-4">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <div>
            <label className="block text-xs text-zinc-400 mb-1">Период с</label>
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
              className="w-full px-2 py-1.5 text-sm border border-zinc-200 dark:border-zinc-700 rounded-lg bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          </div>
          <div>
            <label className="block text-xs text-zinc-400 mb-1">По</label>
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
              className="w-full px-2 py-1.5 text-sm border border-zinc-200 dark:border-zinc-700 rounded-lg bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          </div>
          <div>
            <label className="block text-xs text-zinc-400 mb-1">Артикул WB (nm_id)</label>
            <input type="number" value={nmId} onChange={e => setNmId(e.target.value)} placeholder="123456789"
              className="w-full px-2 py-1.5 text-sm border border-zinc-200 dark:border-zinc-700 rounded-lg bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          </div>
          <div>
            <label className="block text-xs text-zinc-400 mb-1">Баркод</label>
            <input type="text" value={barcode} onChange={e => setBarcode(e.target.value)} placeholder="2000000000000"
              className="w-full px-2 py-1.5 text-sm border border-zinc-200 dark:border-zinc-700 rounded-lg bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          </div>
          <div>
            <label className="block text-xs text-zinc-400 mb-1">№ отчёта</label>
            <select value={reportId} onChange={e => setReportId(e.target.value)}
              className="w-full px-2 py-1.5 text-sm border border-zinc-200 dark:border-zinc-700 rounded-lg bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500">
              <option value="">Все</option>
              {reports.map(r => (
                <option key={r.id} value={r.id}>
                  №{r.id} ({fmtDate(r.date_from)}–{fmtDate(r.date_to)})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-zinc-400 mb-1">Тип операции</label>
            <select value={docType} onChange={e => setDocType(e.target.value)}
              className="w-full px-2 py-1.5 text-sm border border-zinc-200 dark:border-zinc-700 rounded-lg bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500">
              <option value="">Все</option>
              <option value="Продажа">Продажа</option>
              <option value="Возврат">Возврат</option>
              <option value="Логистика">Логистика</option>
              <option value="Хранение">Хранение</option>
              <option value="Штраф">Штраф</option>
              <option value="Прочее">Прочее</option>
            </select>
          </div>
        </div>
        <div className="flex gap-2 mt-3">
          <button onClick={applyFilters}
            className="px-4 py-1.5 text-sm bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors font-medium">
            Применить
          </button>
          <button onClick={resetFilters}
            className="px-4 py-1.5 text-sm border border-zinc-200 dark:border-zinc-700 text-zinc-500 hover:text-zinc-700 rounded-lg transition-colors">
            Сбросить
          </button>
        </div>
      </div>

      {/* ── KPI карточки ── */}
      {totals && (
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
          {[
            { label: 'К выплате', key: 'ppvz_for_pay.sum', hint: 'Сумма к перечислению продавцу за реализованный товар (ppvz_for_pay)', positive: true },
            { label: 'Доп. выплаты', key: 'additional_payment.sum', hint: 'Дополнительные выплаты — доплаты и корректировки', positive: true },
            { label: 'Логистика', key: 'delivery_rub.sum', hint: 'Расходы на доставку товаров покупателям (delivery_rub)', positive: false },
            { label: 'Хранение', key: 'storage_fee.sum', hint: 'Стоимость хранения товаров на складе WB (storage_fee)', positive: false },
            { label: 'Приёмка', key: 'acceptance.sum', hint: 'Расходы на приёмку товара на складе WB (acceptance)', positive: false },
            { label: 'Штрафы', key: 'penalty.sum', hint: 'Штрафы от WB (penalty)', positive: false },
            { label: 'Удержания', key: 'deduction.sum', hint: 'Прочие удержания WB (deduction)', positive: false },
          ].map(c => {
            const val = (totals as unknown as Record<string, number | null>)[c.key]
            return (
              <div key={c.key} className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-3">
                <div className="flex items-center gap-1 mb-1">
                  <p className="text-xs text-zinc-400">{c.label}</p>
                  <Hint width={240}>{c.hint}</Hint>
                </div>
                <p className={`text-lg font-bold tabular-nums ${rubColor(val, c.positive)}`}>
                  {rub(val)}
                </p>
              </div>
            )
          })}
        </div>
      )}

      {/* ── Таблица ── */}
      <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-100 dark:border-zinc-800">
          <p className="text-sm text-zinc-500">
            {loading ? 'Загрузка…' : `${total.toLocaleString('ru')} строк`}
          </p>
          {totalPages > 1 && (
            <div className="flex items-center gap-2 text-sm">
              <button onClick={() => load(page - 1)} disabled={page <= 1 || loading}
                className="px-2 py-1 rounded border border-zinc-200 dark:border-zinc-700 disabled:opacity-40 hover:bg-zinc-50 dark:hover:bg-zinc-800">←</button>
              <span className="text-zinc-500">{page} / {totalPages}</span>
              <button onClick={() => load(page + 1)} disabled={page >= totalPages || loading}
                className="px-2 py-1 rounded border border-zinc-200 dark:border-zinc-700 disabled:opacity-40 hover:bg-zinc-50 dark:hover:bg-zinc-800">→</button>
            </div>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-100 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/50">
                <th className="text-left px-3 py-2 text-xs font-medium text-zinc-400 whitespace-nowrap">Отчёт / период</th>
                <th className="text-left px-3 py-2 text-xs font-medium text-zinc-400 whitespace-nowrap">Артикул</th>
                <th className="text-left px-3 py-2 text-xs font-medium text-zinc-400 whitespace-nowrap">Баркод</th>
                <th className="text-left px-3 py-2 text-xs font-medium text-zinc-400 whitespace-nowrap">Операция</th>
                <th className="text-right px-3 py-2 text-xs font-medium text-zinc-400 whitespace-nowrap">Кол-во</th>
                <th className="text-right px-3 py-2 text-xs font-medium text-zinc-400 whitespace-nowrap">К выплате</th>
                <th className="text-right px-3 py-2 text-xs font-medium text-zinc-400 whitespace-nowrap">Логистика</th>
                <th className="text-right px-3 py-2 text-xs font-medium text-zinc-400 whitespace-nowrap">Хранение</th>
                <th className="text-right px-3 py-2 text-xs font-medium text-zinc-400 whitespace-nowrap">Штраф</th>
                <th className="text-left px-3 py-2 text-xs font-medium text-zinc-400 whitespace-nowrap">Дата продажи</th>
                <th className="text-left px-3 py-2 text-xs font-medium text-zinc-400 whitespace-nowrap">SRID</th>
              </tr>
            </thead>
            <tbody>
              {!loading && rows.length === 0 && (
                <tr>
                  <td colSpan={11} className="text-center py-12 text-zinc-400">
                    Нет данных. Загрузите отчёт или измените фильтры.
                  </td>
                </tr>
              )}
              {rows.map(r => (
                <tr
                  key={r.rrd_id}
                  onClick={() => setDetail(r)}
                  className="border-b border-zinc-50 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 cursor-pointer transition-colors"
                >
                  <td className="px-3 py-2 whitespace-nowrap">
                    <span className="text-xs font-medium text-indigo-600 dark:text-indigo-400">№{r.realizationreport_id}</span>
                    <span className="text-xs text-zinc-400 ml-1">{fmtDate(r.date_from)}–{fmtDate(r.date_to)}</span>
                  </td>
                  <td className="px-3 py-2">
                    <div className="text-xs font-medium text-zinc-900 dark:text-zinc-100">{r.sa_name ?? '—'}</div>
                    <div className="text-xs text-zinc-400">{r.nm_id ?? ''}</div>
                  </td>
                  <td className="px-3 py-2 text-xs text-zinc-500 whitespace-nowrap">{r.barcode ?? '—'}</td>
                  <td className="px-3 py-2">
                    <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                      r.doc_type_name === 'Продажа' ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400'
                      : r.doc_type_name === 'Возврат' ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
                      : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500'
                    }`}>
                      {r.doc_type_name ?? '—'}
                    </span>
                    {r.supplier_oper_name && r.supplier_oper_name !== r.doc_type_name && (
                      <div className="text-xs text-zinc-400 mt-0.5">{r.supplier_oper_name}</div>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right text-xs tabular-nums">{r.quantity ?? '—'}</td>
                  <td className={`px-3 py-2 text-right text-xs tabular-nums font-medium ${rubColor(r.ppvz_for_pay)}`}>
                    {rub(r.ppvz_for_pay)}
                  </td>
                  <td className={`px-3 py-2 text-right text-xs tabular-nums ${rubColor(r.delivery_rub, false)}`}>
                    {rub(r.delivery_rub)}
                  </td>
                  <td className={`px-3 py-2 text-right text-xs tabular-nums ${rubColor(r.storage_fee, false)}`}>
                    {rub(r.storage_fee)}
                  </td>
                  <td className={`px-3 py-2 text-right text-xs tabular-nums ${rubColor(r.penalty, false)}`}>
                    {rub(r.penalty)}
                  </td>
                  <td className="px-3 py-2 text-xs text-zinc-500 whitespace-nowrap">{fmtDate(r.sale_dt)}</td>
                  <td className="px-3 py-2 text-xs text-zinc-400 max-w-[120px] truncate" title={r.srid ?? ''}>{r.srid ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Детальная панель ── */}
      {detail && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-4"
          onClick={() => setDetail(null)}
        >
          <div
            className="bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-100 dark:border-zinc-800 sticky top-0 bg-white dark:bg-zinc-900">
              <div>
                <p className="font-semibold text-zinc-900 dark:text-zinc-100">{detail.sa_name ?? '—'}</p>
                <p className="text-xs text-zinc-400">nm_id: {detail.nm_id} · {detail.ts_name}</p>
              </div>
              <button onClick={() => setDetail(null)} className="text-zinc-400 hover:text-zinc-600 text-2xl leading-none">×</button>
            </div>

            <div className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                {[
                  ['Отчёт №', detail.realizationreport_id],
                  ['Период', `${fmtDate(detail.date_from)} — ${fmtDate(detail.date_to)}`],
                  ['Баркод', detail.barcode],
                  ['rrd_id', detail.rrd_id],
                  ['Тип операции', detail.doc_type_name],
                  ['Поставщик опер.', detail.supplier_oper_name],
                  ['Кол-во', detail.quantity],
                  ['Склад', detail.office_name],
                  ['Дата заказа', fmtDate(detail.order_dt)],
                  ['Дата продажи', fmtDate(detail.sale_dt)],
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
                    ['Розничная цена', detail.retail_price, true],
                    ['Цена со скидкой', detail.retail_price_withdisc_rub, true],
                    ['Сумма продажи', detail.retail_amount, true],
                    ['К выплате (ppvz)', detail.ppvz_for_pay, true],
                    ['Комиссия WB', detail.ppvz_sales_commission, false],
                    ['Логистика', detail.delivery_rub, false],
                    ['Хранение', detail.storage_fee, false],
                    ['Приёмка', detail.acceptance, false],
                    ['Штраф', detail.penalty, false],
                    ['Удержание', detail.deduction, false],
                    ['Доп. выплата', detail.additional_payment, true],
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
