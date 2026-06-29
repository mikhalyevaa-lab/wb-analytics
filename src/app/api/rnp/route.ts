import { adminDb } from '@/lib/db-compat'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-server'
import { getUserStoreIds } from '@/lib/queries'

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
  const user = await requireAuth().catch(() => null)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const storeIds = await getUserStoreIds(user.id)
  if (!storeIds.length) return NextResponse.json({ error: 'No store' }, { status: 404 })

  const url = req.nextUrl
  const dateFrom = url.searchParams.get('from') ?? daysAgo(60)
  const dateTo   = url.searchParams.get('to')   ?? new Date().toISOString().split('T')[0]

  const adb = adminDb()

  const [financeRes, salesRes, adRes, stocksRes, funnelRes] = await Promise.all([
    // wb_finance — только штрафы и доп.выплаты
    adb.from('wb_finance')
      .select('date_from, date_to, penalty, additional_payment')
      .in('store_id', storeIds)
      .gte('date_from', dateFrom)
      .lte('date_to', dateTo)
      .limit(200000),

    // wb_sales — ежедневные выкупы (is_realization=true)
    adb.from('wb_sales')
      .select('date, is_realization')
      .in('store_id', storeIds)
      .gte('date', dateFrom)
      .lte('date', dateTo + 'T23:59:59')
      .eq('is_realization', true)
      .limit(200000),

    // Реклама по дням
    adb.from('wb_ad_spend')
      .select('date, spend')
      .in('store_id', storeIds)
      .gte('date', dateFrom)
      .lte('date', dateTo)
      .limit(50000),

    // Текущие остатки — сумма quantity по всем складам на последнюю дату снапшота
    adb.from('wb_stocks')
      .select('quantity, date')
      .in('store_id', storeIds)
      .order('date', { ascending: false })
      .limit(50000),

    // Воронка — заказы и переходы по дням (основной источник заказов)
    adb.from('wb_funnel')
      .select('date, open_count, order_count, order_sum')
      .in('store_id', storeIds)
      .gte('date', dateFrom)
      .lte('date', dateTo)
      .limit(200000),
  ])

  type FinRow     = { date_from: string | null; date_to: string | null; penalty: number | null; additional_payment: number | null }
  type SaleRow    = { date: string | null; is_realization: boolean | null }
  type AdRow      = { date: string | null; spend: number | null }
  type StockRow   = { quantity: number | null; date: string | null }
  type FunnelRow  = { date: string | null; open_count: number | null; order_count: number | null; order_sum: number | null }

  const finRows    = (financeRes.data ?? []) as FinRow[]
  const salesRows  = (salesRes.data   ?? []) as SaleRow[]
  const adRows     = (adRes.data      ?? []) as AdRow[]
  const stocks     = (stocksRes.data  ?? []) as StockRow[]
  const funnelRows = (funnelRes.data  ?? []) as FunnelRow[]

  // Остаток ВБ — сумма quantity по всем складам на последнюю дату снапшота
  const toStr = (d: unknown) => typeof d === 'string' ? d.slice(0, 10) : d instanceof Date ? d.toISOString().slice(0, 10) : ''
  const latestDate = stocks.reduce((max, r) => { const s = toStr(r.date); return s > max ? s : max }, '')
  const totalStock = stocks
    .filter(r => toStr(r.date) === latestDate)
    .reduce((s, r) => s + (r.quantity ?? 0), 0)

  // Воронка — агрегируем заказы и переходы по дням
  const funnelMap = new Map<string, { open_count: number; order_count: number; order_sum: number }>()
  for (const f of funnelRows) {
    const day = f.date?.slice(0, 10)
    if (!day) continue
    const cur = funnelMap.get(day) ?? { open_count: 0, order_count: 0, order_sum: 0 }
    cur.open_count  += f.open_count  ?? 0
    cur.order_count += f.order_count ?? 0
    cur.order_sum   += f.order_sum   ?? 0
    funnelMap.set(day, cur)
  }

  // Агрегация по дням
  type DayAcc = {
    orders_count: number
    orders_sum: number
    sales_count: number
    penalties: number
    additional: number
    ad_spend: number
  }

  const dayMap = new Map<string, DayAcc>()

  const emptyDay = (): DayAcc => ({
    orders_count: 0, orders_sum: 0,
    sales_count: 0,
    penalties: 0, additional: 0, ad_spend: 0,
  })

  // Продажи (выкупы) — из wb_sales (только is_realization=true, фильтр в запросе)
  for (const s of salesRows) {
    const day = s.date?.slice(0, 10)
    if (!day) continue
    const acc = dayMap.get(day) ?? emptyDay()
    acc.sales_count++
    dayMap.set(day, acc)
  }

  // wb_finance — штрафы и доп.выплаты (логистика убрана — не отображается)
  // Данные еженедельные: распределяем равномерно по дням периода (date_from → date_to)
  for (const r of finRows) {
    const wStart = r.date_from?.slice(0, 10)
    const wEnd   = r.date_to?.slice(0, 10) ?? wStart
    if (!wStart || !wEnd) continue

    const weekDays: string[] = []
    const cur = new Date(wStart + 'T00:00:00Z')
    const end = new Date(wEnd + 'T00:00:00Z')
    while (cur <= end) {
      const d = cur.toISOString().slice(0, 10)
      if (d >= dateFrom && d <= dateTo) weekDays.push(d)
      cur.setUTCDate(cur.getUTCDate() + 1)
    }
    if (!weekDays.length) continue

    const totalDays = Math.max(1,
      (new Date(wEnd + 'T00:00:00Z').getTime() - new Date(wStart + 'T00:00:00Z').getTime()) / 86400000 + 1
    )
    const frac = 1 / totalDays

    for (const day of weekDays) {
      const acc = dayMap.get(day) ?? emptyDay()
      acc.penalties  += Math.abs(r.penalty ?? 0) * frac
      acc.additional += (r.additional_payment ?? 0) * frac
      dayMap.set(day, acc)
    }
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
    const funnel = funnelMap.get(date) ?? { open_count: 0, order_count: 0, order_sum: 0 }

    // Заказы — из воронки (wb_funnel), чтобы данные совпадали со страницей Воронка
    const ordersCount = funnel.order_count
    const ordersSum   = funnel.order_sum

    // ДРР = расход на рекламу / сумма заказов * 100
    const drr = ordersSum > 0 ? (acc.ad_spend / ordersSum) * 100 : null

    // CR% (заказы → продажи)
    const crOrderToSale = ordersCount > 0 ? (acc.sales_count / ordersCount) * 100 : null

    const openCount = funnel.open_count

    return {
      date,
      orders_count:    ordersCount,
      orders_sum:      Math.round(ordersSum),
      sales_count:     Math.round(acc.sales_count),
      ad_spend:        Math.round(acc.ad_spend),
      drr:             drr !== null ? Math.round(drr * 10) / 10 : null,
      cr_order_sale:   crOrderToSale !== null ? Math.round(crOrderToSale * 10) / 10 : null,
      avg_order_price: ordersCount > 0 ? Math.round(ordersSum / ordersCount) : null,
      open_count:      openCount,
      cost_per_click:  openCount > 0 ? Math.round(acc.ad_spend / openCount * 100) / 100 : null,
    }
  })

  // Итоги
  const totals = byDate.reduce((acc, d) => ({
    orders_count: acc.orders_count + d.orders_count,
    orders_sum:   acc.orders_sum   + d.orders_sum,
    sales_count:  acc.sales_count  + d.sales_count,
    ad_spend:     acc.ad_spend     + d.ad_spend,
  }), { orders_count: 0, orders_sum: 0, sales_count: 0, ad_spend: 0 })

  // Время последней синхронизации воронки
  const lastOrdersSync = funnelRows.reduce((max, r) => {
    const t = r.date ?? ''
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
