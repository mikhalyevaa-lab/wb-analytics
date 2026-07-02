'use client'

import { useState, useEffect, useCallback, Suspense } from 'react'
import { TodayCards }      from '@/components/dashboard/today-cards'
import { SalesChart }      from '@/components/dashboard/sales-chart'
import { TopProducts }     from '@/components/dashboard/top-products'
import { InsightsRow }     from '@/components/overview/insights-row'
import { TopTasks }        from '@/components/overview/top-tasks'
import { SectionShell }    from '@/components/layout/section-shell'
import type { StatusTone } from '@/components/layout/global-status-bar'
import { VerdictBand }     from '@/components/overview/verdict-band'
import { SignalCard }      from '@/components/overview/signal-card'
import { ChartCard }       from '@/components/charts/chart-card'
import { Pulse }           from '@/components/charts/pulse'
import { Waterfall }       from '@/components/charts/waterfall'
import { BuyoutGauge }     from '@/components/charts/buyout-gauge'
import { RunwayBars }      from '@/components/charts/runway-bars'
import { AbcRibbon }       from '@/components/charts/abc-ribbon'
import { MetricGraph, type MetricValue } from '@/components/overview/metric-graph'
import { usePeriod, PERIOD_PRESETS } from '@/lib/hooks/use-period'
import type { MetricId } from '@/lib/metricGraph'
import type { OverviewFinance, Insights, YesterdayOrders, StocksAlerts, DataQualityAlerts, AbcShares } from '@/lib/queries-overview'
import type { DailySales } from '@/lib/queries'

interface Task {
  id: string; title: string; priority: 'low' | 'medium' | 'high' | 'critical'
  status: 'todo' | 'in_progress' | 'done'; due_date: string | null; nm_id: number | null
}

interface OverviewData {
  finance: OverviewFinance
  financePrev: OverviewFinance
  insights: Insights
  yesterday: YesterdayOrders
  stocks: StocksAlerts
  quality: DataQualityAlerts
  abc: AbcShares
  dailySales: DailySales[]
  tasks: Task[]
  criticalTaskCount: number
}

const EMPTY_FINANCE: OverviewFinance = { revenue:0,cost:0,commission:0,logistics:0,returns:0,penalties:0,additional:0,netProfit:0,netPayable:0,margin:0,roi:0,unitCount:0,profitPerUnit:0,buyoutRate:0 }
const EMPTY: OverviewData = {
  finance: EMPTY_FINANCE,
  financePrev: EMPTY_FINANCE,
  insights: { worstProduct:null,bestProduct:null,bestRoi:null,highDrrCampaign:null,emptyStockSoon:null,returnsAmount:0,returnsShare:0,buyoutRate:0 },
  yesterday: { count:0,revenue:0,countPrevWeek:0,delta:0 },
  stocks: { critical:[],soon:[] },
  quality: { missingCost:0,missingToken:false },
  abc: { A:{count:0,skuShare:0,revenueShare:0}, B:{count:0,skuShare:0,revenueShare:0}, C:{count:0,skuShare:0,revenueShare:0}, totalSku:0 },
  dailySales: [],
  tasks: [],
  criticalTaskCount: 0,
}

function fmtHero(n: number) {
  const sign = n > 0 ? '+' : ''
  if (Math.abs(n) >= 1_000_000) return `${sign}${(n / 1_000_000).toFixed(1)} M ₽`
  if (Math.abs(n) >= 1_000) return `${sign}${(n / 1_000).toFixed(0)} k ₽`
  return `${sign}${n} ₽`
}

