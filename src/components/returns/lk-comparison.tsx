'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'

interface LkData {
  period: { from: string; to: string }
  lk_returns: { total: number; unique_skus: number }
  fin_returns: { total: number; unique_skus: number; sum: number }
  diff: number
  diff_pct: number | null
  by_status: { status: string; count: number }[]
  by_category: {
    lk:  { category: string; count: number }[]
    fin: { category: string; count: number }[]
  }
}

// Человекочитаемые названия статусов WB
const STATUS_LABELS: Record<string, string> = {
  waiting_for_client:    'Ожидание клиента',
  received_from_client:  'Получен от клиента',
  sorted_for_client:     'Сортировка',
  on_the_way_to_client:  'В пути к клиенту',
  on_the_way_from_client:'В пути от клиента',
  delivered_to_wb:       'Доставлен на WB',
  unknown:               'Неизвестен',
}

function statusLabel(s: string) {
  return STATUS_LABELS[s] ?? s
}

function diffColor(diff: number) {
  if (diff === 0) return 'text-zinc-500'
  if (diff > 0)  return 'text-amber-500'
  return 'text-emerald-500'
}

interface Props {
  dateFrom: string
  dateTo:   string
}

export function LkComparison({ dateFrom, dateTo }: Props) {
  const [data, setData]       = useState<LkData | null>(null)
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [syncMsg, setSyncMsg] = useState('')

  useEffect(() => {
    setLoading(true)
    fetch(`/api/returns/lk?from=${dateFrom}&to=${dateTo}`)
      .then(r => r.json())
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [dateFrom, dateTo])

  async function runSync() {
    setSyncing(true)
    setSyncMsg('')
    try {
      const res = await fetch('/api/sync/lk-returns', { method: 'POST' })
      const json = await res.json()
      console.log('[lk-sync] result:', json)

      // Ошибка верхнего уровня (нет магазинов, не авторизован и т.д.)
      if (json.error) {
        setSyncMsg(`Ошибка: ${json.error}`)
        setSyncing(false)
        return
      }

      // Собираем счётчики и ошибки по каждому магазину
      const entries = Object.entries(json.results ?? {})
      let totalCount = 0
      const errors: string[] = []
      for (const [name, r] of entries) {
        const result = r as { count?: number; error?: string; dateFrom?: string }
        totalCount += result?.count ?? 0
        if (result?.error) errors.push(`${name}: ${result.error}`)
      }

      if (errors.length) {
        setSyncMsg(`Ошибка: ${errors.join('; ')}`)
      } else {
        setSyncMsg(`Синхронизировано: ${totalCount} записей`)
      }

      // Перезагрузить данные
      const updated = await fetch(`/api/returns/lk?from=${dateFrom}&to=${dateTo}`).then(r => r.json())
      setData(updated)
    } catch (err) {
      setSyncMsg(`Ошибка: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setSyncing(false)
    }
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="p-5">
          <div className="space-y-3">
            <div className="h-4 w-48 bg-zinc-100 dark:bg-zinc-800 rounded animate-pulse" />
            <div className="h-24 bg-zinc-100 dark:bg-zinc-800 rounded animate-pulse" />
          </div>
        </CardContent>
      </Card>
    )
  }

  const lkTotal  = data?.lk_returns.total  ?? 0
  const finTotal = data?.fin_returns.total ?? 0
  const diff     = data?.diff ?? 0
  const diffPct  = data?.diff_pct

  return (
    <Card>
      <CardContent className="p-5 space-y-5">
        {/* Заголовок */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">
              Сверка заявок ЛК WB
            </h2>
            <p className="text-xs text-zinc-400 mt-0.5">
              Заявки покупателей (returns-api) vs финансовые возвраты wb_sales · последние 14 дней
            </p>
          </div>
          <div className="flex items-center gap-3">
            {syncMsg && <span className="text-xs text-zinc-500">{syncMsg}</span>}
            <button
              onClick={runSync}
              disabled={syncing}
              className="px-3 py-1.5 text-xs bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-lg transition-colors"
            >
              {syncing ? 'Синхронизация…' : 'Обновить данные ЛК'}
            </button>
          </div>
        </div>

        {/* Основные числа */}
        <div className="grid grid-cols-3 gap-4">
          <div className="text-center p-4 bg-zinc-50 dark:bg-zinc-800/50 rounded-xl">
            <p className="text-xs text-zinc-400 mb-1">Заявки ЛК WB</p>
            <p className="text-3xl font-bold text-zinc-900 dark:text-zinc-100">
              {lkTotal.toLocaleString('ru')}
            </p>
            <p className="text-xs text-zinc-400 mt-1">{data?.lk_returns.unique_skus ?? 0} SKU</p>
          </div>
          <div className="text-center p-4 bg-zinc-50 dark:bg-zinc-800/50 rounded-xl">
            <p className="text-xs text-zinc-400 mb-1">Финансовые возвраты</p>
            <p className="text-3xl font-bold text-zinc-900 dark:text-zinc-100">
              {finTotal.toLocaleString('ru')}
            </p>
            <p className="text-xs text-zinc-400 mt-1">{data?.fin_returns.unique_skus ?? 0} SKU</p>
          </div>
          <div className="text-center p-4 bg-zinc-50 dark:bg-zinc-800/50 rounded-xl">
            <p className="text-xs text-zinc-400 mb-1">Расхождение</p>
            <p className={`text-3xl font-bold ${diffColor(diff)}`}>
              {diff > 0 ? '+' : ''}{diff.toLocaleString('ru')}
            </p>
            {diffPct != null && (
              <p className={`text-xs mt-1 ${diffColor(diff)}`}>
                {diffPct > 0 ? '+' : ''}{diffPct}%
              </p>
            )}
          </div>
        </div>

        {lkTotal === 0 && (
          <p className="text-sm text-zinc-400 text-center py-2">
            Нет данных ЛК за период. Нажмите «Обновить данные ЛК» для первичной загрузки.
          </p>
        )}

        {/* Статусы заявок */}
        {(data?.by_status?.length ?? 0) > 0 && (
          <div>
            <h3 className="text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wide mb-2">
              По статусам заявок ЛК
            </h3>
            <div className="space-y-1.5">
              {data!.by_status.map(s => (
                <div key={s.status} className="flex items-center justify-between text-sm">
                  <span className="text-zinc-600 dark:text-zinc-400">{statusLabel(s.status)}</span>
                  <div className="flex items-center gap-3">
                    <div className="w-32 bg-zinc-100 dark:bg-zinc-800 rounded-full h-1.5">
                      <div
                        className="h-1.5 bg-indigo-500 rounded-full"
                        style={{ width: `${Math.round(s.count / lkTotal * 100)}%` }}
                      />
                    </div>
                    <span className="text-zinc-700 dark:text-zinc-300 font-medium w-10 text-right">
                      {s.count}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Топ категорий */}
        {(data?.by_category.lk?.length ?? 0) > 0 && (
          <div className="grid grid-cols-2 gap-6">
            <div>
              <h3 className="text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wide mb-2">
                Топ категорий ЛК
              </h3>
              <div className="space-y-1">
                {data!.by_category.lk.slice(0, 5).map(c => (
                  <div key={c.category} className="flex justify-between text-xs">
                    <span className="text-zinc-600 dark:text-zinc-400 truncate max-w-[160px]">{c.category}</span>
                    <span className="text-zinc-700 dark:text-zinc-300 font-medium">{c.count}</span>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <h3 className="text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wide mb-2">
                Топ категорий финансовые
              </h3>
              <div className="space-y-1">
                {data!.by_category.fin.slice(0, 5).map(c => (
                  <div key={c.category} className="flex justify-between text-xs">
                    <span className="text-zinc-600 dark:text-zinc-400 truncate max-w-[160px]">{c.category}</span>
                    <span className="text-zinc-700 dark:text-zinc-300 font-medium">{c.count}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
