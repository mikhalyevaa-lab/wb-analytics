import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-server'
import { adminDb } from '@/lib/db-compat'
import { getUserStoreIds } from '@/lib/queries'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const user = await requireAuth().catch(() => null)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const storeIds = await getUserStoreIds(user.id)
    if (!storeIds.length) return NextResponse.json({ weeks: [] })

    const adb = adminDb()

    // Группируем по report_number — берём только строки с доставками
    const { data, error } = await adb
      .from('wb_weekly_report_rows')
      .select('report_number, order_date, sale_date')
      .in('store_id', storeIds)
      .not('delivery_service_cost', 'is', null)
      .gt('delivery_service_cost', 0)
      .gt('deliveries_count', 0)
      .not('report_number', 'is', null)

    if (error) throw new Error(error.message)

    // Агрегируем по report_number
    const map = new Map<number, { min_date: string; max_date: string; count: number }>()
    for (const row of data ?? []) {
      const rn = row.report_number as number
      const d = row.sale_date ?? row.order_date
      if (!d) continue
      const existing = map.get(rn)
      if (!existing) {
        map.set(rn, { min_date: d, max_date: d, count: 1 })
      } else {
        existing.count++
        if (d < existing.min_date) existing.min_date = d
        if (d > existing.max_date) existing.max_date = d
      }
    }

    const weeks = [...map.entries()]
      .map(([report_number, v]) => ({ report_number, ...v }))
      .sort((a, b) => b.max_date.localeCompare(a.max_date))

    return NextResponse.json({ weeks })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
