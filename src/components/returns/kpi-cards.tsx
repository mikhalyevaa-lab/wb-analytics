'use client'

import { Card, CardContent } from '@/components/ui/card'
import { Hint } from '@/components/ui/hint'

interface ReturnsSummary {
  returns_28d: number
  sales_28d: number
  returns_sum: number
  buyout_rate: number | null
  low_buyout_sku_count: number
  is_preliminary: boolean
}

function fmtNum(n: number) {
  return n.toLocaleString('ru')
}
function fmtRub(n: number) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + ' млн ₽'
  if (n >= 1_000)     return (n / 1_000).toFixed(0) + ' тыс ₽'
  return n.toLocaleString('ru') + ' ₽'
}

function PrelimBadge() {
  return (
    <span className="ml-1.5 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-100 text-amber-700 cursor-default">
      предв.
    </span>
  )
}

function KpiCard({
  label,
  value,
  sub,
  color = 'neutral',
  hint,
  preliminary,
}: {
  label: string
  value: string
  sub?: string
  color?: 'neutral' | 'green' | 'red' | 'amber'
  hint?: React.ReactNode
  preliminary?: boolean
}) {
  const valueColor = {
    neutral: 'text-zinc-900 dark:text-zinc-100',
    green:   'text-green-600 dark:text-green-400',
    red:     'text-red-600 dark:text-red-400',
    amber:   'text-amber-600 dark:text-amber-400',
  }[color]

  return (
    <Card>
      <CardContent className="p-5">
        <p className="text-xs font-medium text-zinc-500 uppercase tracking-wide flex items-center gap-1">
          {label}
          {hint && <Hint width={240}>{hint}</Hint>}
        </p>
        <p className={`text-2xl font-bold mt-1.5 ${valueColor} flex items-center flex-wrap`}>
          {value}
          {preliminary && <PrelimBadge />}
        </p>
        {sub && <p className="text-xs text-zinc-400 mt-1">{sub}</p>}
      </CardContent>
    </Card>
  )
}

export function ReturnsKpiCards({ data, loading }: { data: ReturnsSummary | null; loading: boolean }) {
  if (loading || !data) {
    return (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map(i => (
          <Card key={i}><CardContent className="p-5"><div className="h-16 bg-zinc-100 dark:bg-zinc-800 rounded animate-pulse" /></CardContent></Card>
        ))}
      </div>
    )
  }

  const buyoutColor = data.buyout_rate == null
    ? 'neutral'
    : data.buyout_rate >= 60 ? 'green'
    : data.buyout_rate < 40  ? 'red'
    : 'amber'

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      <KpiCard
        label="Возвратов за 28 дней"
        value={fmtNum(data.returns_28d)}
        sub={`из ${fmtNum(data.sales_28d + data.returns_28d)} операций`}
        color="neutral"
        preliminary
        hint={<span>Количество возвратов (is_realization = true, сумма &lt; 0) за последние 28 дней.</span>}
      />
      <KpiCard
        label="Сумма возвратов"
        value={fmtRub(data.returns_sum)}
        sub="обратные выплаты WB"
        color={data.returns_sum > 50000 ? 'red' : 'neutral'}
        preliminary
      />
      <KpiCard
        label="% выкупа"
        value={data.buyout_rate != null ? data.buyout_rate.toFixed(1) + ' %' : '—'}
        sub="выкупы / (выкупы + возвраты)"
        color={buyoutColor}
        preliminary
        hint={
          <span>
            <strong>% выкупа</strong><br /><br />
            Выкупы ÷ (Выкупы + Возвраты) × 100%<br /><br />
            Зелёный ≥ 60%, красный &lt; 40%.
          </span>
        }
      />
      <KpiCard
        label="SKU с выкупом < 40%"
        value={fmtNum(data.low_buyout_sku_count)}
        sub="мин. 3 продажи за 28 дней"
        color={data.low_buyout_sku_count > 0 ? 'red' : 'green'}
        hint={<span>SKU, у которых доля выкупа меньше 40% при минимум 3 продажах за период.</span>}
      />
    </div>
  )
}
