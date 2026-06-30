'use client'

import { useState, useEffect } from 'react'

type CheckDetail = {
  nm_id: number | null
  barcode: string | null
  supplier_article: string | null
  title: string | null
  warehouse: string | null
  volume_liters: number | null
  retail_price: number | null
  calc_logistics: number | null
  actual_logistics: number
  delta: number | null
  delta_pct: number | null
  has_tariff: boolean
  has_volume: boolean
  tariff_coef: number | null
}

type CheckData = {
  kpi: {
    rows_total: number
    rows_with_calc: number
    total_calc: number
    total_actual: number
    total_delta: number
    delta_pct: string | null
    no_volume: number
    no_tariff: number
  }
  indexes: {
    week_date: string | null
    irp: number | null
    localization_index: number | null
  }
  details: CheckDetail[]
}

function fmt(n: number | null, decimals = 0) {
  if (n == null) return '—'
  return n.toLocaleString('ru', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }) + ' ₽'
}

function fmtPct(n: number | null) {
  if (n == null) return '—'
  return (n >= 0 ? '+' : '') + n.toFixed(1) + '%'
}

type SortKey = 'delta' | 'delta_pct' | 'actual_logistics' | 'calc_logistics'
type FilterKey = 'all' | 'over' | 'under' | 'no_data'

