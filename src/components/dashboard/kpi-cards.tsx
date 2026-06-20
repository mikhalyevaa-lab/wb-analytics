import { Card, CardContent } from '@/components/ui/card'
import type { KpiData } from '@/lib/queries'

function delta(cur: number, prev: number, lowerIsBetter = false): { sign: string; pct: string; up: boolean } {
  if (prev === 0) return { sign: '', pct: '—', up: true }
  const pct = ((cur - prev) / prev) * 100
  if (Math.abs(pct) > 500 && prev < cur * 0.1) return { sign: '', pct: '—', up: true }
  const isGood = lowerIsBetter ? pct <= 0 : pct >= 0
  return {
    sign: pct >= 0 ? '+' : '',
    pct: Math.abs(pct).toFixed(1) + '%',
    up: isGood,
  }
}

function fmt(n: number) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M'
  if (n >= 1_000) return (n / 1_000).toFixed(0) + 'K'
  return n.toFixed(0)
}

function KpiCard({
  label,
  value,
  sub,
  prev,
  cur,
  suffix = '',
  lowerIsBetter = false,
}: {
  label: string
  value: string
  sub: string
  prev: number
  cur: number
  suffix?: string
  lowerIsBetter?: boolean
}) {
  const d = delta(cur, prev, lowerIsBetter)
  return (
    <Card>
      <CardContent className="p-5">
        <p className="text-xs font-medium text-zinc-500 uppercase tracking-wide">{label}</p>
        <p className="text-2xl font-bold text-zinc-900 dark:text-zinc-100 mt-1.5">
          {value}{suffix}
        </p>
        <div className="flex items-center gap-2 mt-1.5">
          <span
            className={`text-xs font-medium px-1.5 py-0.5 rounded ${
              d.up
                ? 'text-emerald-700 bg-emerald-50 dark:text-emerald-400 dark:bg-emerald-950/40'
                : 'text-red-600 bg-red-50 dark:text-red-400 dark:bg-red-950/40'
            }`}
          >
            {d.sign}{d.pct}
          </span>
          <span className="text-xs text-zinc-400">{sub}</span>
        </div>
      </CardContent>
    </Card>
  )
}

export function KpiCards({ kpi }: { kpi: KpiData }) {
  const costPerOrder = kpi.orders > 0 ? kpi.adSpend / kpi.orders : 0
  const costPerOrderPrev = kpi.ordersPrev > 0 ? kpi.adSpendPrev / kpi.ordersPrev : 0

  return (
    <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
      <KpiCard
        label="Заказы, шт"
        value={kpi.orders.toLocaleString('ru')}
        sub="прошлый период"
        cur={kpi.orders}
        prev={kpi.ordersPrev}
      />
      <KpiCard
        label="Сумма заказов"
        value={fmt(kpi.revenue)}
        sub="прошлый период"
        cur={kpi.revenue}
        prev={kpi.revenuePrev}
        suffix=" ₽"
      />
      <KpiCard
        label="Реклама, руб"
        value={fmt(kpi.adSpend)}
        sub="прошлый период"
        cur={kpi.adSpend}
        prev={kpi.adSpendPrev}
        suffix=" ₽"
        lowerIsBetter
      />
      <KpiCard
        label="Цена заказа, руб"
        value={fmt(costPerOrder)}
        sub="прошлый период"
        cur={costPerOrder}
        prev={costPerOrderPrev}
        suffix=" ₽"
        lowerIsBetter
      />
      <KpiCard
        label="Переходов"
        value={kpi.clicks.toLocaleString('ru')}
        sub="прошлый период"
        cur={kpi.clicks}
        prev={kpi.clicksPrev}
      />
    </div>
  )
}
