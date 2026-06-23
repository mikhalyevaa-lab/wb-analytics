'use client'

export const dynamic = 'force-dynamic'

import { useState, useEffect } from 'react'

type DataSource = {
  key: string; label: string; lastDate: string | null; lastUpdatedAt: string | null
  daysSince: number | null; status: 'ok' | 'warn' | 'error' | 'missing'; warnDays: number
}

type Product = {
  nm_id: number | null; vendor_code: string | null; title: string | null
  brand: string | null; photo_url: string | null; current_stock: number | null
  avg_orders_per_day: number | null
}

type ApiResponse = {
  issues: string[]
  missingCostProducts: Product[]
  hasToken: boolean
  storeName: string
  dataSources: DataSource[]
  today: string
  weeklyReport: { lastDate: string | null; lastReconciledAt: string | null }
}

function statusIcon(s: DataSource['status']) {
  return s === 'ok' ? '✅' : s === 'warn' ? '⚠️' : s === 'missing' ? '❓' : '🔴'
}
function statusColor(s: DataSource['status']) {
  return s === 'ok' ? 'text-green-400' : s === 'warn' ? 'text-yellow-400' : 'text-red-400'
}

export default function QualityPage() {
  const [data, setData] = useState<ApiResponse | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/quality').then(r => r.json()).then((d: ApiResponse) => {
      setData(d); setLoading(false)
    })
  }, [])

  if (loading) return (
    <div className="p-6 text-center py-16 text-muted-foreground">Проверяем качество данных…</div>
  )
  if (!data) return null

  const { issues, missingCostProducts, hasToken, dataSources, weeklyReport } = data

  const overallOk = issues.length === 0

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Качество данных</h1>
        <p className="text-sm text-muted-foreground mt-1">H5 — мониторинг полноты данных для точных расчётов</p>
      </div>

      {/* Общий статус */}
      <div className={`rounded-xl border p-5 flex items-start gap-4 ${overallOk ? 'border-green-500/40 bg-green-500/5' : 'border-yellow-500/40 bg-yellow-500/5'}`}>
        <span className="text-3xl">{overallOk ? '✅' : '⚠️'}</span>
        <div>
          <p className="font-semibold text-lg">{overallOk ? 'Данные в порядке' : `${issues.length} проблем${issues.length > 1 ? 'ы' : 'а'}`}</p>
          {issues.map((iss, i) => (
            <p key={i} className="text-sm text-muted-foreground mt-0.5">• {iss}</p>
          ))}
        </div>
      </div>

      {/* Статус источников данных */}
      <div className="rounded-xl border border-border bg-card p-5 space-y-3">
        <h2 className="text-sm font-semibold mb-4">Источники данных</h2>
        {dataSources.map(s => {
          const timeStr = s.lastUpdatedAt
            ? new Date(s.lastUpdatedAt).toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Moscow' })
            : null
          const dateLabel = s.lastDate
            ? s.daysSince === 0 ? 'сегодня'
            : s.daysSince === 1 ? 'вчера'
            : `${s.daysSince}д назад (${s.lastDate})`
            : 'нет данных'
          return (
            <div key={s.key} className="flex items-center gap-3">
              <span className="text-lg w-6">{statusIcon(s.status)}</span>
              <span className="flex-1 text-sm">{s.label}</span>
              <span className={`text-sm font-mono ${statusColor(s.status)}`}>
                {dateLabel}
                {timeStr && <span className="text-xs text-muted-foreground ml-1">{timeStr} МСК</span>}
              </span>
              {s.status !== 'ok' && (
                <span className="text-xs text-muted-foreground">
                  {s.status === 'missing' ? 'не загружалось' : `норма ≤${s.warnDays}д`}
                </span>
              )}
            </div>
          )
        })}
      </div>

      {/* Финансовые отчёты */}
      <div className="rounded-xl border border-border bg-card p-4 flex items-start gap-3">
        <span className="text-xl">⚠️</span>
        <div className="flex-1">
          <p className="text-sm font-semibold">Финансы</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {weeklyReport?.lastDate
              ? `Последний отчёт: ${weeklyReport.lastDate}`
              : 'Отчёты не загружены'}
          </p>
          <p className="text-xs text-muted-foreground">
            {`Сверка: ${weeklyReport?.lastReconciledAt ?? 'Сверки не было'}`}
          </p>
        </div>
        <a href="/finance-reports" className="text-sm px-3 py-1.5 rounded-lg border border-border hover:bg-muted/30 whitespace-nowrap">
          Отчёты →
        </a>
      </div>

      {/* Токен аналитики */}
      <div className={`rounded-xl border p-4 flex items-center gap-3 ${hasToken ? 'border-green-500/30 bg-green-500/5' : 'border-yellow-500/30 bg-yellow-500/5'}`}>
        <span className="text-xl">{hasToken ? '✅' : '⚠️'}</span>
        <div className="flex-1">
          <p className="text-sm font-semibold">{hasToken ? 'wb_analytics_token подключён' : 'wb_analytics_token не указан'}</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {hasToken ? 'Доступны ИРП, индекс локализации и данные воронки' : 'Без токена недоступны ИРП, индекс локализации, переходы. Добавьте в Настройках.'}
          </p>
        </div>
        {!hasToken && (
          <a href="/settings" className="text-sm px-3 py-1.5 rounded-lg bg-white text-black font-medium hover:bg-white/90">
            Настройки →
          </a>
        )}
      </div>

      {/* SKU без себестоимости */}
      {missingCostProducts.length > 0 ? (
        <div className="rounded-xl border border-red-500/30 bg-card overflow-hidden">
          <div className="flex items-center gap-3 p-4 border-b border-red-500/20 bg-red-500/5">
            <span className="text-xl">🔴</span>
            <div className="flex-1">
              <h2 className="text-sm font-semibold text-red-400">{missingCostProducts.length} SKU без себестоимости</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Без с/с невозможно рассчитать прибыль, ROI и инсайты. Заполните в справочнике.
              </p>
            </div>
            <a href="/catalog" className="text-sm px-3 py-1.5 rounded-lg bg-white text-black font-medium hover:bg-white/90 shrink-0">
              Перейти в каталог →
            </a>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-border text-xs text-muted-foreground">
                <tr>
                  <th className="text-left px-4 py-2 w-10"></th>
                  <th className="text-left px-3 py-2">Артикул</th>
                  <th className="text-right px-3 py-2">Остаток</th>
                  <th className="text-right px-3 py-2">Скорость пр./д</th>
                  <th className="text-left px-3 py-2">Приоритет</th>
                </tr>
              </thead>
              <tbody>
                {missingCostProducts.map(p => {
                  const stock = p.current_stock ?? 0
                  const spd = p.avg_orders_per_day ?? 0
                  const priority = stock > 0 && spd > 0 ? 'high' : stock > 0 ? 'medium' : 'low'
                  return (
                    <tr key={p.nm_id} className="border-b border-border/30 hover:bg-muted/10">
                      <td className="px-4 py-2">
                        {p.photo_url
                          ? <img src={p.photo_url} alt="" className="w-8 h-10 object-cover rounded" />
                          : <div className="w-8 h-10 bg-muted rounded" />}
                      </td>
                      <td className="px-3 py-2">
                        <a href={`/catalog/${p.nm_id}`} className="font-medium hover:text-blue-400">{p.vendor_code ?? '—'}</a>
                        <p className="text-xs text-muted-foreground truncate max-w-[200px]">{p.title ?? p.brand ?? ''}</p>
                        <p className="text-[10px] text-zinc-500">{p.nm_id}</p>
                      </td>
                      <td className="px-3 py-2 text-right font-mono">{stock.toLocaleString('ru')}</td>
                      <td className="px-3 py-2 text-right font-mono">{spd > 0 ? spd.toFixed(1) : '—'}</td>
                      <td className="px-3 py-2">
                        {priority === 'high' && <span className="px-2 py-0.5 rounded text-xs bg-red-500/20 text-red-400">Срочно</span>}
                        {priority === 'medium' && <span className="px-2 py-0.5 rounded text-xs bg-yellow-500/20 text-yellow-400">Нужно</span>}
                        {priority === 'low' && <span className="px-2 py-0.5 rounded text-xs bg-zinc-500/20 text-zinc-400">Нет остатка</span>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-green-500/30 bg-green-500/5 p-4 flex items-center gap-3">
          <span className="text-xl">✅</span>
          <p className="text-sm">У всех активных товаров указана себестоимость</p>
        </div>
      )}
    </div>
  )
}
