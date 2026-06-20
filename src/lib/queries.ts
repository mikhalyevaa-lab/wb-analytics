/**
 * Server-side запросы к Supabase для дашборда
 */

import { createClient } from './supabase-server'
import { SupabaseClient } from '@supabase/supabase-js'

// Supabase PostgREST cap = 1000 строк. Для агрегатов по большим таблицам нужна пагинация.
async function fetchAllOrderRows(
  db: SupabaseClient,
  storeIds: string[],
  dateFrom: string,
  dateTo?: string
): Promise<{ g_number: string | null; nm_id: number | null; barcode: string | null; total_price: number | null; discount_percent: number | null }[]> {
  const rows: { g_number: string | null; nm_id: number | null; barcode: string | null; total_price: number | null; discount_percent: number | null }[] = []
  for (let page = 0; ; page++) {
    let q = db.from('wb_orders')
      .select('g_number, nm_id, barcode, total_price, discount_percent')
      .in('store_id', storeIds)
      .gte('date', dateFrom)
      .eq('is_cancel', false)
      .range(page * 1000, (page + 1) * 1000 - 1)
    if (dateTo) q = q.lte('date', dateTo)
    const { data } = await q
    if (!data?.length) break
    rows.push(...data)
    if (data.length < 1000) break
  }
  return rows
}

export interface KpiData {
  revenue: number
  revenuePrev: number
  orders: number
  ordersPrev: number
  sales: number
  salesPrev: number
  buyoutRate: number
  buyoutRatePrev: number
  adSpend: number
  adSpendPrev: number
  clicks: number
  clicksPrev: number
}

export interface DailySales {
  date: string
  revenue: number
  orders: number
  sales: number
}

export interface StockItem {
  nm_id: number
  supplier_article: string
  subject: string
  brand: string
  quantity: number
  days_left: number | null
}

function startOfDay(date: Date): string {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  return d.toISOString()
}

function daysBack(n: number): Date {
  const d = new Date()
  d.setDate(d.getDate() - n)
  d.setHours(0, 0, 0, 0)
  return d
}

// Пагинация для wb_sales (for_pay + count) — обходит cap 1000 строк
async function fetchAllSaleRows(
  db: SupabaseClient,
  storeIds: string[],
  dateFrom: string,
  dateTo?: string
): Promise<{ for_pay: number | null }[]> {
  const rows: { for_pay: number | null }[] = []
  for (let page = 0; ; page++) {
    let q = db.from('wb_sales')
      .select('for_pay')
      .in('store_id', storeIds)
      .gte('date', dateFrom)
      .range(page * 1000, (page + 1) * 1000 - 1)
    if (dateTo) q = q.lt('date', dateTo)
    const { data } = await q
    if (!data?.length) break
    rows.push(...data)
    if (data.length < 1000) break
  }
  return rows
}

