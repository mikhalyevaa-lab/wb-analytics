'use client'

import { useState, useEffect, useCallback, Fragment } from 'react'

type WeekOption = { report_number: number; min_date: string; max_date: string; count: number }

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
  is_return: boolean
  tariff_coef: number | null
  // Детализация
  order_date: string | null
  sale_date: string | null
  supply_number: string | null
  supply_date: string | null
  tariff_type: 'Фиксированный' | 'Текущий' | 'Нет данных'
  office_name: string | null
  fix_start_date: string | null
  fix_end_date: string | null
  tariff_warehouse: string | null
  tariff_date: string | null
  delivery_base: number | null
  delivery_liter: number | null
  vol_used: number | null
  price_used: number | null
  tariff_base: number | null
  irp_part: number | null
  il_coef: number | null
  irp_rate: number | null
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

function fmtDate(s: string | null) {
  if (!s) return '—'
  const [y, m, d] = s.split('T')[0].split('-')
  return `${d}/${m}/${y.slice(2)}`
}

function n2(v: number | null) {
  if (v == null) return '—'
  return v.toFixed(2)
}

type SortKey = 'delta' | 'delta_pct' | 'actual_logistics' | 'calc_logistics'
type FilterKey = 'all' | 'over' | 'under' | 'no_data'

