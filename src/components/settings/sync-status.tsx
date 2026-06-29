'use client'

import { useEffect, useState, useCallback } from 'react'
import type { DataQualityItem } from '@/app/api/data-quality/route'

function fmtAgo(h: number | null): string {
  if (h === null) return '—'
  if (h < 1) return 'только что'
  if (h < 24) return `${Math.round(h)} ч назад`
  return `${Math.round(h / 24)} д назад`
}

function isoDate(d: Date) {
  return d.toISOString().split('T')[0]
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

// Маппинг метода → endpoint для ручного запуска
const SYNC_ENDPOINTS: Record<string, { url: string; body?: object; label: string }> = {
  orders:      { url: '/api/sync/initial',      body: { methods: ['orders'] },   label: 'Заказы' },
  sales:       { url: '/api/sync/initial',      body: { methods: ['sales'] },    label: 'Продажи' },
  finance:     { url: '/api/sync/initial',      body: { methods: ['finance'] },  label: 'Финансы WB' },
  stocks:      { url: '/api/sync/initial',      body: { methods: ['stocks'] },   label: 'Остатки' },
  storage:     { url: '/api/sync/initial',      body: { methods: ['storage'] },  label: 'Хранение' },
  products:    { url: '/api/sync/initial',      body: { methods: ['products'] }, label: 'Товары' },
  tariffs:     { url: '/api/sync/tariffs',      body: {},                         label: 'Тарифы' },
  commissions: { url: '/api/sync/commissions',  body: {},                         label: 'Комиссии' },
  funnel:      { url: '/api/sync/funnel-initial', body: {},                       label: 'Воронка' },
  // incomes убран — WB удалил API эндпоинт
  // advertising обрабатывается отдельно (требует dateFrom / dateTo)
}

export function SyncStatus() {
  const [items, setItems] = useState<DataQualityItem[]>([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState<string | null>(null) // method key
  const [results, setResults] = useState<Record<string, string>>({})

  // Состояние для ручного запуска рекламного синка
  const defaultDateFrom = isoDate(new Date(Date.now() - 90 * 86400000))
  const defaultDateTo   = isoDate(new Date())
  const [adDateFrom, setAdDateFrom] = useState(defaultDateFrom)
  const [adDateTo,   setAdDateTo]   = useState(defaultDateTo)
  const [adExpanded, setAdExpanded] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetch('/api/data-quality')
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const d = await r.json()
      setItems(d.items ?? [])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  async function runSync(method: string) {
    const ep = SYNC_ENDPOINTS[method]
    if (!ep) return
    setSyncing(method)
    setResults(prev => ({ ...prev, [method]: '' }))
    try {
      const cronSecret = document.cookie
        .split(';')
        .find(c => c.trim().startsWith('cron_secret='))
        ?.split('=')?.[1] ?? ''

      const r = await fetch(ep.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.NEXT_PUBLIC_CRON_SECRET ?? cronSecret}`,
        },
        body: JSON.stringify(ep.body ?? {}),
      })
      const d = await r.json().catch(() => ({}))
      if (r.ok) {
        setResults(prev => ({ ...prev, [method]: '✓ Запущено' }))
        setTimeout(() => {
          load()
          setResults(prev => { const n = { ...prev }; delete n[method]; return n })
        }, 4000)
      } else {
        setResults(prev => ({ ...prev, [method]: `Ошибка: ${d.error ?? r.status}` }))
      }
    } catch (e) {
      setResults(prev => ({ ...prev, [method]: 'Ошибка сети' }))
    } finally {
      setSyncing(null)
    }
  }

  async function runAdvertSync() {
    setSyncing('advertising')
    setResults(prev => ({ ...prev, advertising: '' }))
    try {
      const r = await fetch('/api/sync/advert-initial', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dateFrom: adDateFrom, dateTo: adDateTo }),
      })
      const d = await r.json().catch(() => ({}))
      if (r.ok) {
        setResults(prev => ({ ...prev, advertising: '✓ Запущено' }))
        setAdExpanded(false)
        setTimeout(() => {
          load()
          setResults(prev => { const n = { ...prev }; delete n.advertising; return n })
        }, 4000)
      } else {
        setResults(prev => ({ ...prev, advertising: `Ошибка: ${d.error ?? r.status}` }))
      }
    } catch {
      setResults(prev => ({ ...prev, advertising: 'Ошибка сети' }))
    } finally {
      setSyncing(null)
    }
  }

  const statusColors: Record<DataQualityItem['status'], string> = {
    ok:      'text-emerald-600 dark:text-emerald-400',
    stale:   'text-amber-600 dark:text-amber-400',
    error:   'text-red-500',
    never:   'text-zinc-400',
    syncing: 'text-blue-500 dark:text-blue-400',
  }
  const statusLabels: Record<DataQualityItem['status'], string> = {
    ok: 'Актуально', stale: 'Устарело', error: 'Ошибка', never: 'Нет данных', syncing: 'Синхронизация…',
  }

  return (
    <div className="space-y-2">
      {loading ? (
        <div className="text-xs text-zinc-400 py-6 text-center">Загружаем статус…</div>
      ) : (
        <div className="divide-y divide-zinc-100 dark:divide-zinc-800 rounded-xl border border-zinc-100 dark:border-zinc-800 overflow-hidden">
          {items.map(item => (
            <div key={item.method} className="bg-white dark:bg-zinc-900">
              <div className="flex items-center gap-3 px-4 py-2.5">
                {/* Статус + название */}
                <StatusDot status={item.status} />
                <span className="text-sm text-zinc-700 dark:text-zinc-200 w-36 shrink-0">{item.label}</span>

                {/* Когда обновлено */}
                <span className="text-xs text-zinc-400 tabular-nums flex-1">
                  {fmtAgo(item.hoursAgo)}
                  {item.lastRows != null && (
                    <span className="ml-2 hidden sm:inline">· {item.lastRows.toLocaleString('ru')} строк</span>
                  )}
                </span>

                {/* Статус текстом */}
                <span className={`text-xs font-medium w-20 text-right hidden sm:block ${statusColors[item.status]}`}>
                  {statusLabels[item.status]}
                </span>

                {/* Кнопка ручного запуска */}
                <div className="w-28 text-right">
                  {results[item.method] ? (
                    <span className={`text-xs ${results[item.method].startsWith('✓') ? 'text-emerald-600' : 'text-red-500'}`}>
                      {results[item.method]}
                    </span>
                  ) : item.method === 'advertising' ? (
                    <button
                      onClick={() => setAdExpanded(v => !v)}
                      className="px-2.5 py-1 text-xs rounded-lg border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition whitespace-nowrap"
                    >
                      {adExpanded ? 'Свернуть' : 'Обновить'}
                    </button>
                  ) : SYNC_ENDPOINTS[item.method] ? (
                    <button
                      onClick={() => runSync(item.method)}
                      disabled={syncing === item.method}
                      className="px-2.5 py-1 text-xs rounded-lg border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 disabled:opacity-40 transition whitespace-nowrap"
                    >
                      {syncing === item.method ? '…' : 'Обновить'}
                    </button>
                  ) : (
                    <span />
                  )}
                </div>
              </div>

              {/* Раскрывающаяся панель синка рекламы */}
              {item.method === 'advertising' && adExpanded && (
                <div className="px-4 pb-3 border-t border-zinc-100 dark:border-zinc-800 pt-3 bg-zinc-50 dark:bg-zinc-800/40">
                  <p className="text-xs text-zinc-500 mb-2">
                    WB хранит рекламную статистику только за последние 90 дней. Синхронизация занимает несколько минут.
                  </p>
                  <div className="flex items-center gap-2 flex-wrap">
                    <label className="text-xs text-zinc-500">С</label>
                    <input
                      type="date"
                      value={adDateFrom}
                      onChange={e => setAdDateFrom(e.target.value)}
                      className="h-7 text-xs rounded border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-2"
                    />
                    <label className="text-xs text-zinc-500">По</label>
                    <input
                      type="date"
                      value={adDateTo}
                      onChange={e => setAdDateTo(e.target.value)}
                      className="h-7 text-xs rounded border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-2"
                    />
                    <button
                      onClick={runAdvertSync}
                      disabled={syncing === 'advertising'}
                      className="px-3 py-1 text-xs rounded-lg bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-40 transition whitespace-nowrap"
                    >
                      {syncing === 'advertising' ? 'Запускаем…' : 'Запустить синхронизацию'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <button
        onClick={load}
        disabled={loading}
        className="text-xs text-zinc-400 hover:text-zinc-600 transition"
      >
        ↻ Обновить статус
      </button>
    </div>
  )
}
