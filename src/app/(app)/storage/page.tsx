'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Hint } from '@/components/ui/hint'
import { PageHeader } from '@/components/ui/page-header'
import { VelocityMatrix } from '@/components/storage/velocity-matrix'

interface KPI {
  total_cost: number
  avg_per_day: number
  wasteland_cost: number
  wasteland_count: number
  top_sku_cost: number
  top_sku_nm_id: number | null
  weekly_report_cost?: number
}

interface DayRow  { date: string; cost: number }
interface SkuRow {
  nm_id: number
  vendor_code: string | null
  title: string | null
  subject: string | null
  brand: string | null
  photo_url: string | null
  current_stock: number
  cost_total: number
  cost_per_day: number | null
  cost_per_unit: number | null
  revenue: number
  storage_to_revenue: number | null
  is_wasteland: boolean
}

const PRESETS = [
  { label: 'Сегодня', days: 0  },
  { label: '7 дн',    days: 7  },
  { label: '14 дн',   days: 14 },
  { label: '30 дн',   days: 30 },
  { label: '90 дн',   days: 90 },
]

function fmt(n: number | null | undefined, dec = 0) {
  if (n == null) return '—'
  return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: dec }).format(n)
}

function toInputDate(d: Date) {
  return d.toISOString().split('T')[0]
}

function moscowToday() {
  return new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString().split('T')[0]
}

function KpiCard({ icon, label, value, sub, color = '', hint }: {
  icon: string; label: string; value: string; sub?: string; color?: string; hint?: React.ReactNode
}) {
  return (
    <div className={`rounded-xl border p-4 ${color}`}>
      <div className="text-2xl mb-2">{icon}</div>
      <div className="flex items-center gap-1">
        <div className="text-xs text-muted-foreground font-medium uppercase tracking-wide">{label}</div>
        {hint && <Hint width={280}>{hint}</Hint>}
      </div>
      <div className="text-xl font-bold mt-0.5">{value}</div>
      {sub && <div className="text-xs text-muted-foreground mt-0.5">{sub}</div>}
    </div>
  )
}

function MiniBar({ data }: { data: DayRow[] }) {
  if (!data.length) return <div className="text-sm text-muted-foreground">Нет данных</div>
  const max = Math.max(...data.map(d => d.cost), 1)
  return (
    <div className="flex items-end gap-0.5 h-24">
      {data.map(d => (
        <div key={d.date} className="flex-1 flex flex-col items-center gap-0.5 group relative">
          <div
            className="w-full bg-orange-500/70 rounded-sm min-h-[2px] group-hover:bg-orange-500 transition-colors"
            style={{ height: `${Math.max(2, (d.cost / max) * 88)}px` }}
          />
          <div className="absolute -top-6 left-1/2 -translate-x-1/2 bg-popover border rounded px-1 py-0.5 text-xs whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none z-10">
            {d.date.slice(5)}: {fmt(d.cost)} ₽
          </div>
        </div>
      ))}
    </div>
  )
}

