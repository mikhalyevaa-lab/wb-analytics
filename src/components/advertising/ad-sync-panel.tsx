'use client'

import { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { RefreshCw, AlertCircle, CheckCircle2 } from 'lucide-react'

type SyncStatus = {
  min_date: string | null
  max_date: string | null
  days: number
  campaigns: number
  total_spend: number
}

type SyncState = 'idle' | 'running' | 'done' | 'error'

function fmtDate(s: string | null) {
  if (!s) return '—'
  return new Date(s).toLocaleDateString('ru', { day: 'numeric', month: 'short', year: 'numeric' })
}

function fmtRub(n: number) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + ' млн ₽'
  if (n >= 1_000) return (n / 1_000).toFixed(0) + ' тыс ₽'
  return n.toLocaleString('ru') + ' ₽'
}

export function AdSyncPanel() {
  const [status, setStatus]     = useState<SyncStatus | null>(null)
  const [syncState, setSyncState] = useState<SyncState>('idle')
  const [syncMsg, setSyncMsg]   = useState<string>('')
  const [dateFrom, setDateFrom] = useState<string>(() => {
    const d = new Date()
    d.setDate(d.getDate() - 90)
    return d.toISOString().split('T')[0]
  })

  const loadStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/sync/advert-status')
      if (res.ok) setStatus(await res.json())
    } catch { /* ignore */ }
  }, [])

  useEffect(() => { loadStatus() }, [loadStatus])

  const handleSync = async () => {
    setSyncState('running')
    setSyncMsg('')
    try {
      const dateTo = new Date().toISOString().split('T')[0]
      const res = await fetch('/api/sync/advert-initial', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dateFrom, dateTo }),
      })
      const data = await res.json()
      if (!res.ok) {
        setSyncState('error')
        setSyncMsg(data.error ?? 'Ошибка синхронизации')
        return
      }
      // Считаем итоги из summary
      const summary = data.summary ?? {}
      const total = Object.values(summary as Record<string, { inserted: number; errors: number }>)
        .reduce((acc, r) => ({ inserted: acc.inserted + r.inserted, errors: acc.errors + r.errors }), { inserted: 0, errors: 0 })
      setSyncState('done')
      setSyncMsg(`Загружено: ${total.inserted.toLocaleString('ru')} записей${total.errors ? `, ошибок: ${total.errors}` : ''}`)
      await loadStatus()
    } catch (e) {
      setSyncState('error')
      setSyncMsg(e instanceof Error ? e.message : 'Неизвестная ошибка')
    }
  }

  const isRunning = syncState === 'running'

  return (
    <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">Синхронизация рекламы</h3>
        {status && (
          <span className="text-xs text-zinc-400">
            WB API хранит данные за последние 90 дней
          </span>
        )}
      </div>

      {/* Текущее состояние данных */}
      {status ? (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-zinc-50 dark:bg-zinc-800 rounded-lg px-3 py-2">
            <p className="text-xs text-zinc-500 mb-0.5">Данные с</p>
            <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200">{fmtDate(status.min_date)}</p>
          </div>
          <div className="bg-zinc-50 dark:bg-zinc-800 rounded-lg px-3 py-2">
            <p className="text-xs text-zinc-500 mb-0.5">Данные по</p>
            <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200">{fmtDate(status.max_date)}</p>
          </div>
          <div className="bg-zinc-50 dark:bg-zinc-800 rounded-lg px-3 py-2">
            <p className="text-xs text-zinc-500 mb-0.5">Кампаний</p>
            <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200">{status.campaigns}</p>
          </div>
          <div className="bg-zinc-50 dark:bg-zinc-800 rounded-lg px-3 py-2">
            <p className="text-xs text-zinc-500 mb-0.5">Всего расходов</p>
            <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200">{fmtRub(status.total_spend)}</p>
          </div>
        </div>
      ) : (
        <div className="h-14 bg-zinc-50 dark:bg-zinc-800 rounded-lg animate-pulse" />
      )}

      {/* Управление обновлением */}
      <div className="flex items-end gap-3 flex-wrap">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-zinc-500">Загрузить данные с</label>
          <input
            type="date"
            value={dateFrom}
            onChange={e => setDateFrom(e.target.value)}
            disabled={isRunning}
            className="h-9 rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 text-sm text-zinc-800 dark:text-zinc-200 focus:outline-none focus:ring-2 focus:ring-violet-500 disabled:opacity-50"
          />
        </div>
        <Button
          onClick={handleSync}
          disabled={isRunning}
          className="h-9 gap-2"
          variant={syncState === 'error' ? 'destructive' : 'default'}
        >
          <RefreshCw className={`h-4 w-4 ${isRunning ? 'animate-spin' : ''}`} />
          {isRunning ? 'Загружаю...' : 'Обновить рекламу'}
        </Button>
      </div>

      {/* Результат */}
      {syncMsg && (
        <div className={`flex items-center gap-2 text-sm rounded-lg px-3 py-2 ${
          syncState === 'error'
            ? 'bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-400'
            : 'bg-green-50 dark:bg-green-950 text-green-700 dark:text-green-400'
        }`}>
          {syncState === 'error'
            ? <AlertCircle className="h-4 w-4 flex-shrink-0" />
            : <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
          }
          {syncMsg}
        </div>
      )}

      {isRunning && (
        <p className="text-xs text-zinc-400">
          Загрузка может занять несколько минут — WB API запрашивает данные по каждой кампании с паузами.
        </p>
      )}
    </div>
  )
}
