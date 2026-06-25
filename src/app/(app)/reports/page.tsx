'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { WeeklyTable } from '@/components/weekly/weekly-table'
import { Hint } from '@/components/ui/hint'
import Link from 'next/link'

// ─── Types ────────────────────────────────────────────────────────────────────

interface WeekRow {
  realizationreport_id: number
  date_from: string
  date_to: string
  revenue: number
  returns: number
  commission: number
  logistics: number
  storage: number
  paid_storage: number
  advertising: number
  penalties: number
  additional: number
  payout: number
  reconciled: number
  delta: number | null
}

type FinReport = {
  id: string
  report_number: number
  legal_entity: string | null
  date_from: string | null
  date_to: string | null
  date_created: string | null
  report_type: string | null
  sale: number | null
  loyalty_compensation: number | null
  for_pay: number | null
  agreed_discount_pct: number | null
  logistics_cost: number | null
  storage_cost: number | null
  acceptance_cost: number | null
  other_deductions: number | null
  total_fines: number | null
  wb_commission_correction: number | null
  loyalty_program_cost: number | null
  loyalty_points_deducted: number | null
  one_time_payment_change: number | null
  total_to_pay: number | null
  currency: string | null
  has_detail_rows: boolean
  reconciled: boolean
  reconciled_at: string | null
  reconcile_result: Record<string, unknown> | null
}

type FinApiResponse = { reports: FinReport[]; total: number; lastDate: string | null }

// ─── Helpers ──────────────────────────────────────────────────────────────────

