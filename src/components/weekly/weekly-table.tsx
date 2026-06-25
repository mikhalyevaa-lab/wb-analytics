'use client'

import React, { useState, useMemo } from 'react'

interface WeekRow {
  realizationreport_id: number
  date_from: string
  date_to: string
  revenue: number
  returns: number
  commission: number
  logistics: number
  storage: number       // хранение из отчёта wb_finance
  paid_storage: number  // платное хранение из API paid_storage
  advertising: number   // расходы на рекламу из wb_ad_spend
  penalties: number
  additional: number
  payout: number
  reconciled: number    // формула: выручка − логистика − комиссия − реклама − штрафы − прочие
  delta: number | null
}

function fmt(n: number) { return n.toLocaleString('ru', { maximumFractionDigits: 0 }) }
function fmtRub(n: number) { return fmt(Math.round(n)) + ' ₽' }

function DeltaBadge({ delta }: { delta: number | null }) {
  if (delta == null) return <span className="text-zinc-300 dark:text-zinc-600">—</span>
  const pos = delta >= 0
  return (
    <span className={`text-xs font-medium ${pos ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500'}`}>
      {pos ? '+' : ''}{fmtRub(delta)}
    </span>
  )
}

// Допустимая погрешность сверки (из-за округления WB)
const RECONCILE_TOLERANCE = 500

function ReconcileBadge({ payout, reconciled }: { payout: number; reconciled: number }) {
  if (reconciled === 0) return <span className="text-zinc-400 text-xs">—</span>
  const diff = Math.abs(payout - reconciled)
  const ok = diff <= RECONCILE_TOLERANCE
  return (
    <span className={`text-xs font-medium ${ok ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-500'}`}
      title={`Сверка: формула даёт ${fmtRub(reconciled)}, WB платит ${fmtRub(payout)}, разница ${fmtRub(diff)}`}>
      {ok ? '✓' : `Δ ${fmtRub(diff)}`}
    </span>
  )
}

const COLS = [
  { key: 'revenue',      label: 'Выручка' },
  { key: 'returns',      label: 'Возвраты' },
  { key: 'commission',   label: 'Комиссии' },
  { key: 'logistics',    label: 'Логистика' },
  { key: 'storage',      label: 'Хранение (отчёт)' },
  { key: 'paid_storage', label: 'Хранение (API)' },
  { key: 'advertising',  label: 'Реклама' },
  { key: 'penalties',    label: 'Штрафы' },
  { key: 'payout',       label: 'Выплата' },
  { key: 'reconciled',   label: 'Сверка' },
  { key: 'delta',        label: 'Δ нед.' },
]

