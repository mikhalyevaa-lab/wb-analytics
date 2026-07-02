'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Hint } from '@/components/ui/hint'

interface Stats {
  orders: number
  order_sum: number
  ad_spend: number
  clicks: number
  cost_per_order: number
  dateFrom: string
  dateTo: string
}

function fmt(n: number) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + ' млн'
  if (n >= 1_000) return (n / 1_000).toFixed(0) + ' тыс'
  return n.toLocaleString('ru')
}
function fmtRub(n: number) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + ' млн ₽'
  if (n >= 1_000) return Math.round(n / 1_000) + ' тыс ₽'
  return n.toLocaleString('ru', { maximumFractionDigits: 0 }) + ' ₽'
}

function Stat({
  label, value, hint, loading,
}: { label: string; value: string; hint?: React.ReactNode; loading?: boolean }) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-center gap-1">
          <p className="text-xs font-medium text-zinc-500 uppercase tracking-wide">{label}</p>
          {hint && <Hint width={280}>{hint}</Hint>}
        </div>
        {loading
          ? <div className="h-8 mt-1.5 bg-zinc-100 dark:bg-zinc-800 rounded animate-pulse w-3/4" />
          : <p className="text-2xl font-bold text-zinc-900 dark:text-zinc-100 mt-1.5">{value}</p>
        }
      </CardContent>
    </Card>
  )
}

interface Props {
  dateFrom: string
  dateTo: string
}

export function TodayCards({ dateFrom, dateTo }: Props) {
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    fetch(`/api/dashboard/stats?from=${dateFrom}&to=${dateTo}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { setStats(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [dateFrom, dateTo])

  const label = dateFrom === dateTo
    ? new Date(dateFrom + 'T00:00:00').toLocaleDateString('ru', { day: 'numeric', month: 'long' })
    : `${dateFrom} — ${dateTo}`

  return (
    <div>
      <div className="flex items-center gap-1.5 mb-3">
        <h2 className="text-sm font-semibold text-zinc-500 uppercase tracking-wide">
          Заказы и реклама · {label}
        </h2>
        <Hint width={300}>
          Заказы и сумма — воронка продаж WB. Реклама и переходы — API рекламы WB. Данные за текущий день могут появляться с задержкой 2–4 часа.
        </Hint>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <Stat loading={loading} label="Заказы, шт" value={stats ? stats.orders.toLocaleString('ru') : '—'}
          hint={<p>Количество заказов за выбранный период. Источник — воронка продаж WB.</p>} />
        <Stat loading={loading} label="Сумма заказов" value={stats ? fmtRub(stats.order_sum) : '—'}
          hint={<p>Сумма цен заказанных товаров. Источник — воронка продаж WB.</p>} />
        <Stat loading={loading} label="Реклама, руб" value={stats ? fmtRub(stats.ad_spend) : '—'}
          hint={<p>Расходы на рекламу за период.</p>} />
        <Stat loading={loading} label="Цена заказа" value={stats && stats.cost_per_order > 0 ? fmtRub(stats.cost_per_order) : '—'}
          hint={<p>Рекламный бюджет ÷ количество заказов.</p>} />
        <Stat loading={loading} label="Переходов" value={stats ? fmt(stats.clicks) : '—'}
          hint={<p>Клики по рекламным объявлениям за период.</p>} />
      </div>
    </div>
  )
}
