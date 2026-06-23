import { adminDb } from './admin'
import { createClient } from './supabase-server'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface OverviewFinance {
  revenue: number
  cost: number
  commission: number
  logistics: number
  returns: number
  penalties: number
  additional: number
  netProfit: number
  netPayable: number
  margin: number
  roi: number
  unitCount: number
  profitPerUnit: number
  buyoutRate: number
}

export interface Insights {
  worstProduct:   { nm_id: number; title: string; profit: number } | null
  bestProduct:    { nm_id: number; title: string; profit: number } | null
  bestRoi:        { nm_id: number; title: string; roi: number } | null
  highDrrCampaign: { campaign_id: number; campaign_name: string | null; drr: number; spend: number } | null
  emptyStockSoon: { nm_id: number; title: string; days: number } | null
  returnsAmount:  number
  returnsShare:   number
  buyoutRate:     number
}

export interface YesterdayOrders {
  count: number
  revenue: number
  countPrevWeek: number
  delta: number
}

export interface StocksAlert {
  nm_id: number
  title: string
  photo_url: string | null
  days_of_stock: number
}

export interface StocksAlerts {
  critical: StocksAlert[]   // < 14 days
  soon: StocksAlert[]       // 14–21 days
}

export interface DataQualityAlerts {
  missingCost: number
  missingToken: boolean
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function daysAgo(n: number): string {
  const d = new Date(); d.setDate(d.getDate() - n)
  return d.toISOString().split('T')[0]
}

// ─── Main financial aggregation ──────────────────────────────────────────────

export async function getOverviewFinance(
  storeIds: string[],
  dateFrom: string,
  dateTo: string
): Promise<OverviewFinance> {
  const adb = adminDb()

  const [finRes, dirRes, prodRes] = await Promise.all([
    adb.from('wb_finance')
      .select('nm_id, doc_type_name, supplier_oper_name, quantity, ppvz_for_pay, delivery_rub, penalty, additional_payment')
      .in('store_id', storeIds)
      .gte('date_from', dateFrom)
      .lte('date_from', dateTo)
      .limit(200000),

    adb.from('directory').select('doc_type_name, multiplier'),

    adb.from('products')
      .select('nm_id, cost_price, subject_name')
      .in('store_id', storeIds)
      .limit(5000),
  ])

  const rows = (finRes.data ?? []) as {
    nm_id: number | null; doc_type_name: string | null; supplier_oper_name: string | null
    quantity: number | null; ppvz_for_pay: number | null; delivery_rub: number | null
    penalty: number | null; additional_payment: number | null
  }[]

  const multMap = new Map<string, number>()
  for (const d of (dirRes.data ?? []) as { doc_type_name: string; multiplier: number }[]) multMap.set(d.doc_type_name, d.multiplier)

  const costMap = new Map<number, number>()
  for (const p of (prodRes.data ?? []) as { nm_id: number | null; cost_price: number | null }[]) {
    if (p.nm_id && p.cost_price) costMap.set(p.nm_id, p.cost_price)
  }

  let revenue = 0, returns = 0, logistics = 0, penalties = 0, additional = 0
  let unitCount = 0, salesCount = 0, buyoutCount = 0

  // Commission from wb_commissions is complex — estimate at avg 15% or skip
  // We use delivery_rub for logistics (all rows), penalty for penalties
  for (const r of rows) {
    const mult = multMap.get(r.doc_type_name ?? '') ?? 0
    const pay = r.ppvz_for_pay ?? 0
    const qty = r.quantity ?? 0

    if (mult === 1) {
      revenue += pay
      unitCount += qty
      salesCount += qty
    } else if (mult === -1) {
      returns += Math.abs(pay)
      buyoutCount -= qty
    }
    logistics += r.delivery_rub ?? 0
    penalties += Math.abs(r.penalty ?? 0)
    additional += r.additional_payment ?? 0
  }

  // buyoutRate = sales / (sales + returns) by unit
  const totalOrdered = salesCount + Math.abs(buyoutCount)
  const buyoutRate = totalOrdered > 0 ? (salesCount / totalOrdered) * 100 : 0

  // Cost: sum over sales rows
  let cost = 0
  for (const r of rows) {
    const mult = multMap.get(r.doc_type_name ?? '') ?? 0
    if (mult === 1 && r.nm_id) {
      cost += (costMap.get(r.nm_id) ?? 0) * (r.quantity ?? 0)
    }
  }

  // Commission: revenue - netPayable - logistics - penalties - additional - returns
  // netPayable ≈ revenue - returns - logistics - penalties + additional (WB formula)
  // Commission = WB keeps: revenue × commPct (harder to compute exactly, approximate)
  // Use: commission = revenue - returns - logistics - penalties + additional - netPayable
  // Since we don't have a single netPayable, estimate commission from structure:
  // We'll use a rough estimate: commission ≈ 15% of revenue as fallback
  // Better: sum from wb_finance ppvz_sales_commission if column exists — skip for now
  const netPayable = revenue - returns - logistics - penalties + additional
  const commission = 0 // will be shown as 0 if not in data

  const netProfit = revenue - returns - logistics - penalties - commission - cost + additional
  const margin = revenue > 0 ? (netProfit / revenue) * 100 : 0
  const roi = cost > 0 ? (netProfit / cost) * 100 : 0
  const profitPerUnit = unitCount > 0 ? netProfit / unitCount : 0

  return {
    revenue: Math.round(revenue),
    cost: Math.round(cost),
    commission: Math.round(commission),
    logistics: Math.round(Math.abs(logistics)),
    returns: Math.round(returns),
    penalties: Math.round(penalties),
    additional: Math.round(additional),
    netProfit: Math.round(netProfit),
    netPayable: Math.round(netPayable),
    margin: Math.round(margin * 10) / 10,
    roi: Math.round(roi * 10) / 10,
    unitCount,
    profitPerUnit: Math.round(profitPerUnit),
    buyoutRate: Math.round(buyoutRate * 10) / 10,
  }
}

// ─── Insights ────────────────────────────────────────────────────────────────

export async function getInsights(
  storeIds: string[],
  dateFrom: string,
  dateTo: string
): Promise<Insights> {
  const adb = adminDb()

  const [finRes, dirRes, prodRes, adRes, stocksAlertRes] = await Promise.all([
    adb.from('wb_finance')
      .select('nm_id, doc_type_name, ppvz_for_pay, delivery_rub, penalty, quantity')
      .in('store_id', storeIds)
      .gte('date_from', dateFrom)
      .lte('date_from', dateTo)
      .limit(100000),

    adb.from('directory').select('doc_type_name, multiplier'),

    adb.from('products')
      .select('nm_id, title, cost_price, vendor_code')
      .in('store_id', storeIds)
      .limit(5000),

    // H6: ДРР по кампаниям за период
    adb.from('wb_ad_spend')
      .select('campaign_id, campaign_name, spend, orders_sum')
      .in('store_id', storeIds)
      .gte('date', dateFrom)
      .lte('date', dateTo)
      .limit(10000),

    // H6: товары с критичным остатком (пустой склад)
    adb.from('products')
      .select('nm_id, title, vendor_code, current_stock, avg_orders_per_day')
      .in('store_id', storeIds)
      .gt('current_stock', 0)
      .gt('avg_orders_per_day', 0)
      .limit(1000),
  ])

  const rows = (finRes.data ?? []) as { nm_id: number | null; doc_type_name: string | null; ppvz_for_pay: number | null; delivery_rub: number | null; penalty: number | null; quantity: number | null }[]
  const multMap = new Map<string, number>()
  for (const d of (dirRes.data ?? []) as { doc_type_name: string; multiplier: number }[]) multMap.set(d.doc_type_name, d.multiplier)
  const prodMap = new Map<number, { title: string; cost_price: number | null; vendor_code: string }>()
  for (const p of (prodRes.data ?? []) as { nm_id: number | null; title: string | null; cost_price: number | null; vendor_code: string }[]) {
    if (p.nm_id) prodMap.set(p.nm_id, { title: p.title ?? p.vendor_code, cost_price: p.cost_price, vendor_code: p.vendor_code })
  }

  // Aggregate per nm_id
  const nmMap = new Map<number, { revenue: number; returns: number; logistics: number; penalties: number; units: number }>()

  let totalReturns = 0, totalRevenue = 0, salesUnits = 0, returnUnits = 0

  for (const r of rows) {
    if (!r.nm_id) continue
    const mult = multMap.get(r.doc_type_name ?? '') ?? 0
    const pay = r.ppvz_for_pay ?? 0
    const cur = nmMap.get(r.nm_id) ?? { revenue: 0, returns: 0, logistics: 0, penalties: 0, units: 0 }

    if (mult === 1) { cur.revenue += pay; cur.units += r.quantity ?? 0; totalRevenue += pay; salesUnits += r.quantity ?? 0 }
    if (mult === -1) { cur.returns += Math.abs(pay); totalReturns += Math.abs(pay); returnUnits += r.quantity ?? 0 }
    cur.logistics += Math.abs(r.delivery_rub ?? 0)
    cur.penalties += Math.abs(r.penalty ?? 0)
    nmMap.set(r.nm_id, cur)
  }

  // Compute profit per nm_id
  const profitRows = [...nmMap.entries()].map(([nm_id, v]) => {
    const prod = prodMap.get(nm_id)
    const cost = (prod?.cost_price ?? 0) * v.units
    const profit = v.revenue - v.returns - v.logistics - v.penalties - cost
    const roi = cost > 0 ? (profit / cost) * 100 : null
    return { nm_id, title: prod?.title ?? String(nm_id), profit, roi, revenue: v.revenue }
  }).filter(r => r.revenue > 0)

  profitRows.sort((a, b) => a.profit - b.profit)
  const worst = profitRows[0] ?? null
  const best = profitRows[profitRows.length - 1] ?? null

  const roiRows = profitRows.filter(r => r.roi !== null).sort((a, b) => (b.roi ?? 0) - (a.roi ?? 0))
  const bestRoiRow = roiRows[0] ?? null

  const buyoutRate = (salesUnits + returnUnits) > 0 ? (salesUnits / (salesUnits + returnUnits)) * 100 : 0

  // H6: Кампания с высоким ДРР
  type AdRow = { campaign_id: number | null; campaign_name: string | null; spend: number | null; orders_sum: number | null }
  const adRows = (adRes.data ?? []) as AdRow[]
  const adMap = new Map<number, { name: string | null; spend: number; orders_sum: number }>()
  for (const a of adRows) {
    if (!a.campaign_id) continue
    const cur = adMap.get(a.campaign_id) ?? { name: a.campaign_name, spend: 0, orders_sum: 0 }
    cur.spend      += a.spend ?? 0
    cur.orders_sum += a.orders_sum ?? 0
    adMap.set(a.campaign_id, cur)
  }
  const campaignDrr = [...adMap.entries()]
    .map(([id, v]) => ({ campaign_id: id, campaign_name: v.name, spend: v.spend, orders_sum: v.orders_sum, drr: v.orders_sum > 0 ? v.spend / v.orders_sum * 100 : 0 }))
    .filter(c => c.spend > 500)
    .sort((a, b) => b.drr - a.drr)
  const highDrrCampaign = campaignDrr[0]?.drr > 25
    ? { ...campaignDrr[0], drr: Math.round(campaignDrr[0].drr * 10) / 10, spend: Math.round(campaignDrr[0].spend) }
    : null

  // H6: Товар с ближайшим пустым складом
  type StockAlertRow = { nm_id: number | null; title: string | null; vendor_code: string | null; current_stock: number | null; avg_orders_per_day: number | null }
  const alertRows = (stocksAlertRes.data ?? []) as StockAlertRow[]
  const emptyRows = alertRows
    .map(r => ({ nm_id: r.nm_id!, title: r.title ?? r.vendor_code ?? String(r.nm_id), days: Math.floor((r.current_stock ?? 0) / (r.avg_orders_per_day ?? 1)) }))
    .filter(r => r.days < 15 && r.days > 0)
    .sort((a, b) => a.days - b.days)
  const emptyStockSoon = emptyRows[0] ?? null

  return {
    worstProduct: worst ? { nm_id: worst.nm_id, title: worst.title, profit: Math.round(worst.profit) } : null,
    bestProduct: best ? { nm_id: best.nm_id, title: best.title, profit: Math.round(best.profit) } : null,
    bestRoi: bestRoiRow ? { nm_id: bestRoiRow.nm_id, title: bestRoiRow.title, roi: Math.round(bestRoiRow.roi ?? 0) } : null,
    highDrrCampaign,
    emptyStockSoon,
    returnsAmount: Math.round(totalReturns),
    returnsShare: totalRevenue > 0 ? Math.round((totalReturns / totalRevenue) * 100 * 10) / 10 : 0,
    buyoutRate: Math.round(buyoutRate * 10) / 10,
  }
}

// ─── Yesterday orders ────────────────────────────────────────────────────────

export async function getYesterdayOrders(storeIds: string[]): Promise<YesterdayOrders> {
  const yesterday = daysAgo(1)
  const prevWeekDay = daysAgo(8)

  const adb = adminDb()
  const [todayRes, prevRes] = await Promise.all([
    adb.from('wb_orders')
      .select('total_price, discount_percent')
      .in('store_id', storeIds)
      .eq('is_cancel', false)
      .gte('date', yesterday)
      .lte('date', yesterday + 'T23:59:59')
      .limit(10000),

    adb.from('wb_orders')
      .select('id')
      .in('store_id', storeIds)
      .eq('is_cancel', false)
      .gte('date', prevWeekDay)
      .lte('date', prevWeekDay + 'T23:59:59')
      .limit(10000),
  ])

  const todayOrders = (todayRes.data ?? []) as { total_price: number | null; discount_percent: number | null }[]
  const count = todayOrders.length
  const revenue = todayOrders.reduce((s, o) => s + (o.total_price ?? 0) * (1 - (o.discount_percent ?? 0) / 100), 0)
  const countPrevWeek = prevRes.data?.length ?? 0

  return {
    count,
    revenue: Math.round(revenue),
    countPrevWeek,
    delta: count - countPrevWeek,
  }
}

// ─── Stocks alerts ───────────────────────────────────────────────────────────

export async function getStocksAlerts(storeIds: string[]): Promise<StocksAlerts> {
  const adb = adminDb()

  const [stocksRes, prodRes] = await Promise.all([
    adb.from('wb_stocks')
      .select('nm_id, quantity_full')
      .in('store_id', storeIds)
      .limit(20000),

    adb.from('products')
      .select('nm_id, title, photo_url, avg_orders_per_day')
      .in('store_id', storeIds)
      .gt('avg_orders_per_day', 0)
      .limit(5000),
  ])

  // Collapse stocks by nm_id
  const stockMap = new Map<number, number>()
  for (const s of (stocksRes.data ?? []) as { nm_id: number; quantity_full: number | null }[]) {
    stockMap.set(s.nm_id, (stockMap.get(s.nm_id) ?? 0) + (s.quantity_full ?? 0))
  }

  const critical: StocksAlert[] = []
  const soon: StocksAlert[] = []

  for (const p of (prodRes.data ?? []) as { nm_id: number | null; title: string | null; photo_url: string | null; avg_orders_per_day: number | null }[]) {
    if (!p.nm_id || !p.avg_orders_per_day) continue
    const qty = stockMap.get(p.nm_id) ?? 0
    const days = Math.round(qty / p.avg_orders_per_day)
    const alert: StocksAlert = { nm_id: p.nm_id, title: p.title ?? String(p.nm_id), photo_url: p.photo_url ?? null, days_of_stock: days }
    if (days < 14) critical.push(alert)
    else if (days < 21) soon.push(alert)
  }

  return {
    critical: critical.sort((a, b) => a.days_of_stock - b.days_of_stock).slice(0, 10),
    soon: soon.sort((a, b) => a.days_of_stock - b.days_of_stock).slice(0, 10),
  }
}

// ─── Data quality ────────────────────────────────────────────────────────────

export async function getDataQualityAlerts(storeIds: string[]): Promise<DataQualityAlerts> {
  const db = await createClient()

  const [prodRes, storeRes] = await Promise.all([
    db.from('products')
      .select('nm_id', { count: 'exact', head: true })
      .in('store_id', storeIds)
      .or('cost_price.is.null,cost_price.eq.0'),

    db.from('stores')
      .select('wb_analytics_token')
      .in('id', storeIds)
      .limit(1)
      .single(),
  ])

  return {
    missingCost: prodRes.count ?? 0,
    missingToken: !storeRes.data?.wb_analytics_token,
  }
}

// ─── Daily sales (28 days) ───────────────────────────────────────────────────

export async function getOverviewDailySales(storeIds: string[]) {
  const dateFrom = daysAgo(28)
  const dateTo = new Date().toISOString().split('T')[0]

  const { data } = await adminDb()
    .from('wb_orders')
    .select('date, total_price, discount_percent')
    .in('store_id', storeIds)
    .eq('is_cancel', false)
    .gte('date', dateFrom)
    .lte('date', dateTo + 'T23:59:59')
    .limit(50000)

  const dayMap = new Map<string, { orders: number; revenue: number }>()
  for (const o of (data ?? []) as { date: string | null; total_price: number | null; discount_percent: number | null }[]) {
    const day = o.date?.split('T')[0]
    if (!day) continue
    const rev = (o.total_price ?? 0) * (1 - (o.discount_percent ?? 0) / 100)
    const cur = dayMap.get(day) ?? { orders: 0, revenue: 0 }
    dayMap.set(day, { orders: cur.orders + 1, revenue: cur.revenue + rev })
  }

  const result: { date: string; orders: number; revenue: number }[] = []
  for (let i = 27; i >= 0; i--) {
    const day = daysAgo(i)
    const v = dayMap.get(day) ?? { orders: 0, revenue: 0 }
    result.push({ date: day, orders: v.orders, revenue: Math.round(v.revenue) })
  }
  return result
}
