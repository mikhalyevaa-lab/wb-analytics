import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { getUserStoreIds } from '@/lib/queries'
import { adminDb } from '@/lib/admin'

export const dynamic = 'force-dynamic'

function today() { return new Date().toISOString().split('T')[0] }
function thirtyDaysAgo() {
  const d = new Date(); d.setDate(d.getDate() - 30); return d.toISOString().split('T')[0]
}

async function paginateQuery<T>(queryFn: (from: number) => Promise<{ data: T[] | null }>) {
  const all: T[] = []
  let from = 0
  while (true) {
    const { data } = await queryFn(from)
    if (!data?.length) break
    all.push(...data)
    if (data.length < 1000) break
    from += 1000
  }
  return all
}

export async function GET(req: NextRequest) {
  const db = await createClient()
  const { data: { user } } = await db.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const storeIds = await getUserStoreIds(user.id)
  if (!storeIds.length) return NextResponse.json({ rows: [], summary: { A: 0, B: 0, C: 0 } })

  const url = req.nextUrl
  const dateFrom = url.searchParams.get('from') ?? thirtyDaysAgo()
  const dateTo   = url.searchParams.get('to') ?? today()
  const thresholdA = parseFloat(url.searchParams.get('thresholdA') ?? '0.80')
  const thresholdB = parseFloat(url.searchParams.get('thresholdB') ?? '0.95')
  const thresholdMA = parseFloat(url.searchParams.get('thresholdMA') ?? '0.30')
  const thresholdMB = parseFloat(url.searchParams.get('thresholdMB') ?? '0.10')

  // Prev period (same length) for comparison arrows
  const periodDays = Math.round((new Date(dateTo).getTime() - new Date(dateFrom).getTime()) / 86400000)
  const prevDateTo   = new Date(new Date(dateFrom).getTime() - 86400000).toISOString().split('T')[0]
  const prevDateFrom = new Date(new Date(dateFrom).getTime() - (periodDays + 1) * 86400000).toISOString().split('T')[0]

  const adb = adminDb()

  // ── Sales (current period) ──
  type SaleRow = { nm_id: number; finished_price: number; for_pay: number }
  const sales = await paginateQuery<SaleRow>(from => adb
    .from('wb_sales')
    .select('nm_id,finished_price,for_pay')
    .in('store_id', storeIds)
    .like('sale_id', 'S%')
    .gte('date', dateFrom)
    .lte('date', dateTo + 'T23:59:59')
    .range(from, from + 999) as unknown as Promise<{ data: SaleRow[] | null }>)

  // ── Sales (prev period) ──
  const salesPrev = await paginateQuery<SaleRow>(from => adb
    .from('wb_sales')
    .select('nm_id,finished_price,for_pay')
    .in('store_id', storeIds)
    .like('sale_id', 'S%')
    .gte('date', prevDateFrom)
    .lte('date', prevDateTo + 'T23:59:59')
    .range(from, from + 999) as unknown as Promise<{ data: SaleRow[] | null }>)

  // ── Products ──
  type ProdRow = {
    nm_id: number; vendor_code: string; brand: string; title: string;
    subject_name: string; photo_url: string | null; cost_price: number | null
    current_stock: number; avg_orders_per_day: number | null
  }
  const products = await paginateQuery<ProdRow>(from => adb
    .from('products')
    .select('nm_id,vendor_code,brand,title,subject_name,photo_url,cost_price,current_stock,avg_orders_per_day')
    .in('store_id', storeIds)
    .range(from, from + 999) as unknown as Promise<{ data: ProdRow[] | null }>)

  const prodMap = new Map(products.map(p => [p.nm_id, p]))

  // ── Aggregate per nm_id ──
  type Agg = { revenue: number; for_pay: number; orders: number }
  const agg = new Map<number, Agg>()
  for (const s of sales) {
    if (!s.nm_id) continue
    const prev = agg.get(s.nm_id) ?? { revenue: 0, for_pay: 0, orders: 0 }
    agg.set(s.nm_id, {
      revenue:  prev.revenue  + (s.finished_price ?? 0),
      for_pay:  prev.for_pay  + (s.for_pay ?? 0),
      orders:   prev.orders   + 1,
    })
  }

  const aggPrev = new Map<number, Agg>()
  for (const s of salesPrev) {
    if (!s.nm_id) continue
    const prev = aggPrev.get(s.nm_id) ?? { revenue: 0, for_pay: 0, orders: 0 }
    aggPrev.set(s.nm_id, {
      revenue:  prev.revenue  + (s.finished_price ?? 0),
      for_pay:  prev.for_pay  + (s.for_pay ?? 0),
      orders:   prev.orders   + 1,
    })
  }

  if (!agg.size) return NextResponse.json({ rows: [], summary: { A: { count: 0, revenue: 0 }, B: { count: 0, revenue: 0 }, C: { count: 0, revenue: 0 } }, missingCost: 0, dateFrom, dateTo })

  // ── ABC by revenue ──
  const sorted = [...agg.entries()].sort((a, b) => b[1].revenue - a[1].revenue)
  const totalRevenue = sorted.reduce((s, [, v]) => s + v.revenue, 0)
  let cumulative = 0
  const revenueClassMap = new Map<number, string>()
  for (const [nmId, v] of sorted) {
    cumulative += v.revenue
    const pct = totalRevenue > 0 ? cumulative / totalRevenue : 0
    revenueClassMap.set(nmId, pct <= thresholdA ? 'A' : pct <= thresholdB ? 'B' : 'C')
  }

  // ── ABC by margin ──
  const withMargin = sorted.map(([nmId, v]) => {
    const prod = prodMap.get(nmId)
    const hasCost = prod?.cost_price != null && prod.cost_price > 0
    const cost = hasCost ? (prod!.cost_price! * v.orders) : 0
    const net = v.for_pay - cost
    const marginPct = v.revenue > 0 ? (v.for_pay - cost) / v.revenue : 0
    return { nmId, v, prod, hasCost, net, marginPct }
  })

  const marginClassMap = new Map<number, string | null>()
  for (const { nmId, hasCost, marginPct } of withMargin) {
    if (!hasCost) { marginClassMap.set(nmId, null); continue }
    marginClassMap.set(nmId, marginPct >= thresholdMA ? 'A' : marginPct >= thresholdMB ? 'B' : 'C')
  }

  // ── Build rows ──
  let missingCost = 0
  const rows = withMargin.map(({ nmId, v, prod, hasCost, net, marginPct }) => {
    if (!hasCost) missingCost++
    const abc_r = revenueClassMap.get(nmId) ?? 'C'
    const abc_m = marginClassMap.get(nmId)
    const abc_group = abc_m ? `${abc_r}${abc_m}` : `${abc_r}?`

    const prevV = aggPrev.get(nmId)
    const prevAbc_r = (() => {
      if (!prevV) return null
      const totalPrev = [...aggPrev.values()].reduce((s, v) => s + v.revenue, 0)
      const sortedPrev = [...aggPrev.entries()].sort((a, b) => b[1].revenue - a[1].revenue)
      let cum = 0
      for (const [id, pv] of sortedPrev) {
        cum += pv.revenue
        const pct = totalPrev > 0 ? cum / totalPrev : 0
        if (id === nmId) return pct <= thresholdA ? 'A' : pct <= thresholdB ? 'B' : 'C'
      }
      return null
    })()

    const daysOfStock = prod?.avg_orders_per_day && prod.avg_orders_per_day > 0
      ? Math.round((prod.current_stock ?? 0) / prod.avg_orders_per_day)
      : null

    return {
      nm_id: nmId,
      vendor_code:   prod?.vendor_code ?? '',
      brand:         prod?.brand ?? '',
      title:         prod?.title ?? '',
      photo_url:     prod?.photo_url ?? null,
      cost_price:    prod?.cost_price ?? null,
      current_stock: prod?.current_stock ?? 0,
      days_of_stock: daysOfStock,
      orders_count:  v.orders,
      revenue:       Math.round(v.revenue),
      for_pay:       Math.round(v.for_pay),
      net_profit:    hasCost ? Math.round(net) : null,
      margin_pct:    Math.round(marginPct * 1000) / 10,
      revenue_share: totalRevenue > 0 ? Math.round(v.revenue / totalRevenue * 1000) / 10 : 0,
      has_cost:      hasCost,
      abc_r,
      abc_m,
      abc_group,
      abc_r_prev:    prevAbc_r,
      orders_prev:   prevV?.orders ?? 0,
      revenue_prev:  prevV ? Math.round(prevV.revenue) : 0,
      is_candidate:  abc_r === 'C' && (v.orders === 0 || marginPct < 0 || (daysOfStock !== null && daysOfStock > 90)),
    }
  })

  // ── Summary ──
  const summary = {
    A: { count: rows.filter(r => r.abc_r === 'A').length, revenue: rows.filter(r => r.abc_r === 'A').reduce((s, r) => s + r.revenue, 0) },
    B: { count: rows.filter(r => r.abc_r === 'B').length, revenue: rows.filter(r => r.abc_r === 'B').reduce((s, r) => s + r.revenue, 0) },
    C: { count: rows.filter(r => r.abc_r === 'C').length, revenue: rows.filter(r => r.abc_r === 'C').reduce((s, r) => s + r.revenue, 0) },
  }

  return NextResponse.json({ rows, summary, missingCost, dateFrom, dateTo })
}
