import type { OverviewFinance } from '@/lib/queries-overview'

function fmt(n: number) {
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(0)}k`
  return String(n)
}

export function ProfitWaterfall({ finance }: { finance: OverviewFinance }) {
  const steps = [
    { label: 'Реализация', value: finance.revenue, type: 'positive' as const },
    { label: 'Себестоимость', value: -finance.cost, type: 'negative' as const },
    { label: 'Возвраты', value: -finance.returns, type: 'negative' as const },
    { label: 'Комиссия WB', value: -finance.commission, type: 'negative' as const },
    { label: 'Логистика', value: -finance.logistics, type: 'negative' as const },
    { label: 'Штрафы', value: -finance.penalties, type: 'negative' as const },
    { label: 'Доп. выплаты', value: finance.additional, type: 'positive' as const },
    { label: 'Чистая прибыль', value: finance.netProfit, type: finance.netProfit >= 0 ? 'result-pos' as const : 'result-neg' as const },
  ]

  const maxAbs = Math.max(...steps.map(s => Math.abs(s.value)))
  const maxWidth = 100 // %

  const colors = {
    positive: 'bg-green-500',
    negative: 'bg-red-400',
    'result-pos': 'bg-blue-500',
    'result-neg': 'bg-red-600',
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Profit Waterfall</h2>
        {finance.netPayable > 0 && (
          <span className="text-xs text-green-600 font-medium bg-green-500/10 rounded px-2 py-0.5">
            Выплата WB: {fmt(finance.netPayable)} ₽ · сверено
          </span>
        )}
      </div>
      <div className="rounded-xl border border-border bg-card p-5 space-y-2">
        {steps.map((step) => {
          if (step.value === 0 && step.label !== 'Чистая прибыль') return null
          const pct = maxAbs > 0 ? (Math.abs(step.value) / maxAbs) * maxWidth : 0
          return (
            <div key={step.label} className="flex items-center gap-3">
              <div className="w-28 text-xs text-right text-muted-foreground shrink-0">{step.label}</div>
              <div className="flex-1 h-6 flex items-center">
                <div
                  className={`h-full rounded-sm ${colors[step.type]} transition-all`}
                  style={{ width: `${pct}%`, minWidth: pct > 0 ? 2 : 0 }}
                />
              </div>
              <div className={`w-24 text-xs text-right font-mono tabular-nums shrink-0 ${
                step.type === 'negative' ? 'text-red-500' :
                step.type === 'result-neg' ? 'text-red-600 font-bold' :
                step.type === 'result-pos' ? 'text-blue-600 font-bold' :
                'text-green-600'
              }`}>
                {step.value > 0 ? '+' : ''}{fmt(step.value)} ₽
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
