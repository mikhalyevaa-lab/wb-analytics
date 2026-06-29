'use client'

import { useEffect, useState } from 'react'
import type { CrossCheckData } from '@/app/api/crosscheck/route'

function fmt(n: number, dec = 0) {
  return n.toLocaleString('ru', { minimumFractionDigits: dec, maximumFractionDigits: dec })
}

interface Props {
  dateFrom: string | null
  dateTo:   string | null
  reportStorageCost: number | null // из еженедельного отчёта WB
}

export function CrossCheckBlock({ dateFrom, dateTo, reportStorageCost }: Props) {
  const [data, setData]     = useState<CrossCheckData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!dateFrom || !dateTo) { setLoading(false); return }
    const from = dateFrom.split('T')[0]
    const to   = dateTo.split('T')[0]
    fetch(`/api/crosscheck?from=${from}&to=${to}`)
      .then(r => r.json())
      .then((d: CrossCheckData) => setData(d))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [dateFrom, dateTo])

  if (!dateFrom || !dateTo) return null

  const storageDeviation =
    data && reportStorageCost && reportStorageCost > 0
      ? Math.round((data.storageApiCost / reportStorageCost - 1) * 100)
      : null

  return (
    <div className="px-4 pb-4">
      <div className="rounded-xl border border-blue-100 dark:border-blue-900/50 bg-blue-50/50 dark:bg-blue-950/20 overflow-hidden">
        <div className="px-5 py-2.5 border-b border-blue-100 dark:border-blue-900/50">
          <span className="text-xs font-semibold text-blue-700 dark:text-blue-300 uppercase tracking-wide">
            Кросс-проверка с внутренними данными
          </span>
        </div>
        {loading ? (
          <div className="px-5 py-3 text-xs text-zinc-400">Загружаем…</div>
        ) : !data ? (
          <div className="px-5 py-3 text-xs text-zinc-400">Нет данных</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-0 divide-y md:divide-y-0 md:divide-x divide-blue-100 dark:divide-blue-900/50">
            {/* Хранение API vs отчёт */}
            <div className="px-5 py-3 space-y-0.5">
              <div className="text-xs text-zinc-500">Хранение по API paid_storage</div>
              <div className="text-sm font-semibold">{fmt(data.storageApiCost)} ₽</div>
              {storageDeviation !== null && (
                <div className={`text-xs ${Math.abs(storageDeviation) > 20
                    ? 'text-amber-600 dark:text-amber-400'
                    : 'text-zinc-400'}`}>
                  {storageDeviation > 0 ? '+' : ''}{storageDeviation}% к отчёту WB
                  {Math.abs(storageDeviation) > 20 && ' — расхождение >20%'}
                </div>
              )}
              {storageDeviation === null && reportStorageCost != null && (
                <div className="text-xs text-zinc-400">Нет данных paid_storage за период</div>
              )}
            </div>

            {/* Продажи wb_sales */}
            <div className="px-5 py-3 space-y-0.5">
              <div className="text-xs text-zinc-500">Выкупы по wb_sales за период</div>
              <div className="text-sm font-semibold">
                {fmt(data.salesCount)} шт · {fmt(data.salesRevenue)} ₽
              </div>
              <div className="text-xs text-zinc-400">
                is_realization = true, по дате операции
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
