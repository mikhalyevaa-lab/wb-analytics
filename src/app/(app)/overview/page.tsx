import { adminDb } from '@/lib/db-compat'
export const dynamic = 'force-dynamic'

import { getServerSession } from '@/lib/auth-server'
import { getUserStoreIds } from '@/lib/queries'
import { redirect } from 'next/navigation'
import {
  getOverviewFinance,
  getInsights,
  getYesterdayOrders,
  getStocksAlerts,
  getDataQualityAlerts,
  getOverviewDailySales,
} from '@/lib/queries-overview'
import { SignalCards } from '@/components/overview/signal-cards'
import { KpiCards } from '@/components/overview/kpi-cards'
import { InsightsRow } from '@/components/overview/insights-row'
import { YesterdayCards } from '@/components/overview/yesterday-cards'
import { ProfitWaterfall } from '@/components/overview/profit-waterfall'
import { OrdersChart } from '@/components/overview/orders-chart'
import { TopTasks } from '@/components/overview/top-tasks'
import { PageHeader } from '@/components/ui/page-header'

function startOfYear(): string {
  return `${new Date().getFullYear()}-01-01`
}

function today(): string {
  return new Date().toISOString().split('T')[0]
}

interface PageProps {
  searchParams: Promise<{ from?: string; to?: string }>
}

export default async function OverviewPage({ searchParams }: PageProps) {
  const sp = await searchParams
  const dateFrom = sp.from ?? startOfYear()
  const dateTo = sp.to ?? today()

  const session = await getServerSession()
  if (!session?.user) redirect('/login')
  const user = session.user

  const storeIds = await getUserStoreIds(user.id)
  if (!storeIds.length) redirect('/settings')

  const [finance, insights, yesterday, stocks, quality, dailySales, tasksRes] = await Promise.all([
    getOverviewFinance(storeIds, dateFrom, dateTo),
    getInsights(storeIds, dateFrom, dateTo),
    getYesterdayOrders(storeIds),
    getStocksAlerts(storeIds),
    getDataQualityAlerts(storeIds),
    getOverviewDailySales(storeIds),
    adminDb()
      .from('tasks')
      .select('id, title, priority, status, due_date, nm_id')
      .in('store_id', storeIds)
      .neq('status', 'done')
      .order('priority', { ascending: true })
      .limit(20),
  ])

  const tasks = (tasksRes.data ?? []) as {
    id: string; title: string; priority: 'low' | 'medium' | 'high' | 'critical'
    status: 'todo' | 'in_progress' | 'done'; due_date: string | null; nm_id: number | null
  }[]

  const criticalTaskCount = tasks.filter(t => t.priority === 'critical' || t.priority === 'high').length

  const periodLabel = sp.from
    ? `${dateFrom} — ${dateTo}`
    : `С начала ${new Date().getFullYear()} года`

  return (
    <div className="p-6 space-y-8 max-w-7xl mx-auto">
      <PageHeader picto="overview" title="Обзор" subtitle={periodLabel}>
        {[
          { label: 'С начала года', href: '/overview' },
          { label: '30 дней', href: `/overview?from=${(() => { const d = new Date(); d.setDate(d.getDate() - 30); return d.toISOString().split('T')[0] })()}&to=${today()}` },
          { label: '90 дней', href: `/overview?from=${(() => { const d = new Date(); d.setDate(d.getDate() - 90); return d.toISOString().split('T')[0] })()}&to=${today()}` },
        ].map(p => (
          <a key={p.label} href={p.href} className="text-xs px-3 py-1.5 rounded-lg border border-border hover:bg-muted transition-colors">
            {p.label}
          </a>
        ))}
      </PageHeader>

      {/* Block 1: Signal cards */}
      <SignalCards
        yesterday={yesterday}
        stocks={stocks}
        quality={quality}
        taskCount={tasks.length}
        criticalTaskCount={criticalTaskCount}
      />

      {/* Block 2: KPI cards */}
      <KpiCards finance={finance} yesterday={yesterday} />

      {/* Block 3: Insights */}
      <InsightsRow insights={insights} />

      {/* Block 4: Yesterday */}
      <YesterdayCards yesterday={yesterday} criticalTaskCount={criticalTaskCount} />

      {/* Block 5+6: Waterfall + Chart side by side on wide screens */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <ProfitWaterfall finance={finance} />
        <OrdersChart data={dailySales} />
      </div>

      {/* Block 7: Top tasks */}
      <TopTasks tasks={tasks} />
    </div>
  )
}
