'use client'

import { useState, useEffect, useCallback } from 'react'
import { StatusBanner }    from '@/components/dashboard/status-banner'
import { HeroKpiStrip }    from '@/components/dashboard/hero-kpi-strip'
import { SignalCards }     from '@/components/overview/signal-cards'
import { TodayCards }      from '@/components/dashboard/today-cards'
import { SalesChart }      from '@/components/dashboard/sales-chart'
import { TopProducts }     from '@/components/dashboard/top-products'
import { InsightsRow }     from '@/components/overview/insights-row'
import { ProfitWaterfall } from '@/components/overview/profit-waterfall'
import { TopTasks }        from '@/components/overview/top-tasks'
import { PageHeader }      from '@/components/ui/page-header'
import type { OverviewFinance, Insights, YesterdayOrders, StocksAlerts, DataQualityAlerts } from '@/lib/queries-overview'
import type { DailySales } from '@/lib/queries'

function moscowDate(offsetDays = 0) {
  const d = new Date(Date.now() + 3 * 60 * 60 * 1000)
  d.setUTCDate(d.getUTCDate() - offsetDays)
  return d.toISOString().split('T')[0]
}

const PRESETS = [
  { label: 'Сегодня', days: 0  },
  { label: '7 дн',    days: 7  },
  { label: '14 дн',   days: 14 },
  { label: '30 дн',   days: 30 },
  { label: '90 дн',   days: 90 },
]

interface Task {
  id: string; title: string; priority: 'low' | 'medium' | 'high' | 'critical'
  status: 'todo' | 'in_progress' | 'done'; due_date: string | null; nm_id: number | null
}

interface OverviewData {
  finance: OverviewFinance
  insights: Insights
  yesterday: YesterdayOrders
  stocks: StocksAlerts
  quality: DataQualityAlerts
  dailySales: DailySales[]
  tasks: Task[]
  criticalTaskCount: number
}

const EMPTY: OverviewData = {
  finance: { revenue:0,cost:0,commission:0,logistics:0,returns:0,penalties:0,additional:0,netProfit:0,netPayable:0,margin:0,roi:0,unitCount:0,profitPerUnit:0,buyoutRate:0 },
  insights: { worstProduct:null,bestProduct:null,bestRoi:null,highDrrCampaign:null,emptyStockSoon:null,returnsAmount:0,returnsShare:0,buyoutRate:0 },
  yesterday: { count:0,revenue:0,countPrevWeek:0,delta:0 },
  stocks: { critical:[],soon:[] },
  quality: { missingCost:0,missingToken:false },
  dailySales: [],
  tasks: [],
  criticalTaskCount: 0,
}

export default function DashboardPage() {
  const [dateFrom, setDateFrom]         = useState(moscowDate(30))
  const [dateTo, setDateTo]             = useState(moscowDate(0))
  const [activePreset, setActivePreset] = useState('30 дн')
  const [data, setData]                 = useState<OverviewData | null>(null)
  const [loading, setLoading]           = useState(true)

  const load = useCallback((from: string, to: string) => {
    setLoading(true)
    fetch(`/api/dashboard/overview?from=${from}&to=${to}`)
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  useEffect(() => { load(dateFrom, dateTo) }, []) // eslint-disable-line

  function applyPreset(label: string, days: number) {
    const from = days === 0 ? moscowDate(0) : moscowDate(days)
    const to   = moscowDate(0)
    setDateFrom(from); setDateTo(to); setActivePreset(label)
    load(from, to)
  }

  function applyRange() {
    setActivePreset('')
    load(dateFrom, dateTo)
  }

  const d = data ?? EMPTY
  const updatedAt = new Date().toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' })

  const periodLabel = activePreset
    ? `последние ${activePreset === 'Сегодня' ? '1 день' : activePreset}`
    : `${dateFrom} — ${dateTo}`

  return (
    <div className="space-y-5 p-6 max-w-[1400px]">

      <PageHeader picto="dashboard" title="Главная" subtitle={periodLabel}>
        {/* Пресеты */}
        {PRESETS.map(p => (
          <button
            key={p.label}
            onClick={() => applyPreset(p.label, p.days)}
            className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${
              activePreset === p.label
                ? 'bg-zinc-900 border-zinc-900 text-white dark:bg-zinc-100 dark:border-zinc-100 dark:text-zinc-900'
                : 'border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800'
            }`}
          >
            {p.label}
          </button>
        ))}

        {/* Произвольный диапазон */}
        <div className="flex items-center gap-1">
          <input
            type="date" value={dateFrom}
            onChange={e => { setDateFrom(e.target.value); setActivePreset('') }}
            className="px-2 py-1.5 text-sm border border-zinc-200 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <span className="text-zinc-400">—</span>
          <input
            type="date" value={dateTo}
            onChange={e => { setDateTo(e.target.value); setActivePreset('') }}
            className="px-2 py-1.5 text-sm border border-zinc-200 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          {!activePreset && (
            <button
              onClick={applyRange}
              className="px-3 py-1.5 text-sm bg-zinc-900 hover:bg-zinc-800 dark:bg-zinc-100 dark:hover:bg-zinc-200 dark:text-zinc-900 text-white rounded-lg transition-colors"
            >
              Применить
            </button>
          )}
        </div>
      </PageHeader>

      {/* 1 — Статус */}
      {!loading && (
        <StatusBanner
          stocks={d.stocks}
          quality={d.quality}
          criticalTaskCount={d.criticalTaskCount}
          updatedAt={`обновлено ${updatedAt}`}
        />
      )}
      {loading && <div className="h-10 bg-zinc-100 dark:bg-zinc-800 rounded-xl animate-pulse" />}

      {/* 2 — 4 сигнала */}
      {!loading && (
        <SignalCards
          yesterday={d.yesterday}
          stocks={d.stocks}
          quality={d.quality}
          taskCount={d.tasks.length}
          criticalTaskCount={d.criticalTaskCount}
        />
      )}
      {loading && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[1,2,3,4].map(i => (
            <div key={i} className="h-24 bg-zinc-100 dark:bg-zinc-800 rounded-xl animate-pulse" />
          ))}
        </div>
      )}

      {/* 3 — Финансовые KPI */}
      {!loading && (
        <HeroKpiStrip finance={d.finance} periodLabel={periodLabel} />
      )}
      {loading && <div className="h-36 bg-zinc-100 dark:bg-zinc-800 rounded-xl animate-pulse" />}

      {/* 4 — Операционные метрики (заказы/реклама) */}
      <TodayCards dateFrom={dateFrom} dateTo={dateTo} />

      {/* 5 — Waterfall + динамика продаж */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        {!loading
          ? <ProfitWaterfall finance={d.finance} />
          : <div className="h-64 bg-zinc-100 dark:bg-zinc-800 rounded-xl animate-pulse" />
        }
        <SalesChart data={d.dailySales} />
      </div>

      {/* 6 — Авто-инсайты */}
      {!loading && <InsightsRow insights={d.insights} />}

      {/* 7 — Топ товаров + задачи */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <TopProducts />
        </div>
        {!loading && <TopTasks tasks={d.tasks} />}
      </div>

    </div>
  )
}