export async function getKpi(storeIds: string[]): Promise<KpiData> {
  const db = await createClient()

  const monthStart   = startOfDay(daysBack(30))
  const prevMonthStart = startOfDay(daysBack(60))
  const prevMonthEnd   = startOfDay(daysBack(30))

  // orders: COUNT запросы не бьются об cap (head:true)
  // sales + ad: нужна пагинация
  const [ordersCur, ordersPrev, adCur, adPrev] = await Promise.all([
    db.from('wb_orders')
      .select('id', { count: 'exact', head: true })
      .in('store_id', storeIds)
      .gte('date', monthStart)
      .eq('is_cancel', false),
    db.from('wb_orders')
      .select('id', { count: 'exact', head: true })
      .in('store_id', storeIds)
      .gte('date', prevMonthStart)
      .lt('date', prevMonthEnd)
      .eq('is_cancel', false),
    db.from('wb_ad_spend')
      .select('spend, clicks')
      .in('store_id', storeIds)
      .gte('date', monthStart),
    db.from('wb_ad_spend')
      .select('spend, clicks')
      .in('store_id', storeIds)
      .gte('date', prevMonthStart)
      .lt('date', prevMonthEnd),
  ])

  const [salesCurRows, salesPrevRows] = await Promise.all([
    fetchAllSaleRows(db, storeIds, monthStart),
    fetchAllSaleRows(db, storeIds, prevMonthStart, prevMonthEnd),
  ])

  const revenue      = salesCurRows.reduce((s, r) => s + (r.for_pay ?? 0), 0)
  const revenuePrev  = salesPrevRows.reduce((s, r) => s + (r.for_pay ?? 0), 0)
  const salesCount   = salesCurRows.length
  const salesCountPrev = salesPrevRows.length
  const ordersCount    = ordersCur.count ?? 0
  const ordersPrevCount = ordersPrev.count ?? 0
  const buyoutRate     = ordersCount > 0 ? Math.round((salesCount / ordersCount) * 100) : 0
  const buyoutRatePrev = ordersPrevCount > 0 ? Math.round((salesCountPrev / ordersPrevCount) * 100) : 0
  const adSpend      = (adCur.data ?? []).reduce((s, r) => s + (r.spend ?? 0), 0)
  const adSpendPrev  = (adPrev.data ?? []).reduce((s, r) => s + (r.spend ?? 0), 0)
  const clicks       = (adCur.data ?? []).reduce((s, r) => s + (r.clicks ?? 0), 0)
  const clicksPrev   = (adPrev.data ?? []).reduce((s, r) => s + (r.clicks ?? 0), 0)

  return {
    revenue, revenuePrev,
    orders: ordersCount, ordersPrev: ordersPrevCount,
    sales: salesCount, salesPrev: salesCountPrev,
    buyoutRate, buyoutRatePrev,
    adSpend, adSpendPrev,
    clicks, clicksPrev,
  }
}

export async function getDailySales(storeIds: string[]): Promise<DailySales[]> {
  const db = await createClient()
  const dateFrom = startOfDay(daysBack(30))

  const { data: salesData } = await db
    .from('wb_sales')
    .select('date, for_pay')
    .in('store_id', storeIds)
    .gte('date', dateFrom)
    .order('date')

  // Пагинация заказов: за 30 дней может быть > 1000 строк
  type OrderRow = { date: string | null; g_number: string | null; nm_id: number | null; barcode: string | null; total_price: number | null; discount_percent: number | null }
  const ordersRaw: OrderRow[] = []
  for (let page = 0; ; page++) {
    const { data } = await db.from('wb_orders')
      .select('date, g_number, nm_id, barcode, total_price, discount_percent')
      .in('store_id', storeIds)
      .gte('date', dateFrom)
      .eq('is_cancel', false)
      .range(page * 1000, (page + 1) * 1000 - 1)
    if (!data?.length) break
    ordersRaw.push(...(data as OrderRow[]))
    if (data.length < 1000) break
  }

  // Дедуплицируем по (g_number, nm_id, barcode)
  const seenOrders = new Set<string>()
  const ordersData = ordersRaw.filter(r => {
    const k = `${r.g_number}|${r.nm_id}|${r.barcode}`
    if (seenOrders.has(k)) return false
    seenOrders.add(k)
    return true
  })

  const byDate: Record<string, { revenue: number; sales: number; orders: number }> = {}
  for (let i = 29; i >= 0; i--) {
    byDate[daysBack(i).toISOString().split('T')[0]] = { revenue: 0, sales: 0, orders: 0 }
  }

  for (const row of salesData ?? []) {
    const key = row.date?.split('T')[0]
    if (key && byDate[key]) {
      byDate[key].revenue += row.for_pay ?? 0
      byDate[key].sales += 1
    }
  }

  for (const row of ordersData) {
    const key = row.date?.split('T')[0]
    if (key && byDate[key]) {
      byDate[key].orders += 1
      // Сумма заказа: total_price × (1 - discount_percent/100)
      const dp = (row.discount_percent ?? 0) / 100
      byDate[key].revenue += (row.total_price ?? 0) * (1 - dp)
    }
  }

  return Object.entries(byDate).map(([date, v]) => ({ date, ...v }))
}

export interface TodayStats {
  date: string
  orders: number
  revenue: number
  adSpend: number
  clicks: number
}

