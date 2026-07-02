'use client'

import { Card, CardContent } from '@/components/ui/card'
import { Hint } from '@/components/ui/hint'

interface ReturnsSummary {
  days: number
  returns_nd: number
  sales_nd: number
  returns_sum: number
  return_rate: number | null
  above_avg_sku_count: number
  avg_return_rate: number
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
  label, value, sub, color = 'neutral', hint, preliminary, onClick,
}: {
  label: string
  value: string
  sub?: string
  color?: 'neutral' | 'green' | 'red' | 'amber'
  hint?: React.ReactNode
  preliminary?: boolean
  onClick?: () => void
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
        {onClick ? (
          <button
            onClick={onClick}
            className={`text-2xl font-bold mt-1.5 ${valueColor} flex items-center flex-wrap hover:underline underline-offset-2 cursor-pointer`}
          >
            {value}
            {preliminary && <PrelimBadge />}
          </button>
        ) : (
          <p className={`text-2xl font-bold mt-1.5 ${valueColor} flex items-center flex-wrap`}>
            {value}
            {preliminary && <PrelimBadge />}
          </p>
        )}
        {sub && <p className="text-xs text-zinc-400 mt-1">{sub}</p>}
      </CardContent>
    </Card>
  )
}

export function ReturnsKpiCards({
  data,
  loading,
  onClickAboveAvg,
}: {
  data: ReturnsSummary | null
  loading: boolean
  onClickAboveAvg?: () => void
}) {
  if (loading || !data) {
    return (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map(i => (
          <Card key={i}><CardContent className="p-5"><div className="h-16 bg-zinc-100 dark:bg-zinc-800 rounded animate-pulse" /></CardContent></Card>
        ))}
      </div>
    )
  }

  const returnColor = data.return_rate == null
    ? 'neutral'
    : data.return_rate <= 3 ? 'green'
    : data.return_rate <= 7 ? 'amber'
    : 'red'

  const days = data.days

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      <KpiCard
        label={`Возвратов за ${days} дней`}
        value={fmtNum(data.returns_nd)}
        sub={`из ${fmtNum(data.sales_nd + data.returns_nd)} операций`}
        color="neutral"
        preliminary
        hint={<span>Количество возвратов (for_pay &lt; 0) за последние {days} дней.</span>}
      />
      <KpiCard
        label="Сумма возвратов"
        value={fmtRub(data.returns_sum)}
        sub="обратные выплаты WB"
        color={data.returns_sum > 50000 ? 'red' : 'neutral'}
        preliminary
      />
      <KpiCard
        label="% возврата"
        value={data.return_rate != null ? data.return_rate.toFixed(1) + ' %' : '—'}
        sub="возвраты / (продажи + возвраты)"
        color={returnColor}
        preliminary
        hint={
          <span>
            <strong>% возврата</strong><br /><br />
            Возвраты ÷ (Продажи + Возвраты) × 100%<br /><br />
            Зелёный ≤ 3%, жёлтый ≤ 7%, красный &gt; 7%.
          </span>
        }
      />
      <KpiCard
        label="SKU выше среднего"
        value={fmtNum(data.above_avg_sku_count)}
        sub={`среднее 2026: ${data.avg_return_rate.toFixed(1)}%`}
        color={data.above_avg_sku_count > 0 ? 'amber' : 'green'}
        onClick={onClickAboveAvg}
        hint={
          <span>
            SKU периода с % возврата выше среднего за 2026 год ({data.avg_return_rate.toFixed(1)}%).
            Мин. 3 операции. Нажмите чтобы перейти к списку.
          </span>
        }
      />
    </div>
  )
}
