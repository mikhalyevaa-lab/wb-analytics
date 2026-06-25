import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-server'
import { getUserStoreIds } from '@/lib/queries'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

function moscowToday() {
  const d = new Date(Date.now() + 3 * 60 * 60 * 1000)
  return d.toISOString().split('T')[0]
}
function moscowDaysAgo(n: number) {
  const d = new Date(Date.now() + 3 * 60 * 60 * 1000)
  d.setUTCDate(d.getUTCDate() - n)
  return d.toISOString().split('T')[0]
}

export async function GET(req: NextRequest) {
  const user = await requireAuth().catch(() => null)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const storeIds = await getUserStoreIds(user.id)
  if (!storeIds.length) return NextResponse.json({ error: 'No stores' }, { status: 404 })

  const { searchParams } = new URL(req.url)
  const dateTo   = searchParams.get('to')   ?? moscowToday()
  const dateFrom = searchParams.get('from') ?? dateTo // по умолчанию только сегодня

  const [funnel, ad] = await Promise.all([
    // Заказы и сумма заказов из воронки продаж
    db<{ orders: number; order_sum: number }[]>`
      SELECT COALESCE(SUM(order_count), 0) orders,
             COALESCE(SUM(order_sum), 0)   order_sum
      FROM wb_funnel
      WHERE store_id = ANY(${storeIds})
        AND date >= ${dateFrom}::date
        AND date <= ${dateTo}::date
    `,
    db<{ spend: number; clicks: number }[]>`
      SELECT COALESCE(SUM(spend), 0)  spend,
             COALESCE(SUM(clicks), 0) clicks
      FROM wb_ad_spend
      WHERE store_id = ANY(${storeIds})
        AND date >= ${dateFrom}::date
        AND date <= ${dateTo}::date
    `,
  ])

  const orders    = Number(funnel[0]?.orders    ?? 0)
  const orderSum  = Number(funnel[0]?.order_sum ?? 0)
  const adSpend   = Number(ad[0]?.spend         ?? 0)
  const clicks    = Number(ad[0]?.clicks        ?? 0)
  const costPerOrder = orders > 0 ? adSpend / orders : 0

  return NextResponse.json({
    dateFrom,
    dateTo,
    orders,
    order_sum: orderSum,
    ad_spend: adSpend,
    clicks,
    cost_per_order: Math.round(costPerOrder * 100) / 100,
  })
}
