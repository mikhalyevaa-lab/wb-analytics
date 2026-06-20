'use client'

import { Card, CardContent } from '@/components/ui/card'
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

function AdStatRow({ stats, Wrapper = Stat }: { stats: AdStats; Wrapper?: typeof Stat }) {
  return (
    <>
      <Wrapper label="Реклама, руб"                value={fmtRub(stats.spend)} />
      <Wrapper label="Сумма заказов по рекламе"    value={fmtRub(stats.ordersSum)} />
      <Wrapper label="Заказы по рекламе, шт"       value={fmtNum(stats.ordersCount)} />
      <Wrapper label="ДДР % по кабинету"           value={stats.ddr > 0 ? fmtPct(stats.ddr) : '—'} />
      <Wrapper label="CTR"                         value={stats.ctr > 0 ? fmtPct(stats.ctr) : '—'} />
    </>
  )
}

export function AdCards({ data }: { data: AdPageData }) {
  const today = new Date().toLocaleDateString('ru', { day: 'numeric', month: 'long', year: 'numeric' })
  const basis = `${data.daysElapsed} из ${data.daysInMonth} дней`

  const ForecastWrapper = ({ label, value }: { label: string; value: string }) => (
    <ForecastStat label={label} value={value} basis={basis} />
  )

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
        <h2 className="text-sm font-semibold text-zinc-500 uppercase tracking-wide mb-3">
          Прогноз на месяц · на {data.daysInMonth} дней
        </h2>
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          <AdStatRow stats={data.forecast} Wrapper={ForecastWrapper} />
        </div>
      </div>
    </div>
  )
}
