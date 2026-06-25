import { db } from './db'
import type { ManualCost } from './types'
export type { ManualCost } from './types'
export { CATEGORY_LABELS } from './types'

export interface KpiData {
  revenue: number; revenuePrev: number
  orders: number; ordersPrev: number
  sales: number; salesPrev: number
  buyoutRate: number; buyoutRatePrev: number
  adSpend: number; adSpendPrev: number
  clicks: number; clicksPrev: number
}
export interface DailySales { date: string; revenue: number; orders: number; sales: number }
export interface StockItem {
  nm_id: number; supplier_article: string; subject: string; brand: string
  quantity: number; days_left: number | null
}
export interface TodayStats { date: string; orders: number; revenue: number; adSpend: number; clicks: number }
export interface MonthStats {
  periodLabel: string; daysElapsed: number; daysInMonth: number
  orders: number; revenue: number; adSpend: number; clicks: number
  forecastOrders: number; forecastRevenue: number; forecastAdSpend: number; forecastClicks: number
}
export interface AdStats {
  spend: number; ordersSum: number; ordersCount: number; clicks: number; views: number; ddr: number; ctr: number
}
export interface AdPageData {
  periodLabel: string; daysElapsed: number; daysInMonth: number
  today: AdStats; month: AdStats; forecast: AdStats
}
export interface PnLSummary {
  sale: number; forPay: number; commission: number; logistics: number; storage: number
  penalties: number; correction: number; otherDeductions: number; totalToPay: number
  adSpend: number; reportCount: number
  revenue: number; returns: number; additionalPayments: number; netPayable: number
}

function moscowNow() {
  return new Date(Date.now() + 3 * 60 * 60 * 1000)
}
function daysBack(n: number) {
  const d = moscowNow()
  d.setUTCDate(d.getUTCDate() - n)
  return d.toISOString().split('T')[0]
}
const MONTH_NAMES = ['января','февраля','марта','апреля','мая','июня',
  'июля','августа','сентября','октября','ноября','декабря']

export async function getUserStoreIds(userId: string): Promise<string[]> {
  const rows = await db<{ store_id: string }[]>`
    SELECT store_id FROM user_stores WHERE user_id = ${userId}
  `
  return rows.map(r => r.store_id)
}

export async function getStores(storeIds: string[]) {
  if (!storeIds.length) return []
  const rows = await db<{ id: string; name: string }[]>`
    SELECT id, name FROM stores WHERE id = ANY(${storeIds})
  `
  return rows
}

export async function getKpi(storeIds: string[]): Promise<KpiData> {
  if (!storeIds.length) return { revenue:0,revenuePrev:0,orders:0,ordersPrev:0,sales:0,salesPrev:0,buyoutRate:0,buyoutRatePrev:0,adSpend:0,adSpendPrev:0,clicks:0,clicksPrev:0 }
  const monthStart = daysBack(30)
  const prevStart  = daysBack(60)
  const prevEnd    = daysBack(30)

  const [ordCur, ordPrev, salCur, salPrev, adCur, adPrev] = await Promise.all([
    db<{c:string}[]>`SELECT COUNT(*) c FROM wb_orders WHERE store_id=ANY(${storeIds}) AND "date">=NOW()-INTERVAL '30 days' AND is_cancel=false`,
    db<{c:string}[]>`SELECT COUNT(*) c FROM wb_orders WHERE store_id=ANY(${storeIds}) AND "date">=NOW()-INTERVAL '60 days' AND "date"<NOW()-INTERVAL '30 days' AND is_cancel=false`,
    db<{c:string}[]>`SELECT COUNT(*) c FROM wb_sales WHERE store_id=ANY(${storeIds}) AND "date">=NOW()-INTERVAL '30 days'`,
    db<{c:string}[]>`SELECT COUNT(*) c FROM wb_sales WHERE store_id=ANY(${storeIds}) AND "date">=NOW()-INTERVAL '60 days' AND "date"<NOW()-INTERVAL '30 days'`,
    db<{spend:number,clicks:number}[]>`SELECT COALESCE(SUM(spend),0) spend, COALESCE(SUM(clicks),0) clicks FROM wb_ad_spend WHERE store_id=ANY(${storeIds}) AND "date">=${monthStart}`,
    db<{spend:number,clicks:number}[]>`SELECT COALESCE(SUM(spend),0) spend, COALESCE(SUM(clicks),0) clicks FROM wb_ad_spend WHERE store_id=ANY(${storeIds}) AND "date">=${prevStart} AND "date"<${prevEnd}`,
  ])
  const [revCur] = await db<{v:number}[]>`SELECT COALESCE(SUM(for_pay),0) v FROM wb_sales WHERE store_id=ANY(${storeIds}) AND "date">=NOW()-INTERVAL '30 days'`
  const [revPrev] = await db<{v:number}[]>`SELECT COALESCE(SUM(for_pay),0) v FROM wb_sales WHERE store_id=ANY(${storeIds}) AND "date">=NOW()-INTERVAL '60 days' AND "date"<NOW()-INTERVAL '30 days'`

  const orders = Number(ordCur[0].c); const ordersPrev = Number(ordPrev[0].c)
  const sales  = Number(salCur[0].c); const salesPrev  = Number(salPrev[0].c)
  return {
    revenue:     Number(revCur.v),  revenuePrev:  Number(revPrev.v),
    orders,      ordersPrev,
    sales,       salesPrev,
    buyoutRate:     orders > 0 ? Math.round(sales/orders*100) : 0,
    buyoutRatePrev: ordersPrev > 0 ? Math.round(salesPrev/ordersPrev*100) : 0,
    adSpend:  Number(adCur[0].spend),  adSpendPrev:  Number(adPrev[0].spend),
    clicks:   Number(adCur[0].clicks), clicksPrev:   Number(adPrev[0].clicks),
  }
}

