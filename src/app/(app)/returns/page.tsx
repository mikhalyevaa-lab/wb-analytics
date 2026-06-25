'use client'

import { useEffect, useState, useCallback } from 'react'
import { ReturnsKpiCards } from '@/components/returns/kpi-cards'
import { ReturnsTable } from '@/components/returns/returns-table'

interface Summary {
  returns_28d: number
  sales_28d: number
  returns_sum: number
  buyout_rate: number | null
  low_buyout_sku_count: number
  is_preliminary: boolean
}

interface ProductItem {
  nm_id: number
  article: string
  title: string | null
  photo_url: string | null
  sales_28d: number
  returns_28d: number
  buyout_rate: number
  net_revenue: number
  returns_sum: number
}

export default function ReturnsPage() {
  const [summary, setSummary]       = useState<Summary | null>(null)
  const [items, setItems]           = useState<ProductItem[]>([])
  const [total, setTotal]           = useState(0)
  const [threshold, setThreshold]   = useState(40)
  const [minSales, setMinSales]     = useState(3)
  const [loading, setLoading]       = useState(true)
  const [loadingTable, setLoadingTable] = useState(false)

  // Загружаем KPI-сводку
  useEffect(() => {
    fetch('/api/returns/summary')
      .then(r => r.json())
      .then(d => { setSummary(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  // Загружаем таблицу
  const loadTable = useCallback((thr: number, ms: number) => {
    setLoadingTable(true)
    fetch(`/api/returns/products?threshold=${thr}&min_sales=${ms}&limit=50`)
      .then(r => r.json())
      .then(d => { setItems(d.items ?? []); setTotal(d.total ?? 0) })
      .finally(() => setLoadingTable(false))
  }, [])

  useEffect(() => { loadTable(threshold, minSales) }, [threshold, minSales, loadTable])

  return (
    <div className="space-y-8 p-6">
      {/* Заголовок */}
      <div>
        <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">Возвраты</h1>
        <p className="text-sm text-zinc-500 mt-1">
          Радар выкупа · где возвраты съедают выручку · последние 28 дней
        </p>
      </div>

      {/* KPI */}
      <ReturnsKpiCards data={summary} loading={loading} />

      {/* Таблица */}
      <div>
        <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
          <div>
            <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">
              Разобрать возвраты — худшие по выкупу
            </h2>
            <p className="text-xs text-zinc-400 mt-0.5">
              SKU с выкупом ниже порога · сортировка по % выкупа (худшие сверху)
            </p>
          </div>

          {/* Фильтры */}
          <div className="flex items-center gap-4 flex-wrap">
            <label className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400">
              Порог выкупа
              <select
                value={threshold}
                onChange={e => setThreshold(Number(e.target.value))}
                className="h-8 rounded border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-2 text-sm"
              >
                {[20, 30, 40, 50, 60].map(v => (
                  <option key={v} value={v}>&lt; {v}%</option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400">
              Мин. продаж
              <select
                value={minSales}
                onChange={e => setMinSales(Number(e.target.value))}
                className="h-8 rounded border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-2 text-sm"
              >
                {[1, 3, 5, 10].map(v => (
                  <option key={v} value={v}>{v}+</option>
                ))}
              </select>
            </label>
          </div>
        </div>

        <ReturnsTable items={items} loading={loadingTable} total={total} />
      </div>

      {/* Методология */}
      <div className="text-xs text-zinc-400 border-t border-zinc-100 dark:border-zinc-800 pt-4 space-y-1">
        <p><strong>Методология:</strong> Возврат = строка wb_sales с is_realization = true и for_pay &lt; 0.</p>
        <p>% выкупа = Выкупы / (Выкупы + Возвраты) × 100%. Данные оперативные — обновляются при синхронизации.</p>
      </div>
    </div>
  )
}
