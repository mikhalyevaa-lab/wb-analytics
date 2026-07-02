'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { ReturnsKpiCards }  from '@/components/returns/kpi-cards'
import { ReturnsTable }     from '@/components/returns/returns-table'
import { BuyoutTrend }      from '@/components/returns/buyout-trend'
import { ReturnsRadar }     from '@/components/returns/returns-radar'
import { LkComparison }     from '@/components/returns/lk-comparison'
import { Card, CardContent } from '@/components/ui/card'
import { PageHeader }       from '@/components/ui/page-header'

// Дата в московском часовом поясе (UTC+3), опционально минус N дней
function moscowDate(offsetDays = 0) {
  const d = new Date(Date.now() + 3 * 60 * 60 * 1000)
  d.setUTCDate(d.getUTCDate() - offsetDays)
  return d.toISOString().split('T')[0]
}

interface Summary {
  days: number
  returns_nd: number
  sales_nd: number
  returns_sum: number
  return_rate: number | null
  above_avg_sku_count: number
  avg_return_rate: number
  is_preliminary: boolean
}

interface ProductItem {
  nm_id: number
  article: string
  title: string | null
  photo_url: string | null
  sales_nd: number
  returns_nd: number
  return_rate: number
  net_revenue: number
  returns_sum: number
}

const PRESETS = [
  { label: 'Сегодня', days: 0  },
  { label: '7 дн',    days: 7  },
  { label: '14 дн',   days: 14 },
  { label: '30 дн',   days: 30 },
  { label: '90 дн',   days: 90 },
]

export default function ReturnsPage() {
  const tableRef = useRef<HTMLDivElement>(null)

  const [dateFrom, setDateFrom]       = useState(moscowDate(30))
  const [dateTo, setDateTo]           = useState(moscowDate(0))
  const [activePreset, setActivePreset] = useState('30 дн')

  const [minSales, setMinSales]       = useState(3)

  const [summary, setSummary]         = useState<Summary | null>(null)
  const [items, setItems]             = useState<ProductItem[]>([])
  const [total, setTotal]             = useState(0)
  const [avgReturnRate, setAvgReturnRate] = useState(0)

  const [loading, setLoading]         = useState(true)
  const [loadingTable, setLoadingTable] = useState(false)

  const loadSummary = useCallback((from: string, to: string) => {
    setLoading(true)
    fetch(`/api/returns/summary?from=${from}&to=${to}`)
      .then(r => r.json())
      .then(data => { setSummary(data); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  const loadTable = useCallback((from: string, to: string, ms: number) => {
    setLoadingTable(true)
    fetch(`/api/returns/products?sort=returns&filter=above_avg&min_sales=${ms}&limit=50&from=${from}&to=${to}`)
      .then(r => r.json())
      .then(data => {
        setItems(data.items ?? [])
        setTotal(data.total ?? 0)
        setAvgReturnRate(data.avg_return_rate ?? 0)
      })
      .finally(() => setLoadingTable(false))
  }, [])

  useEffect(() => {
    loadSummary(dateFrom, dateTo)
    loadTable(dateFrom, dateTo, minSales)
  }, []) // eslint-disable-line

  function applyPreset(label: string, days: number) {
    const from = days === 0 ? moscowDate(0) : moscowDate(days)
    const to   = moscowDate(0)
    setDateFrom(from)
    setDateTo(to)
    setActivePreset(label)
    loadSummary(from, to)
    loadTable(from, to, minSales)
  }

  function applyDateRange() {
    setActivePreset('')
    loadSummary(dateFrom, dateTo)
    loadTable(dateFrom, dateTo, minSales)
  }

  function applyMinSales(ms: number) {
    setMinSales(ms)
    loadTable(dateFrom, dateTo, ms)
  }

  return (
    <div className="space-y-8 p-6 max-w-[1400px]">
      <PageHeader
        picto="returns"
        title="Возвраты"
        subtitle="Радар возврата · топ артикулы · тренд · данные из wb_sales"
      >
        {/* Пресеты */}
        {PRESETS.map(p => (
          <button
            key={p.label}
            onClick={() => applyPreset(p.label, p.days)}
            className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${
              activePreset === p.label
                ? 'bg-zinc-900 border-zinc-900 text-white dark:bg-zinc-100 dark:border-zinc-100 dark:text-zinc-900'
                : 'border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800'
            }`}
          >
            {p.label}
          </button>
        ))}

        {/* Произвольный диапазон */}
        <div className="flex items-center gap-1">
          <input
            type="date"
            value={dateFrom}
            onChange={e => { setDateFrom(e.target.value); setActivePreset('') }}
            className="px-2 py-1.5 text-sm border border-zinc-200 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <span className="text-zinc-400">—</span>
          <input
            type="date"
            value={dateTo}
            onChange={e => { setDateTo(e.target.value); setActivePreset('') }}
            className="px-2 py-1.5 text-sm border border-zinc-200 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          {!activePreset && (
            <button
              onClick={applyDateRange}
              className="px-3 py-1.5 text-sm bg-zinc-900 hover:bg-zinc-800 dark:bg-zinc-100 dark:hover:bg-zinc-200 dark:text-zinc-900 text-white rounded-lg transition-colors"
            >
              Применить
            </button>
          )}
        </div>
      </PageHeader>

      {/* KPI */}
      <ReturnsKpiCards
        data={summary}
        loading={loading}
        onClickAboveAvg={() => tableRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
      />

      {/* Радар + Тренд */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardContent className="p-5">
            <ReturnsRadar dateFrom={dateFrom} dateTo={dateTo} />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <BuyoutTrend dateFrom={dateFrom} dateTo={dateTo} />
          </CardContent>
        </Card>
      </div>

      {/* Таблица — SKU с возвратом выше среднего */}
      <div ref={tableRef}>
        <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
          <div>
            <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">
              Топ по возвратам
            </h2>
            <p className="text-xs text-zinc-400 mt-0.5">
              SKU с % возврата выше среднего по кабинету · {dateFrom} — {dateTo}
            </p>
          </div>
          <label className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400">
            Мин. операций
            <select
              value={minSales}
              onChange={e => applyMinSales(Number(e.target.value))}
              className="h-8 rounded border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-2 text-sm"
            >
              {[1, 3, 5, 10].map(v => (
                <option key={v} value={v}>{v}+</option>
              ))}
            </select>
          </label>
        </div>
        <ReturnsTable
          items={items}
          loading={loadingTable}
          total={total}
          avgReturnRate={avgReturnRate}
        />
      </div>

      {/* Сверка заявок ЛК WB (последние 14 дней) */}
      <LkComparison dateFrom={dateFrom} dateTo={dateTo} />

      {/* Методология */}
      <div className="text-xs text-zinc-400 border-t border-zinc-100 dark:border-zinc-800 pt-4 space-y-1">
        <p>
          <strong>Методология:</strong> Возврат = строка wb_sales с for_pay &lt; 0.
          Продажа = строка с for_pay &gt; 0.
        </p>
        <p>% возврата = Возвраты / (Продажи + Возвраты) × 100%. Данные оперативные.</p>
        <p>SKU выше среднего = артикулы с % возврата &gt; среднего по кабинету за выбранный период.</p>
      </div>
    </div>
  )
}