export async function getDailySales(storeIds: string[]): Promise<DailySales[]> {
  if (!storeIds.length) return []
  const [sales, orders] = await Promise.all([
    db<{day:string,revenue:number,sales:number}[]>`
      SELECT date_trunc('day', "date")::text AS "day",
             COALESCE(SUM(for_pay),0) revenue,
             COUNT(*) sales
      FROM wb_sales
      WHERE store_id=ANY(${storeIds}) AND "date">=NOW()-INTERVAL '30 days'
      GROUP BY 1 ORDER BY 1`,
    db<{day:string,orders:number}[]>`
      SELECT date_trunc('day', "date")::text AS "day", COUNT(*) orders
      FROM wb_orders
      WHERE store_id=ANY(${storeIds}) AND "date">=NOW()-INTERVAL '30 days' AND is_cancel=false
      GROUP BY 1 ORDER BY 1`,
  ])
  const map: Record<string,DailySales> = {}
  for (const r of sales) map[r.day] = { date:r.day, revenue:Number(r.revenue), orders:0, sales:Number(r.sales) }
  for (const r of orders) {
    if (map[r.day]) map[r.day].orders = Number(r.orders)
    else map[r.day] = { date:r.day, revenue:0, orders:Number(r.orders), sales:0 }
  }
  return Object.values(map).sort((a,b) => a.date.localeCompare(b.date))
}

export async function getTodayStats(storeIds: string[]): Promise<TodayStats> {
  const now = moscowNow()
  const todayStr = now.toISOString().split('T')[0]
  if (!storeIds.length) return { date:todayStr, orders:0, revenue:0, adSpend:0, clicks:0 }

  const [ord, ad] = await Promise.all([
    // Заказы и сумма заказов — из воронки продаж (wb_funnel), данные актуальнее wb_orders
    db<{orders:number, order_sum:number}[]>`
      SELECT COALESCE(SUM(order_count),0) orders, COALESCE(SUM(order_sum),0) order_sum
      FROM wb_funnel WHERE store_id=ANY(${storeIds}) AND "date"=${todayStr}::date`,
    db<{spend:number,clicks:number}[]>`SELECT COALESCE(SUM(spend),0) spend, COALESCE(SUM(clicks),0) clicks FROM wb_ad_spend WHERE store_id=ANY(${storeIds}) AND "date"=${todayStr}::date`,
  ])

  return { date:todayStr, orders:Number(ord[0].orders), revenue:Number(ord[0].order_sum), adSpend:Number(ad[0].spend), clicks:Number(ad[0].clicks) }
}

