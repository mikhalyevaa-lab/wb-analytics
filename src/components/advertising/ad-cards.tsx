'use client'

import { useState, useEffect, useCallback } from 'react'
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

const PRESETS = [
  { label: 'Сегодня', days: 0 },
  { label: '7 дн',   days: 7 },
  { label: '14 дн',  days: 14 },
  { label: '30 дн',  days: 30 },
  { label: '90 дн',  days: 90 },
]

function moscowDate(offsetDays = 0) {
  const d = new Date(Date.now() + 3 * 60 * 60 * 1000)
  d.setUTCDate(d.getUTCDate() - offsetDays)
  return d.toISOString().split('T')[0]
}

interface LiveStats {
  spend: number; views: number; clicks: number
  ordersCount: number; ordersSum: number
  ctr: number; cpc: number; cpm: number; ddr: number
}

function liveToAdStats(s: LiveStats): AdStats {
  return {
    spend: s.spend,
    ordersSum: s.ordersSum,
    ordersCount: s.ordersCount,
    ddr: s.ddr,
    ctr: s.ctr,
    views: s.views,
    clicks: s.clicks,
  }
}

function TodaySection() {
  const [activePreset, setActivePreset] = useState('Сегодня')
  const [stats, setStats] = useState<LiveStats | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async (from: string, to: string) => {
    setLoading(true)
    try {
      const res = await fetch(`/api/advertising/stats?from=${from}&to=${to}`)
      if (res.ok) setStats(await res.json())
    } finally { setLoading(false) }
  }, [])

  useEffect(() => {
    const today = moscowDate(0)
    load(today, today)
  }, [load])

  function applyPreset(label: string, days: number) {
    setActivePreset(label)
    const to = moscowDate(0)
    const from = days === 0 ? to : moscowDate(days)
    load(from, to)
  }

  const skeleton = (
    <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
      {Array.from({ length: 5 }).map((_, i) => (
        <Card key={i}><CardContent className="p-5 animate-pulse">
          <div className="h-3 bg-zinc-100 dark:bg-zinc-800 rounded w-2/3 mb-3" />
          <div className="h-7 bg-zinc-100 dark:bg-zinc-800 rounded w-3/4" />
        </CardContent></Card>
      ))}
    </div>
  )

  return (
    <div>
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div className="flex items-center gap-1.5">
          <h2 className="text-sm font-semibold text-zinc-500 uppercase tracking-wide">
            {activePreset === 'Сегодня' ? `Сегодня · ${new Date().toLocaleDateString('ru', { day: 'numeric', month: 'long' })}` : `За ${activePreset}`}
          </h2>
          <Hint width={300}>
            <strong>Рекламная статистика за период</strong><br /><br />
            Данные из WB API рекламы (wb_ad_spend). Включают все активные кампании магазина.<br /><br />
            <strong>Заказы по рекламе</strong> — заказы, атрибутированные WB к рекламным кампаниям. Могут отличаться от общих заказов магазина.<br /><br />
            WB хранит данные рекламы только за последние 90 дней.
          </Hint>
        </div>
        <div className="flex gap-1">
          {PRESETS.map(p => (
            <button key={p.label} onClick={() => applyPreset(p.label, p.days)}
              className={`px-3 py-1.5 rounded-lg text-sm border transition-colors ${
                activePreset === p.label
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'border-border text-zinc-500 dark:text-zinc-400 hover:bg-muted'
              }`}>
              {p.label}
            </button>
          ))}
        </div>
      </div>
      {loading || !stats ? skeleton : (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          <AdStatRow stats={liveToAdStats(stats)} />
        </div>
      )}
    </div>
  )
}

export function AdCards({ data }: { data: AdPageData }) {
  const basis = `${data.daysElapsed} из ${data.daysInMonth} дней`

  return (
    <div className="space-y-6">
      <TodaySection />

      {/* Текущий месяц */}
      <div>
        <div className="flex items-center gap-1.5 mb-3">
          <h2 className="text-sm font-semibold text-zinc-500 uppercase tracking-wide">
            Текущий месяц · {data.periodLabel}
          </h2>
          <Hint width={300}>
            Накопленные рекламные показатели с 1-го числа текущего месяца по сегодня. Обновляются при синхронизации рекламных данных.
          </Hint>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          <AdStatRow stats={data.month} />
        </div>
      </div>

      {/* Прогноз */}
      <div>
        <div className="flex items-center gap-1.5 mb-3">
          <h2 className="text-sm font-semibold text-zinc-500 uppercase tracking-wide">
            Прогноз на месяц · на {data.daysInMonth} дней
          </h2>
          <Hint width={280} align="left">
            {FORECAST_HINT(data.daysElapsed, data.daysInMonth)}
          </Hint>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          <AdStatRow stats={data.forecast} isForecast basis={basis} />
        </div>
      </div>
    </div>
  )
}
