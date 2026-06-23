import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { getUserStoreIds } from '@/lib/queries'
import { adminDb } from '@/lib/admin'

function daysAgo(n: number) {
  const d = new Date(); d.setDate(d.getDate() - n)
  return d.toISOString().split('T')[0]
}

function dateRange(from: string, to: string): string[] {
  const dates: string[] = []
  const cur = new Date(from + 'T00:00:00Z')
  const end = new Date(to + 'T00:00:00Z')
  while (cur <= end) {
    dates.push(cur.toISOString().split('T')[0])
    cur.setUTCDate(cur.getUTCDate() + 1)
  }
  return dates
}

export async function GET(req: NextRequest) {
  const db = await createClient()
  const { data: { user } } = await db.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const storeIds = await getUserStoreIds(user.id)
  if (!storeIds.length) return NextResponse.json({ error: 'No store' }, { status: 404 })

  const url = req.nextUrl
  const dateFrom = url.searchParams.get('from') ?? daysAgo(60)
  const dateTo   = url.searchParams.get('to')   ?? new Date().toISOString().split('T')[0]

  const adb = adminDb()

  const [ordersRes, financeRes, adRes, stocksRes, dirRes, prodRes, funnelRes] = await Promise.all([
    // Заказы по дням
    adb.from('wb_orders')
      .select('date, last_change_date, total_price, discount_percent, price_after_discount, nm_id, is_cancel')
      .in('store_id', storeIds)
      .gte('date', dateFrom)
      .lte('date', dateTo + 'T23:59:59')
      .limit(200000),

    // Продажи из wb_finance
    adb.from('wb_finance')
      .select('date_from, doc_type_name, ppvz_for_pay, quantity, nm_id, delivery_rub, penalty, additional_payment')
      .in('store_id', storeIds)
      .gte('date_from', dateFrom)
      .lte('date_from', dateTo)
      .limit(200000),

    // Реклама по дням
    adb.from('wb_ad_spend')
      .select('date, spend')
      .in('store_id', storeIds)
      .gte('date', dateFrom)
      .lte('date', dateTo)
      .limit(50000),

    // Текущие остатки — только последняя дата, суммируем quantity по всем складам
    adb.from('wb_stocks')
      .select('nm_id, quantity, date')
      .in('store_id', storeIds)
      .order('date', { ascending: false })
      .limit(50000),

    // Directory для мультипликаторов
    adb.from('directory').select('doc_type_name, multiplier'),

    // Продукты для себестоимости
    adb.from('products')
      .select('nm_id, cost_price')
      .in('store_id', storeIds)
      .limit(5000),

    // Воронка — переходы в карточку по дням
    adb.from('wb_funnel')
      .select('date, open_count')
      .in('store_id', storeIds)
      .gte('date', dateFrom)
      .lte('date', dateTo)
      .limit(200000),
  ])

  type OrderRow   = { date: string | null; last_change_date: string | null; total_price: number | null; discount_percent: number | null; price_after_discount: number | null; nm_id: number | null; is_cancel: boolean | null }
  type FinRow     = { date_from: string | null; doc_type_name: string | null; ppvz_for_pay: number | null; quantity: number | null; nm_id: number | null; delivery_rub: number | null; penalty: number | null; additional_payment: number | null }
  type AdRow      = { date: string | null; spend: number | null }
  type StockRow   = { nm_id: number; quantity: number | null; date: string | null }
  type DirRow     = { doc_type_name: string; multiplier: number }
  type ProdRow    = { nm_id: number | null; cost_price: number | null }
  type FunnelRow  = { date: string | null; open_count: number | null }

  const orders    = (ordersRes.data  ?? []) as OrderRow[]
  const finRows   = (financeRes.data ?? []) as FinRow[]
  const adRows    = (adRes.data      ?? []) as AdRow[]
  const stocks    = (stocksRes.data  ?? []) as StockRow[]
  const dirRows   = (dirRes.data     ?? []) as DirRow[]
  const prodRows  = (prodRes.data    ?? []) as ProdRow[]
  const funnelRows = (funnelRes.data ?? []) as FunnelRow[]

  // Мультипликаторы
  const multMap = new Map<string, number>()
  for (const d of dirRows) multMap.set(d.doc_type_name, d.multiplier)

  // Себестоимость
  const costMap = new Map<number, number>()
  for (const p of prodRows) if (p.nm_id && p.cost_price) costMap.set(p.nm_id, p.cost_price)

  // Остатки ВБ — берём только строки с последней датой снапшота, суммируем quantity
  const latestDate = stocks.reduce((max, r) => r.date && r.date > max ? r.date : max, '')
  const totalStock = stocks
    .filter(r => r.date?.slice(0, 10) === latestDate?.slice(0, 10))
    .reduce((s, r) => s + (r.quantity ?? 0), 0)

  // Переходы из воронки по дням
  const funnelMap = new Map<string, number>()
  for (const f of funnelRows) {
    const day = f.date?.slice(0, 10)
    if (!day) continue
    funnelMap.set(day, (funnelMap.get(day) ?? 0) + (f.open_count ?? 0))
  }

  // Агрегация по дням
  type DayAcc = {
    orders_count: number
    orders_sum: number
    orders_sum_retail: number
    sales_count: number
    sales_revenue: number
    returns_count: number
    returns_amount: number
    logistics: number
    penalties: number
    additional: number
    ad_spend: number
  }

  const dayMap = new Map<string, DayAcc>()

  const emptyDay = (): DayAcc => ({
    orders_count: 0, orders_sum: 0, orders_sum_retail: 0,
    sales_count: 0, sales_revenue: 0,
    returns_count: 0, returns_amount: 0,
    logistics: 0, penalties: 0, additional: 0, ad_spend: 0,
  })

  // Заказы
  for (const o of orders) {
    if (o.is_cancel) continue
    const day = o.date?.slice(0, 10)
    if (!day) continue
    const acc = dayMap.get(day) ?? emptyDay()
    acc.orders_count++
    // Цена заказа (после скидки) — приоритет над расчётом
    const priceAfter = o.price_after_discount
      ?? ((o.total_price ?? 0) * (1 - (o.discount_percent ?? 0) / 100))
    acc.orders_sum += priceAfter
    acc.orders_sum_retail += o.total_price ?? 0
    dayMap.set(day, acc)
  }

  // Финансы (продажи + возвраты + логистика)
  for (const r of finRows) {
    const day = r.date_from?.slice(0, 10)
    if (!day) continue
    const mult = multMap.get(r.doc_type_name ?? '') ?? 0
    const acc = dayMap.get(day) ?? emptyDay()
    if (mult === 1) { acc.sales_count += r.quantity ?? 0; acc.sales_revenue += r.ppvz_for_pay ?? 0 }
    if (mult === -1) { acc.returns_count += r.quantity ?? 0; acc.returns_amount += Math.abs(r.ppvz_for_pay ?? 0) }
    acc.logistics  += Math.abs(r.delivery_rub ?? 0)
    acc.penalties  += Math.abs(r.penalty ?? 0)
    acc.additional += r.additional_payment ?? 0
    dayMap.set(day, acc)
  }

  // Реклама
  for (const a of adRows) {
    const day = a.date?.slice(0, 10)
    if (!day) continue
    const acc = dayMap.get(day) ?? emptyDay()
    acc.ad_spend += a.spend ?? 0
    dayMap.set(day, acc)
  }

  // Заполняем все даты диапазона
  const allDates = dateRange(dateFrom, dateTo)
  const byDate = allDates.map(date => {
    const acc = dayMap.get(date) ?? emptyDay()

    // Потенциальная ЧП = выручка - логистика - штрафы + доп - себестоимость
    // (без учёта конкретных nm_id — общий расчёт)
    const grossProfit = acc.sales_revenue - acc.logistics - acc.penalties + acc.additional

    // ДРР = расход на рекламу / выручка от заказов * 100
    const drr = acc.orders_sum > 0 ? (acc.ad_spend / acc.orders_sum) * 100 : null

    // CR% (заказы → продажи)
    const crOrderToSale = acc.orders_count > 0 ? (acc.sales_count / acc.orders_count) * 100 : null

    const openCount = funnelMap.get(date) ?? 0

    return {
      date,
      orders_count:    acc.orders_count,
      orders_sum:      Math.round(acc.orders_sum),
      sales_count:     acc.sales_count,
      sales_revenue:   Math.round(acc.sales_revenue),
      returns_count:   acc.returns_count,
      returns_amount:  Math.round(acc.returns_amount),
      logistics:       Math.round(acc.logistics),
      penalties:       Math.round(acc.penalties),
      ad_spend:        Math.round(acc.ad_spend),
      gross_profit:    Math.round(grossProfit),
      drr:             drr !== null ? Math.round(drr * 10) / 10 : null,
      cr_order_sale:   crOrderToSale !== null ? Math.round(crOrderToSale * 10) / 10 : null,
      avg_order_price: acc.orders_count > 0 ? Math.round(acc.orders_sum / acc.orders_count) : null,
      open_count:      openCount,
      cost_per_click:  openCount > 0 ? Math.round(acc.ad_spend / openCount * 100) / 100 : null,
    }
  })

  // Итоги
  const totals = byDate.reduce((acc, d) => ({
    orders_count:   acc.orders_count   + d.orders_count,
    orders_sum:     acc.orders_sum     + d.orders_sum,
    sales_count:    acc.sales_count    + d.sales_count,
    sales_revenue:  acc.sales_revenue  + d.sales_revenue,
    returns_amount: acc.returns_amount + d.returns_amount,
    logistics:      acc.logistics      + d.logistics,
    ad_spend:       acc.ad_spend       + d.ad_spend,
    gross_profit:   acc.gross_profit   + d.gross_profit,
  }), { orders_count: 0, orders_sum: 0, sales_count: 0, sales_revenue: 0, returns_amount: 0, logistics: 0, ad_spend: 0, gross_profit: 0 })

  // Время последней загрузки — берём max last_change_date из заказов
  const lastOrdersSync = orders.reduce((max, r) => {
    const t = r.last_change_date ?? ''
    return t > max ? t : max
  }, '')

  const lastAdSync = adRows.reduce((max, r) => {
    const t = r.date ?? ''
    return t > max ? t : max
  }, '')

  const lastSyncedAt = new Date().toISOString()

  return NextResponse.json({
    byDate,
    totals,
    stockTotal: totalStock,
    today: new Date().toISOString().split('T')[0],
    lastSyncedAt,
    lastOrdersSync: lastOrdersSync || null,
    lastAdSync: lastAdSync || null,
  })
}