export async function getMonthStats(storeIds: string[]): Promise<MonthStats> {
  const now = moscowNow()
  const year=now.getUTCFullYear(), month=now.getUTCMonth(), day=now.getUTCDate()
  const monthStart = `${year}-${String(month+1).padStart(2,'0')}-01`
  const daysInMonth = new Date(Date.UTC(year,month+1,0)).getUTCDate()
  const todayStr = now.toISOString().split('T')[0]
  if (!storeIds.length) return { periodLabel:`1–${day} ${MONTH_NAMES[month]}`, daysElapsed:day, daysInMonth, orders:0, revenue:0, adSpend:0, clicks:0, forecastOrders:0, forecastRevenue:0, forecastAdSpend:0, forecastClicks:0 }

  const [ord, ad] = await Promise.all([
    // Заказы и сумма заказов — из воронки продаж (wb_funnel)
    db<{orders:number, order_sum:number}[]>`
      SELECT COALESCE(SUM(order_count),0) orders, COALESCE(SUM(order_sum),0) order_sum
      FROM wb_funnel WHERE store_id=ANY(${storeIds}) AND "date">=${monthStart}::date AND "date"<=${todayStr}::date`,
    db<{spend:number,clicks:number}[]>`SELECT COALESCE(SUM(spend),0) spend, COALESCE(SUM(clicks),0) clicks FROM wb_ad_spend WHERE store_id=ANY(${storeIds}) AND "date">=${monthStart}::date AND "date"<=${todayStr}::date`,
  ])
  const orders=Number(ord[0].orders), revenue=Number(ord[0].order_sum), adSpend=Number(ad[0].spend), clicks=Number(ad[0].clicks)
  const scale = day > 0 ? daysInMonth/day : 1
  return { periodLabel:`1–${day} ${MONTH_NAMES[month]}`, daysElapsed:day, daysInMonth, orders, revenue, adSpend, clicks, forecastOrders:Math.round(orders*scale), forecastRevenue:Math.round(revenue*scale), forecastAdSpend:Math.round(adSpend*scale), forecastClicks:Math.round(clicks*scale) }
}

export async function getStockAlerts(storeIds: string[]): Promise<StockItem[]> {
  if (!storeIds.length) return []
  const rows = await db<{nm_id:number,supplier_article:string,subject:string,brand:string,quantity:number,daily_rate:number}[]>`
    WITH latest AS (
      SELECT MAX("date") AS d FROM wb_stocks WHERE store_id=ANY(${storeIds})
    ), stocks AS (
      SELECT s.nm_id, s.supplier_article, s.subject, s.brand, SUM(s.quantity) quantity
      FROM wb_stocks s, latest
      WHERE s.store_id=ANY(${storeIds}) AND s."date"=latest.d AND s.quantity>0
      GROUP BY 1,2,3,4
    ), rates AS (
      SELECT nm_id, COUNT(*)::float/7 daily_rate
      FROM wb_orders
      WHERE store_id=ANY(${storeIds}) AND "date">=NOW()-INTERVAL '7 days' AND is_cancel=false
      GROUP BY 1
    )
    SELECT st.nm_id, st.supplier_article, st.subject, st.brand, st.quantity,
           COALESCE(r.daily_rate,0) daily_rate
    FROM stocks st LEFT JOIN rates r USING(nm_id)
    ORDER BY CASE WHEN r.daily_rate>0 THEN st.quantity/r.daily_rate ELSE 9999 END
    LIMIT 50
  `
  return rows.map(r => ({
    nm_id: r.nm_id, supplier_article: r.supplier_article??'—',
    subject: r.subject??'—', brand: r.brand??'—', quantity: Number(r.quantity),
    days_left: r.daily_rate > 0 ? Math.round(Number(r.quantity)/Number(r.daily_rate)) : null,
  }))
}

export async function getManualCosts(storeIds: string[], dateFrom: string, dateTo: string): Promise<ManualCost[]> {
  if (!storeIds.length) return []
  return db<ManualCost[]>`
    SELECT id,store_id,"date"::text date,category,description,amount::float amount
    FROM manual_costs WHERE store_id=ANY(${storeIds}) AND "date">=${dateFrom}::date AND "date"<=${dateTo}::date
    ORDER BY date DESC
  `
}

export async function getPnL(storeIds: string[], dateFrom: string, dateTo: string): Promise<PnLSummary> {
  if (!storeIds.length) return { sale:0,forPay:0,commission:0,logistics:0,storage:0,penalties:0,correction:0,otherDeductions:0,totalToPay:0,adSpend:0,reportCount:0,revenue:0,returns:0,additionalPayments:0,netPayable:0 }
  const [wr, ad] = await Promise.all([
    db<{sale:number,for_pay:number,logistics_cost:number,storage_cost:number,total_fines:number,wb_commission_correction:number,other_deductions:number,total_to_pay:number,cnt:number}[]>`
      SELECT COALESCE(SUM(sale),0) sale, COALESCE(SUM(for_pay),0) for_pay,
             COALESCE(SUM(logistics_cost),0) logistics_cost, COALESCE(SUM(storage_cost),0) storage_cost,
             COALESCE(SUM(total_fines),0) total_fines, COALESCE(SUM(wb_commission_correction),0) wb_commission_correction,
             COALESCE(SUM(other_deductions),0) other_deductions, COALESCE(SUM(total_to_pay),0) total_to_pay,
             COUNT(*) cnt
      FROM wb_weekly_reports WHERE store_id=ANY(${storeIds}) AND date_from>=${dateFrom}::date AND date_to<=${dateTo}::date`,
    db<{spend:number}[]>`SELECT COALESCE(SUM(spend),0) spend FROM wb_ad_spend WHERE store_id=ANY(${storeIds}) AND "date">=${dateFrom}::date AND "date"<=${dateTo}::date`,
  ])
  const r=wr[0]
  const sale=Number(r.sale), forPay=Number(r.for_pay)
  const totalToPay=Number(r.total_to_pay), adSpend=Number(ad[0].spend)
  return { sale, forPay, commission:sale-forPay, logistics:Number(r.logistics_cost), storage:Number(r.storage_cost), penalties:Number(r.total_fines), correction:Number(r.wb_commission_correction), otherDeductions:Number(r.other_deductions), totalToPay, adSpend, reportCount:Number(r.cnt), revenue:sale, returns:0, additionalPayments:0, netPayable:totalToPay }
}

