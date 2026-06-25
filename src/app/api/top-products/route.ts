import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-server'
import { getUserStoreIds } from '@/lib/queries'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

function moscowDaysAgo(n: number) {
  const d = new Date(Date.now() + 3 * 60 * 60 * 1000)
  d.setUTCDate(d.getUTCDate() - n)
  return d.toISOString().split('T')[0]
}
function moscowToday() { return moscowDaysAgo(0) }

export async function GET(req: NextRequest) {
  const user = await requireAuth().catch(() => null)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const storeIds = await getUserStoreIds(user.id)
  if (!storeIds.length) return NextResponse.json({ error: 'No store' }, { status: 404 })

  const { searchParams } = new URL(req.url)
  const dateFrom = searchParams.get('from') ?? moscowDaysAgo(30)
  const dateTo   = searchParams.get('to')   ?? moscowToday()

  // Топ по заказам — из воронки продаж (order_count, order_sum)
  const funnelRows = await db<{
    nm_id: number
    orders: number
    order_sum: number
  }[]>`
    SELECT nm_id,
           COALESCE(SUM(order_count), 0)::int AS orders,
           COALESCE(SUM(order_sum),   0)      AS order_sum
    FROM wb_funnel
    WHERE store_id = ANY(${storeIds})
      AND date >= ${dateFrom}::date
      AND date <= ${dateTo}::date
    GROUP BY nm_id
    HAVING SUM(order_count) > 0
    ORDER BY orders DESC
    LIMIT 50
  `

  // Топ по выручке — из wb_sales (for_pay > 0 = выкупы)
  const salesRows = await db<{
    nm_id: number
    revenue: number
  }[]>`
    SELECT nm_id,
           COALESCE(SUM(for_pay), 0) AS revenue
    FROM wb_sales
    WHERE store_id = ANY(${storeIds})
      AND is_realization = true
      AND for_pay > 0
      AND date >= ${dateFrom}::date
      AND date <= (${dateTo}::date + INTERVAL '1 day')
    GROUP BY nm_id
    HAVING SUM(for_pay) > 0
    ORDER BY revenue DESC
    LIMIT 50
  `

  // Справочник товаров
  const nmIds = [...new Set([
    ...funnelRows.map(r => r.nm_id),
    ...salesRows.map(r => r.nm_id),
  ])]

  const products = nmIds.length
    ? await db<{
        nm_id: number
        title: string | null
        vendor_code: string | null
        brand: string | null
        subject_name: string | null
        photo_url: string | null
      }[]>`
        SELECT nm_id, title, vendor_code, brand, subject_name, photo_url
        FROM products
        WHERE store_id = ANY(${storeIds}) AND nm_id = ANY(${nmIds})
      `
    : []

  const prodMap = new Map(products.map(p => [Number(p.nm_id), p]))

  const topByOrders = funnelRows.slice(0, 10).map(r => {
    const p = prodMap.get(Number(r.nm_id))
    return {
      nm_id:        Number(r.nm_id),
      title:        p?.title        ?? '',
      vendor_code:  p?.vendor_code  ?? String(r.nm_id),
      brand:        p?.brand        ?? '',
      subject_name: p?.subject_name ?? '',
      photo_url:    p?.photo_url    ?? null,
      orders:       Number(r.orders),
      revenue:      Math.round(Number(r.order_sum)),
    }
  })

  const topByRevenue = salesRows.slice(0, 10).map(r => {
    const p = prodMap.get(Number(r.nm_id))
    return {
      nm_id:        Number(r.nm_id),
      title:        p?.title        ?? '',
      vendor_code:  p?.vendor_code  ?? String(r.nm_id),
      brand:        p?.brand        ?? '',
      subject_name: p?.subject_name ?? '',
      photo_url:    p?.photo_url    ?? null,
      orders:       0,
      revenue:      Math.round(Number(r.revenue)),
    }
  })

  return NextResponse.json({ topByOrders, topByRevenue, dateFrom, dateTo })
}
