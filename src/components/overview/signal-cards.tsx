'use client'
import Link from 'next/link'
import type { YesterdayOrders, StocksAlerts, DataQualityAlerts } from '@/lib/queries-overview'

interface Props {
  yesterday: YesterdayOrders
  stocks: StocksAlerts
  quality: DataQualityAlerts
  taskCount: number
  criticalTaskCount: number
}

function SignalCard({ icon, label, value, sub, href, color = 'default' }: {
  icon: string; label: string; value: string; sub: string; href?: string; color?: 'default' | 'green' | 'yellow' | 'red'
}) {
  const colors = {
    default: 'border-border',
    green: 'border-green-500/40 bg-green-500/5',
    yellow: 'border-yellow-500/40 bg-yellow-500/5',
    red: 'border-red-500/40 bg-red-500/5',
  }
  const inner = (
    <div className={`rounded-xl border p-4 flex gap-3 items-start ${colors[color]}`}>
      <span className="text-2xl">{icon}</span>
      <div className="min-w-0">
        <div className="text-xs text-muted-foreground font-medium uppercase tracking-wide">{label}</div>
        <div className="text-lg font-bold mt-0.5">{value}</div>
        <div className="text-xs text-muted-foreground mt-0.5">{sub}</div>
      </div>
    </div>
  )
  if (href) return <Link href={href} className="block hover:opacity-80 transition-opacity">{inner}</Link>
  return inner
}

export function SignalCards({ yesterday, stocks, quality, taskCount, criticalTaskCount }: Props) {
  const deltaSign = yesterday.delta > 0 ? '+' : ''
  const deltaColor = yesterday.delta > 0 ? 'text-green-600' : yesterday.delta < 0 ? 'text-red-600' : ''
  const stocksTotal = stocks.critical.length + stocks.soon.length
  const stockColor = stocks.critical.length > 0 ? 'red' : stocks.soon.length > 0 ? 'yellow' : 'green'

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      <SignalCard
        icon="📦"
        label="Продажи"
        value={`${yesterday.count} заказов`}
        sub={`${deltaSign}${yesterday.delta} к пред. нед. · ${new Intl.NumberFormat('ru-RU').format(yesterday.revenue)} ₽`}
        color={yesterday.delta >= 0 ? 'green' : 'red'}
        href="/dashboard"
      />
      <SignalCard
        icon="🎯"
        label="Задачи"
        value={`${taskCount} задач`}
        sub={criticalTaskCount > 0 ? `${criticalTaskCount} критичных` : 'Без критичных'}
        color={criticalTaskCount > 0 ? 'red' : taskCount > 0 ? 'yellow' : 'green'}
        href="/tasks"
      />
      <SignalCard
        icon="🚚"
        label="Поставки"
        value={stocksTotal > 0 ? `${stocksTotal} SKU` : 'Всё в порядке'}
        sub={stocks.critical.length > 0 ? `${stocks.critical.length} критично (< 14 дн)` : stocks.soon.length > 0 ? `${stocks.soon.length} скоро (< 21 дн)` : 'Запасов хватает'}
        color={stockColor}
      />
      <SignalCard
        icon="⚠️"
        label="Данные"
        value={quality.missingCost > 0 ? `${quality.missingCost} без с/с` : quality.missingToken ? 'Нет токена' : 'Данные полные'}
        sub={quality.missingCost > 0 ? 'Заполните себестоимость' : quality.missingToken ? 'WB Analytics токен' : 'Всё подключено'}
        color={quality.missingCost > 0 ? 'red' : quality.missingToken ? 'yellow' : 'green'}
        href="/quality"
      />
    </div>
  )
}
