'use client'

export const dynamic = 'force-dynamic'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'

type Report = {
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
  reconcile_result: {
    checkedAt?: string
    overallOk?: boolean
    fields?: {
      name: string
      summary: number
      detail: number
      diff: number
      diffPct: number
      ok: boolean
    }[]
  } | null
}

function fmt(v: number | null, decimals = 2): string {
  if (v == null || v === 0) return '0'
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

export default function ReportDetailPage() {
  const params = useParams()
  const router = useRouter()
  const reportNumber = params.reportNumber as string

  const [report, setReport] = useState<Report | null>(null)
  const [loading, setLoading] = useState(true)
  const [reconciling, setReconciling] = useState(false)

  useEffect(() => {
    async function load() {
      const res = await fetch(`/api/finance-reports?search=${reportNumber}&limit=1`)
      const d = await res.json() as { reports: Report[] }
      setReport(d.reports?.[0] ?? null)
      setLoading(false)
    }
    load()
  }, [reportNumber])

  async function reconcile() {
    setReconciling(true)
    await fetch(`/api/finance-reports/${reportNumber}/reconcile`, { method: 'POST' })
    const res = await fetch(`/api/finance-reports?search=${reportNumber}&limit=1`)
    const d = await res.json() as { reports: Report[] }
    setReport(d.reports?.[0] ?? null)
    setReconciling(false)
  }

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[200px] text-muted-foreground">
        Загружаем отчёт…
      </div>
    )
  }

  if (!report) {
    return (
      <div className="p-6 text-center text-muted-foreground">
        Отчёт №{reportNumber} не найден
      </div>
    )
  }

  const r = report
  const cur = r.currency ?? 'руб.'

  // Exact WB layout: 4 columns, 5 rows
  const columns: { label: string; value: string }[][] = [
    [
      { label: '№ отчёта', value: String(r.report_number) },
      { label: 'Юридическое лицо', value: r.legal_entity ?? '—' },
      { label: 'Период', value: `с ${fmtDate(r.date_from)} по ${fmtDate(r.date_to)}` },
      { label: 'Дата формирования', value: fmtDate(r.date_created) },
      { label: 'Тип отчёта', value: r.report_type ?? '—' },
    ],
    [
      { label: 'Продажа', value: fmt(r.sale) },
      { label: 'В том числе Компенсация скидки по программе лояльности', value: fmt(r.loyalty_compensation) },
      { label: 'К перечислению за товар', value: fmt(r.for_pay) },
      { label: 'Согласованная скидка, %', value: fmt(r.agreed_discount_pct) },
      { label: 'Стоимость логистики', value: fmt(r.logistics_cost) },
    ],
    [
      { label: 'Стоимость хранения', value: fmt(r.storage_cost) },
      { label: 'Стоимость операций при приёмке', value: fmt(r.acceptance_cost) },
      { label: 'Прочие удержания/выплаты', value: fmt(r.other_deductions) },
      { label: 'Общая сумма штрафов', value: fmt(r.total_fines) },
      { label: 'Корректировка Вознаграждения Вайлдберриз (ВВ)', value: fmt(r.wb_commission_correction) },
    ],
    [
      { label: 'Стоимость участия в программе лояльности', value: fmt(r.loyalty_program_cost) },
      { label: 'Сумма баллов, удержанных по программе лояльности', value: fmt(r.loyalty_points_deducted) },
      { label: 'Разовое изменение срока перечисления денежных средств', value: fmt(r.one_time_payment_change) },
      { label: 'Итого к оплате', value: fmt(r.total_to_pay) },
      { label: 'Валюта', value: cur },
    ],
  ]

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <button
            onClick={() => router.back()}
            className="text-sm text-muted-foreground hover:text-foreground mb-2 flex items-center gap-1"
          >
            ← Все отчёты
          </button>
          <h1 className="text-2xl font-bold">Отчёт №{r.report_number}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {fmtDate(r.date_from)} — {fmtDate(r.date_to)} · {r.legal_entity}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {r.has_detail_rows && !r.reconciled && (
            <button
              onClick={reconcile}
              disabled={reconciling}
              className="px-4 py-2 rounded-lg border border-border text-sm hover:bg-muted/30 disabled:opacity-50"
            >
              {reconciling ? 'Сверяем…' : 'Сверить данные'}
            </button>
          )}
          <a
            href="https://seller.wildberries.ru/suppliers-mutual-settlements/reports-implementations/reports-weekly"
            target="_blank"
            rel="noopener noreferrer"
            className="px-4 py-2 rounded-lg border border-border text-sm hover:bg-muted/30"
          >
            Открыть на WB →
          </a>
        </div>
      </div>

      {/* Summary card — WB format */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="px-6 py-4 border-b border-border flex items-center justify-between">
          <span className="font-semibold">
            Сводная информация за период {fmtDate(r.date_from)} — {fmtDate(r.date_to)}
          </span>
          <a
            href="https://seller.wildberries.ru/suppliers-mutual-settlements/reports-implementations/reports-weekly"
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-blue-400 hover:text-blue-300 transition-colors"
          >
            Как читать детализированный финансовый отчёт
          </a>
        </div>

        {/* 4-column × 5-row grid, exactly matching WB layout */}
        <div className="grid grid-cols-4">
          {Array.from({ length: 5 }, (_, rowIdx) =>
            columns.map((col, colIdx) => {
              const cell = col[rowIdx]
              const isLastRow = rowIdx === 4
              const isLastCol = colIdx === 3
              return (
                <div
                  key={`${rowIdx}-${colIdx}`}
                  className={[
                    'px-6 py-4',
                    !isLastRow ? 'border-b border-border/40' : '',
                    !isLastCol ? 'border-r border-border/40' : '',
                  ].join(' ')}
                >
                  <div className="text-xs text-muted-foreground leading-snug mb-1">{cell.label}</div>
                  <div className="text-sm font-medium">{cell.value}</div>
                </div>
              )
            })
          )}
        </div>
      </div>

      {/* Status badges */}
      <div className="flex items-center gap-3 flex-wrap">
        <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border ${
          r.has_detail_rows
            ? 'border-green-500/30 bg-green-500/10 text-green-400'
            : 'border-border bg-muted/20 text-muted-foreground'
        }`}>
          {r.has_detail_rows ? '✓ Детализация загружена' : '○ Только сводка'}
        </span>
        <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border ${
          r.reconciled
            ? 'border-green-500/30 bg-green-500/10 text-green-400'
            : 'border-border bg-muted/20 text-muted-foreground'
        }`}>
          {r.reconciled ? `✓ Сверен ${fmtDateShort(r.reconciled_at)}` : '○ Сверка не проводилась'}
        </span>
      </div>

      {/* Reconciliation results */}
      {r.reconciled && r.reconcile_result?.fields && (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="px-6 py-4 border-b border-border flex items-center justify-between">
            <span className="font-semibold">Результаты сверки</span>
            <span className={`text-sm font-medium ${r.reconcile_result.overallOk ? 'text-green-400' : 'text-red-400'}`}>
              {r.reconcile_result.overallOk ? '✓ Данные совпадают (допуск ≤ 0.5%)' : '⚠ Обнаружены расхождения'}
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-border text-xs text-muted-foreground">
                <tr>
                  <th className="text-left px-6 py-3">Поле</th>
                  <th className="text-right px-4 py-3">Сводный отчёт</th>
                  <th className="text-right px-4 py-3">Детализация (сумма)</th>
                  <th className="text-right px-4 py-3">Разница</th>
                  <th className="text-right px-4 py-3">% откл.</th>
                  <th className="text-center px-4 py-3">Статус</th>
                </tr>
              </thead>
              <tbody>
                {r.reconcile_result.fields.map((f, i) => (
                  <tr key={i} className="border-b border-border/30 hover:bg-muted/10">
                    <td className="px-6 py-3 text-muted-foreground">{f.name}</td>
                    <td className="px-4 py-3 text-right font-mono">{fmt(f.summary)}</td>
                    <td className="px-4 py-3 text-right font-mono">{fmt(f.detail)}</td>
                    <td className={`px-4 py-3 text-right font-mono ${Math.abs(f.diff) > 0.01 ? 'text-yellow-400' : 'text-muted-foreground'}`}>
                      {f.diff > 0 ? '+' : ''}{fmt(f.diff)}
                    </td>
                    <td className={`px-4 py-3 text-right font-mono ${f.ok ? 'text-muted-foreground' : 'text-red-400'}`}>
                      {f.diffPct > 0 ? '+' : ''}{f.diffPct.toFixed(2)}%
                    </td>
                    <td className="px-4 py-3 text-center">
                      {f.ok
                        ? <span className="text-green-400 text-xs">✓</span>
                        : <span className="text-red-400 text-xs">⚠</span>
                      }
                    </td>
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
