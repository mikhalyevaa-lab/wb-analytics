import { adminDb } from '@/lib/db-compat'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-server'
import { getUserStoreIds } from '@/lib/queries'
import { requireRole, CAN_VIEW_PNL } from '@/lib/auth-roles'

export const dynamic = 'force-dynamic'

// Возврат на WB стоит логистику + 55 ₽
const RETURN_EXTRA = 55
const DEFECT_PCT   = 0.01 // 1% брак и потери

export async function GET(req: NextRequest) {
  const user = await requireAuth().catch(() => null)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const storeIds = await getUserStoreIds(user.id)
  if (!storeIds.length) return NextResponse.json({ error: 'No store' }, { status: 404 })
  const storeId = storeIds[0]

  const err = await requireRole(user.id, storeId, CAN_VIEW_PNL).catch(e => e)
  if (err?.status === 403) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const dateFrom = searchParams.get('date_from') ?? new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0]
  const dateTo   = searchParams.get('date_to')   ?? new Date().toISOString().split('T')[0]

  const adb = adminDb()

  // Настройки магазина (УСН)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: settings } = await (adb.from('store_settings') as any)
    .select('usn_tax_pct')
    .eq('store_id', storeId)
    .maybeSingle()
  const usnPct = ((settings as { usn_tax_pct: number | null } | null)?.usn_tax_pct ?? 6) / 100

  // Все товары магазина с себестоимостью и остатком
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: productsRaw } = await (adb.from('products') as any)
    .select('nm_id, name, vendor_code, photo_url, cost_price, current_stock, avg_price_before_spp, avg_price_after_spp, buyout_rate')
    .eq('store_id', storeId)
    .not('cost_price', 'is', null)
    .order('nm_id')

  const products = (productsRaw ?? []) as {
    nm_id: number
    name: string
    vendor_code: string
    photo_url: string | null
    cost_price: number
    current_stock: number
    avg_price_before_spp: number | null
    avg_price_after_spp: number | null
    buyout_rate: number | null
  }[]

  if (!products.length) return NextResponse.json({ rows: [] })

  const nmIds = products.map(p => p.nm_id)

  // Среднее по wb_finance за период: логистика, комиссия
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: finRaw } = await (adb.from('wb_finance') as any)
    .select('nm_id, delivery_rub, commission_percent')
    .in('nm_id', nmIds)
    .in('store_id', storeIds)
    .gte('date_from', dateFrom)
    .lte('date_to', dateTo)
    .gt('delivery_rub', 0)

  // Агрегируем средние по nm_id
  const finMap = new Map<number, { delivery_sum: number; commission_sum: number; count: number }>()
  for (const r of (finRaw ?? []) as { nm_id: number; delivery_rub: number; commission_percent: number }[]) {
    const cur = finMap.get(r.nm_id) ?? { delivery_sum: 0, commission_sum: 0, count: 0 }
    cur.delivery_sum    += r.delivery_rub ?? 0
    cur.commission_sum  += r.commission_percent ?? 0
    cur.count           += 1
    finMap.set(r.nm_id, cur)
  }

  // Среднее хранение из wb_storage_daily за период
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: storRaw } = await (adb.from('wb_storage_daily') as any)
    .select('nm_id, cost')
    .in('nm_id', nmIds)
    .in('store_id', storeIds)
    .gte('date', dateFrom)
    .lte('date', dateTo)
    .not('cost', 'is', null)

  const storMap = new Map<number, { sum: number; count: number }>()
  for (const r of (storRaw ?? []) as { nm_id: number; cost: number }[]) {
    const cur = storMap.get(r.nm_id) ?? { sum: 0, count: 0 }
    cur.sum   += r.cost ?? 0
    cur.count += 1
    storMap.set(r.nm_id, cur)
  }

  // Средний % выкупа из wb_funnel за период
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: funnelRaw } = await (adb.from('wb_funnel') as any)
    .select('nm_id, buyout_percent')
    .in('nm_id', nmIds)
    .in('store_id', storeIds)
    .gte('date', dateFrom)
    .lte('date', dateTo)
    .not('buyout_percent', 'is', null)

  const funnelMap = new Map<number, { sum: number; count: number }>()
  for (const r of (funnelRaw ?? []) as { nm_id: number; buyout_percent: number }[]) {
    const cur = funnelMap.get(r.nm_id) ?? { sum: 0, count: 0 }
    cur.sum   += r.buyout_percent ?? 0
    cur.count += 1
    funnelMap.set(r.nm_id, cur)
  }

  // Перезаписи цены пользователем
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: overridesRaw } = await (adb.from('unit_economics_overrides') as any)
    .select('nm_id, price_before_spp, spp_pct')
    .eq('store_id', storeId)
    .in('nm_id', nmIds)

  const overrideMap = new Map<number, { price_before_spp: number | null; spp_pct: number | null }>()
  for (const r of (overridesRaw ?? []) as { nm_id: number; price_before_spp: number | null; spp_pct: number | null }[]) {
    overrideMap.set(r.nm_id, r)
  }

  // Расчёт метрик для каждого товара
  const rows = products.map(p => {
    const fin     = finMap.get(p.nm_id)
    const stor    = storMap.get(p.nm_id)
    const funnel  = funnelMap.get(p.nm_id)
    const over    = overrideMap.get(p.nm_id)

    const avgDelivery    = fin   ? fin.delivery_sum   / fin.count   : null
    const avgCommPct     = fin   ? fin.commission_sum / fin.count / 100 : null
    const avgStorage     = stor  ? stor.sum / stor.count : null
    const avgBuyoutRate  = funnel ? funnel.sum / funnel.count : (p.buyout_rate ?? null)

    // Цена для расчёта: из override, иначе из products.avg_price_before_spp
    const priceBeforeSpp = over?.price_before_spp ?? p.avg_price_before_spp ?? null
    const sppPct         = over?.spp_pct ?? null
    const priceAfterSpp  = priceBeforeSpp && sppPct != null
      ? priceBeforeSpp * (1 - sppPct / 100)
      : (p.avg_price_after_spp ?? null)

    let netProfit: number | null = null
    let margin: number | null    = null
    let roi: number | null       = null
    let breakEven: number | null = null
    let potentialProfit: number | null = null

    if (
      priceBeforeSpp != null &&
      p.cost_price   != null &&
      avgDelivery    != null &&
      avgCommPct     != null
    ) {
      const commission  = priceBeforeSpp * avgCommPct
      const storage     = avgStorage ?? 0
      const buyout      = avgBuyoutRate && avgBuyoutRate > 0 ? avgBuyoutRate / 100 : 1
      const logisticAdj = (buyout * avgDelivery + (1 - buyout) * (avgDelivery + RETURN_EXTRA)) / buyout
      const taxUsn      = priceBeforeSpp * usnPct
      const defect      = p.cost_price * DEFECT_PCT

      netProfit = priceBeforeSpp - p.cost_price - commission - logisticAdj - storage - taxUsn - defect
      margin    = priceBeforeSpp > 0 ? netProfit / priceBeforeSpp : null
      roi       = p.cost_price   > 0 ? netProfit / p.cost_price   : null
      breakEven = p.cost_price + commission + logisticAdj + storage + taxUsn + defect
      potentialProfit = netProfit * (p.current_stock ?? 0)
    }

    return {
      nm_id:            p.nm_id,
      name:             p.name,
      vendor_code:      p.vendor_code,
      photo_url:        p.photo_url,
      cost_price:       p.cost_price,
      current_stock:    p.current_stock,
      // Данные из БД (средние за период)
      avg_delivery:     avgDelivery,
      avg_commission_pct: avgCommPct != null ? avgCommPct * 100 : null,
      avg_storage:      avgStorage,
      avg_buyout_rate:  avgBuyoutRate,
      // Цена (override или из products)
      price_before_spp: priceBeforeSpp,
      spp_pct:          sppPct ?? (priceBeforeSpp && priceAfterSpp
        ? Math.round((1 - priceAfterSpp / priceBeforeSpp) * 100 * 10) / 10
        : null),
      price_after_spp:  priceAfterSpp,
      // Расчётные метрики
      commission_rub:   priceBeforeSpp != null && avgCommPct != null ? priceBeforeSpp * avgCommPct : null,
      net_profit:       netProfit,
      margin_pct:       margin != null ? margin * 100 : null,
      roi_pct:          roi    != null ? roi    * 100 : null,
      break_even:       breakEven,
      potential_profit: potentialProfit,
      usn_pct:          usnPct * 100,
    }
  })

  return NextResponse.json({ rows, date_from: dateFrom, date_to: dateTo })
}

// PATCH — сохранить price_before_spp и/или spp_pct для nm_id
export async function PATCH(req: NextRequest) {
  const user = await requireAuth().catch(() => null)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const storeIds = await getUserStoreIds(user.id)
  if (!storeIds.length) return NextResponse.json({ error: 'No store' }, { status: 404 })
  const storeId = storeIds[0]

  const body = await req.json() as { nm_id: number; price_before_spp?: number | null; spp_pct?: number | null }
  if (!body.nm_id) return NextResponse.json({ error: 'nm_id required' }, { status: 400 })

  const adb = adminDb()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (adb.from('unit_economics_overrides') as any)
    .upsert(
      { store_id: storeId, nm_id: body.nm_id, price_before_spp: body.price_before_spp ?? null, spp_pct: body.spp_pct ?? null, updated_at: new Date().toISOString() },
      { onConflict: 'store_id,nm_id' }
    )

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
