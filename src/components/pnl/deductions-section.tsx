'use client'

import { useState, useEffect, useMemo } from 'react'

interface DeductionKpi {
  penalties: number
  storage: number
  acceptance: number
  other: number
  total: number
}

interface ByTypeRow {
  name: string
  amount: number
  count: number
  pct: number
}

interface ByWeekRow {
  week: string
  penalties: number
  storage: number
  acceptance: number
  other: number
  total: number
}

interface DetailRow {
  rrd_id: number
  date: string
  supplier_oper_name: string
  category: string
  nm_id: number | null
  sa_name: string
  amount: number
}

interface DeductionsData {
  kpi: DeductionKpi
  byType: ByTypeRow[]
  byWeek: ByWeekRow[]
  detail: DetailRow[]
}

function fmt(n: number) { return n.toLocaleString('ru', { maximumFractionDigits: 0 }) }
function fmtRub(n: number) { return fmt(Math.round(n)) + ' ₽' }

const CAT_LABELS: Record<string, string> = {
  penalties: 'Штрафы',
  storage: 'Хранение',
  acceptance: 'Приёмка',
  other: 'Прочие',
}

const CAT_COLORS: Record<string, string> = {
  penalties: 'text-red-600 dark:text-red-400',
  storage: 'text-amber-600 dark:text-amber-400',
  acceptance: 'text-blue-600 dark:text-blue-400',
  other: 'text-zinc-600 dark:text-zinc-400',
}

