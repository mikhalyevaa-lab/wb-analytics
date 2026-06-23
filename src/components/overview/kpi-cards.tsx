import type { OverviewFinance, YesterdayOrders } from '@/lib/queries-overview'

function fmt(n: number) {
  return new Intl.NumberFormat('ru-RU').format(n)
}

function KpiCard({ label, value, sub, isNegative, isPrelim }: {
  label: string; value: string; sub?: string; isNegative?: boolean; isPrelim?: boolean
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 flex flex-col gap-1">
      <div className="flex items-center gap-2 justify-between">
        <span className="text-xs text-muted-foreground font-medium uppercase tracking-wide">{label}</span>
        {isPrelim && (
          <span className="text-[10px] font-medium bg-yellow-500/20 text-yellow-700 dark:text-yellow-400 rounded px-1.5 py-0.5">предв.</span>
        )}
      </div>
      <div className={`text-xl font-bold ${isNegative ? 'text-red-500' : ''}`}>{value}</div>
      {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
    </div>
  )
}

export function KpiCards({ finance, yesterday }: { finance: OverviewFinance; yesterday: YesterdayOrders }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      <KpiCard
        label="Реализация"
        value={`${fmt(finance.revenue)} ₽`}
        sub={`${finance.unitCount} шт`}
      />
      <KpiCard
        label="Чистая прибыль"
        value={`${fmt(finance.netProfit)} ₽`}
        sub={`Маржа ${finance.margin}%`}
        isNegative={finance.netProfit < 0}
      />
      <KpiCard
        label="Маржа %"
        value={`${finance.margin}%`}
        sub={`ROI ${finance.roi}%`}
        isNegative={finance.margin < 0}
      />
      <KpiCard
        label="Выручка вчера"
        value={`${fmt(yesterday.revenue)} ₽`}
        sub={`${yesterday.count} заказов`}
        isPrelim
      />
      <KpiCard
        label="ROI"
        value={`${finance.roi}%`}
        sub={`С/с ${fmt(finance.cost)} ₽`}
        isNegative={finance.roi < 0}
      />
      <KpiCard
        label="% выкупа"
        value={`${finance.buyoutRate}%`}
      />
      <KpiCard
        label="Прибыль на шт"
        value={`${fmt(finance.profitPerUnit)} ₽`}
        isNegative={finance.profitPerUnit < 0}
      />
      <KpiCard
        label="Возвраты"
        value={`${fmt(finance.returns)} ₽`}
        sub={`Логистика ${fmt(finance.logistics)} ₽`}
        isNegative={finance.returns > finance.revenue * 0.3}
      />
    </div>
  )
}
