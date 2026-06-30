// @ts-nocheck
import { adminDb } from '@/lib/db-compat'
import { redirect } from 'next/navigation'
import { getServerSession } from '@/lib/auth-server'
import { getUserStoreIds } from '@/lib/queries'
import { IrpWidget } from '@/components/logistics/irp-widget'
import { LogisticsCosts } from '@/components/logistics/logistics-costs'
import { LogisticsCheck } from '@/components/logistics/logistics-check'
import { PageHeader } from '@/components/ui/page-header'

export const dynamic = 'force-dynamic'

function getMondayOfWeek(date = new Date()): string {
  const d = new Date(date)
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day
  d.setDate(d.getDate() + diff)
  return d.toISOString().split('T')[0]
}

export default async function LogisticsPage() {
  const session = await getServerSession()
  if (!session?.user) redirect('/login')
  const user = session.user

  const storeIds = await getUserStoreIds(user.id)
  if (!storeIds.length) redirect('/dashboard')

  const now = new Date()
  const thisMonday = getMondayOfWeek(now)

  // ISO week start/end
  const weekStart = thisMonday
  const weekEnd = now.toISOString().split('T')[0]

  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`

  // 30 days ago for per-unit calc
  const d30 = new Date(now)
  d30.setDate(d30.getDate() - 30)
  const date30ago = d30.toISOString().split('T')[0]

  const [indexRows, weekFinance, monthFinance, salesData, ordersData] = await Promise.all([
    // IRP indexes — last 8 weeks
    adminDb().from('wb_logistics_indexes')
      .select('week_date, irp, localization_index')
      .in('store_id', storeIds)
      .order('week_date', { ascending: false })
      .limit(8)
      .then(r => r.data ?? []),

    // Logistics cost this week (wb_finance uses date_from, sale_dt is null)
    adminDb().from('wb_finance')
      .select('delivery_rub')
      .in('store_id', storeIds)
      .gte('date_from', weekStart)
      .lte('date_from', weekEnd)
      .then(r => r.data ?? []),

    // Logistics cost this month
    adminDb().from('wb_finance')
      .select('delivery_rub')
      .in('store_id', storeIds)
      .gte('date_from', monthStart)
      .then(r => r.data ?? []),

    // Sales last 30 days for per-unit calc (count rows, wb_sales has no quantity field)
    adminDb().from('wb_sales')
      .select('id')
      .in('store_id', storeIds)
      .gte('date', date30ago)
      .then(r => r.data ?? []),

    // Orders for local orders calc (last 4 weeks)
    adminDb().from('wb_orders')
      .select('oblast_okrug_name, warehouse_name')
      .in('store_id', storeIds)
      .gte('date', getMondayOfWeek(new Date(now.getTime() - 28 * 86400000)))
      .eq('is_cancel', false)
      .then(r => r.data ?? []),
  ])

  const weekDelivery = weekFinance.reduce((s, r) => s + (r.delivery_rub ?? 0), 0)
  const monthDelivery = monthFinance.reduce((s, r) => s + (r.delivery_rub ?? 0), 0)

  const totalDelivery30 = (await adminDb().from('wb_finance')
    .select('delivery_rub')
    .in('store_id', storeIds)
    .gte('date_from', date30ago)
    .then(r => r.data ?? [])
  ).reduce((s, r) => s + (r.delivery_rub ?? 0), 0)

  const totalSales30 = salesData.length
  const perUnitDelivery = totalSales30 > 0 ? totalDelivery30 / totalSales30 : null

  // Local orders: orders where oblast_okrug_name contains keyword matching warehouse region
  // Simple heuristic: count orders grouped by oblast_okrug_name
  const regionCounts = new Map<string, number>()
  for (const o of ordersData) {
    const key = o.oblast_okrug_name ?? 'Не указан'
    regionCounts.set(key, (regionCounts.get(key) ?? 0) + 1)
  }
  const totalOrders = ordersData.length

  const topRegions = [...regionCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, count]) => ({
      name,
      count,
      pct: totalOrders > 0 ? (count / totalOrders) * 100 : 0,
    }))

  // Local = orders from the same federal district as "Москва" warehouse (most common)
  // Simple: top region = "local" proxy — show top region %
  const topRegionPct = topRegions[0]?.pct ?? 0

  // Check if current week has IRP data
  const thisWeekRow = indexRows.find(r => r.week_date === thisMonday)
  const hasPendingInput = !thisWeekRow?.irp && !thisWeekRow?.localization_index

  return (
    <div className="p-6 space-y-8 max-w-[1200px]">
      <PageHeader
        picto="logistics"
        title="Логистика"
        subtitle="Индексы WB и затраты на доставку"
      />

      <div className="space-y-4">
        <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">Индексы WB</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <IrpWidget rows={indexRows} hasPendingInput={hasPendingInput} />
        </div>
      </div>

      <LogisticsCosts
        weekDelivery={weekDelivery}
        monthDelivery={monthDelivery}
        perUnitDelivery={perUnitDelivery}
        localOrders={{
          pct: topRegionPct,
          prevPct: 0,
          topRegions,
        }}
      />

      <LogisticsCheck />
    </div>
  )
}