function DetailPanel({ d }: { d: CheckDetail }) {
  const noWarehouse = !d.has_tariff && d.warehouse === '—'

  return (
    <tr>
      <td colSpan={8} className="px-0 py-0">
        <div className="bg-zinc-50 dark:bg-zinc-800/40 border-t border-zinc-100 dark:border-zinc-800 px-4 py-3 space-y-3">

          {/* Метка типа строки */}
          {d.is_return && (
            <div className="flex items-center gap-2 rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/30 px-3 py-2 text-xs text-blue-700 dark:text-blue-400">
              <svg className="h-3.5 w-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6"/>
              </svg>
              Обратная логистика (возврат покупателя) — рассчитывается только по объёму, без ИЛ и ИРП
            </div>
          )}

          {/* Если склад не указан */}
          {noWarehouse && !d.is_return && (
            <div className="flex items-center gap-2 rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
              <svg className="h-3.5 w-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M12 3a9 9 0 100 18A9 9 0 0012 3z"/>
              </svg>
              Склад не указан — расчётная логистика принята равной фактической ({fmt(d.actual_logistics, 2)})
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">

            {/* Блок 1: Данные заказа */}
            <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg p-3 space-y-1.5">
              <p className="text-[10px] font-medium text-zinc-400 uppercase tracking-wide mb-2">Данные заказа</p>
              <Row label="Дата заказа" val={fmtDate(d.order_date)} />
              <Row label="Дата продажи" val={fmtDate(d.sale_date)} />
              <Row label="Номер поставки" val={d.supply_number ?? '—'} mono />
              <Row label="Дата поставки" val={fmtDate(d.supply_date)} />
              <Row label="Склад приёмки" val={d.office_name ?? '—'} />
              <Row label="Склад отгрузки" val={d.warehouse ?? '—'} />
            </div>

            {/* Блок 2: Объём и тариф */}
            <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg p-3 space-y-1.5">
              <p className="text-[10px] font-medium text-zinc-400 uppercase tracking-wide mb-2">Объём и тариф</p>
              <Row label="Объём в БД" val={d.vol_used != null ? `${d.vol_used.toFixed(3)} л` : '—'} />
              {d.is_return ? (
                <Row label="Тип расчёта" val="Обратная логистика" />
              ) : (
                <>
                  <Row label="Склад тарифа WB" val={d.tariff_warehouse ?? '—'} />
                  <Row label="Дата тарифа" val={fmtDate(d.tariff_date)} />
                  <Row label="Коэф. склада" val={d.tariff_coef != null ? `${d.tariff_coef}%` : '—'} />
                  <Row label="delivery_base" val={d.delivery_base != null ? `${n2(d.delivery_base)} ₽` : '—'} mono />
                  <Row label="delivery_liter" val={d.delivery_liter != null ? `${n2(d.delivery_liter)} ₽` : '—'} mono />
                </>
              )}
            </div>

            {/* Блок 3: Индексы и период */}
            <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg p-3 space-y-1.5">
              <p className="text-[10px] font-medium text-zinc-400 uppercase tracking-wide mb-2">Индексы и период</p>
              {d.is_return ? (
                <>
                  <Row label="ИЛ (локализация)" val="не применяется" />
                  <Row label="ИРП" val="не применяется" />
                  <Row label="Цена в расчёте" val="не применяется" />
                </>
              ) : (
                <>
                  <Row label="ИЛ (локализация)" val={d.il_coef != null ? d.il_coef.toFixed(2) : '—'} />
                  <Row label="ИРЦ" val={d.irp_rate != null ? `${(d.irp_rate * 100).toFixed(2)}%` : '—'} />
                  <Row label="Цена в расчёте" val={d.price_used != null ? fmt(d.price_used, 2) : '—'} />
                </>
              )}
              <Row
                label="Период фиксации"
                val={d.fix_start_date ? `${fmtDate(d.fix_start_date)} — ${fmtDate(d.fix_end_date)}` : '—'}
              />
              <Row
                label="Тип тарифа"
                val={d.tariff_type}
                badge={d.tariff_type === 'Фиксированный' ? 'ok' : d.tariff_type === 'Текущий' ? 'neutral' : 'warn'}
              />
            </div>
          </div>

          {/* Формула */}
          {d.has_tariff && d.has_volume && (
            <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg p-3">
              <p className="text-[10px] font-medium text-zinc-400 uppercase tracking-wide mb-2">Формула расчёта</p>
              {d.is_return ? (
                <>
                  <p className="font-mono text-[11px] text-zinc-400 mb-1">
                    Обратная логистика: базовый тариф по объёму (без ИЛ и ИРП)
                  </p>
                  <p className="font-mono text-[11px] text-zinc-400 mb-1">
                    до 1 л: фиксированная ставка · свыше 1 л: 46 ₽ + 14 ₽ × (объём − 1)
                  </p>
                  <p className="font-mono text-xs text-zinc-700 dark:text-zinc-300 mt-0.5">
                    объём {d.vol_used?.toFixed(3)} л → <span className="font-medium text-zinc-900 dark:text-zinc-100">{fmt(d.calc_logistics, 2)}</span>
                  </p>
                </>
              ) : (
                d.delivery_base != null && d.il_coef != null && d.irp_rate != null && (
                  <>
                    <p className="font-mono text-[11px] text-zinc-400 mb-1">
                      (delivery_base + delivery_liter × max(0, объём − 1)) × ИЛ + цена × ИРЦ
                    </p>
                    <p className="font-mono text-xs text-zinc-700 dark:text-zinc-300">
                      = ({n2(d.delivery_base)} + {n2(d.delivery_liter)} × max(0, {d.vol_used?.toFixed(3)} − 1)) × {d.il_coef.toFixed(2)} + {n2(d.price_used)} × {(d.irp_rate * 100).toFixed(2)}%
                    </p>
                    <p className="font-mono text-xs text-zinc-700 dark:text-zinc-300 mt-0.5">
                      = {n2(d.tariff_base)} × {d.il_coef.toFixed(2)} + {n2(d.irp_part)}
                      {' = '}
                      <span className="font-medium text-zinc-900 dark:text-zinc-100">{fmt(d.calc_logistics, 2)}</span>
                    </p>
                  </>
                )
              )}
              {d.delta != null && Math.abs(d.delta) > 1 && (
                <p className="text-[11px] text-zinc-400 mt-1.5">
                  Расхождение с фактической:&nbsp;
                  <span className={d.delta > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'}>
                    {d.delta > 0 ? '+' : ''}{fmt(d.delta, 2)} ({fmtPct(d.delta_pct)})
                  </span>
                </p>
              )}
            </div>
          )}
        </div>
      </td>
    </tr>
  )
}

function Row({ label, val, mono, badge }: { label: string; val: string; mono?: boolean; badge?: 'ok' | 'neutral' | 'warn' }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-[11px] text-zinc-400 shrink-0">{label}</span>
      {badge ? (
        <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
          badge === 'ok'
            ? 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400'
            : badge === 'warn'
            ? 'bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400'
            : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500'
        }`}>{val}</span>
      ) : (
        <span className={`text-[11px] text-zinc-700 dark:text-zinc-300 text-right truncate max-w-[160px] ${mono ? 'font-mono' : ''}`} title={val}>{val}</span>
      )}
    </div>
  )
}

function fmtDateShort(s: string) {
  const [y, m, d] = s.split('T')[0].split('-')
  return `${d}.${m}.${y.slice(2)}`
}

function exportToCsv(details: CheckDetail[], week: WeekOption | null) {
  const headers = [
    'Тип', 'Артикул', 'Баркод', 'Название', 'Склад отгрузки', 'Склад приёмки',
    'Объём л', 'Расчётная ₽', 'Фактическая ₽', 'Δ ₽', 'Δ %',
    'Дата заказа', 'Дата продажи', 'Номер поставки', 'Дата поставки', 'Тип тарифа',
    'Склад тарифа WB', 'Дата тарифа', 'Коэф склада %', 'delivery_base', 'delivery_liter',
    'ИЛ', 'ИРЦ %', 'Цена ₽', 'Период фиксации от', 'Период фиксации до',
    'Есть объём', 'Есть тариф',
  ]
  const rows = details.map(d => [
    d.is_return ? 'Возврат' : 'Доставка',
    d.supplier_article ?? '',
    d.barcode ?? '',
    d.title ?? '',
    d.warehouse ?? '',
    d.office_name ?? '',
    d.volume_liters?.toFixed(3) ?? '',
    d.calc_logistics?.toFixed(2) ?? '',
    d.actual_logistics.toFixed(2),
    d.delta?.toFixed(2) ?? '',
    d.delta_pct?.toFixed(1) ?? '',
    d.order_date?.split('T')[0] ?? '',
    d.sale_date?.split('T')[0] ?? '',
    d.supply_number ?? '',
    d.supply_date ?? '',
    d.tariff_type,
    d.tariff_warehouse ?? '',
    d.tariff_date ?? '',
    d.tariff_coef?.toString() ?? '',
    d.delivery_base?.toFixed(2) ?? '',
    d.delivery_liter?.toFixed(2) ?? '',
    d.il_coef?.toFixed(2) ?? '',
    d.irp_rate != null ? (d.irp_rate * 100).toFixed(2) : '',
    d.price_used?.toFixed(2) ?? '',
    d.fix_start_date?.split('T')[0] ?? '',
    d.fix_end_date?.split('T')[0] ?? '',
    d.has_volume ? 'да' : 'нет',
    d.has_tariff ? 'да' : 'нет',
  ])

  const csvContent = [headers, ...rows]
    .map(row => row.map(v => `"${String(v).replace(/"/g, '""')}"`).join(';'))
    .join('\n')

  const bom = '﻿'
  const blob = new Blob([bom + csvContent], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  const label = week ? `${fmtDateShort(week.min_date)}-${fmtDateShort(week.max_date)}` : 'все'
  a.href = url
  a.download = `logistics_check_${label}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

export function LogisticsCheck() {
  const [data, setData] = useState<CheckData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [weeks, setWeeks] = useState<WeekOption[]>([])
  const [selectedWeek, setSelectedWeek] = useState<number | null>(null)
  const [sortBy, setSortBy] = useState<SortKey>('delta')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [filter, setFilter] = useState<FilterKey>('all')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const PAGE_SIZE = 30

  const loadData = useCallback((week: number | null) => {
    setLoading(true)
    setError(null)
    const url = week
      ? `/api/logistics/check?limit=10000&week=${week}`
      : '/api/logistics/check?limit=10000'
    fetch(url)
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false) })
      .catch(e => { setError(String(e)); setLoading(false) })
  }, [])

  useEffect(() => {
    fetch('/api/logistics/weeks')
      .then(r => r.json())
      .then(d => setWeeks(d.weeks ?? []))
      .catch(() => {})
    loadData(null)
  }, [loadData])

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

  filtered = [...filtered].sort((a, b) => {
    const av = a[sortBy] ?? (sortDir === 'desc' ? -Infinity : Infinity)
    const bv = b[sortBy] ?? (sortDir === 'desc' ? -Infinity : Infinity)
    return sortDir === 'desc' ? (bv as number) - (av as number) : (av as number) - (bv as number)
  })

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE)
  const pageRows   = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  function rowKey(d: CheckDetail, i: number) { return `${d.nm_id}-${d.barcode}-${i}` }

  function toggleRow(key: string) {
    setExpanded(prev => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }

  function toggleSort(key: SortKey) {
    if (sortBy === key) setSortDir(d => d === 'desc' ? 'asc' : 'desc')
    else { setSortBy(key); setSortDir('desc') }
  }

  function SortIcon({ k }: { k: SortKey }) {
    if (sortBy !== k) return <span className="ml-1 text-zinc-300">↕</span>
    return <span className="ml-1">{sortDir === 'desc' ? '↓' : '↑'}</span>
  }

  const deltaSign = kpi.total_delta >= 0 ? '+' : ''
  const currentWeekObj = weeks.find(w => w.report_number === selectedWeek) ?? null

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">Проверка логистики</h2>
          <p className="text-xs text-zinc-400 mt-0.5">
            Расчётная логистика по оферте vs фактические удержания из еженедельных отчётов WB
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Выбор недели */}
          <select
            value={selectedWeek ?? ''}
            onChange={e => {
              const v = e.target.value ? parseInt(e.target.value) : null
              setSelectedWeek(v)
              setPage(1)
              setExpanded(new Set())
              loadData(v)
            }}
            className="text-xs border border-zinc-200 dark:border-zinc-700 rounded-lg px-2.5 py-1.5 bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 min-w-[220px]"
          >
            <option value="">Все недели</option>
            {weeks.map(w => (
              <option key={w.report_number} value={w.report_number}>
                {fmtDateShort(w.min_date)} — {fmtDateShort(w.max_date)} ({w.count} строк)
              </option>
            ))}
          </select>

          {/* Экспорт CSV */}
          <button
            onClick={() => exportToCsv(details, currentWeekObj)}
            className="inline-flex items-center gap-1.5 text-xs border border-zinc-200 dark:border-zinc-700 rounded-lg px-2.5 py-1.5 bg-white dark:bg-zinc-900 hover:bg-zinc-50 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 transition-colors"
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/>
            </svg>
            Скачать CSV
          </button>

          {indexes.week_date && (
            <div className="text-right">
              <p className="text-xs text-zinc-400">ИЛ {indexes.localization_index ?? '—'} · ИРП {indexes.irp ?? '—'}%</p>
              <p className="text-xs text-zinc-400">неделя от {indexes.week_date}</p>
            </div>
          )}
        </div>
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

      {/* Таблица */}
      <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 overflow-hidden">
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

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-100 dark:border-zinc-800">
                <th className="text-left px-4 py-3 text-xs font-medium text-zinc-500 uppercase tracking-wide w-6"></th>
                <th className="text-left px-4 py-3 text-xs font-medium text-zinc-500 uppercase tracking-wide">Артикул / Баркод</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-zinc-500 uppercase tracking-wide">Склад</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-zinc-500 uppercase tracking-wide">Объём, л</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-zinc-500 uppercase tracking-wide cursor-pointer select-none hover:text-zinc-900 dark:hover:text-zinc-100" onClick={() => toggleSort('calc_logistics')}>
                  Расчётная <SortIcon k="calc_logistics" />
                </th>
                <th className="text-right px-4 py-3 text-xs font-medium text-zinc-500 uppercase tracking-wide cursor-pointer select-none hover:text-zinc-900 dark:hover:text-zinc-100" onClick={() => toggleSort('actual_logistics')}>
                  Фактическая <SortIcon k="actual_logistics" />
                </th>
                <th className="text-right px-4 py-3 text-xs font-medium text-zinc-500 uppercase tracking-wide cursor-pointer select-none hover:text-zinc-900 dark:hover:text-zinc-100" onClick={() => toggleSort('delta')}>
                  Δ ₽ <SortIcon k="delta" />
                </th>
                <th className="text-right px-4 py-3 text-xs font-medium text-zinc-500 uppercase tracking-wide cursor-pointer select-none hover:text-zinc-900 dark:hover:text-zinc-100" onClick={() => toggleSort('delta_pct')}>
                  Δ % <SortIcon k="delta_pct" />
                </th>
              </tr>
            </thead>
            <tbody>
              {pageRows.map((d, i) => {
                const key = rowKey(d, i)
                const isOpen = expanded.has(key)
                return (
                  <Fragment key={key}>
                    <tr
                      onClick={() => toggleRow(key)}
                      className="border-b border-zinc-50 dark:border-zinc-800/50 hover:bg-zinc-50 dark:hover:bg-zinc-800/30 cursor-pointer"
                    >
                      <td className="pl-4 pr-1 py-3 text-zinc-300 dark:text-zinc-600 text-xs select-none">
                        {isOpen ? '▾' : '▸'}
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-medium text-zinc-900 dark:text-zinc-100 text-xs">{d.supplier_article}</p>
                        <p className="text-zinc-400 text-xs">{d.barcode ?? '—'}</p>
                        <p className="text-zinc-400 text-xs truncate max-w-[180px]" title={d.title ?? ''}>{d.title ?? '—'}</p>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          <p className="text-xs text-zinc-700 dark:text-zinc-300">{d.warehouse}</p>
                          {d.is_return && (
                            <span className="text-[9px] px-1 py-0.5 rounded bg-blue-100 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 font-medium shrink-0">↩ возврат</span>
                          )}
                        </div>
                        {!d.is_return && d.tariff_coef != null && (
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
                    {isOpen && <DetailPanel key={`${key}-detail`} d={d} />}
                  </Fragment>
                )
              })}
              {pageRows.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-sm text-zinc-400">
                    Нет данных по заданному фильтру
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

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

      <details className="text-xs text-zinc-400">
        <summary className="cursor-pointer select-none hover:text-zinc-600 dark:hover:text-zinc-300">
          Формула расчёта (оферта WB п. 13.1.10)
        </summary>
        <div className="mt-2 p-4 bg-zinc-50 dark:bg-zinc-800/50 rounded-lg space-y-1">
          <p className="font-mono text-zinc-700 dark:text-zinc-300">
            Логистика = (delivery_base + delivery_liter × max(0, объём − 1)) × ИЛ + цена × (ИРП / 100)
          </p>
          <p>• <b>delivery_base</b>, <b>delivery_liter</b> — тарифы WB (уже включают коэффициент склада)</p>
          <p>• <b>объём</b> — volume_liters из карточки товара (литры)</p>
          <p>• <b>ИЛ</b> (Индекс Локализации) = {indexes.localization_index ?? '—'}</p>
          <p>• <b>ИРП</b> (Индекс Распределения Продаж) = {indexes.irp ?? '—'}%</p>
          <p>• <b>цена</b> = retail_price_with_discount (без СПП)</p>
        </div>
      </details>
    </div>
  )
}