export interface MonthStats {
  periodLabel: string
  daysElapsed: number
  daysInMonth: number
  orders: number
  revenue: number
  adSpend: number
  clicks: number
  forecastOrders: number
  forecastRevenue: number
  forecastAdSpend: number
  forecastClicks: number
}

type OrderRow = {
  g_number: string | null
  nm_id: number | null
  barcode: string | null
  total_price: number | null
  discount_percent: number | null
}

function calcRevenue(rows: OrderRow[]): { orders: number; revenue: number } {
  // Deduplicate by (g_number, nm_id, barcode) to avoid sync duplicates
  const seen = new Set<string>()
  let orders = 0; let revenue = 0
  for (const r of rows) {
    const key = `${r.g_number}|${r.nm_id}|${r.barcode}`
    if (seen.has(key)) continue
    seen.add(key)
    orders++
    const dp = (r.discount_percent ?? 0) > 1
      ? (r.discount_percent ?? 0) / 100
      : (r.discount_percent ?? 0)
    revenue += (r.total_price ?? 0) * (1 - dp)
  }
  return { orders, revenue }
}

export async function getTodayStats(storeIds: string[]): Promise<TodayStats> {
  const db = await createClient()

  const now = new Date()
  const moscowNow = new Date(now.getTime() + 3 * 60 * 60 * 1000)
  const todayMoscow = moscowNow.toISOString().split('T')[0]
  const todayStart = new Date(todayMoscow + 'T00:00:00+03:00').toISOString()

  const [ordersRows, adRes] = await Promise.all([
    fetchAllOrderRows(db, storeIds, todayStart),
    db.from('wb_ad_spend')
      .select('spend, clicks')
      .in('store_id', storeIds)
      .eq('date', todayMoscow),
  ])

  const { orders, revenue } = calcRevenue(ordersRows)
  const adSpend = (adRes.data ?? []).reduce((s, r) => s + (r.spend ?? 0), 0)
  const clicks  = (adRes.data ?? []).reduce((s, r) => s + (r.clicks ?? 0), 0)

  return { date: todayMoscow, orders, revenue, adSpend, clicks }
}

export async function getMonthStats(storeIds: string[]): Promise<MonthStats> {
  const db = await createClient()

  const now = new Date()
  const moscowNow = new Date(now.getTime() + 3 * 60 * 60 * 1000)
  const year  = moscowNow.getUTCFullYear()
  const month = moscowNow.getUTCMonth()
  const day   = moscowNow.getUTCDate()

  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
  const daysElapsed = day

  const monthStartStr = `${year}-${String(month + 1).padStart(2, '0')}-01`
  const monthStart = new Date(monthStartStr + 'T00:00:00+03:00').toISOString()

  const MONTH_NAMES = ['января','февраля','марта','апреля','мая','июня',
    'июля','августа','сентября','октября','ноября','декабря']
  const periodLabel = `1–${day} ${MONTH_NAMES[month]}`

  const [ordersRows, adRes] = await Promise.all([
    fetchAllOrderRows(db, storeIds, monthStart),
    db.from('wb_ad_spend')
      .select('spend, clicks')
      .in('store_id', storeIds)
      .gte('date', monthStartStr),
  ])

  const { orders, revenue } = calcRevenue(ordersRows)
  const adSpend = (adRes.data ?? []).reduce((s, r) => s + (r.spend ?? 0), 0)
  const clicks  = (adRes.data ?? []).reduce((s, r) => s + (r.clicks ?? 0), 0)

  const scale = daysElapsed > 0 ? daysInMonth / daysElapsed : 1

  return {
    periodLabel,
    daysElapsed,
    daysInMonth,
    orders,
    revenue,
    adSpend,
    clicks,
    forecastOrders:  Math.round(orders  * scale),
    forecastRevenue: Math.round(revenue * scale),
    forecastAdSpend: Math.round(adSpend * scale),
    forecastClicks:  Math.round(clicks  * scale),
  }
}

