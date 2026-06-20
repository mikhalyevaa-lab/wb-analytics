import { Card, CardContent } from '@/components/ui/card'
import type { TodayStats } from '@/lib/queries'

function fmt(n: number) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + ' млн'
  if (n >= 1_000) return (n / 1_000).toFixed(0) + ' тыс'
  return n.toLocaleString('ru')
}

function fmtRub(n: number) {
  return n.toLocaleString('ru', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + ' ₽'
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="p-5">
        <p className="text-xs font-medium text-zinc-500 uppercase tracking-wide">{label}</p>
        <p className="text-2xl font-bold text-zinc-900 dark:text-zinc-100 mt-1.5">{value}</p>
      </CardContent>
    </Card>
  )
}

export function TodayCards({ stats }: { stats: TodayStats }) {
  const costPerOrder = stats.orders > 0 ? stats.adSpend / stats.orders : 0

  const dateLabel = new Date(stats.date + 'T00:00:00').toLocaleDateString('ru', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })

  return (
    <div>
      <h2 className="text-sm font-semibold text-zinc-500 uppercase tracking-wide mb-3">
        Сегодня · {dateLabel}
      </h2>
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <Stat label="Заказы, шт" value={stats.orders.toLocaleString('ru')} />
        <Stat label="Сумма заказов" value={fmtRub(stats.revenue)} />
        <Stat label="Реклама, руб" value={fmtRub(stats.adSpend)} />
        <Stat label="Цена заказа, руб" value={costPerOrder > 0 ? fmtRub(costPerOrder) : '—'} />
        <Stat label="Переходов" value={fmt(stats.clicks)} />
      </div>
    </div>
  )
}