export default function StoragePage() {
  const today = moscowToday()
  const [activeDays, setActiveDays]     = useState<number | null>(30)
  const [customFrom, setCustomFrom]     = useState(toInputDate(new Date(Date.now() - 30 * 86400000)))
  const [customTo, setCustomTo]         = useState(today)
  const [customActive, setCustomActive] = useState(false)

  const [kpi, setKpi]             = useState<KPI | null>(null)
  const [byDate, setByDate]       = useState<DayRow[]>([])
  const [skuList, setSkuList]     = useState<SkuRow[]>([])
  const [lastDate, setLastDate]   = useState<string | null>(null)
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null)
  const [days, setDays]           = useState(28)
  const [loading, setLoading]     = useState(true)
  const [loadingHistory, setLoadingHistory] = useState(false)
  const [historyResult, setHistoryResult]   = useState<string | null>(null)
  const [search, setSearch]       = useState('')
  const [showWasteland, setShowWasteland] = useState(false)

  function buildUrl() {
    if (customActive) {
      return `/api/storage?dateFrom=${customFrom}&dateTo=${customTo}`
    }
    return `/api/storage?days=${activeDays ?? 28}`
  }

  useEffect(() => {
    setLoading(true)
    fetch(buildUrl())
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json() })
      .then(d => {
        setKpi(d.kpi)
        setByDate(d.byDate ?? [])
        setSkuList(d.skuList ?? [])
        setLastDate(d.lastDate ?? null)
        setLastSyncAt(d.lastSyncAt ?? null)
        setDays(d.days ?? activeDays ?? 28)
      })
      .catch(e => console.error('[storage] fetch error:', e))
      .finally(() => setLoading(false))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeDays, customActive, customFrom, customTo])

  function selectPreset(d: number) {
    if (d === 0) {
      // «Сегодня» — переключаемся в custom-режим с dateFrom=dateTo=сегодня по МСК
      const todayMsk = moscowToday()
      setCustomFrom(todayMsk)
      setCustomTo(todayMsk)
      setCustomActive(true)
      setActiveDays(null)
      return
    }
    setActiveDays(d)
    setCustomActive(false)
  }

  function applyCustom() {
    if (!customFrom || !customTo || customFrom > customTo) return
    setCustomActive(true)
    setActiveDays(null)
  }

  async function loadHistory() {
    if (!confirm('Загрузить данные по платному хранению за последние 12 месяцев? Это займёт несколько минут.')) return
    setLoadingHistory(true)
    setHistoryResult(null)
    try {
      const res = await fetch('/api/storage/load-history', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ months: 12 }) })
      const d = await res.json()
      setHistoryResult(d.ok ? `Загружено ${d.inserted} строк за ${d.dateFrom} — ${d.dateTo}` : `Ошибка: ${d.error}`)
    } catch {
      setHistoryResult('Ошибка загрузки')
    } finally {
      setLoadingHistory(false)
    }
  }

  const filtered = skuList.filter(s => {
    if (showWasteland && !s.is_wasteland) return false
    if (search && !String(s.nm_id).includes(search) && !s.vendor_code?.toLowerCase().includes(search.toLowerCase()) && !s.title?.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  const periodLabel = customActive
    ? `${customFrom} — ${customTo}`
    : `последние ${activeDays} дн.`

  return (
    <div className="p-6 space-y-4 max-w-[1100px]">
      <PageHeader picto="storage" title="Хранение WB" subtitle="Затраты на хранение по SKU и дням">
        <Hint width={340}>
          <strong>Блок Хранение WB</strong><br /><br />
          <strong>Источник:</strong> отчёт о платном хранении WB (wb_storage_daily). WB списывает деньги за каждый товар, находящийся на складе.<br /><br />
          <strong>Как обновить:</strong> Настройки → Синхронизация → Хранение WB. Или нажмите «Загрузить историю» для загрузки данных за 12 месяцев.<br /><br />
          WB публикует данные о хранении с задержкой 1–2 дня.
        </Hint>
        {lastDate && (() => {
          const dateStr = new Date(lastDate).toLocaleDateString('ru', { day: 'numeric', month: 'long' })
          const timeStr = lastSyncAt
            ? new Date(new Date(lastSyncAt).getTime() + 3 * 60 * 60 * 1000).toISOString().slice(11, 16) + ' мск'
            : null
          return (
            <span className="text-xs text-zinc-500 flex items-center gap-1">
              данные по {dateStr}{timeStr ? `, ${timeStr}` : ''}
              <Hint width={260}>
                Дата последней записи в базе данных хранения. Если дата устарела — запустите синхронизацию в Настройках.
              </Hint>
            </span>
          )
        })()}
      </PageHeader>

      {/* Пресеты + дейтпикер */}
      <div className="flex items-center gap-2 flex-wrap">
        {PRESETS.map(p => (
          <button
            key={p.label}
            onClick={() => selectPreset(p.days)}
            className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${
              (p.days === 0
                ? customActive && customFrom === today && customTo === today
                : !customActive && activeDays === p.days)
                ? 'bg-zinc-900 border-zinc-900 text-white dark:bg-zinc-100 dark:border-zinc-100 dark:text-zinc-900'
                : 'border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800'
            }`}
          >
            {p.label}
          </button>
        ))}
        <div className="flex items-center gap-1">
          <input type="date" value={customFrom} max={customTo}
            onChange={e => setCustomFrom(e.target.value)}
            className="px-2 py-1.5 text-sm border border-zinc-200 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <span className="text-zinc-400">—</span>
          <input type="date" value={customTo} min={customFrom} max={today}
            onChange={e => setCustomTo(e.target.value)}
            className="px-2 py-1.5 text-sm border border-zinc-200 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <button onClick={applyCustom}
            disabled={!customFrom || !customTo || customFrom > customTo}
            className="px-3 py-1.5 text-sm bg-zinc-900 hover:bg-zinc-800 dark:bg-zinc-100 dark:hover:bg-zinc-200 dark:text-zinc-900 text-white rounded-lg transition-colors disabled:opacity-40">
            Применить
          </button>
          {customActive && (
            <button onClick={() => { setCustomActive(false); setActiveDays(30) }}
              className="text-xs text-zinc-400 hover:text-zinc-700 underline ml-1">
              Сбросить
            </button>
          )}
        </div>
      </div>

      {/* KPI */}
      {loading ? (
        <div className="text-sm text-muted-foreground">Загружаю...</div>
      ) : kpi && (
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-4">
            <p className="text-xs text-zinc-500 uppercase tracking-wide font-medium flex items-center gap-1">
              Хранение за период
              <Hint width={300}>
                Суммарные расходы на хранение всех товаров за выбранный период.<br /><br />
                WB рассчитывает стоимость хранения ежедневно: объём товара × тариф за литр. Тариф зависит от склада, категории и коэффициента хранения.<br /><br />
                <strong>Среднее в день</strong> = общая сумма ÷ количество дней в периоде.
              </Hint>
            </p>
            <p className="text-2xl font-bold text-zinc-900 dark:text-zinc-100 mt-1">{fmt(kpi.total_cost)} ₽</p>
            <p className="text-xs text-zinc-400 mt-1">{fmt(kpi.avg_per_day)} ₽ / день в среднем</p>
          </div>
          <div className={`rounded-xl border p-4 ${kpi.wasteland_count > 0 ? 'border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950/20' : 'bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800'}`}>
            <p className="text-xs text-zinc-500 uppercase tracking-wide font-medium flex items-center gap-1">
              Залежи
              <Hint width={280}>
                <strong>Залежи</strong> — товары, у которых есть остаток на складе WB, но не было ни одного заказа за выбранный период.<br /><br />
                Такие товары занимают место и <strong>генерируют расходы на хранение</strong> без дохода. Рекомендуется снизить цену, запустить рекламу или вывезти товар со склада.
              </Hint>
            </p>
            <p className={`text-2xl font-bold mt-1 ${kpi.wasteland_count > 0 ? 'text-red-600 dark:text-red-400' : 'text-zinc-900 dark:text-zinc-100'}`}>
              {kpi.wasteland_count} арт.
            </p>
            <p className="text-xs text-zinc-400 mt-1">{fmt(kpi.wasteland_cost)} ₽ потрачено на хранение</p>
          </div>
        </div>
      )}


      {/* Кросс-проверка с еженедельным отчётом */}
      {!loading && kpi && (kpi.weekly_report_cost ?? 0) > 0 && (() => {
        const weekly = kpi.weekly_report_cost!
        const dev = kpi.total_cost > 0 ? Math.round((kpi.total_cost / weekly - 1) * 100) : null
        return (
          <div className="rounded-xl border border-blue-100 dark:border-blue-900/50 bg-blue-50/50 dark:bg-blue-950/20 px-4 py-3 flex items-center gap-4 flex-wrap">
            <span className="text-xs font-semibold text-blue-700 dark:text-blue-300 uppercase tracking-wide whitespace-nowrap">
              По еженедельному отчёту WB
            </span>
            <span className="text-sm font-bold text-zinc-900 dark:text-zinc-100">{fmt(weekly)} ₽</span>
            {dev !== null && (
              <span className={`text-xs ${Math.abs(dev) > 25 ? 'text-amber-600 dark:text-amber-400' : 'text-zinc-400'}`}>
                {dev > 0 ? '+' : ''}{dev}% к API paid_storage
                {Math.abs(dev) > 25 && ' — расхождение >25%'}
              </span>
            )}
            <span className="text-xs text-zinc-400 ml-auto">
              Сумма storage_cost из отчётов WB за пересекающиеся периоды
            </span>
          </div>
        )
      })()}

      {/* Таблица SKU */}
      <div className="rounded-xl border overflow-hidden">
        <div className="p-3 border-b flex items-center gap-3">
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Поиск по nm_id, артикулу, названию..."
            className="flex-1 text-sm bg-transparent border rounded-lg px-3 py-1.5 outline-none focus:ring-1 ring-ring"
          />
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" checked={showWasteland} onChange={e => setShowWasteland(e.target.checked)} />
            Только залежи
          </label>
          <span className="text-xs text-muted-foreground">{filtered.length} SKU</span>
        </div>
        <div className="overflow-auto max-h-[600px]">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-muted/80 backdrop-blur">
              <tr>
                <th className="text-left px-3 py-2 font-medium">Товар</th>
                <th className="text-right px-3 py-2 font-medium">Остаток</th>
                <th className="text-right px-3 py-2 font-medium">
                  <span className="inline-flex items-center gap-1 justify-end">
                    Хранение
                    <Hint width={240}>Суммарные расходы на хранение этого товара за выбранный период.</Hint>
                  </span>
                </th>
                <th className="text-right px-3 py-2 font-medium">
                  <span className="inline-flex items-center gap-1 justify-end">
                    в день
                    <Hint width={240}>Среднесуточные расходы на хранение = Хранение за период ÷ количество дней.</Hint>
                  </span>
                </th>
                <th className="text-right px-3 py-2 font-medium">
                  <span className="inline-flex items-center gap-1 justify-end">
                    за единицу
                    <Hint width={260}>Расходы на хранение одной единицы товара за период = Хранение ÷ средний остаток.</Hint>
                  </span>
                </th>
                <th className="text-right px-3 py-2 font-medium">
                  <span className="inline-flex items-center gap-1 justify-end">
                    Выручка
                    <Hint width={260}>Сумма выкупленных заказов (for_pay) по этому товару за период. Источник: wb_sales.</Hint>
                  </span>
                </th>
                <th className="text-right px-3 py-2 font-medium">
                  <span className="inline-flex items-center gap-1 justify-end">
                    Хр/Выр %
                    <Hint width={280}>
                      Доля расходов на хранение в выручке = Хранение ÷ Выручка × 100%.<br /><br />
                      <span style={{color:'#16a34a'}}>■ Зелёный</span> — ≤ 10% (норма)<br />
                      <span style={{color:'#ca8a04'}}>■ Жёлтый</span> — 10–20% (внимание)<br />
                      <span style={{color:'#dc2626'}}>■ Красный</span> — &gt; 20% (хранение съедает выручку)<br /><br />
                      «—» — нет выручки за период (залежь).
                    </Hint>
                  </span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtered.map(s => (
                <tr key={s.nm_id} className={`hover:bg-muted/30 ${s.is_wasteland ? 'bg-red-500/5' : ''}`}>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      {s.photo_url && (
                        <img src={s.photo_url} alt="" className="w-8 h-8 object-cover rounded" />
                      )}
                      <div>
                        <Link href={`/catalog/${s.nm_id}`} className="text-blue-600 hover:underline font-medium">
                          {s.nm_id}
                        </Link>
                        <div className="text-xs text-muted-foreground truncate max-w-[200px]">
                          {s.vendor_code ?? s.title ?? s.subject ?? '—'}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right">{fmt(s.current_stock)}</td>
                  <td className="px-3 py-2 text-right font-medium">{fmt(s.cost_total)} ₽</td>
                  <td className="px-3 py-2 text-right text-muted-foreground">{fmt(s.cost_per_day)} ₽</td>
                  <td className="px-3 py-2 text-right text-muted-foreground">{s.cost_per_unit != null ? `${fmt(s.cost_per_unit)} ₽` : '—'}</td>
                  <td className="px-3 py-2 text-right">{s.revenue > 0 ? `${fmt(s.revenue)} ₽` : <span className="text-red-500">0</span>}</td>
                  <td className="px-3 py-2 text-right">
                    {s.storage_to_revenue != null ? (
                      <span className={s.storage_to_revenue > 20 ? 'text-red-500 font-medium' : s.storage_to_revenue > 10 ? 'text-yellow-500' : 'text-green-600'}>
                        {fmt(s.storage_to_revenue, 1)}%
                      </span>
                    ) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length === 0 && (
            <div className="text-center py-8 text-muted-foreground text-sm">Нет данных</div>
          )}
        </div>
      </div>

      {/* Velocity Matrix — скорость продаж vs остатки */}
      <div className="space-y-2">
        <h2 className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Velocity Matrix — скорость продаж × дней остатка</h2>
        <p className="text-xs text-zinc-500">Каждая точка — артикул. Данные: wb_stocks + wb_sales за 30 дней</p>
        <div className="bg-card border rounded-xl p-4">
          <VelocityMatrix />
        </div>
      </div>
    </div>
  )
}
