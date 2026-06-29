'use client'

import { useEffect, useState } from 'react'
import type { DataQualityItem } from '@/app/api/data-quality/route'

function fmtAgo(h: number | null): string {
  if (h === null) return '—'
  if (h < 1) return 'только что'
  if (h < 24) return `${Math.round(h)} ч назад`
  return `${Math.round(h / 24)} д назад`
}

function StatusDot({ status }: { status: DataQualityItem['status'] }) {
  const cls: Record<DataQualityItem['status'], string> = {
    ok:      'bg-emerald-500',
    stale:   'bg-amber-400',
    error:   'bg-red-500',
    never:   'bg-zinc-300 dark:bg-zinc-600',
    syncing: 'bg-blue-400 animate-pulse',
  }
  return <span className={`inline-block w-2 h-2 rounded-full shrink-0 ${cls[status]}`} />
}

function StatusLabel({ status }: { status: DataQualityItem['status'] }) {
  const map: Record<DataQualityItem['status'], { text: string; cls: string }> = {
    ok:      { text: 'Актуально',       cls: 'text-emerald-600 dark:text-emerald-400' },
    stale:   { text: 'Устарело',        cls: 'text-amber-600 dark:text-amber-400' },
    error:   { text: 'Ошибка',          cls: 'text-red-500' },
    never:   { text: 'Нет данных',      cls: 'text-zinc-400' },
    syncing: { text: 'Синхронизация…',  cls: 'text-blue-500 dark:text-blue-400' },
  }
  const m = map[status]
  return <span className={`text-xs font-medium ${m.cls}`}>{m.text}</span>
}

export function DataQuality() {
  const [items, setItems] = useState<DataQualityItem[]>([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [syncResult, setSyncResult] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    try {
      const r = await fetch('/api/data-quality')
      const d = await r.json()
      setItems(d.items ?? [])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  async function runSync() {
    setSyncing(true)
    setSyncResult(null)
    try {
      const r = await fetch('/api/sync', {
        headers: { Authorization: `Bearer ${process.env.NEXT_PUBLIC_CRON_SECRET ?? ''}` },
      })
      const d = await r.json()
      setSyncResult(d.success ? 'Синхронизация запущена' : `Ошибка: ${d.error}`)
      setTimeout(() => { load(); setSyncResult(null) }, 3000)
    } catch {
      setSyncResult('Ошибка запуска')
    } finally {
      setSyncing(false)
    }
  }

  const counts = items.reduce((a, i) => { a[i.status] = (a[i.status] ?? 0) + 1; return a }, {} as Record<string, number>)

  return (
    <div className="space-y-3">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3 text-xs text-zinc-500">
          {counts.ok    ? <span className="flex items-center gap-1"><StatusDot status="ok"    /> {counts.ok} актуально</span> : null}
          {counts.stale ? <span className="flex items-center gap-1"><StatusDot status="stale" /> {counts.stale} устарело</span> : null}
          {counts.error ? <span className="flex items-center gap-1"><StatusDot status="error" /> {counts.error} ошибка</span> : null}
          {counts.never ? <span className="flex items-center gap-1"><StatusDot status="never" /> {counts.never} нет данных</span> : null}
        </div>
        <button
          onClick={runSync}
          disabled={syncing}
          className="px-3 py-1.5 text-xs font-medium bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-lg hover:opacity-90 disabled:opacity-50 transition"
        >
          {syncing ? 'Запускаем…' : 'Синхронизировать'}
        </button>
      </div>

      {syncResult && (
        <p className="text-xs text-zinc-500 bg-zinc-50 dark:bg-zinc-800/50 rounded-lg px-3 py-2">{syncResult}</p>
      )}

      {/* Grid */}
      {loading ? (
        <div className="text-xs text-zinc-400 py-4 text-center">Загружаем статус…</div>
      ) : (
        <div className="divide-y divide-zinc-100 dark:divide-zinc-800 rounded-xl border border-zinc-100 dark:border-zinc-800 overflow-hidden">
          {items.map(item => (
            <div key={item.method} className="flex items-center justify-between px-4 py-2.5 bg-white dark:bg-zinc-900 hover:bg-zinc-50 dark:hover:bg-zinc-800/40">
              <div className="flex items-center gap-2.5 min-w-0">
                <StatusDot status={item.status} />
                <span className="text-sm text-zinc-700 dark:text-zinc-200">{item.label}</span>
              </div>
              <div className="flex items-center gap-4 shrink-0">
                {item.lastRows != null && (
                  <span className="text-xs text-zinc-400 tabular-nums hidden sm:inline">
                    {item.lastRows.toLocaleString('ru')} строк
                  </span>
                )}
                <span className="text-xs text-zinc-400 tabular-nums w-24 text-right">
                  {fmtAgo(item.hoursAgo)}
                </span>
                <StatusLabel status={item.status} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
