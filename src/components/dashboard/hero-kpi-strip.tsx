import type { OverviewFinance } from '@/lib/queries-overview'

function fmt(n: number) {
  if (Math.abs(n) >= 1_000_000) return (n / 1_000_000).toFixed(1) + ' M'
  if (Math.abs(n) >= 1_000) return (n / 1_000).toFixed(0) + ' k'
  return n.toLocaleString('ru')
}

interface Props {
  finance: OverviewFinance
  periodLabel: string
}

export function HeroKpiStrip({ finance, periodLabel }: Props) {
  const metrics = [
    {
      label: 'Реализация',
      value: fmt(finance.revenue) + ' ₽',
      color: 'text-zinc-900 dark:text-zinc-100',
      sub: `${finance.unitCount.toLocaleString('ru')} шт`,
    },
    {
      label: 'Чистая прибыль',
      value: (finance.netProfit > 0 ? '+' : '') + fmt(finance.netProfit) + ' ₽',
      color: finance.netProfit >= 0
        ? 'text-emerald-600 dark:text-emerald-400'
        : 'text-red-600 dark:text-red-400',
      sub: `ROI ${finance.roi}%`,
    },
    {
      label: 'Маржа',
      value: finance.margin + ' %',
      color: finance.margin >= 15
        ? 'text-emerald-600 dark:text-emerald-400'
        : finance.margin >= 5
          ? 'text-amber-600 dark:text-amber-400'
          : 'text-red-600 dark:text-red-400',
      sub: 'прибыль / реализация',
    },
    {
      label: '% выкупа',
      value: finance.buyoutRate + ' %',
      color: finance.buyoutRate >= 60
        ? 'text-emerald-600 dark:text-emerald-400'
        : finance.buyoutRate >= 40
          ? 'text-amber-600 dark:text-amber-400'
          : 'text-red-600 dark:text-red-400',
      sub: 'норма WB 50–80%',
    },
    {
      label: 'Возвраты',
      value: fmt(finance.returns) + ' ₽',
      color: finance.returns > finance.revenue * 0.3
        ? 'text-red-600 dark:text-red-400'
        : 'text-zinc-700 dark:text-zinc-300',
      sub: finance.revenue > 0
        ? `${((finance.returns / finance.revenue) * 100).toFixed(1)}% от реализации`
        : '—',
    },
  ]

  return (
    <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-hidden">
      {/* Заголовок */}
      <div className="px-5 py-3 border-b border-zinc-100 dark:border-zinc-800 flex items-center gap-2">
        <span className="text-[11px] font-semibold text-zinc-400 uppercase tracking-widest">Финансы</span>
        <span className="text-xs text-zinc-500">{periodLabel}</span>
      </div>

      {/* 5 метрик */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 divide-x divide-y lg:divide-y-0 divide-zinc-100 dark:divide-zinc-800">
        {metrics.map(m => (
          <div key={m.label} className="p-5">
            <p className="text-[11px] text-zinc-400 font-medium uppercase tracking-widest mb-2">
              {m.label}
            </p>
            <p className={`text-2xl font-bold tabular-nums leading-none ${m.color}`}>
              {m.value}
            </p>
            {m.sub && (
              <p className="text-xs text-zinc-400 mt-1.5">{m.sub}</p>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