export async function getStockAlerts(storeIds: string[]): Promise<StockItem[]> {
  const db = await createClient()
  const dateFrom = new Date(Date.now() - 7 * 864e5).toISOString().split('T')[0]

  // Берём последнюю доступную дату остатков (не привязываемся к "сегодня")
  const { data: latestRow } = await db
    .from('wb_stocks')
    .select('date')
    .in('store_id', storeIds)
    .order('date', { ascending: false })
    .limit(1)
    .single()

  if (!latestRow?.date) return []
  const latestDate = latestRow.date

  // Агрегируем остатки по nm_id (суммируем по всем складам)
  const { data: rawStocks } = await db
    .from('wb_stocks')
    .select('nm_id, supplier_article, subject, brand, quantity')
    .in('store_id', storeIds)
    .eq('date', latestDate)
    .gt('quantity', 0)

  if (!rawStocks?.length) return []

  // Суммируем quantity по nm_id
  const byNm: Record<number, { supplier_article: string; subject: string; brand: string; quantity: number }> = {}
  for (const s of rawStocks) {
    if (!s.nm_id) continue
    if (!byNm[s.nm_id]) {
      byNm[s.nm_id] = {
        supplier_article: s.supplier_article ?? '—',
        subject: s.subject ?? '—',
        brand: s.brand ?? '—',
        quantity: 0,
      }
    }
    byNm[s.nm_id].quantity += s.quantity ?? 0
  }

  const nmIds = Object.keys(byNm).map(Number)

  const { data: recentOrders } = await db
    .from('wb_orders')
    .select('nm_id')
    .in('store_id', storeIds)
    .in('nm_id', nmIds)
    .gte('date', dateFrom)
    .eq('is_cancel', false)

  const ordByNm: Record<number, number> = {}
  for (const o of recentOrders ?? []) {
    if (o.nm_id) ordByNm[o.nm_id] = (ordByNm[o.nm_id] ?? 0) + 1
  }

  return Object.entries(byNm)
    .map(([nmId, s]) => {
      const nm = Number(nmId)
      const weeklyOrders = ordByNm[nm] ?? 0
      const dailyRate = weeklyOrders / 7
      const daysLeft = dailyRate > 0 ? Math.round(s.quantity / dailyRate) : null
      return {
        nm_id: nm,
        supplier_article: s.supplier_article,
        subject: s.subject,
        brand: s.brand,
        quantity: s.quantity,
        days_left: daysLeft,
      }
    })
    .filter(s => s.quantity > 0)
    .sort((a, b) => {
      // Сначала те, у кого кончается (с конкретным числом дней), потом без заказов
      const aD = a.days_left ?? 9999
      const bD = b.days_left ?? 9999
      return aD - bD
    })
    .slice(0, 50)
}

export interface PnLRow {
  doc_type_name: string
  multiplier: number
  quantity: number
  ppvz_for_pay: number
  delivery_rub: number
  penalty: number
  additional_payment: number
}

export interface PnLSummary {
  revenue: number
  returns: number
  logistics: number
  penalties: number
  additionalPayments: number
  netPayable: number
}

export type { ManualCost } from './types'
export { CATEGORY_LABELS } from './types'
import type { ManualCost } from './types'

export async function getManualCosts(storeIds: string[], dateFrom: string, dateTo: string): Promise<ManualCost[]> {
  const db = await createClient()
  const { data } = await db
    .from('manual_costs')
    .select('id, store_id, date, category, description, amount')
    .in('store_id', storeIds)
    .gte('date', dateFrom)
    .lte('date', dateTo)
    .order('date', { ascending: false })
  return (data ?? []) as ManualCost[]
}

export async function getPnL(storeIds: string[], dateFrom: string, dateTo: string): Promise<PnLSummary> {
  const db = await createClient()

  const [{ data: dirRows }, { data: finRows }] = await Promise.all([
    db.from('directory').select('doc_type_name, multiplier'),
    db.from('wb_finance')
      .select('doc_type_name, ppvz_for_pay, delivery_rub, penalty, additional_payment')
      .in('store_id', storeIds)
      .gte('date_from', dateFrom)
      .lte('date_to', dateTo),
  ])

  const multiplierMap: Record<string, number> = {}
  for (const d of dirRows ?? []) {
    multiplierMap[d.doc_type_name] = d.multiplier
  }

  let revenue = 0
  let returns = 0
  let logistics = 0
  let penalties = 0
  let additionalPayments = 0

  for (const row of finRows ?? []) {
    const mult = multiplierMap[row.doc_type_name] ?? 0
    if (mult === 1) revenue += row.ppvz_for_pay ?? 0
    if (mult === -1) returns += Math.abs(row.ppvz_for_pay ?? 0)
    logistics += row.delivery_rub ?? 0
    penalties += row.penalty ?? 0
    additionalPayments += row.additional_payment ?? 0
  }

  return {
    revenue,
    returns,
    logistics,
    penalties,
    additionalPayments,
    netPayable: revenue - returns - logistics - penalties + additionalPayments,
  }
}