export function WeeklyTable({ weeks, dateFrom, dateTo }: {
  weeks: WeekRow[]
  dateFrom: string
  dateTo: string
}) {
  const [visibleCols, setVisibleCols] = useState(
    new Set(['revenue', 'returns', 'logistics', 'paid_storage', 'advertising', 'penalties', 'payout', 'reconciled', 'delta'])
  )

  function toggleCol(key: string) {
    setVisibleCols(prev => {
      const n = new Set(prev)
      n.has(key) ? n.delete(key) : n.add(key)
      return n
    })
  }

  const totals = useMemo(() => weeks.reduce((acc, w) => ({
    revenue:      acc.revenue      + w.revenue,
    returns:      acc.returns      + w.returns,
    commission:   acc.commission   + w.commission,
    logistics:    acc.logistics    + w.logistics,
    storage:      acc.storage      + w.storage,
    paid_storage: acc.paid_storage + w.paid_storage,
    advertising:  acc.advertising  + w.advertising,
    penalties:    acc.penalties    + w.penalties,
    additional:   acc.additional   + w.additional,
    payout:       acc.payout       + w.payout,
    reconciled:   acc.reconciled   + w.reconciled,
  }), { revenue: 0, returns: 0, commission: 0, logistics: 0, storage: 0, paid_storage: 0, advertising: 0, penalties: 0, additional: 0, payout: 0, reconciled: 0 }), [weeks])

  function exportCsv() {
    const cols = COLS.filter(c => c.key !== 'delta' && c.key !== 'reconciled' && visibleCols.has(c.key))
    const header = ['Период', 'Отчёт №', ...cols.map(c => c.label), 'Δ к пред. нед.'].join(';')
    const body = weeks.map(w => [
      `${w.date_from?.slice(0, 10)} — ${w.date_to?.slice(0, 10)}`,
      w.realizationreport_id,
      ...cols.map(c => Math.round(w[c.key as keyof WeekRow] as number)),
      w.delta != null ? Math.round(w.delta) : '',
    ].join(';')).join('\n')
    const blob = new Blob(['﻿' + header + '\n' + body], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `weekly_${dateFrom}_${dateTo}.csv`
    a.click()
  }

  if (!weeks.length) return (
    <div className="py-12 text-center text-sm text-zinc-400">Нет данных за выбранный период</div>
  )

  function cell(w: WeekRow, key: string) {
    switch (key) {
      case 'revenue':
        return <td className="px-4 py-2.5 text-right text-zinc-700 dark:text-zinc-300">{fmtRub(w.revenue)}</td>
      case 'returns':
        return <td className="px-4 py-2.5 text-right text-red-500">{w.returns > 0 ? fmtRub(w.returns) : '—'}</td>
      case 'commission':
        return <td className="px-4 py-2.5 text-right text-zinc-700 dark:text-zinc-300">{w.commission > 0 ? fmtRub(w.commission) : '—'}</td>
      case 'logistics':
        return <td className="px-4 py-2.5 text-right text-zinc-700 dark:text-zinc-300">{w.logistics > 0 ? fmtRub(w.logistics) : '—'}</td>
      case 'storage':
        return <td className="px-4 py-2.5 text-right text-zinc-500">{w.storage > 0 ? fmtRub(w.storage) : '—'}</td>
      case 'paid_storage':
        return (
          <td className="px-4 py-2.5 text-right">
            {w.paid_storage > 0
              ? <span className="text-zinc-700 dark:text-zinc-300">{fmtRub(w.paid_storage)}</span>
              : <span className="text-zinc-400">—</span>}
          </td>
        )
      case 'advertising':
        return (
          <td className="px-4 py-2.5 text-right">
            {w.advertising > 0
              ? <span className="text-zinc-700 dark:text-zinc-300">{fmtRub(w.advertising)}</span>
              : <span className="text-zinc-400">—</span>}
          </td>
        )
      case 'penalties':
        return <td className="px-4 py-2.5 text-right text-zinc-700 dark:text-zinc-300">{w.penalties > 0 ? fmtRub(w.penalties) : '—'}</td>
      case 'payout':
        return (
          <td className={`px-4 py-2.5 text-right font-semibold ${w.payout >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500'}`}>
            {fmtRub(w.payout)}
          </td>
        )
      case 'reconciled':
        return <td className="px-4 py-2.5 text-right"><ReconcileBadge payout={w.payout} reconciled={w.reconciled} /></td>
      case 'delta':
        return <td className="px-4 py-2.5 text-right"><DeltaBadge delta={w.delta} /></td>
      default:
        return <td />
    }
  }

  function footerCell(key: string) {
    switch (key) {
      case 'revenue':    return <td className="px-4 py-2.5 text-right text-xs font-semibold text-zinc-700 dark:text-zinc-300">{fmtRub(totals.revenue)}</td>
      case 'returns':    return <td className="px-4 py-2.5 text-right text-xs font-semibold text-red-500">{totals.returns > 0 ? fmtRub(totals.returns) : '—'}</td>
      case 'commission': return <td className="px-4 py-2.5 text-right text-xs font-semibold text-zinc-700 dark:text-zinc-300">{totals.commission > 0 ? fmtRub(totals.commission) : '—'}</td>
      case 'logistics':  return <td className="px-4 py-2.5 text-right text-xs font-semibold text-zinc-700 dark:text-zinc-300">{totals.logistics > 0 ? fmtRub(totals.logistics) : '—'}</td>
      case 'storage':    return <td className="px-4 py-2.5 text-right text-xs font-semibold text-zinc-500">{totals.storage > 0 ? fmtRub(totals.storage) : '—'}</td>
      case 'paid_storage': return <td className="px-4 py-2.5 text-right text-xs font-semibold text-zinc-700 dark:text-zinc-300">{totals.paid_storage > 0 ? fmtRub(totals.paid_storage) : '—'}</td>
      case 'advertising':  return <td className="px-4 py-2.5 text-right text-xs font-semibold text-zinc-700 dark:text-zinc-300">{totals.advertising > 0 ? fmtRub(totals.advertising) : '—'}</td>
      case 'penalties':  return <td className="px-4 py-2.5 text-right text-xs font-semibold text-zinc-700 dark:text-zinc-300">{totals.penalties > 0 ? fmtRub(totals.penalties) : '—'}</td>
      case 'payout':     return <td className={`px-4 py-2.5 text-right text-xs font-semibold ${totals.payout >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500'}`}>{fmtRub(totals.payout)}</td>
      case 'reconciled': return <td className="px-4 py-2.5 text-right text-xs text-zinc-400"><ReconcileBadge payout={totals.payout} reconciled={totals.reconciled} /></td>
      case 'delta':      return <td />
      default:           return <td />
    }
  }

  return (
    <div className="space-y-4">
      {/* Легенда формулы */}
      <div className="flex items-center gap-2 flex-wrap text-xs text-zinc-500 bg-zinc-50 dark:bg-zinc-900 rounded-lg px-3 py-2 border border-zinc-200 dark:border-zinc-800">
        <span className="font-medium text-zinc-600 dark:text-zinc-400">Формула сверки:</span>
        <span>Выручка</span>
        <span className="text-zinc-400">−</span>
        <span>Логистика</span>
        <span className="text-zinc-400">−</span>
        <span>Комиссии</span>
        <span className="text-zinc-400">−</span>
        <span className="text-blue-500 dark:text-blue-400">Реклама</span>
        <span className="text-zinc-400">−</span>
        <span>Штрафы</span>
        <span className="text-zinc-400">−</span>
        <span>Прочие удержания</span>
        <span className="text-zinc-400">=</span>
        <span className="font-semibold text-emerald-600 dark:text-emerald-400">Итого к оплате</span>
        <span className="ml-2 text-zinc-400">· Колонка «Сверка» показывает ✓ если расхождение &lt; 500 ₽</span>
      </div>

      {/* Переключатели колонок + экспорт */}
      <div className="flex flex-wrap items-center gap-2">
        {COLS.map(c => (
          <button
            key={c.key}
            onClick={() => toggleCol(c.key)}
            className={`px-2 py-0.5 text-xs rounded border transition-colors ${
              visibleCols.has(c.key)
                ? 'bg-indigo-50 border-indigo-200 text-indigo-700 dark:bg-indigo-900/30 dark:border-indigo-700 dark:text-indigo-300'
                : 'bg-transparent border-zinc-200 dark:border-zinc-700 text-zinc-400'
            }`}
          >
            {c.label}
          </button>
        ))}
        <button
          onClick={exportCsv}
          className="ml-auto px-3 py-1 text-xs border border-zinc-200 dark:border-zinc-700 rounded-lg text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
        >
          ↓ CSV
        </button>
      </div>

      {/* Таблица */}
      <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-800">
        <table className="w-full text-sm">
          <thead className="bg-zinc-50 dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800">
            <tr>
              <th className="text-left px-4 py-2.5 text-xs font-medium text-zinc-500 whitespace-nowrap">Период</th>
              {COLS.filter(c => visibleCols.has(c.key)).map(c => (
                <th key={c.key} className={`text-right px-4 py-2.5 text-xs font-medium whitespace-nowrap ${
                  c.key === 'paid_storage' ? 'text-blue-500 dark:text-blue-400' :
                  c.key === 'advertising'  ? 'text-blue-500 dark:text-blue-400' :
                  c.key === 'reconciled'   ? 'text-emerald-600 dark:text-emerald-400' :
                  'text-zinc-500'
                }`}>
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {weeks.map(w => (
              <tr key={w.realizationreport_id} className="hover:bg-zinc-50 dark:hover:bg-zinc-900/50 transition-colors">
                <td className="px-4 py-2.5 whitespace-nowrap">
                  <p className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
                    {w.date_from?.slice(0, 10)} — {w.date_to?.slice(0, 10)}
                  </p>
                  <p className="text-xs text-zinc-400">#{w.realizationreport_id}</p>
                </td>
                {COLS.filter(c => visibleCols.has(c.key)).map(c =>
                  React.cloneElement(cell(w, c.key), { key: c.key })
                )}
              </tr>
            ))}
          </tbody>
          <tfoot className="bg-zinc-50 dark:bg-zinc-900 border-t border-zinc-200 dark:border-zinc-800">
            <tr>
              <td className="px-4 py-2.5 text-xs font-semibold text-zinc-500">Итого ({weeks.length} нед.)</td>
              {COLS.filter(c => visibleCols.has(c.key)).map(c =>
                React.cloneElement(footerCell(c.key), { key: c.key })
              )}
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}
