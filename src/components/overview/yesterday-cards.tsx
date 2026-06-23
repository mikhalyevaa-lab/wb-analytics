import type { YesterdayOrders } from '@/lib/queries-overview'

function fmt(n: number) {
  return new Intl.NumberFormat('ru-RU').format(n)
}

interface Props {
  yesterday: YesterdayOrders
  criticalTaskCount: number
}

export function YesterdayCards({ yesterday, criticalTaskCount }: Props) {
  // We don't have yesterday profit directly without running a full finance query for yesterday
  // Show available data: orders revenue, ad spend (not available), critical tasks
  return (
    <div>
      <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">Вчера (предварительно)</h2>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Заказы вчера</div>
          <div className="text-2xl font-bold mt-1">{yesterday.count} шт</div>
          <div className="text-sm text-muted-foreground mt-0.5">{fmt(yesterday.revenue)} ₽</div>
          <div className={`text-xs mt-1 font-medium ${yesterday.delta >= 0 ? 'text-green-600' : 'text-red-500'}`}>
            {yesterday.delta >= 0 ? '+' : ''}{yesterday.delta} к пред. нед.
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-4">
          <div className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Расход на рекламу</div>
          <div className="text-2xl font-bold mt-1">—</div>
          <div className="text-sm text-muted-foreground mt-0.5">Нет данных</div>
          <div className="text-xs mt-1 text-muted-foreground">Требуется API рекламы</div>
        </div>

        <div className="rounded-xl border border-border bg-card p-4">
          <div className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Критичных действий</div>
          <div className={`text-2xl font-bold mt-1 ${criticalTaskCount > 0 ? 'text-red-500' : ''}`}>
            {criticalTaskCount}
          </div>
          <div className="text-sm text-muted-foreground mt-0.5">
            {criticalTaskCount > 0 ? 'требуют внимания' : 'всё в норме'}
          </div>
          <div className="text-xs mt-1 text-muted-foreground">По задачам и поставкам</div>
        </div>
      </div>
    </div>
  )
}