export function LogisticsCheck() {
  const [data, setData] = useState<CheckData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [sortBy, setSortBy] = useState<SortKey>('delta')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [filter, setFilter] = useState<FilterKey>('all')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const PAGE_SIZE = 30

  useEffect(() => {
    fetch('/api/logistics/check?limit=2000')
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false) })
      .catch(e => { setError(String(e)); setLoading(false) })
  }, [])

  if (loading) {
    return (
      <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-6">
        <p className="text-sm text-zinc-400 animate-pulse">Загружаем данные проверки логистики…</p>
      </div>
    )
  }
  if (error || !data) {
    return (
      <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-6">
        <p className="text-sm text-red-500">Ошибка загрузки: {error}</p>
      </div>
    )
  }

  const { kpi, indexes, details } = data

  // Фильтрация
  let filtered = details.filter(d => {
    if (search) {
      const q = search.toLowerCase()
      if (
        !d.supplier_article?.toLowerCase().includes(q) &&
        !d.barcode?.includes(q) &&
        !d.title?.toLowerCase().includes(q)
      ) return false
    }
    if (filter === 'over')    return d.delta != null && d.delta > 0
    if (filter === 'under')   return d.delta != null && d.delta < 0
    if (filter === 'no_data') return !d.has_volume || !d.has_tariff
    return true
  })

  // Сортировка
  filtered = [...filtered].sort((a, b) => {
    const av = a[sortBy] ?? (sortDir === 'desc' ? -Infinity : Infinity)
    const bv = b[sortBy] ?? (sortDir === 'desc' ? -Infinity : Infinity)
    return sortDir === 'desc' ? (bv as number) - (av as number) : (av as number) - (bv as number)
  })

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE)
  const pageRows   = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  function toggleSort(key: SortKey) {
    if (sortBy === key) setSortDir(d => d === 'desc' ? 'asc' : 'desc')
    else { setSortBy(key); setSortDir('desc') }
  }

  function SortIcon({ k }: { k: SortKey }) {
    if (sortBy !== k) return <span className="ml-1 text-zinc-300">↕</span>
    return <span className="ml-1">{sortDir === 'desc' ? '↓' : '↑'}</span>
  }

  const deltaSign = kpi.total_delta >= 0 ? '+' : ''

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">Проверка логистики</h2>
          <p className="text-xs text-zinc-400 mt-0.5">
            Расчётная логистика по оферте vs фактические удержания из еженедельных отчётов WB
          </p>
        </div>
        {indexes.week_date && (
          <div className="text-right">
            <p className="text-xs text-zinc-400">Индексы WB</p>
            <p className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
              ИЛ {indexes.localization_index ?? '—'}% · ИРП {indexes.irp ?? '—'}%
            </p>
            <p className="text-xs text-zinc-400">неделя от {indexes.week_date}</p>
          </div>
        )}
      </div>

      {/* KPI карточки */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-4">
          <p className="text-xs text-zinc-500 uppercase tracking-wide">Расчётная (∑)</p>
          <p className="text-xl font-bold text-zinc-900 dark:text-zinc-100 mt-2">{fmt(kpi.total_calc)}</p>
          <p className="text-xs text-zinc-400 mt-1">{kpi.rows_with_calc} строк с расчётом</p>
        </div>
        <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-4">
          <p className="text-xs text-zinc-500 uppercase tracking-wide">Фактическая (∑)</p>
          <p className="text-xl font-bold text-zinc-900 dark:text-zinc-100 mt-2">{fmt(kpi.total_actual)}</p>
          <p className="text-xs text-zinc-400 mt-1">из отчётов WB</p>
        </div>
        <div className={`rounded-xl border p-4 ${
          kpi.total_delta > 0
            ? 'bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800'
            : kpi.total_delta < 0
              ? 'bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800'
              : 'bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800'
        }`}>
          <p className="text-xs text-zinc-500 uppercase tracking-wide">Расхождение (∑)</p>
          <p className={`text-xl font-bold mt-2 ${
            kpi.total_delta > 0 ? 'text-amber-600 dark:text-amber-400'
            : kpi.total_delta < 0 ? 'text-emerald-600 dark:text-emerald-400'
            : 'text-zinc-900 dark:text-zinc-100'
          }`}>
            {deltaSign}{fmt(kpi.total_delta)}
          </p>
          <p className="text-xs text-zinc-400 mt-1">
            {kpi.delta_pct ? `${deltaSign}${kpi.delta_pct}% от факта` : '—'}
          </p>
        </div>
        <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-4">
          <p className="text-xs text-zinc-500 uppercase tracking-wide">Покрытие</p>
          <p className="text-xl font-bold text-zinc-900 dark:text-zinc-100 mt-2">
            {kpi.rows_total > 0 ? Math.round(kpi.rows_with_calc / kpi.rows_total * 100) : 0}%
          </p>
          <p className="text-xs text-zinc-400 mt-1">
            {kpi.no_volume > 0 && <span>нет объёма: {kpi.no_volume} · </span>}
            {kpi.no_tariff > 0 && <span>нет тарифа: {kpi.no_tariff}</span>}
            {kpi.no_volume === 0 && kpi.no_tariff === 0 && 'все строки рассчитаны'}
          </p>
        </div>
      </div>

      {/* Таблица деталей */}
      <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 overflow-hidden">
        {/* Панель фильтров */}
        <div className="flex flex-wrap items-center gap-3 p-4 border-b border-zinc-100 dark:border-zinc-800">
          <input
            type="search"
            placeholder="Поиск по артикулу / баркоду / названию…"
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1) }}
            className="flex-1 min-w-[200px] text-sm border border-zinc-200 dark:border-zinc-700 rounded-lg px-3 py-1.5 bg-transparent"
          />
          <div className="flex gap-1">
            {(['all', 'over', 'under', 'no_data'] as FilterKey[]).map(f => (
              <button
                key={f}
                onClick={() => { setFilter(f); setPage(1) }}
                className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                  filter === f
                    ? 'bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900'
                    : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700'
                }`}
              >
                {{ all: 'Все', over: 'Переплата', under: 'Недоплата', no_data: 'Нет данных' }[f]}
              </button>
            ))}
          </div>
          <span className="text-xs text-zinc-400">{filtered.length} строк</span>
        </div>

        {/* Таблица */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-100 dark:border-zinc-800">
                <th className="text-left px-4 py-3 text-xs font-medium text-zinc-500 uppercase tracking-wide">Артикул / Баркод</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-zinc-500 uppercase tracking-wide">Склад</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-zinc-500 uppercase tracking-wide">Объём, л</th>
                <th
                  className="text-right px-4 py-3 text-xs font-medium text-zinc-500 uppercase tracking-wide cursor-pointer select-none hover:text-zinc-900 dark:hover:text-zinc-100"
                  onClick={() => toggleSort('calc_logistics')}
                >
                  Расчётная <SortIcon k="calc_logistics" />
                </th>
                <th
                  className="text-right px-4 py-3 text-xs font-medium text-zinc-500 uppercase tracking-wide cursor-pointer select-none hover:text-zinc-900 dark:hover:text-zinc-100"
                  onClick={() => toggleSort('actual_logistics')}
                >
                  Фактическая <SortIcon k="actual_logistics" />
                </th>
                <th
                  className="text-right px-4 py-3 text-xs font-medium text-zinc-500 uppercase tracking-wide cursor-pointer select-none hover:text-zinc-900 dark:hover:text-zinc-100"
                  onClick={() => toggleSort('delta')}
                >
                  Δ ₽ <SortIcon k="delta" />
                </th>
                <th
                  className="text-right px-4 py-3 text-xs font-medium text-zinc-500 uppercase tracking-wide cursor-pointer select-none hover:text-zinc-900 dark:hover:text-zinc-100"
                  onClick={() => toggleSort('delta_pct')}
                >
                  Δ % <SortIcon k="delta_pct" />
                </th>
              </tr>
            </thead>
            <tbody>
              {pageRows.map((d, i) => (
                <tr
                  key={`${d.nm_id}-${d.barcode}-${i}`}
                  className="border-b border-zinc-50 dark:border-zinc-800/50 hover:bg-zinc-50 dark:hover:bg-zinc-800/30"
                >
                  <td className="px-4 py-3">
                    <p className="font-medium text-zinc-900 dark:text-zinc-100 text-xs">{d.supplier_article}</p>
                    <p className="text-zinc-400 text-xs">{d.barcode ?? '—'}</p>
                    <p className="text-zinc-400 text-xs truncate max-w-[180px]" title={d.title ?? ''}>{d.title ?? '—'}</p>
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-xs text-zinc-700 dark:text-zinc-300">{d.warehouse}</p>
                    {d.tariff_coef != null && (
                      <p className="text-xs text-zinc-400">коэф.склада {d.tariff_coef}%</p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right text-xs text-zinc-700 dark:text-zinc-300">
                    {d.volume_liters != null ? d.volume_liters.toFixed(3) : <span className="text-zinc-300">—</span>}
                  </td>
                  <td className="px-4 py-3 text-right text-xs font-mono">
                    {d.calc_logistics != null
                      ? <span className="text-zinc-900 dark:text-zinc-100">{fmt(d.calc_logistics, 2)}</span>
                      : <span className="text-zinc-300 text-xs">{!d.has_volume ? 'нет объёма' : 'нет тарифа'}</span>
                    }
                  </td>
                  <td className="px-4 py-3 text-right text-xs font-mono text-zinc-900 dark:text-zinc-100">
                    {fmt(d.actual_logistics, 2)}
                  </td>
                  <td className="px-4 py-3 text-right text-xs font-mono">
                    {d.delta != null
                      ? <span className={d.delta > 0 ? 'text-amber-600 dark:text-amber-400' : d.delta < 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-zinc-500'}>
                          {d.delta >= 0 ? '+' : ''}{fmt(d.delta, 2)}
                        </span>
                      : <span className="text-zinc-300">—</span>
                    }
                  </td>
                  <td className="px-4 py-3 text-right text-xs font-mono">
                    {d.delta_pct != null
                      ? <span className={d.delta_pct > 0 ? 'text-amber-600 dark:text-amber-400' : d.delta_pct < 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-zinc-500'}>
                          {fmtPct(d.delta_pct)}
                        </span>
                      : <span className="text-zinc-300">—</span>
                    }
                  </td>
                </tr>
              ))}
              {pageRows.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-sm text-zinc-400">
                    Нет данных по заданному фильтру
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Пагинация */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-zinc-100 dark:border-zinc-800">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="text-xs px-3 py-1.5 rounded-lg bg-zinc-100 dark:bg-zinc-800 disabled:opacity-40 hover:bg-zinc-200 dark:hover:bg-zinc-700"
            >
              ← Назад
            </button>
            <span className="text-xs text-zinc-500">Страница {page} из {totalPages}</span>
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="text-xs px-3 py-1.5 rounded-lg bg-zinc-100 dark:bg-zinc-800 disabled:opacity-40 hover:bg-zinc-200 dark:hover:bg-zinc-700"
            >
              Вперёд →
            </button>
          </div>
        )}
      </div>

      {/* Формула */}
      <details className="text-xs text-zinc-400">
        <summary className="cursor-pointer select-none hover:text-zinc-600 dark:hover:text-zinc-300">
          Формула расчёта (оферта WB п. 13.1.10)
        </summary>
        <div className="mt-2 p-4 bg-zinc-50 dark:bg-zinc-800/50 rounded-lg space-y-1">
          <p className="font-mono text-zinc-700 dark:text-zinc-300">
            Логистика = (delivery_base + delivery_liter × max(0, объём − 1)) × ИЛ + цена × (ИРП / 100)
          </p>
          <p>• <b>delivery_base</b>, <b>delivery_liter</b> — тарифы WB (уже включают коэффициент склада)</p>
          <p>• <b>объём</b> — volume_liters из карточки товара</p>
          <p>• <b>ИЛ</b> (Индекс Локализации) = {indexes.localization_index ?? '—'} (коэффициент, не %)</p>
          <p>• <b>ИРП</b> (Индекс Распределения Продаж) = {indexes.irp ?? '—'}%</p>
          <p>• <b>цена</b> = retail_price_with_discount (без СПП — п.5.1 оферты)</p>
          <p className="text-zinc-400 mt-2">
            Фактическая логистика — из поля delivery_service_cost еженедельных отчётов WB.
            Если строки показывают «нет объёма» — заполните volume_liters в карточках товаров на WB.
          </p>
        </div>
      </details>
    </div>
  )
}
