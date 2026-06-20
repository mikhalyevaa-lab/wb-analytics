import { Card, CardContent } from '@/components/ui/card'
import type { MonthStats } from '@/lib/queries'

function fmtNum(n: number) {
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

function ForecastStat({ label, value, basis }: { label: string; value: string; basis: string }) {
  return (
    <Card className="border-dashed">
      <CardContent className="p-5">
        <p className="text-xs font-medium text-zinc-500 uppercase tracking-wide">{label}</p>
        <p className="text-2xl font-bold text-zinc-900 dark:text-zinc-100 mt-1.5">{value}</p>
        <p className="text-xs text-zinc-400 mt-1">{basis}</p>
      </CardContent>
    </Card>
  )
}

export function MonthCards({ stats }: { stats: MonthStats }) {
  const costPerOrder = stats.orders > 0 ? stats.adSpend / stats.orders : 0
  const forecastCostPerOrder = stats.forecastOrders > 0
    ? stats.forecastAdSpend / stats.forecastOrders
    : 0
  const basis = `${stats.daysElapsed} из ${stats.daysInMonth} дней`

  return (
    <div className="space-y-3">
      {/* Текущий месяц */}
      <div>
        <h2 className="text-sm font-semibold text-zinc-500 uppercase tracking-wide mb-3">
          Текущий месяц · {stats.periodLabel}
        </h2>
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          <Stat label="Заказы, шт"     value={stats.orders.toLocaleString('ru')} />
          <Stat label="Сумма заказов"  value={fmtRub(stats.revenue)} />
          <Stat label="Реклама, руб"   value={fmtRub(stats.adSpend)} />
          <Stat label="Цена заказа, руб" value={costPerOrder > 0 ? fmtRub(costPerOrder) : '—'} />
          <Stat label="Переходов"      value={fmtNum(stats.clicks)} />
        </div>
      </div>

      {/* Прогноз */}
      <div>
        <h2 className="text-sm font-semibold text-zinc-500 uppercase tracking-wide mb-3">
          Прогноз на месяц · на {stats.daysInMonth} дней
        </h2>
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          <ForecastStat label="Заказы, шт"     value={stats.forecastOrders.toLocaleString('ru')} basis={basis} />
          <ForecastStat label="Сумма заказов"  value={fmtRub(stats.forecastRevenue)} basis={basis} />
          <ForecastStat label="Реклама, руб"   value={fmtRub(stats.forecastAdSpend)} basis={basis} />
          <ForecastStat label="Цена заказа, руб" value={forecastCostPerOrder > 0 ? fmtRub(forecastCostPerOrder) : '—'} basis={basis} />
          <ForecastStat label="Переходов"      value={fmtNum(stats.forecastClicks)} basis={basis} />
        </div>
      </div>
    </div>
  )
}
