import { adminDb } from '@/lib/db-compat'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-server'
import { getUserStoreIds } from '@/lib/queries'

function daysAgo(n: number) {
  const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().split('T')[0]
}

function isoWeek(dateStr: string): string {
  const d = new Date(dateStr)
  const day = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - day)
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  const weekNum = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)
  return `${d.getUTCFullYear()}-W${String(weekNum).padStart(2, '0')}`
}

export async function GET(req: NextRequest) {
  const user = await requireAuth().catch(() => null)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const storeIds = await getUserStoreIds(user.id)
  if (!storeIds.length) return NextResponse.json({ error: 'No store' }, { status: 404 })

  const url = req.nextUrl
  const dateFrom = url.searchParams.get('from') ?? daysAgo(30)
  const dateTo = url.searchParams.get('to') ?? new Date().toISOString().split('T')[0]
  const aggLevel = url.searchParams.get('agg') ?? 'day' // 'day' | 'week'
  const nmId = url.searchParams.get('nm_id') // optional: filter by single SKU

  // Calculate previous period (same length)
  const periodMs = new Date(dateTo).getTime() - new Date(dateFrom).getTime()
  const prevTo   = new Date(new Date(dateFrom).getTime() - 86400000).toISOString().split('T')[0]
  const prevFrom = new Date(new Date(dateFrom).getTime() - periodMs - 86400000).toISOString().split('T')[0]

  const sel = 'date, nm_id, open_count, cart_count, order_count, order_sum, buyout_count, buyout_sum, buyout_percent, add_to_cart_conversion, cart_to_order_conversion'

  let query = adminDb().from('wb_funnel').select(sel)
    .in('store_id', storeIds).gte('date', dateFrom).lte('date', dateTo)
    .order('date', { ascending: true }).limit(200000)
  if (nmId) query = query.eq('nm_id', parseInt(nmId))

  let prevQuery = adminDb().from('wb_funnel').select(sel)
    .in('store_id', storeIds).gte('date', prevFrom).lte('date', prevTo)
    .order('date', { ascending: true }).limit(200000)
  if (nmId) prevQuery = prevQuery.eq('nm_id', parseInt(nmId))

  // Заказы для замены order_sum — цена с учётом скидки продавца (оба периода)
  let ordersQuery = adminDb().from('wb_orders')
    .select('date, nm_id, total_price, discount_percent')
    .in('store_id', storeIds)
    .gte('date', prevFrom)
    .lte('date', dateTo + 'T23:59:59')
    .eq('is_cancel', false)
    .limit(500000)
  if (nmId) ordersQuery = ordersQuery.eq('nm_id', parseInt(nmId))

  const [{ data: rows, error }, { data: prevRows }, { data: ordersData }] = await Promise.all([query, prevQuery, ordersQuery])
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Строим карты: total_price × (1 − discount_percent/100)
  // wb_orders.date — UTC, wb_funnel.date — МСК дата → конвертируем +3ч
  type OrderRow = { date: string | null; nm_id: number | null; total_price: number | null; discount_percent: number | null }
  const orderSumByDate = new Map<string, number>()  // МСК-дата → сумма (оба периода)
  const orderSumByNm   = new Map<number, number>()  // nm_id → сумма (текущий период)
  for (const o of (ordersData ?? []) as OrderRow[]) {
    if (!o.date) continue
    const mskDay = new Date(new Date(o.date).getTime() + 3 * 3_600_000).toISOString().slice(0, 10)
    const priceWithDisc = Number(o.total_price ?? 0) * (1 - Number(o.discount_percent ?? 0) / 100)
    orderSumByDate.set(mskDay, (orderSumByDate.get(mskDay) ?? 0) + priceWithDisc)
    if (mskDay >= dateFrom && mskDay <= dateTo && o.nm_id) {
      orderSumByNm.set(o.nm_id, (orderSumByNm.get(o.nm_id) ?? 0) + priceWithDisc)
    }
  }

  // Aggregate by period (day or week)
  type PeriodAcc = {
    period: string
    open_count: number
    cart_count: number
    order_count: number
    order_sum: number
    buyout_count: number
    buyout_sum: number
    rows: number
  }

  type FunnelRow = { date: string; nm_id: number | null; open_count: number | null; cart_count: number | null; order_count: number | null; order_sum: number | null; buyout_count: number | null; buyout_sum: number | null; buyout_percent: number | null; add_to_cart_conversion: number | null; cart_to_order_conversion: number | null }
  // Helper to aggregate rows into periodMap
  function aggregateRows(data: FunnelRow[]) {
    const map = new Map<string, PeriodAcc>()
    // orderSumByDate — это сумма заказов магазина ЗА ДЕНЬ (не за nm_id), поэтому
    // прибавляем её к периоду только один раз на дату, а не в каждой строке nm_id
    const countedDates = new Set<string>()
    for (const r of data) {
      const period = aggLevel === 'week' ? isoWeek(r.date) : r.date
      const cur = map.get(period) ?? { period, open_count: 0, cart_count: 0, order_count: 0, order_sum: 0, buyout_count: 0, buyout_sum: 0, rows: 0 }
      cur.open_count  += r.open_count  ?? 0
      cur.cart_count  += r.cart_count  ?? 0
      cur.order_count += r.order_count ?? 0
      const dateKey = r.date?.slice(0, 10) ?? ''
      const dailySum = orderSumByDate.get(dateKey)
      if (dailySum !== undefined) {
        if (!countedDates.has(dateKey)) {
          countedDates.add(dateKey)
          cur.order_sum += dailySum
        }
      } else {
        cur.order_sum += r.order_sum ?? 0
      }
      cur.buyout_count += r.buyout_count ?? 0
      cur.buyout_sum  += r.buyout_sum  ?? 0
      cur.rows += 1
      map.set(period, cur)
    }
    return [...map.values()]
  }

  function mapToPeriodRows(acc: PeriodAcc[]) {
    return acc.map(p => ({
      period: p.period,
      open_count: p.open_count, cart_count: p.cart_count,
      order_count: p.order_count, order_sum: Math.round(p.order_sum),
      buyout_count: p.buyout_count, buyout_sum: Math.round(p.buyout_sum),
      add_to_cart_pct: p.open_count > 0 ? (p.cart_count / p.open_count) * 100 : 0,
      cart_to_order_pct: p.cart_count > 0 ? (p.order_count / p.cart_count) * 100 : 0,
      buyout_pct: p.order_count > 0 ? (p.buyout_count / p.order_count) * 100 : 0,
    }))
  }

  const allRows = (rows ?? []) as FunnelRow[]
  const periodMap = new Map<string, PeriodAcc>()

  const byPeriod = mapToPeriodRows(aggregateRows(allRows))
  const byPeriodPrev = mapToPeriodRows(aggregateRows((prevRows ?? []) as FunnelRow[]))

  // Summary totals
  const total = byPeriod.reduce((acc, p) => ({
    open_count: acc.open_count + p.open_count,
    cart_count: acc.cart_count + p.cart_count,
    order_count: acc.order_count + p.order_count,
    order_sum: acc.order_sum + p.order_sum,
    buyout_count: acc.buyout_count + p.buyout_count,
    buyout_sum: acc.buyout_sum + p.buyout_sum,
  }), { open_count: 0, cart_count: 0, order_count: 0, order_sum: 0, buyout_count: 0, buyout_sum: 0 })

  function calcSummary(periods: ReturnType<typeof mapToPeriodRows>) {
    const t = periods.reduce((acc, p) => ({
      open_count: acc.open_count + p.open_count, cart_count: acc.cart_count + p.cart_count,
      order_count: acc.order_count + p.order_count, order_sum: acc.order_sum + p.order_sum,
      buyout_count: acc.buyout_count + p.buyout_count, buyout_sum: acc.buyout_sum + p.buyout_sum,
    }), { open_count: 0, cart_count: 0, order_count: 0, order_sum: 0, buyout_count: 0, buyout_sum: 0 })
    return {
      ...t,
      add_to_cart_pct:  t.open_count  > 0 ? (t.cart_count  / t.open_count)  * 100 : 0,
      cart_to_order_pct: t.cart_count > 0 ? (t.order_count / t.cart_count)   * 100 : 0,
      buyout_pct:       t.order_count > 0 ? (t.buyout_count / t.order_count) * 100 : 0,
    }
  }

  const summary     = calcSummary(byPeriod)
  const summaryPrev = calcSummary(byPeriodPrev)

  // Aggregate by nm_id for the selected period
  type NmAcc = { nm_id: number; open_count: number; cart_count: number; order_count: number; order_sum: number; buyout_count: number; buyout_sum: number }
  const nmMap = new Map<number, NmAcc>()
  for (const r of allRows) {
    if (!r.nm_id) continue
    const cur = nmMap.get(r.nm_id) ?? { nm_id: r.nm_id, open_count: 0, cart_count: 0, order_count: 0, order_sum: 0, buyout_count: 0, buyout_sum: 0 }
    cur.open_count   += r.open_count   ?? 0
    cur.cart_count   += r.cart_count   ?? 0
    cur.order_count  += r.order_count  ?? 0
    cur.order_sum    += r.order_sum    ?? 0
    cur.buyout_count += r.buyout_count ?? 0
    cur.buyout_sum   += r.buyout_sum   ?? 0
    nmMap.set(r.nm_id, cur)
  }

  // Fetch product info for nm_ids
  const nmIds = [...nmMap.keys()]
  type ProductRow = { nm_id: number; vendor_code: string | null; title: string | null; photo_url: string | null }
  const { data: products } = nmIds.length
    ? await adminDb().from('products').select('nm_id, vendor_code, title, photo_url').in('nm_id', nmIds)
    : { data: [] as ProductRow[] }
  const productMap = new Map<number, ProductRow>((products ?? []).map((p: ProductRow) => [p.nm_id, p]))

  const byNm = [...nmMap.values()]
    .map(nm => {
      const p = productMap.get(nm.nm_id)
      return {
        nm_id:             nm.nm_id,
        vendor_code:       p?.vendor_code ?? null,
        title:             p?.title ?? null,
        photo_url:         p?.photo_url ?? null,
        open_count:        nm.open_count,
        cart_count:        nm.cart_count,
        order_count:       nm.order_count,
        order_sum:         Math.round(orderSumByNm.get(nm.nm_id) ?? nm.order_sum),
        buyout_count:      nm.buyout_count,
        buyout_sum:        Math.round(nm.buyout_sum),
        add_to_cart_pct:   nm.open_count  > 0 ? (nm.cart_count  / nm.open_count)  * 100 : 0,
        cart_to_order_pct: nm.cart_count  > 0 ? (nm.order_count / nm.cart_count)   * 100 : 0,
        buyout_pct:        nm.order_count > 0 ? (nm.buyout_count / nm.order_count) * 100 : 0,
      }
    })
    .sort((a, b) => b.order_sum - a.order_sum)

  // Last sync timestamp for this store
  const { data: syncRow } = await adminDb()
    .from('wb_funnel')
    .select('date, created_at')
    .in('store_id', storeIds)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const sr = syncRow as { date?: string; created_at?: string } | null
  const lastSyncDate = sr?.date ?? null
  const lastSyncAt   = sr?.created_at ?? null

  return NextResponse.json({ byPeriod, byPeriodPrev, summary, summaryPrev, byNm, hasData: (rows?.length ?? 0) > 0, lastSyncDate, lastSyncAt, prevFrom, prevTo })
}
