import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { getUserStoreIds } from '@/lib/queries'
import { adminDb } from '@/lib/admin'

export const dynamic = 'force-dynamic'

async function fetchAllRows<T>(
  buildQuery: (from: number) => Promise<{ data: T[] | null }>,
  pageSize = 5000
): Promise<T[]> {
  const all: T[] = []
  let from = 0
  while (true) {
    const { data } = await buildQuery(from)
    if (!data?.length) break
    all.push(...data)
    if (data.length < pageSize) break
    from += pageSize
  }
  return all
}

export async function GET(req: Request) {
  const db = await createClient()
  const { data: { user } } = await db.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const storeIds = await getUserStoreIds(user.id)
  if (!storeIds.length) return NextResponse.json({ error: 'No store' }, { status: 404 })

  const { searchParams } = new URL(req.url)
  const adb = adminDb()

  let dateFrom: string
  let dateTo: string
  const paramFrom = searchParams.get('dateFrom')
  const paramTo   = searchParams.get('dateTo')
  if (paramFrom && paramTo) {
    dateFrom = paramFrom
    dateTo   = paramTo
  } else {
    const days = Math.min(parseInt(searchParams.get('days') ?? '30'), 365)
    dateTo   = new Date().toISOString().split('T')[0]
    dateFrom = new Date(Date.now() - days * 86400000).toISOString().split('T')[0]
  }

  // Дата последней записи
  const { data: lastRow } = await (adb.from('wb_storage_daily') as any)
    .select('date, created_at')
    .in('store_id', storeIds)
    .order('created_at', { ascending: false })
    .limit(1)
    .single()
  const lastDate: string | null   = (lastRow as { date?: string; created_at?: string } | null)?.date ?? null
  const lastSyncAt: string | null = (lastRow as { date?: string; created_at?: string } | null)?.created_at ?? null

  // Все строки за период с пагинацией
  type RawRow = { date: string; nm_id: number | null; vendor_code: string | null; subject: string | null; brand: string | null; cost: number | null; volume: number | null }

  const allRows = await fetchAllRows<RawRow>(from =>
    (adb.from('wb_storage_daily') as any)
      .select('date, nm_id, vendor_code, subject, brand, cost, volume')
      .in('store_id', storeIds)
      .gte('date', dateFrom)
      .lte('date', dateTo)
      .order('date', { ascending: true })
      .range(from, from + 4999)
  )

  // Агрегат по дням для графика
  const dayMap = new Map<string, number>()
  for (const r of allRows) {
    if (!r.date) continue
    dayMap.set(r.date, (dayMap.get(r.date) ?? 0) + (r.cost ?? 0))
  }
  const byDate = Array.from(dayMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, cost]) => ({ date, cost: Math.round(cost * 100) / 100 }))

  // Реальное кол-во дней с данными (для среднего)
  const actualDays = dayMap.size

  // Агрегат по nm_id
  const skuMap = new Map<number, {
    nm_id: number; vendor_code: string | null; subject: string | null; brand: string | null
    cost_total: number; volume_avg: number; date_count: number
  }>()
  for (const r of allRows) {
    if (!r.nm_id) continue
    const cur = skuMap.get(r.nm_id)
    if (cur) {
      cur.cost_total  += r.cost ?? 0
      cur.volume_avg  += r.volume ?? 0
      cur.date_count  += 1
    } else {
      skuMap.set(r.nm_id, {
        nm_id:       r.nm_id,
        vendor_code: r.vendor_code,
        subject:     r.subject,
        brand:       r.brand,
        cost_total:  r.cost ?? 0,
        volume_avg:  r.volume ?? 0,
        date_count:  1,
      })
    }
  }

  // Выручка из заказов за период
  type OrderRow = { nm_id: number | null; price_after_spp: number | null; price_after_discount: number | null; total_price: number | null; discount_percent: number | null }
  const ordersRaw = await fetchAllRows<OrderRow>(from =>
    (adb.from('wb_orders') as any)
      .select('nm_id, price_after_spp, price_after_discount, total_price, discount_percent')
      .in('store_id', storeIds)
      .gte('date', dateFrom)
      .lte('date', dateTo)
      .eq('is_cancel', false)
      .range(from, from + 4999)
  )
  const revenueMap = new Map<number, number>()
  for (const o of ordersRaw) {
    if (!o.nm_id) continue
    const price = o.price_after_spp
      ?? o.price_after_discount
      ?? ((o.total_price ?? 0) * (1 - (o.discount_percent ?? 0) / 100))
    revenueMap.set(o.nm_id, (revenueMap.get(o.nm_id) ?? 0) + price)
  }

  // Остатки и фото из products
  type StockRow = { nm_id: number | null; current_stock: number | null; photo_url: string | null; title: string | null }
  const { data: stockRaw } = await (adb.from('products') as any)
    .select('nm_id, current_stock, photo_url, title')
    .in('store_id', storeIds)
    .limit(5000)
  const stockMap = new Map<number, { current_stock: number; photo_url: string | null; title: string | null }>()
  for (const r of (stockRaw ?? []) as StockRow[]) {
    if (!r.nm_id) continue
    stockMap.set(r.nm_id, { current_stock: r.current_stock ?? 0, photo_url: r.photo_url, title: r.title })
  }

  const skuList = Array.from(skuMap.values()).map(s => {
    const revenue   = revenueMap.get(s.nm_id) ?? 0
    const prod      = stockMap.get(s.nm_id)
    const stock     = prod?.current_stock ?? 0
    const isWasteland = stock > 0 && revenue === 0
    const costPerUnit = stock > 0 ? s.cost_total / stock : null
    const storageToRevenue = revenue > 0 ? s.cost_total / revenue : null
    // cost_per_day — делим на реальные дни с данными по этому SKU
    const skuDays = s.date_count  // date_count может быть > actualDays если несколько баркодов/складов
    return {
      nm_id:              s.nm_id,
      vendor_code:        s.vendor_code,
      title:              prod?.title ?? null,
      subject:            s.subject,
      brand:              s.brand,
      photo_url:          prod?.photo_url ?? null,
      current_stock:      stock,
      cost_total:         Math.round(s.cost_total * 100) / 100,
      cost_per_day:       actualDays > 0 ? Math.round(s.cost_total / actualDays * 100) / 100 : null,
      cost_per_unit:      costPerUnit != null ? Math.round(costPerUnit * 100) / 100 : null,
      revenue,
      storage_to_revenue: storageToRevenue != null ? Math.round(storageToRevenue * 10000) / 100 : null,
      is_wasteland:       isWasteland,
    }
  }).sort((a, b) => b.cost_total - a.cost_total)

  // KPI
  const totalCost       = byDate.reduce((s, r) => s + r.cost, 0)
  const avgPerDay       = actualDays > 0 ? totalCost / actualDays : 0
  const wastelandSkus   = skuList.filter(s => s.is_wasteland)
  const wastelandCount  = wastelandSkus.length
  const wastelandCost   = wastelandSkus.reduce((s, r) => s + r.cost_total, 0)

  return NextResponse.json({
    kpi: {
      total_cost:      Math.round(totalCost * 100) / 100,
      avg_per_day:     Math.round(avgPerDay * 100) / 100,
      wasteland_cost:  Math.round(wastelandCost * 100) / 100,
      wasteland_count: wastelandCount,
      top_sku_cost:    skuList[0]?.cost_total ?? 0,
      top_sku_nm_id:   skuList[0]?.nm_id ?? null,
    },
    byDate,
    skuList,
    actualDays,
    dateFrom,
    dateTo,
    lastDate,
    lastSyncAt,
  })
}