export function DeductionsSection({ dateFrom, dateTo }: { dateFrom: string; dateTo: string }) {
  const [data, setData] = useState<DeductionsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [filterCat, setFilterCat] = useState<string>('')

  useEffect(() => {
    setLoading(true)
    setError('')
    fetch(`/api/deductions?from=${dateFrom}&to=${dateTo}`)
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false) })
      .catch(e => { setError(e.message); setLoading(false) })
  }, [dateFrom, dateTo])

  const filteredDetail = useMemo(() => {
    if (!data) return []
    let rows = data.detail
    if (filterCat) rows = rows.filter(r => r.category === filterCat)
    if (search) {
      const q = search.toLowerCase()
      rows = rows.filter(r =>
        r.supplier_oper_name.toLowerCase().includes(q) ||
        r.sa_name.toLowerCase().includes(q) ||
        String(r.nm_id).includes(q)
      )
    }
    return rows
  }, [data, filterCat, search])

  function exportCsv() {
    if (!data) return
    const header = 'Дата;Тип;Категория;nmId;Артикул;Сумма'
    const body = filteredDetail.map(r =>
      `${r.date};${r.supplier_oper_name};${CAT_LABELS[r.category] ?? r.category};${r.nm_id ?? ''};${r.sa_name};${Math.round(r.amount)}`
    ).join('\n')
    const blob = new Blob(['﻿' + header + '\n' + body], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `deductions_${dateFrom}_${dateTo}.csv`
    a.click()
  }

  if (loading) return (
    <div className="flex items-center justify-center py-10 text-sm text-zinc-400">
      <div className="flex items-center gap-2">
        <div className="w-4 h-4 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
        Загружаем удержания…
      </div>
    </div>
  )

  if (error) return (
    <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-lg px-4 py-3 text-sm text-red-700 dark:text-red-400">{error}</div>
  )

  if (!data) return null

  const { kpi, byType, byWeek, detail } = data

  return (
    <div className="space-y-6">
      {/* Block 1: KPI cards */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {(['penalties', 'storage', 'acceptance', 'other'] as const).map(cat => (
          <div key={cat} className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-4">
            <p className="text-xs text-zinc-500 uppercase tracking-wide">{CAT_LABELS[cat]}</p>
            <p className={`text-xl font-bold mt-1 ${CAT_COLORS[cat]}`}>{fmtRub(kpi[cat])}</p>
            <p className="text-xs text-zinc-400 mt-0.5">
              {kpi.total > 0 ? ((kpi[cat] / kpi.total) * 100).toFixed(1) + '%' : '—'}
            </p>
          </div>
        ))}
        <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-4">
          <p className="text-xs text-zinc-500 uppercase tracking-wide">Итого</p>
          <p className="text-xl font-bold mt-1 text-zinc-900 dark:text-zinc-100">{fmtRub(kpi.total)}</p>
          <p className="text-xs text-zinc-400 mt-0.5">за период</p>
        </div>
      </div>

      {/* Block 2: By type */}
      {byType.length > 0 && (
        <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 overflow-hidden">
          <div className="px-5 py-3 border-b border-zinc-100 dark:border-zinc-800">
            <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">По типу</p>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 dark:bg-zinc-900/50">
              <tr>
                <th className="text-left px-4 py-2.5 text-xs text-zinc-500 font-medium">Тип</th>
                <th className="text-right px-4 py-2.5 text-xs text-zinc-500 font-medium">Сумма</th>
                <th className="text-right px-4 py-2.5 text-xs text-zinc-500 font-medium">%</th>
                <th className="text-right px-4 py-2.5 text-xs text-zinc-500 font-medium">Операций</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {byType.map(row => (
                <tr key={row.name} className="hover:bg-zinc-50 dark:hover:bg-zinc-900/50 transition-colors">
                  <td className="px-4 py-2.5 text-zinc-700 dark:text-zinc-300">{row.name}</td>
                  <td className="px-4 py-2.5 text-right font-medium text-zinc-900 dark:text-zinc-100">{fmtRub(row.amount)}</td>
                  <td className="px-4 py-2.5 text-right text-zinc-500">{row.pct.toFixed(1)}%</td>
                  <td className="px-4 py-2.5 text-right text-zinc-500">{row.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Block 3: By week */}
      {byWeek.length > 0 && (
        <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 overflow-hidden">
          <div className="px-5 py-3 border-b border-zinc-100 dark:border-zinc-800">
            <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">По неделям</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-zinc-50 dark:bg-zinc-900/50">
                <tr>
                  <th className="text-left px-4 py-2.5 text-xs text-zinc-500 font-medium">Неделя</th>
                  <th className="text-right px-4 py-2.5 text-xs text-zinc-500 font-medium">Штрафы</th>
                  <th className="text-right px-4 py-2.5 text-xs text-zinc-500 font-medium">Хранение</th>
                  <th className="text-right px-4 py-2.5 text-xs text-zinc-500 font-medium">Приёмка</th>
                  <th className="text-right px-4 py-2.5 text-xs text-zinc-500 font-medium">Прочие</th>
                  <th className="text-right px-4 py-2.5 text-xs text-zinc-500 font-medium">Итого</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {byWeek.map(row => (
                  <tr key={row.week} className="hover:bg-zinc-50 dark:hover:bg-zinc-900/50 transition-colors">
                    <td className="px-4 py-2.5 text-zinc-600 dark:text-zinc-400 font-mono text-xs">{row.week}</td>
                    <td className="px-4 py-2.5 text-right text-zinc-700 dark:text-zinc-300">{row.penalties > 0 ? fmtRub(row.penalties) : '—'}</td>
                    <td className="px-4 py-2.5 text-right text-zinc-700 dark:text-zinc-300">{row.storage > 0 ? fmtRub(row.storage) : '—'}</td>
                    <td className="px-4 py-2.5 text-right text-zinc-700 dark:text-zinc-300">{row.acceptance > 0 ? fmtRub(row.acceptance) : '—'}</td>
                    <td className="px-4 py-2.5 text-right text-zinc-700 dark:text-zinc-300">{row.other > 0 ? fmtRub(row.other) : '—'}</td>
                    <td className="px-4 py-2.5 text-right font-semibold text-zinc-900 dark:text-zinc-100">{fmtRub(row.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Block 4: Detail */}
      <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 overflow-hidden">
        <div className="px-5 py-3 border-b border-zinc-100 dark:border-zinc-800 flex items-center gap-3">
          <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Детализация</p>
          <span className="text-xs text-zinc-400">{filteredDetail.length} / {detail.length} строк</span>
          <div className="ml-auto flex items-center gap-2">
            <select
              value={filterCat}
              onChange={e => setFilterCat(e.target.value)}
              className="px-2 py-1 text-xs border border-zinc-200 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 focus:outline-none"
            >
              <option value="">Все типы</option>
              <option value="penalties">Штрафы</option>
              <option value="storage">Хранение</option>
              <option value="acceptance">Приёмка</option>
              <option value="other">Прочие</option>
            </select>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Поиск..."
              className="w-40 px-2 py-1 text-xs border border-zinc-200 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <button
              onClick={exportCsv}
              className="px-3 py-1 text-xs border border-zinc-200 dark:border-zinc-700 rounded-lg text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
            >
              ↓ CSV
            </button>
          </div>
        </div>
        <div className="overflow-x-auto max-h-80 overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 dark:bg-zinc-900/50 sticky top-0">
              <tr>
                <th className="text-left px-4 py-2.5 text-xs text-zinc-500 font-medium">Дата</th>
                <th className="text-left px-4 py-2.5 text-xs text-zinc-500 font-medium">Тип</th>
                <th className="text-left px-4 py-2.5 text-xs text-zinc-500 font-medium">nmId</th>
                <th className="text-left px-4 py-2.5 text-xs text-zinc-500 font-medium">Артикул</th>
                <th className="text-right px-4 py-2.5 text-xs text-zinc-500 font-medium">Сумма</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {filteredDetail.map((row, i) => (
                <tr key={`${row.rrd_id}-${i}`} className="hover:bg-zinc-50 dark:hover:bg-zinc-900/50 transition-colors">
                  <td className="px-4 py-2 text-xs text-zinc-500 whitespace-nowrap">{row.date?.slice(0, 10)}</td>
                  <td className="px-4 py-2 text-zinc-700 dark:text-zinc-300 text-xs">{row.supplier_oper_name}</td>
                  <td className="px-4 py-2 text-xs text-zinc-500">{row.nm_id ?? '—'}</td>
                  <td className="px-4 py-2 text-xs text-zinc-500 truncate max-w-[120px]">{row.sa_name || '—'}</td>
                  <td className="px-4 py-2 text-right font-medium text-zinc-900 dark:text-zinc-100">{fmtRub(row.amount)}</td>
                </tr>
              ))}
              {filteredDetail.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-sm text-zinc-400">Нет данных</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
