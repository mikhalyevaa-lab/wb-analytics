import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-server'
import { getUserStoreIds } from '@/lib/queries'
import { adminDb } from '@/lib/db-compat'
import { db } from '@/lib/db'
import {
  getOverviewFinance,
  getInsights,
  getYesterdayOrders,
  getStocksAlerts,
  getDataQualityAlerts,
  getAbcRevenueShares,
} from '@/lib/queries-overview'

export const dynamic = 'force-dynamic'

function moscowDate(offsetDays = 0) {
  const d = new Date(Date.now() + 3 * 60 * 60 * 1000)
  d.setUTCDate(d.getUTCDate() - offsetDays)
  return d.toISOString().split('T')[0]
}

export async function GET(req: NextRequest) {
  const user = await requireAuth().catch(() => null)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const storeIds = await getUserStoreIds(user.id)
  if (!storeIds.length) return NextResponse.json({ error: 'No stores' }, { status: 404 })

  const { searchParams } = new URL(req.url)
  const dateFrom = searchParams.get('from') ?? moscowDate(30)
  const dateTo   = searchParams.get('to')   ?? moscowDate(0)

  const fromTs = dateFrom + 'T00:00:00.000Z'
  const toTs   = dateTo   + 'T23:59:59.999Z'

  // Предыдущий период той же длины — для дельты в VerdictBand/GlobalStatusBar
  const periodMs   = new Date(dateTo).getTime() - new Date(dateFrom).getTime()
  const prevDateTo   = new Date(new Date(dateFrom).getTime() - 86400000).toISOString().split('T')[0]
  const prevDateFrom = new Date(new Date(dateFrom).getTime() - periodMs - 86400000).toISOString().split('T')[0]

  const [finance, financePrev, insights, yesterday, stocks, quality, abc, salesRows, orderRows, tasksRes] = await Promise.all([
    getOverviewFinance(storeIds, dateFrom, dateTo),
    getOverviewFinance(storeIds, prevDateFrom, prevDateTo),
    getInsights(storeIds, dateFrom, dateTo),
    getYesterdayOrders(storeIds),
    getStocksAlerts(storeIds),
    getDataQualityAlerts(storeIds),
    getAbcRevenueShares(storeIds, dateFrom, dateTo),
    // Выкупы по дням за период
    db<{ day: string; revenue: number; sales: number }[]>`
      SELECT date_trunc('day', "date")::text AS day,
             COALESCE(SUM(for_pay), 0)       AS revenue,
             COUNT(*)::int                   AS sales
      FROM wb_sales
      WHERE store_id = ANY(${storeIds})
        AND "date" >= ${fromTs}::timestamptz
        AND "date" <= ${toTs}::timestamptz
      GROUP BY 1 ORDER BY 1
    `,
    // Заказы по дням за период
    db<{ day: string; orders: number }[]>`
      SELECT date_trunc('day', "date")::text AS day,
             COUNT(*)::int                   AS orders
      FROM wb_orders
      WHERE store_id = ANY(${storeIds})
        AND "date" >= ${fromTs}::timestamptz
        AND "date" <= ${toTs}::timestamptz
        AND is_cancel = false
      GROUP BY 1 ORDER BY 1
    `,
    adminDb()
      .from('tasks')
      .select('id, title, priority, status, due_date, nm_id')
      .in('store_id', storeIds)
      .neq('status', 'done')
      .order('priority', { ascending: true })
      .limit(20),
  ])

  // Объединяем продажи и заказы по дате
  const dayMap: Record<string, { date: string; revenue: number; orders: number; sales: number }> = {}
  for (const r of salesRows) {
    dayMap[r.day] = { date: r.day, revenue: Number(r.revenue), orders: 0, sales: Number(r.sales) }
  }
  for (const r of orderRows) {
    if (dayMap[r.day]) dayMap[r.day].orders = Number(r.orders)
    else dayMap[r.day] = { date: r.day, revenue: 0, orders: Number(r.orders), sales: 0 }
  }
  const dailySales = Object.values(dayMap).sort((a, b) => a.date.localeCompare(b.date))

  const tasks = (tasksRes.data ?? []) as {
    id: string; title: string; priority: 'low' | 'medium' | 'high' | 'critical'
    status: 'todo' | 'in_progress' | 'done'; due_date: string | null; nm_id: number | null
  }[]

  return NextResponse.json({
    finance,
    financePrev,
    insights,
    yesterday,
    stocks,
    quality,
    abc,
    dailySales,
    tasks,
    criticalTaskCount: tasks.filter(t => t.priority === 'critical' || t.priority === 'high').length,
  })
}