export async function getAdPageData(storeIds: string[]): Promise<AdPageData> {
  const now = moscowNow()
  const year=now.getUTCFullYear(), month=now.getUTCMonth(), day=now.getUTCDate()
  const todayStr = now.toISOString().split('T')[0]
  const monthStart = `${year}-${String(month+1).padStart(2,'0')}-01`
  const daysInMonth = new Date(Date.UTC(year,month+1,0)).getUTCDate()

  const empty: AdStats = { spend:0,ordersSum:0,ordersCount:0,clicks:0,views:0,ddr:0,ctr:0 }
  if (!storeIds.length) return { periodLabel:`1–${day} ${MONTH_NAMES[month]}`, daysElapsed:day, daysInMonth, today:empty, month:empty, forecast:empty }

  const [todayAd, monthAd] = await Promise.all([
    db<{spend:number,orders_sum:number,orders_count:number,clicks:number,views:number}[]>`
      SELECT COALESCE(SUM(spend),0) spend,COALESCE(SUM(orders_sum),0) orders_sum,COALESCE(SUM(orders_count),0) orders_count,COALESCE(SUM(clicks),0) clicks,COALESCE(SUM(views),0) views
      FROM wb_ad_spend WHERE store_id=ANY(${storeIds}) AND "date"=${todayStr}::date`,
    db<{spend:number,orders_sum:number,orders_count:number,clicks:number,views:number}[]>`
      SELECT COALESCE(SUM(spend),0) spend,COALESCE(SUM(orders_sum),0) orders_sum,COALESCE(SUM(orders_count),0) orders_count,COALESCE(SUM(clicks),0) clicks,COALESCE(SUM(views),0) views
      FROM wb_ad_spend WHERE store_id=ANY(${storeIds}) AND "date">=${monthStart}::date AND "date"<=${todayStr}::date`,
  ])

  const [todayOrdSum, monthOrdSum] = await Promise.all([
    db<{v:number}[]>`SELECT COALESCE(SUM(total_price*(1-COALESCE(discount_percent,0)/100)),0) v FROM wb_orders WHERE store_id=ANY(${storeIds}) AND "date"=${todayStr}::date AND is_cancel=false`,
    db<{v:number}[]>`SELECT COALESCE(SUM(total_price*(1-COALESCE(discount_percent,0)/100)),0) v FROM wb_orders WHERE store_id=ANY(${storeIds}) AND "date">=${monthStart}::date AND is_cancel=false`,
  ])

  function toStats(row: typeof todayAd[0], ordSum: number): AdStats {
    const spend=Number(row.spend), views=Number(row.views), clicks=Number(row.clicks)
    return { spend, ordersSum:Number(row.orders_sum), ordersCount:Number(row.orders_count), clicks, views, ddr:ordSum>0?spend/ordSum*100:0, ctr:views>0?clicks/views*100:0 }
  }
  const today = toStats(todayAd[0], Number(todayOrdSum[0].v))
  const monthS = toStats(monthAd[0], Number(monthOrdSum[0].v))
  const scale = day>0 ? daysInMonth/day : 1
  const forecast: AdStats = { spend:monthS.spend*scale, ordersSum:monthS.ordersSum*scale, ordersCount:Math.round(monthS.ordersCount*scale), clicks:Math.round(monthS.clicks*scale), views:Math.round(monthS.views*scale), ddr:monthS.ddr, ctr:monthS.ctr }

  return { periodLabel:`1–${day} ${MONTH_NAMES[month]}`, daysElapsed:day, daysInMonth, today, month:monthS, forecast }
}