export async function getUserStoreIds(userId: string): Promise<string[]> {
  const db = await createClient()
  const { data } = await db
    .from('user_stores')
    .select('store_id')
    .eq('user_id', userId)
  return (data ?? []).map(r => r.store_id)
}

export async function getStores(storeIds: string[]) {
  const db = await createClient()
  const { data } = await db
    .from('stores')
    .select('id, name')
    .in('id', storeIds)
  return data ?? []
}

// ============================================================
// Рекламная аналитика
// ============================================================

type AdRow = { spend: number | null; orders_sum: number | null; orders_count: number | null; clicks: number | null; views: number | null }

export interface AdStats {
  spend: number
  ordersSum: number
  ordersCount: number
  clicks: number
  views: number
  ddr: number
  ctr: number
}

export interface AdPageData {
  periodLabel: string
  daysElapsed: number
  daysInMonth: number
  today: AdStats
  month: AdStats
  forecast: AdStats
}

function calcAdStats(rows: AdRow[]): AdStats {
  const spend       = rows.reduce((s, r) => s + (r.spend        ?? 0), 0)
  const ordersSum   = rows.reduce((s, r) => s + (r.orders_sum   ?? 0), 0)
  const ordersCount = rows.reduce((s, r) => s + (r.orders_count ?? 0), 0)
  const clicks      = rows.reduce((s, r) => s + (r.clicks       ?? 0), 0)
  const views       = rows.reduce((s, r) => s + (r.views        ?? 0), 0)
  return {
    spend, ordersSum, ordersCount, clicks, views,
    ddr: ordersSum > 0 ? (spend / ordersSum) * 100 : 0,
    ctr: views     > 0 ? (clicks / views)   * 100 : 0,
  }
}

export async function getAdPageData(storeIds: string[]): Promise<AdPageData> {
  const db = await createClient()
  const moscowNow  = new Date(Date.now() + 3 * 60 * 60 * 1000)
  const year       = moscowNow.getUTCFullYear()
  const month      = moscowNow.getUTCMonth()
  const day        = moscowNow.getUTCDate()
  const todayStr   = moscowNow.toISOString().split('T')[0]
  const monthStart = `${year}-${String(month + 1).padStart(2, '0')}-01`
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate()

  const MONTH_NAMES = ['января','февраля','марта','апреля','мая','июня',
    'июля','августа','сентября','октября','ноября','декабря']

  const sel = 'spend, orders_sum, orders_count, clicks, views'
  const [todayRes, monthRes] = await Promise.all([
    db.from('wb_ad_spend').select(sel).in('store_id', storeIds).eq('date', todayStr),
    db.from('wb_ad_spend').select(sel).in('store_id', storeIds)
      .gte('date', monthStart).lte('date', todayStr),
  ])

  const todayStats = calcAdStats(todayRes.data ?? [])
  const monthStats = calcAdStats(monthRes.data ?? [])

  const scale = day > 0 ? daysInMonth / day : 1
  const forecast: AdStats = {
    spend:        monthStats.spend        * scale,
    ordersSum:    monthStats.ordersSum    * scale,
    ordersCount:  Math.round(monthStats.ordersCount * scale),
    clicks:       Math.round(monthStats.clicks      * scale),
    views:        Math.round(monthStats.views       * scale),
    ddr:          monthStats.ddr,
    ctr:          monthStats.ctr,
  }

  return {
    periodLabel: `1–${day} ${MONTH_NAMES[month]}`,
    daysElapsed: day,
    daysInMonth,
    today: todayStats,
    month: monthStats,
    forecast,
  }
}
