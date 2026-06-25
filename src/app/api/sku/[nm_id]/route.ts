// @ts-nocheck
import { adminDb } from '@/lib/db-compat'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-server'
import { getUserStoreIds } from '@/lib/queries'


function daysAgo(n: number) {
  const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().split('T')[0]
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ nm_id: string }> }
) {
  const user = await requireAuth().catch(() => null)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const storeIds = await getUserStoreIds(user.id)
  if (!storeIds.length) return NextResponse.json({ error: 'No store' }, { status: 404 })

  const { nm_id } = await params
  const nmId = parseInt(nm_id)
  if (isNaN(nmId)) return NextResponse.json({ error: 'Invalid nm_id' }, { status: 400 })

  const url = req.nextUrl
  const dateFrom = url.searchParams.get('from') ?? daysAgo(30)
  const dateTo = url.searchParams.get('to') ?? new Date().toISOString().split('T')[0]

  const adb = adminDb()

  const [productRes, ordersRes, financeRes, stocksRes, commRes] = await Promise.all([
    adb.from('products')
      .select('nm_id, vendor_code, brand, title, subject_name, photo_url, cost_price, current_stock, avg_orders_per_day, buyout_rate, group_id')
      .eq('nm_id', nmId)
      .in('store_id', storeIds)
      .single(),

    // All orders in period for daily aggregation (с детализацией по баркоду/размеру)
    adb.from('wb_orders')
      .select('date, total_price, discount_percent, price_after_discount, price_after_spp, barcode, techsize')
      .eq('nm_id', nmId)
      .in('store_id', storeIds)
      .eq('is_cancel', false)
      .gte('date', dateFrom)
      .lte('date', dateTo + 'T23:59:59')
      .order('date'),

    // Finance for logistics in period
    adb.from('wb_finance')
      .select('delivery_rub, ppvz_for_pay, date_from')
      .eq('nm_id', nmId)
      .in('store_id', storeIds)
      .gte('date_from', dateFrom)
      .lte('date_from', dateTo),

    // Current stock breakdown by warehouse
    adb.from('wb_stocks')
      .select('warehouse, quantity, quantity_full, tech_size')
      .eq('nm_id', nmId)
      .in('store_id', storeIds)
      .order('quantity_full', { ascending: false }),

    // Commission for this subject
    adb.from('wb_commissions')
      .select('kgvp_supplier, subject_name')
      .in('store_id', storeIds)
      .limit(2000),
  ])

  const product = productRes.data
  const orders = ordersRes.data ?? []
  const finance = financeRes.data ?? []
  const stocks = stocksRes.data ?? []
  const commissions = commRes.data ?? []

  // Commission %
  const commPct = commissions.find(c => c.subject_name === product?.subject_name)?.kgvp_supplier ?? 0

  // Цена заказа: приоритет price_after_spp (факт из файла) → price_after_discount → расчёт из totalPrice×(1−disc)
  function orderPriceSpp(o: typeof orders[0]): number {
    if (o.price_after_spp != null) return o.price_after_spp
    if (o.price_after_discount != null) return o.price_after_discount
    return (o.total_price ?? 0) * (1 - (o.discount_percent ?? 0) / 100)
  }

  // KPI aggregates
  const revenue = orders.reduce((s, o) => s + orderPriceSpp(o), 0)
  const ordersCount = orders.length
  const deliveryRub = finance.reduce((s, f) => s + (f.delivery_rub ?? 0), 0)
  const commission = (commPct / 100) * revenue
  const cogs = (product?.cost_price ?? 0) * ordersCount
  const marginalProfit = revenue - commission - deliveryRub
  const netProfit = marginalProfit - cogs
  const netMarginPct = revenue > 0 ? (netProfit / revenue) * 100 : 0

  // Daily aggregation
  const dailyMap = new Map<string, { orders: number; revenue: number }>()
  for (const o of orders) {
    const day = o.date.split('T')[0]
    const rev = orderPriceSpp(o)
    const cur = dailyMap.get(day) ?? { orders: 0, revenue: 0 }
    dailyMap.set(day, { orders: cur.orders + 1, revenue: cur.revenue + rev })
  }

  // Fill date gaps
  const daily: { date: string; orders: number; revenue: number }[] = []
  const from = new Date(dateFrom)
  const to = new Date(dateTo)
  for (let d = new Date(from); d <= to; d.setDate(d.getDate() + 1)) {
    const key = d.toISOString().split('T')[0]
    const val = dailyMap.get(key) ?? { orders: 0, revenue: 0 }
    daily.push({ date: key, orders: val.orders, revenue: Math.round(val.revenue) })
  }

  // Stock summary — collapse by warehouse
  const warehouseMap = new Map<string, number>()
  for (const s of stocks) {
    warehouseMap.set(s.warehouse, (warehouseMap.get(s.warehouse) ?? 0) + (s.quantity_full ?? 0))
  }
  const warehouseList = [...warehouseMap.entries()]
    .map(([warehouse, quantity_full]) => ({ warehouse, quantity_full, quantity: quantity_full, tech_size: '' }))
    .sort((a, b) => b.quantity_full - a.quantity_full)

  const totalStock = stocks.reduce((s, r) => s + (r.quantity_full ?? 0), 0)
  const daysOfStock = product?.avg_orders_per_day && product.avg_orders_per_day > 0
    ? Math.round(totalStock / product.avg_orders_per_day)
    : null

  return NextResponse.json({
    product,
    kpi: {
      orders_count: ordersCount,
      revenue: Math.round(revenue),
      commission: Math.round(commission),
      commission_pct: commPct,
      delivery_rub: Math.round(deliveryRub),
      cogs: Math.round(cogs),
      marginal_profit: Math.round(marginalProfit),
      net_profit: Math.round(netProfit),
      net_margin_pct: Math.round(netMarginPct * 10) / 10,
      has_cost: (product?.cost_price ?? 0) > 0,
    },
    stocks: {
      total: totalStock,
      days_of_stock: daysOfStock,
      warehouses: warehouseList.slice(0, 10),
    },
    daily,
    dateFrom,
    dateTo,
  })
}
