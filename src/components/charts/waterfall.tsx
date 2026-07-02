import type { OverviewFinance } from '@/lib/queries-overview'

function fmt(n: number) {
  if (Math.abs(n) >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M'
  if (Math.abs(n) >= 1_000) return (n / 1_000).toFixed(0) + 'k'
  return String(n)
}

/** Диаграмма 2 — Каскад прибыли: из чего складывается прибыль (рестайл Steep) */
export function Waterfall({ finance }: { finance: OverviewFinance }) {
  const steps = [
    { label: 'Реализация', value: finance.revenue, tone: 'base' as const },
    { label: 'Себестоимость', value: -finance.cost, tone: 'neg' as const },
    { label: 'Возвраты', value: -finance.returns, tone: 'neg' as const },
    { label: 'Логистика', value: -finance.logistics, tone: 'neg' as const },
    { label: 'Штрафы', value: -finance.penalties, tone: 'neg' as const },
    { label: 'Прибыль', value: finance.netProfit, tone: 'result' as const },
  ]
  const maxAbs = Math.max(1, ...steps.map(s => Math.abs(s.value)))
  const colors = {
    base: 'var(--app-cta-bg)', // не --app-ink: на тёмной теме нужен контраст с тёмной card-поверхностью
    neg: 'var(--app-dove)',
    result: 'var(--app-rust)',
  }

  return (
    <div className="space-y-2">
      {steps.map(step => {
        const pct = (Math.abs(step.value) / maxAbs) * 100
        return (
          <div key={step.label} className="flex items-center gap-3">
            <div className="w-24 text-[12px] text-right shrink-0" style={{ color: 'var(--app-graphite)' }}>{step.label}</div>
            <div className="flex-1 h-5 flex items-center">
              <div className="h-full rounded-sm transition-all" style={{ width: `${pct}%`, minWidth: pct > 0 ? 3 : 0, background: colors[step.tone] }} />
            </div>
            <div className="w-20 text-[12px] text-right tabular-nums shrink-0" style={{ color: step.tone === 'result' ? 'var(--app-rust)' : 'var(--app-ash)', fontWeight: step.tone === 'result' ? 600 : 400 }}>
              {step.value > 0 && step.tone !== 'base' ? '+' : ''}{fmt(step.value)} ₽
            </div>
          </div>
        )
      })}
    </div>
  )
}
