import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { getUserStoreIds } from '@/lib/queries'
import { adminDb } from '@/lib/admin'

function daysAgo(n: number) {
  const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().split('T')[0]
}

export async function GET(req: NextRequest) {
  const db = await createClient()
  const { data: { user } } = await db.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const storeIds = await getUserStoreIds(user.id)
  if (!storeIds.length) return NextResponse.json({ error: 'No store' }, { status: 404 })

  const url = req.nextUrl
  const dateFrom = url.searchParams.get('from') ?? daysAgo(30)
  const dateTo = url.searchParams.get('to') ?? new Date().toISOString().split('T')[0]

  const adb = adminDb()

  const [ordersRes, productsRes] = await Promise.all([
    adb.from('wb_orders')
      .select('nm_id, total_price, discount_percent')
      .in('store_id', storeIds)
      .eq('is_cancel', false)
      .gte('date', dateFrom)
      .lte('date', dateTo + 'T23:59:59')
      .limit(100000),

    adb.from('products')
      .select('nm_id, title, vendor_code, brand, subject_name, photo_url')
      .in('store_id', storeIds)
      .limit(5000),
  ])

  type OrderRow = { nm_id: number; total_price: number | null; discount_percent: number | null }
  type ProductRow = { nm_id: number; title: string | null; vendor_code: string | null; brand: string | null; subject_name: string | null; photo_url: string | null }
  const orders = (ordersRes.data ?? []) as OrderRow[]
  const products = (productsRes.data ?? []) as ProductRow[]

  const productMap = new Map(products.map(p => [p.nm_id, p]))

  // Aggregate per nm_id
  const aggMap = new Map<number, { orders: number; revenue: number }>()
  for (const o of orders) {
    const cur = aggMap.get(o.nm_id) ?? { orders: 0, revenue: 0 }
    aggMap.set(o.nm_id, {
      orders: cur.orders + 1,
      revenue: cur.revenue + (o.total_price ?? 0) * (1 - (o.discount_percent ?? 0) / 100),
    })
  }

  const rows = [...aggMap.entries()].map(([nm_id, agg]) => {
    const p = productMap.get(nm_id)
    return {
      nm_id,
      title: p?.title ?? '',
      vendor_code: p?.vendor_code ?? '',
      brand: p?.brand ?? '',
      subject_name: p?.subject_name ?? '',
      photo_url: p?.photo_url ?? null,
      orders: agg.orders,
      revenue: Math.round(agg.revenue),
    }
  })

  const topByOrders = [...rows].sort((a, b) => b.orders - a.orders).slice(0, 10)
  const topByRevenue = [...rows].sort((a, b) => b.revenue - a.revenue).slice(0, 10)

  return NextResponse.json({ topByOrders, topByRevenue })
}