function today() { return new Date().toISOString().split('T')[0] }
function daysAgo(n: number) {
  const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().split('T')[0]
}
function fmt(v: number | null, decimals = 2): string {
  if (v == null) return '—'
  return v.toLocaleString('ru', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
}
function fmtDate(s: string | null): string {
  if (!s) return '—'
  return new Date(s).toLocaleDateString('ru', { day: '2-digit', month: '2-digit', year: 'numeric' })
}
function fmtDateShort(s: string | null): string {
  if (!s) return '—'
  return new Date(s).toLocaleDateString('ru', { day: '2-digit', month: '2-digit', year: '2-digit' })
}

// ─── SummaryCard ──────────────────────────────────────────────────────────────

const FIELD_HINTS: Record<string, React.ReactNode> = {
  'Продажа': (
    <div className="space-y-1">
      <div className="font-semibold text-foreground">Продажа</div>
      <p>Сумма выкупленных товаров по розничным ценам WB за отчётный период. Это выручка до вычета любых расходов.</p>
    </div>
  ),
  'К перечислению за товар': (
    <div className="space-y-1">
      <div className="font-semibold text-foreground">К перечислению за товар</div>
      <p>Сумма к выплате продавцу <strong>после</strong> вычета комиссии WB, но <strong>до</strong> вычета логистики и хранения.</p>
      <p className="text-muted-foreground text-xs">= Продажа − Комиссия WB</p>
    </div>
  ),
  'Итого к оплате': (
    <div className="space-y-1">
      <div className="font-semibold text-foreground">Итого к оплате</div>
      <p>Финальная сумма выплаты: что WB перечислит вам на расчётный счёт.</p>
      <p className="text-muted-foreground text-xs">= К перечислению − Логистика − Хранение − Штрафы ± Корректировки</p>
    </div>
  ),
  'Прочие удержания/выплаты': (
    <div className="space-y-1">
      <div className="font-semibold text-foreground">Прочие удержания/выплаты</div>
      <p>Удержания за нарушения, штрафы СЦ, самовыкупы, возвраты и прочие операции, не попавшие в другие статьи.</p>
    </div>
  ),
  'Стоимость логистики': (
    <div className="space-y-1">
      <div className="font-semibold text-foreground">Стоимость логистики</div>
      <p>Расходы на доставку товаров покупателям и обратные логистику (возвраты). Взимается WB автоматически.</p>
    </div>
  ),
  'Корректировка Вознаграждения Вайлдберриз (ВВ)': (
    <div className="space-y-1">
      <div className="font-semibold text-foreground">Корректировка ВВ</div>
      <p>Перерасчёт вознаграждения Wildberries за <strong>предыдущие</strong> отчётные периоды. Может быть положительным или отрицательным.</p>
    </div>
  ),
  'Общая сумма штрафов': (
    <div className="space-y-1">
      <div className="font-semibold text-foreground">Штрафы</div>
      <p>Штрафы за нарушения: неверная маркировка, отказ от поставки, нарушение условий акций и т.д.</p>
    </div>
  ),
  'Стоимость хранения': (
    <div className="space-y-1">
      <div className="font-semibold text-foreground">Стоимость хранения</div>
      <p>Стоимость хранения по данным <strong>еженедельного отчёта</strong> WB. Может отличаться от данных API paid_storage (~×1.3).</p>
    </div>
  ),
}

function SummaryCard({ r }: { r: FinReport }) {
  const fields = [
    { label: '№ отчёта', value: String(r.report_number) },
    { label: 'Продажа', value: `${fmt(r.sale)} ${r.currency ?? 'руб.'}` },
    { label: 'Стоимость хранения', value: fmt(r.storage_cost) },
    { label: 'Стоимость участия в программе лояльности', value: fmt(r.loyalty_program_cost) },
    { label: 'Юридическое лицо', value: r.legal_entity ?? '—' },
    { label: 'В том числе Компенсация скидки по программе лояльности', value: fmt(r.loyalty_compensation) },
    { label: 'Стоимость операций при приёмке', value: fmt(r.acceptance_cost) },
    { label: 'Сумма баллов, удержанных по программе лояльности', value: fmt(r.loyalty_points_deducted) },
    { label: 'Период', value: `с ${fmtDate(r.date_from)} по ${fmtDate(r.date_to)}` },
    { label: 'К перечислению за товар', value: fmt(r.for_pay) },
    { label: 'Прочие удержания/выплаты', value: fmt(r.other_deductions) },
    { label: 'Разовое изменение срока перечисления ДС', value: fmt(r.one_time_payment_change) },
    { label: 'Дата формирования', value: fmtDate(r.date_created) },
    { label: 'Согласованная скидка, %', value: fmt(r.agreed_discount_pct) },
    { label: 'Общая сумма штрафов', value: fmt(r.total_fines) },
    { label: 'Итого к оплате', value: fmt(r.total_to_pay) },
    { label: 'Тип отчёта', value: r.report_type ?? '—' },
    { label: 'Стоимость логистики', value: fmt(r.logistics_cost) },
    { label: 'Корректировка Вознаграждения Вайлдберриз (ВВ)', value: fmt(r.wb_commission_correction) },
    { label: 'Валюта', value: r.currency ?? '—' },
  ]

  return (
    <div className="px-4 pb-4 pt-2">
      <div className="rounded-xl border border-border bg-muted/10 overflow-hidden">
        <div className="px-5 py-3 border-b border-border flex items-center justify-between">
          <span className="text-sm font-medium">
            Сводная информация за период {fmtDate(r.date_from)} — {fmtDate(r.date_to)}
          </span>
          <a
            href="https://seller.wildberries.ru/suppliers-mutual-settlements/reports-implementations/reports-weekly"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
          >
            Как читать детализированный финансовый отчёт →
          </a>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-0">
          {fields.map((f, i) => (
            <div key={i} className="px-5 py-3 border-b border-r border-border/40 last:border-r-0">
              <div className="flex items-center gap-1 mb-0.5">
                <div className="text-xs text-muted-foreground leading-tight">{f.label}</div>
                {FIELD_HINTS[f.label] && (
                  <Hint width={300} align={i % 4 >= 2 ? 'right' : 'left'}>{FIELD_HINTS[f.label]}</Hint>
                )}
              </div>
              <div className="text-sm font-medium">{f.value}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── Weekly section ───────────────────────────────────────────────────────────

const PRESETS = [
  { label: '4 нед', days: 28 },
  { label: '12 нед', days: 84 },
  { label: '24 нед', days: 168 },
]

function WeeklySection() {
  const [dateFrom, setDateFrom] = useState(daysAgo(84))
  const [dateTo, setDateTo] = useState(today())
  const [activePreset, setActivePreset] = useState('12 нед')
  const [weeks, setWeeks] = useState<WeekRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async (from: string, to: string) => {
    setLoading(true); setError('')
    try {
      const res = await fetch(`/api/weekly?from=${from}&to=${to}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Ошибка')
      setWeeks(data.weeks ?? [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка')
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { load(dateFrom, dateTo) }, [])

  function applyPreset(label: string, days: number) {
    const from = daysAgo(days), to = today()
    setDateFrom(from); setDateTo(to); setActivePreset(label)
    load(from, to)
  }

  const totalRevenue = weeks.reduce((s, w) => s + w.revenue, 0)
  const totalPayout = weeks.reduce((s, w) => s + w.payout, 0)
  const avgPayout = weeks.length > 0 ? totalPayout / weeks.length : 0

  return (
    <section className="space-y-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">Отчёты WB (Еженедельные)</h2>
            <Hint width={360}>
              <strong>Еженедельные отчёты о реализации</strong><br /><br />
              WB формирует отчёт каждую неделю (обычно с пн по вс). В отчёте отражаются все операции: продажи, возвраты, логистика, хранение, штрафы.<br /><br />
              <strong>Источник данных:</strong> таблица <code>wb_finance</code> — детализация строк из еженедельного отчёта WB (аналог Excel-выгрузки).<br /><br />
              <strong>Данные ведём с 01.01.2026.</strong> Более ранние периоды не отображаются.
            </Hint>
          </div>
          <p className="text-sm text-zinc-400 mt-0.5">Реализационные отчёты WB по неделям</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
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

      {!loading && weeks.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-4">
            <div className="flex items-center gap-1 mb-1">
              <p className="text-xs text-zinc-500 uppercase tracking-wide">Всего выручка</p>
              <Hint width={280}>
                Сумма розничных продаж (ppvz_for_pay по строкам «Продажа») за все недели выбранного периода. Возвраты уже вычтены из расчёта выплаты, но здесь показана валовая выручка без вычетов.
              </Hint>
            </div>
            <p className="text-xl font-bold text-zinc-900 dark:text-zinc-100">
              {totalRevenue.toLocaleString('ru', { maximumFractionDigits: 0 })} ₽
            </p>
            <p className="text-xs text-zinc-400 mt-0.5">{weeks.length} недель</p>
          </div>
          <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-4">
            <div className="flex items-center gap-1 mb-1">
              <p className="text-xs text-zinc-500 uppercase tracking-wide">Всего выплата</p>
              <Hint width={300}>
                Итоговая сумма к перечислению от WB за период.<br /><br />
                <strong>Формула:</strong> Выручка − Возвраты − Логистика − Хранение − Штрафы ± Прочие.<br /><br />
                Это то, что фактически поступает на расчётный счёт.
              </Hint>
            </div>
            <p className={`text-xl font-bold ${totalPayout >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500'}`}>
              {totalPayout.toLocaleString('ru', { maximumFractionDigits: 0 })} ₽
            </p>
            <p className="text-xs text-zinc-400 mt-0.5">чистая от WB</p>
          </div>
          <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-4">
            <div className="flex items-center gap-1 mb-1">
              <p className="text-xs text-zinc-500 uppercase tracking-wide">Ср. выплата / нед</p>
              <Hint width={260}>
                Среднее значение выплаты за одну неделю = Всего выплата ÷ количество недель в периоде. Помогает оценить стабильность денежного потока от WB.
              </Hint>
            </div>
            <p className={`text-xl font-bold ${avgPayout >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500'}`}>
              {Math.round(avgPayout).toLocaleString('ru')} ₽
            </p>
            <p className="text-xs text-zinc-400 mt-0.5">среднее за период</p>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16 text-sm text-zinc-400">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
            Загружаем отчёты…
          </div>
        </div>
      ) : (
        <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-5">
          <WeeklyTable weeks={weeks} dateFrom={dateFrom} dateTo={dateTo} />
        </div>
      )}
    </section>
  )
}

// ─── Finance section ──────────────────────────────────────────────────────────

function FinanceSection() {
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [data, setData] = useState<FinApiResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [reconciling, setReconciling] = useState<number | null>(null)
  const [expanded, setExpanded] = useState<number | null>(null)

  const load = useCallback(async (q: string, p: number) => {
    setLoading(true)
    const params = new URLSearchParams({ page: String(p), limit: '20' })
    if (q) params.set('search', q)
    const res = await fetch(`/api/finance-reports?${params}`)
    const d = await res.json() as FinApiResponse
    setData(d)
    setLoading(false)
  }, [])

  useEffect(() => { load(search, page) }, [search, page, load])

  async function reconcile(reportNumber: number, e: React.MouseEvent) {
    e.stopPropagation()
    setReconciling(reportNumber)
    await fetch(`/api/finance-reports/${reportNumber}/reconcile`, { method: 'POST' })
    setReconciling(null)
    load(search, page)
  }

  function toggleExpand(reportNumber: number) {
    setExpanded(prev => prev === reportNumber ? null : reportNumber)
  }

  const reports = data?.reports ?? []
  const total = data?.total ?? 0
  const totalPages = Math.ceil(total / 20)

  return (
    <section className="space-y-5">
      <div>
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold">Финансовые отчёты WB</h2>
          <Hint width={360}>
            <strong>Финансовые отчёты WB (сводные)</strong><br /><br />
            Отчёты загружаются из WB API и хранятся в таблице <code>wb_weekly_reports</code>. Каждый отчёт — это сводка за одну неделю с итоговыми суммами по всем статьям.<br /><br />
            <strong>Детализация:</strong> нажмите ▶ на строке, чтобы раскрыть все поля отчёта.<br /><br />
            <strong>Сверка</strong> — автоматическая проверка совпадения данных WB с нашей базой. Кнопка «Сверить» появляется только если загружена детализация строк.<br /><br />
            Данные ведём с 01.01.2026.
          </Hint>
        </div>
        <p className="text-sm text-muted-foreground mt-0.5">Еженедельные отчёты о реализации</p>
      </div>

      <div className="flex gap-3 items-center">
        <input
          type="text"
          placeholder="Поиск по номеру отчёта…"
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(1) }}
          className="w-64 text-sm px-3 py-2 rounded-lg border border-border bg-background"
        />
        <span className="text-sm text-muted-foreground">{total} отчётов</span>
      </div>

      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-border text-xs text-muted-foreground">
              <tr>
                <th className="text-left px-4 py-3 w-6"></th>
                <th className="text-left px-3 py-3">№ отчёта</th>
                <th className="text-left px-3 py-3">Период</th>
                <th className="text-right px-3 py-3">
                  <span className="inline-flex items-center justify-end gap-1">
                    Продажа
                    <span onClick={e => e.stopPropagation()}>
                      <Hint width={260} align="right">Сумма выкупленных товаров по розничным ценам WB. Это валовая выручка до вычета комиссии и расходов.</Hint>
                    </span>
                  </span>
                </th>
                <th className="text-right px-3 py-3">
                  <span className="inline-flex items-center justify-end gap-1">
                    К перечислению
                    <span onClick={e => e.stopPropagation()}>
                      <Hint width={280} align="right">Сумма после вычета комиссии WB, но до вычета логистики и хранения.<br /><strong>= Продажа − Комиссия WB</strong></Hint>
                    </span>
                  </span>
                </th>
                <th className="text-right px-3 py-3">
                  <span className="inline-flex items-center justify-end gap-1">
                    Хранение
                    <span onClick={e => e.stopPropagation()}>
                      <Hint width={280} align="right">Стоимость хранения по данным еженедельного отчёта. Может отличаться от данных API paid_storage примерно в 1.3 раза из-за методологии расчёта WB.</Hint>
                    </span>
                  </span>
                </th>
                <th className="text-right px-3 py-3">
                  <span className="inline-flex items-center justify-end gap-1">
                    Логистика
                    <span onClick={e => e.stopPropagation()}>
                      <Hint width={260} align="right">Расходы на доставку товаров покупателям и обратную логистику (возвраты). Взимается WB автоматически.</Hint>
                    </span>
                  </span>
                </th>
                <th className="text-right px-3 py-3">
                  <span className="inline-flex items-center justify-end gap-1">
                    Итого к оплате
                    <span onClick={e => e.stopPropagation()}>
                      <Hint width={300} align="right">Финальная сумма выплаты на расчётный счёт.<br /><strong>= К перечислению − Логистика − Хранение − Штрафы ± Прочие</strong></Hint>
                    </span>
                  </span>
                </th>
                <th className="text-left px-3 py-3">
                  <span className="inline-flex items-center gap-1">
                    Статус
                    <Hint width={280}>
                      <strong>Детализация загружена</strong> — строки отчёта загружены из WB API в таблицу wb_finance.<br /><br />
                      <strong>Сверен</strong> — мы сравнили суммы из wb_finance с итогами отчёта и они совпали.
                    </Hint>
                  </span>
                </th>
                <th className="px-3 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={10} className="px-4 py-10 text-center text-muted-foreground">Загружаем…</td></tr>
              )}
              {!loading && reports.length === 0 && (
                <tr><td colSpan={10} className="px-4 py-10 text-center text-muted-foreground">Отчёты не найдены</td></tr>
              )}
              {reports.map(r => (
                <React.Fragment key={r.id}>
                  <tr
                    className="border-b border-border/30 hover:bg-muted/10 cursor-pointer"
                    onClick={() => toggleExpand(r.report_number)}
                  >
                    <td className="px-4 py-3 text-muted-foreground text-xs">
                      {expanded === r.report_number ? '▼' : '▶'}
                    </td>
                    <td className="px-3 py-3">
                      <Link
                        href={`/finance-reports/${r.report_number}`}
                        onClick={e => e.stopPropagation()}
                        className="font-mono text-sm text-blue-400 hover:text-blue-300 transition-colors hover:underline"
                      >
                        {r.report_number}
                      </Link>
                    </td>
                    <td className="px-3 py-3 text-muted-foreground whitespace-nowrap">
                      {fmtDateShort(r.date_from)} — {fmtDateShort(r.date_to)}
                    </td>
                    <td className="px-3 py-3 text-right font-mono">{fmt(r.sale)}</td>
                    <td className="px-3 py-3 text-right font-mono">{fmt(r.for_pay)}</td>
                    <td className="px-3 py-3 text-right font-mono">{fmt(r.storage_cost)}</td>
                    <td className="px-3 py-3 text-right font-mono">{fmt(r.logistics_cost)}</td>
                    <td className="px-3 py-3 text-right font-mono font-semibold">{fmt(r.total_to_pay)}</td>
                    <td className="px-3 py-3">
                      <div className="flex flex-col gap-0.5">
                        <span className={`text-xs ${r.has_detail_rows ? 'text-green-400' : 'text-muted-foreground'}`}>
                          {r.has_detail_rows ? 'Детализация загружена' : 'Только сводка'}
                        </span>
                        <span className={`text-xs ${r.reconciled ? 'text-green-400' : 'text-muted-foreground'}`}>
                          {r.reconciled ? `Сверен ${fmtDateShort(r.reconciled_at)}` : 'Не сверен'}
                        </span>
                      </div>
                    </td>
                    <td className="px-3 py-3" onClick={e => e.stopPropagation()}>
                      {!r.reconciled && r.has_detail_rows && (
                        <button
                          onClick={e => reconcile(r.report_number, e)}
                          disabled={reconciling === r.report_number}
                          className="px-3 py-1.5 rounded-lg border border-border text-xs hover:bg-muted/30 disabled:opacity-50 whitespace-nowrap"
                        >
                          {reconciling === r.report_number ? 'Сверяем…' : 'Сверить'}
                        </button>
                      )}
                    </td>
                  </tr>
                  {expanded === r.report_number && (
                    <tr className="border-b border-border/30 bg-muted/5">
                      <td colSpan={10} className="p-0">
                        <SummaryCard r={r} />
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
            className="px-3 py-1.5 rounded-lg border border-border text-sm disabled:opacity-40">←</button>
          <span className="text-sm text-muted-foreground">{page} / {totalPages}</span>
          <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
            className="px-3 py-1.5 rounded-lg border border-border text-sm disabled:opacity-40">→</button>
        </div>
      )}
    </section>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ReportsPage() {
  return (
    <div className="p-6 max-w-[1200px] space-y-10">
      <WeeklySection />
      <div className="border-t border-border" />
      <FinanceSection />
    </div>
  )
}