function DashboardContent() {
  const { dateFrom, dateTo, preset, setPreset, setRange, periodLabel } = usePeriod()
  const [data, setData]     = useState<OverviewData | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback((from: string, to: string) => {
    setLoading(true)
    fetch(`/api/dashboard/overview?from=${from}&to=${to}`)
      .then(r => r.ok ? r.json() : Promise.reject(new Error(String(r.status))))
      .then((d: OverviewData) => { setData(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  useEffect(() => { load(dateFrom, dateTo) }, [dateFrom, dateTo, load])

  const d = data ?? EMPTY
  const tasks = d.tasks ?? []

  // Вердикт: тон и текст по чистой прибыли и дельте к предыдущему периоду
  const profitDelta = d.finance.netProfit - d.financePrev.netProfit
  const hasRisk = d.stocks.critical.length > 0
  const tone: StatusTone = d.finance.netProfit < 0 || hasRisk ? (hasRisk && d.finance.netProfit >= 0 ? 'warn' : 'down') : 'up'
  const verdictText = tone === 'up'
    ? `Магазин ${d.finance.netProfit >= 0 ? 'в плюсе' : 'в минусе'}${hasRisk ? `, есть риск по складу — ${d.stocks.critical.length} SKU` : ''}.`
    : tone === 'warn'
      ? `Прибыль есть, но ${d.stocks.critical.length} SKU скоро закончится на складе.`
      : `Магазин в минусе за период — стоит разобрать причины ниже.`

  const pulseData = d.dailySales.map(r => ({ date: r.date, revenue: r.revenue, orders: r.orders }))

  // Значения для графа связей метрик (Ф3)
  const revenueDelta = d.finance.revenue - d.financePrev.revenue
  const graphValues: Record<MetricId, MetricValue> = {
    profit: {
      value: fmtHero(d.finance.netProfit), tone,
      delta: `${profitDelta >= 0 ? '+' : ''}${fmtHero(profitDelta).replace('+', '')} к пред. периоду`,
      note: 'Итог всей воронки — то, что реально остаётся. Зависит от выручки, рекламы и возвратов.',
    },
    revenue: {
      value: fmtHero(d.finance.revenue).replace('+', ''), tone: revenueDelta >= 0 ? 'up' : 'down',
      delta: `${revenueDelta >= 0 ? '+' : ''}${fmtHero(revenueDelta).replace('+', '')}`,
      note: 'Оплаченные заказы. Зависит от объёма заказов и процента выкупа.',
    },
    orders: {
      value: `${d.yesterday.count} вчера`, tone: d.yesterday.delta >= 0 ? 'up' : 'down',
      delta: `${d.yesterday.delta >= 0 ? '+' : ''}${d.yesterday.delta} к пред. нед.`,
      note: 'Спрос. Питается рекламой и одновременно расходует складские остатки.',
    },
    buyout: {
      value: `${d.finance.buyoutRate}%`, tone: d.finance.buyoutRate >= 50 ? 'up' : 'warn',
      delta: d.finance.buyoutRate >= 50 ? 'в норме WB' : 'ниже нормы',
      note: 'Доля выкупленных заказов. Каждый процент возвратов снижает выручку.',
    },
    returns: {
      value: `${d.insights.returnsShare}%`, tone: d.insights.returnsShare > 30 ? 'down' : 'warn',
      delta: 'от реализации',
      note: 'Каждый возврат — минус выручка и плюс логистика.',
    },
    ads: {
      value: d.insights.highDrrCampaign ? `ДРР ${d.insights.highDrrCampaign.drr}%` : 'в норме',
      tone: d.insights.highDrrCampaign ? 'warn' : 'up',
      delta: d.insights.highDrrCampaign?.campaign_name ?? 'аномалий нет',
      note: 'Доля рекламы в выручке. Двигатель заказов и одновременно расход прибыли.',
    },
    stock: {
      value: d.stocks.critical.length > 0 ? `${d.stocks.critical.length} SKU в риске` : 'в порядке',
      tone: d.stocks.critical.length > 0 ? 'down' : 'up',
      delta: d.stocks.critical.length > 0 ? `${d.stocks.critical[0]?.days_of_stock ?? 0} дней до 0` : 'запасов хватает',
      note: 'Скорость продаж съедает остатки. Риск потерять выручку при пустом складе.',
    },
  }
  const periodQuery = new URLSearchParams({ from: dateFrom, to: dateTo, ...(preset ? { preset } : {}) }).toString()

  return (
    <SectionShell>
      {/* Заголовок раздела */}
      <div>
        <p className="text-[13px] font-semibold uppercase tracking-wider" style={{ color: 'var(--app-graphite)' }}>Обзор</p>
        <h1 style={{ fontFamily: 'var(--app-font-serif)', fontSize: 32, color: 'var(--app-text)', marginTop: 4 }}>Главная</h1>
      </div>

      {/* Пресеты периода */}
      <div className="flex items-center gap-2 flex-wrap">
        {PERIOD_PRESETS.map(p => (
          <button
            key={p.label}
            onClick={() => setPreset(p.label, p.days)}
            className="px-3 py-1.5 text-[14px] rounded-full transition-colors"
            style={{
              background: preset === p.label ? 'var(--app-cta-bg)' : 'transparent',
              color: preset === p.label ? 'var(--app-cta-text)' : 'var(--app-graphite)',
              border: preset === p.label ? 'none' : '1px solid var(--app-dove)',
            }}
          >
            {p.label}
          </button>
        ))}
        <div className="flex items-center gap-1 ml-2">
          <input type="date" value={dateFrom} onChange={e => setRange(e.target.value, dateTo)}
            className="px-2 py-1.5 text-[14px] rounded-lg" style={{ border: '1px solid var(--app-dove)' }} />
          <span style={{ color: 'var(--app-dove)' }}>—</span>
          <input type="date" value={dateTo} onChange={e => setRange(dateFrom, e.target.value)}
            className="px-2 py-1.5 text-[14px] rounded-lg" style={{ border: '1px solid var(--app-dove)' }} />
        </div>
      </div>

      {/* Герой-вердикт */}
      {!loading && (
        <VerdictBand
          verdict={verdictText}
          value={fmtHero(d.finance.netProfit)}
          delta={`${profitDelta >= 0 ? '+' : ''}${fmtHero(profitDelta).replace('+', '')} к пред. периоду`}
          tone={tone}
          note={periodLabel}
        />
      )}
      {loading && <div className="h-32 rounded-[24px] animate-pulse" style={{ background: 'var(--app-fog)' }} />}

      {/* Строка-светофор — 4 сигнала */}
      {!loading && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <SignalCard picto="funnel" label="Продажи" value={`${d.yesterday.count} заказов`}
            sub={`${d.yesterday.delta >= 0 ? '+' : ''}${d.yesterday.delta} к пред. нед.`}
            tone={d.yesterday.delta >= 0 ? 'up' : 'down'} href="/rnp" />
          <SignalCard picto="supplies" label="Запасы" value={d.stocks.critical.length > 0 ? `${d.stocks.critical.length} SKU` : 'Всё в порядке'}
            sub={d.stocks.critical.length > 0 ? 'критично, < 14 дн' : 'запасов хватает'}
            tone={d.stocks.critical.length > 0 ? 'down' : 'up'} href="/supplies" />
          <SignalCard picto="advertising" label="Реклама" value={d.insights.highDrrCampaign ? `ДРР ${d.insights.highDrrCampaign.drr}%` : 'В норме'}
            sub={d.insights.highDrrCampaign?.campaign_name ?? 'без аномалий'}
            tone={d.insights.highDrrCampaign ? 'warn' : 'up'} href="/advertising" />
          <SignalCard picto="quality" label="Данные" value={d.quality.missingCost > 0 ? `${d.quality.missingCost} без с/с` : 'Данные полные'}
            sub={d.quality.missingCost > 0 ? 'заполните себестоимость' : 'всё подключено'}
            tone={d.quality.missingCost > 0 ? 'warn' : 'up'} href="/quality" />
        </div>
      )}
      {loading && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[1,2,3,4].map(i => <div key={i} className="h-28 rounded-[24px] animate-pulse" style={{ background: 'var(--app-fog)' }} />)}
        </div>
      )}

      {/* Граф связей метрик */}
      {!loading && (
        <div className="pt-2">
          <p className="text-[13px] font-semibold uppercase tracking-wider" style={{ color: 'var(--app-graphite)' }}>Взаимосвязи</p>
          <h2 style={{ fontFamily: 'var(--app-font-serif)', fontSize: 26, color: 'var(--app-text)', margin: '4px 0 14px' }}>Все данные — один организм</h2>
          <MetricGraph values={graphValues} periodQuery={periodQuery} />
        </div>
      )}

      {/* Разделитель «Разобрать детали» */}
      <div className="flex items-center gap-3 pt-2">
        <span className="text-[13px] font-medium uppercase tracking-wide" style={{ color: 'var(--app-graphite)' }}>Разобрать детали</span>
        <span className="flex-1 h-px" style={{ background: '#ededef' }} />
      </div>

      {/* 5 канонических диаграмм */}
      {!loading && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <ChartCard picto="dashboard" title="Пульс выручки и заказов" meta={periodLabel} variant="warm" span={2}>
            <Pulse data={pulseData} />
          </ChartCard>
          <ChartCard picto="pnl" title="Каскад прибыли">
            <Waterfall finance={d.finance} />
          </ChartCard>
          <ChartCard picto="funnel" title="Радар выкупа">
            <BuyoutGauge buyoutRate={d.finance.buyoutRate} returnsShare={d.insights.returnsShare} />
          </ChartCard>
          <ChartCard picto="supplies" title="Запас хода, дней">
            <RunwayBars items={[...d.stocks.critical, ...d.stocks.soon]} />
          </ChartCard>
          <ChartCard picto="abc" title="ABC-вклад">
            <AbcRibbon abc={d.abc} />
          </ChartCard>
        </div>
      )}
      {loading && <div className="h-96 rounded-[24px] animate-pulse" style={{ background: 'var(--app-fog)' }} />}

      {/* Ниже — существующие блоки (легаси-стиль, редизайн в следующих фазах) */}
      <TodayCards dateFrom={dateFrom} dateTo={dateTo} />
      <SalesChart data={d.dailySales} />
      {!loading && <InsightsRow insights={d.insights} />}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <TopProducts />
        </div>
        {!loading && <TopTasks tasks={tasks} />}
      </div>
    </SectionShell>
  )
}

export default function DashboardPage() {
  return (
    <Suspense fallback={<div className="p-6">Загрузка…</div>}>
      <DashboardContent />
    </Suspense>
  )
}
