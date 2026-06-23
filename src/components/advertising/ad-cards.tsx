'use client'

import { Card, CardContent } from '@/components/ui/card'
import { Hint } from '@/components/ui/hint'
import type { AdPageData, AdStats } from '@/lib/queries'

function fmtRub(n: number) {
  return n.toLocaleString('ru', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + ' ₽'
}
function fmtPct(n: number) {
  return n.toFixed(1) + ' %'
}
function fmtNum(n: number) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + ' млн'
  if (n >= 1_000) return (n / 1_000).toFixed(0) + ' тыс'
  return n.toLocaleString('ru')
}


const DDR_HINT = (
  <span>
    <strong>ДДР — доля рекламных расходов</strong>
    <br /><br />
    Затраты на рекламу ÷ Сумма заказов по кабинету × 100%
    <br /><br />
    Знаменатель — все заказы магазина за период (не только по рекламным кампаниям).
  </span>
)

function StatWithHint({ label, value, hint }: { label: string; value: string; hint?: React.ReactNode }) {
  return (
    <Card>
      <CardContent className="p-5">
        <p className="text-xs font-medium text-zinc-500 uppercase tracking-wide flex items-center gap-1">
          {label}
          {hint && <Hint width={260}>{hint}</Hint>}
        </p>
        <p className="text-2xl font-bold text-zinc-900 dark:text-zinc-100 mt-1.5">{value}</p>
      </CardContent>
    </Card>
  )
}

function ForecastStatWithHint({ label, value, basis, hint }: { label: string; value: string; basis: string; hint?: React.ReactNode }) {
  return (
    <Card className="border-dashed">
      <CardContent className="p-5">
        <p className="text-xs font-medium text-zinc-500 uppercase tracking-wide flex items-center gap-1">
          {label}
          {hint && <Hint width={260}>{hint}</Hint>}
        </p>
        <p className="text-2xl font-bold text-zinc-900 dark:text-zinc-100 mt-1.5">{value}</p>
        <p className="text-xs text-zinc-400 mt-1">{basis}</p>
      </CardContent>
    </Card>
  )
}

function AdStatRow({ stats, isForecast = false, basis = '' }: { stats: AdStats; isForecast?: boolean; basis?: string }) {
  const W = isForecast
    ? ({ label, value, hint }: { label: string; value: string; hint?: React.ReactNode }) =>
        <ForecastStatWithHint label={label} value={value} basis={basis} hint={hint} />
    : StatWithHint

  return (
    <>
      <W label="Реклама, руб"             value={fmtRub(stats.spend)} />
      <W label="Сумма заказов по рекламе" value={fmtRub(stats.ordersSum)} />
      <W label="Заказы по рекламе, шт"   value={stats.ordersCount.toLocaleString('ru')} />
      <W label="ДДР % по кабинету"       value={stats.ddr > 0 ? fmtPct(stats.ddr) : '—'} hint={DDR_HINT} />
      <W label="CTR"                     value={stats.ctr > 0 ? fmtPct(stats.ctr) : '—'} />
    </>
  )
}

const FORECAST_HINT = (daysElapsed: number, daysInMonth: number) => (
  <span>
    <strong>Прогноз на {daysInMonth} дней</strong>
    <br /><br />
    Среднее за день × {daysInMonth} дней
    <br /><br />
    Рассчитывается на основе {daysElapsed} прошедших дней текущего месяца.
    При равномерном темпе расходов.
  </span>
)

export function AdCards({ data }: { data: AdPageData }) {
  const today = new Date().toLocaleDateString('ru', { day: 'numeric', month: 'long', year: 'numeric' })
  const basis = `${data.daysElapsed} из ${data.daysInMonth} дней`

  return (
    <div className="space-y-6">
      {/* Сегодня */}
      <div>
        <h2 className="text-sm font-semibold text-zinc-500 uppercase tracking-wide mb-3">
          Сегодня · {today}
        </h2>
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          <AdStatRow stats={data.today} />
        </div>
      </div>

      {/* Текущий месяц */}
      <div>
        <h2 className="text-sm font-semibold text-zinc-500 uppercase tracking-wide mb-3">
          Текущий месяц · {data.periodLabel}
        </h2>
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          <AdStatRow stats={data.month} />
        </div>
      </div>

      {/* Прогноз */}
      <div>
        <h2 className="text-sm font-semibold text-zinc-500 uppercase tracking-wide mb-3 flex items-center gap-1.5">
          Прогноз на месяц · на {data.daysInMonth} дней
          <Hint width={280} align="left">
            {FORECAST_HINT(data.daysElapsed, data.daysInMonth)}
          </Hint>
        </h2>
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          <AdStatRow stats={data.forecast} isForecast basis={basis} />
        </div>
      </div>
    </div>
  )
}
