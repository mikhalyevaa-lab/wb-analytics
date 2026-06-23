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

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ nm_id: string }> }
) {
  const db = await createClient()
  const { data: { user } } = await db.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const storeIds = await getUserStoreIds(user.id)
  if (!storeIds.length) return NextResponse.json({ error: 'No store' }, { status: 404 })

  const { nm_id } = await params
  const nmId = parseInt(nm_id)
  if (isNaN(nmId)) return NextResponse.json({ error: 'Invalid nm_id' }, { status: 400 })

  const url = req.nextUrl
  const dateFrom = url.searchParams.get('from') ?? daysAgo(30)
  const dateTo   = url.searchParams.get('to')   ?? new Date().toISOString().split('T')[0]

  const adb = adminDb()

  const [productRes, ordersRes, stocksRes, finRes, adRes, notesRes, storageRes] = await Promise.all([
    adb.from('products')
      .select('nm_id, vendor_code, brand, title, subject_name, photo_url, cost_price, strategy')
      .eq('nm_id', nmId)
      .in('store_id', storeIds)
      .single(),

    // Заказы с детализацией по баркоду и размеру
    adb.from('wb_orders')
      .select('date, barcode, techsize, total_price, discount_percent, price_after_discount, price_after_spp, is_cancel')
      .eq('nm_id', nmId)
      .in('store_id', storeIds)
      .eq('is_cancel', false)
      .gte('date', dateFrom)
      .lte('date', dateTo + 'T23:59:59')
      .limit(100000),

    // Остатки по размеру (текущий снапшот)
    adb.from('wb_stocks')
      .select('tech_size, barcode, quantity_full, quantity, warehouse')
      .eq('nm_id', nmId)
      .in('store_id', storeIds)
      .limit(1000),

    // Финансы для маржи
    adb.from('wb_finance')
      .select('date_from, doc_type_name, ppvz_for_pay, delivery_rub, quantity')
      .eq('nm_id', nmId)
      .in('store_id', storeIds)
      .gte('date_from', dateFrom)
      .lte('date_from', dateTo)
      .limit(50000),

    // Реклама по дням (общая на nm_id — в wb_ad_spend нет разбивки по баркоду)
    adb.from('wb_ad_spend')
      .select('date, spend, views, clicks')
      .in('store_id', storeIds)
      .gte('date', dateFrom)
      .lte('date', dateTo)
      .limit(10000),

    // Лог действий и план заказов
    adb.from('sku_matrix_notes')
      .select('date, action_log, plan_orders')
      .eq('nm_id', nmId)
      .in('store_id', storeIds)
      .gte('date', dateFrom)
      .lte('date', dateTo)
      .limit(500),

    // Платное хранение по дням
    (adb.from('wb_storage_daily') as any)
      .select('date, cost, barcode')
      .eq('nm_id', nmId)
      .in('store_id', storeIds)
      .gte('date', dateFrom)
      .lte('date', dateTo)
      .limit(10000),
  ])

  type OrderRow = { date: string | null; barcode: string | null; techsize: string | null; total_price: number | null; discount_percent: number | null; price_after_discount: number | null; price_after_spp: number | null; is_cancel: boolean | null }
  type StockRow = { tech_size: string | null; barcode: string | null; quantity_full: number | null; quantity: number | null; warehouse: string | null }
  type FinRow   = { date_from: string | null; doc_type_name: string | null; ppvz_for_pay: number | null; delivery_rub: number | null; quantity: number | null }
  type AdRow    = { date: string | null; spend: number | null; views: number | null; clicks: number | null }
  type NoteRow    = { date: string; action_log: string | null; plan_orders: number | null }
  type StorageRow = { date: string | null; cost: number | null; barcode: string | null }

  type ProductRow = { nm_id: number; vendor_code: string | null; brand: string | null; title: string | null; subject_name: string | null; photo_url: string | null; cost_price: number | null; strategy: string | null }
  const product    = productRes.data as ProductRow | null
  const orders     = (ordersRes.data   ?? []) as OrderRow[]
  const stocks     = (stocksRes.data   ?? []) as StockRow[]
  const finRows    = (finRes.data      ?? []) as FinRow[]
  const adRows     = (adRes.data       ?? []) as AdRow[]
  const notes      = (notesRes.data    ?? []) as NoteRow[]
  const storageRows = (storageRes.data ?? []) as StorageRow[]

  // Функция цены заказа после СПП
  function priceAfterSpp(o: OrderRow): number {
    if (o.price_after_spp != null) return o.price_after_spp
    if (o.price_after_discount != null) return o.price_after_discount
    return (o.total_price ?? 0) * (1 - (o.discount_percent ?? 0) / 100)
  }

  // Уникальные баркоды/размеры
  const sizeMap = new Map<string, string>() // barcode → techsize
  for (const o of orders) if (o.barcode) sizeMap.set(o.barcode, o.techsize ?? '—')
  for (const s of stocks) if (s.barcode) sizeMap.set(s.barcode, s.tech_size ?? '—')

  const barcodes = [...sizeMap.keys()].sort((a, b) => (sizeMap.get(a) ?? '').localeCompare(sizeMap.get(b) ?? ''))

  // Текущие остатки по баркоду
  const stockByBarcode = new Map<string, number>()
  for (const s of stocks) {
    if (!s.barcode) continue
    stockByBarcode.set(s.barcode, (stockByBarcode.get(s.barcode) ?? 0) + (s.quantity_full ?? 0))
  }

  // Дни
  const allDates = dateRange(dateFrom, dateTo)

  // Агрегация заказов по (barcode, date)
  type DayBarAcc = { count: number; revenue: number }
  const orderMap = new Map<string, DayBarAcc>() // key = `${barcode}|${date}`
  for (const o of orders) {
    const day = o.date?.slice(0, 10)
    if (!day || !o.barcode) continue
    const key = `${o.barcode}|${day}`
    const acc = orderMap.get(key) ?? { count: 0, revenue: 0 }
    acc.count++
    acc.revenue += priceAfterSpp(o)
    orderMap.set(key, acc)
  }

  // Финансы по дням (общие — ppvz_for_pay суммируем)
  const finByDay = new Map<string, { revenue: number; delivery: number }>()
  for (const r of finRows) {
    const day = r.date_from?.slice(0, 10)
    if (!day) continue
    const acc = finByDay.get(day) ?? { revenue: 0, delivery: 0 }
    acc.revenue  += r.ppvz_for_pay ?? 0
    acc.delivery += r.delivery_rub ?? 0
    finByDay.set(day, acc)
  }

  // Реклама по дням
  const adByDay = new Map<string, number>()
  for (const a of adRows) {
    const day = a.date?.slice(0, 10)
    if (!day) continue
    adByDay.set(day, (adByDay.get(day) ?? 0) + (a.spend ?? 0))
  }

  // Хранение по (barcode, date) и суммарно по дате (для итоговой строки)
  const storageByBarcodeDay = new Map<string, number>() // `${barcode}|${date}` → cost
  const storageByDay = new Map<string, number>()        // date → total cost
  for (const s of storageRows) {
    const day = s.date?.slice(0, 10)
    if (!day) continue
    const cost = s.cost ?? 0
    storageByDay.set(day, (storageByDay.get(day) ?? 0) + cost)
    if (s.barcode) {
      const key = `${s.barcode}|${day}`
      storageByBarcodeDay.set(key, (storageByBarcodeDay.get(key) ?? 0) + cost)
    }
  }

  // Лог и план по дням
  const notesByDay = new Map<string, NoteRow>()
  for (const n of notes) notesByDay.set(n.date, n)

  // Себестоимость
  const costPrice = product?.cost_price ?? 0

  // Матрица по размерам: для каждого баркода — строки по дням
  const sizes = barcodes.map(barcode => {
    const techsize = sizeMap.get(barcode) ?? '—'
    const currentStock = stockByBarcode.get(barcode) ?? 0

    const byDate = allDates.map(date => {
      const ord = orderMap.get(`${barcode}|${date}`) ?? { count: 0, revenue: 0 }
      const fin = finByDay.get(date) ?? { revenue: 0, delivery: 0 }
      const adSpend = adByDay.get(date) ?? 0
      const note = notesByDay.get(date)
      const storageCost = storageByBarcodeDay.get(`${barcode}|${date}`) ?? storageByDay.get(date) ?? null

      // Маржа на единицу = (ppvz_for_pay / продажи_шт) - себестоимость - логистика_на_шт
      // Упрощённо: цена_заказа - себестоимость (т.к. ppvz_for_pay уже после комиссии)
      const avgPrice = ord.count > 0 ? ord.revenue / ord.count : null

      // ДРР = расход РК / сумма заказов
      const drr = ord.revenue > 0 ? (adSpend / ord.revenue) * 100 : null

      // Маржинальность = (ppvz - лог - себест) / ppvz
      // Приблизительно: считаем на уровне nm_id пропорционально
      const finRevPerOrder = fin.revenue > 0 && ord.count > 0 ? fin.revenue / ord.count : null
      const margin = finRevPerOrder != null
        ? finRevPerOrder - costPrice - (ord.count > 0 ? fin.delivery / ord.count : 0)
        : null
      const marginPct = margin != null && finRevPerOrder != null && finRevPerOrder > 0
        ? (margin / finRevPerOrder) * 100
        : null

      // Хранение на единицу = стоимость хранения / заказы (если есть заказы)
      const storagePerUnit = storageCost != null && ord.count > 0
        ? Math.round(storageCost / ord.count * 100) / 100
        : null

      return {
        date,
        orders_count:     ord.count,
        orders_sum:       Math.round(ord.revenue),
        avg_price:        avgPrice != null ? Math.round(avgPrice) : null,
        ad_spend:         Math.round(adSpend),
        drr:              drr != null ? Math.round(drr * 10) / 10 : null,
        margin:           margin != null ? Math.round(margin) : null,
        margin_pct:       marginPct != null ? Math.round(marginPct * 10) / 10 : null,
        storage_cost:     storageCost != null ? Math.round(storageCost * 100) / 100 : null,
        storage_per_unit: storagePerUnit,
        plan_orders:      note?.plan_orders ?? null,
        action_log:       note?.action_log ?? null,
      }
    })

    return { barcode, techsize, currentStock, byDate }
  })

  // Итоги по артикулу в целом по дням (для строки «всего»)
  const totalByDate = allDates.map(date => {
    const totalOrders = barcodes.reduce((s, b) => s + (orderMap.get(`${b}|${date}`)?.count ?? 0), 0)
    const totalRevenue = barcodes.reduce((s, b) => s + (orderMap.get(`${b}|${date}`)?.revenue ?? 0), 0)
    const adSpend = adByDay.get(date) ?? 0
    const note = notesByDay.get(date)
    const storageCost = storageByDay.get(date) ?? null
    return {
      date,
      orders_count:     totalOrders,
      orders_sum:       Math.round(totalRevenue),
      ad_spend:         Math.round(adSpend),
      drr:              totalRevenue > 0 ? Math.round(adSpend / totalRevenue * 1000) / 10 : null,
      storage_cost:     storageCost != null ? Math.round(storageCost * 100) / 100 : null,
      storage_per_unit: storageCost != null && totalOrders > 0 ? Math.round(storageCost / totalOrders * 100) / 100 : null,
      plan_orders:      note?.plan_orders ?? null,
      action_log:       note?.action_log ?? null,
    }
  })

  return NextResponse.json({
    product: product ?? null,
    barcodes,
    sizes,
    totalByDate,
    dates: allDates,
    today: new Date().toISOString().split('T')[0],
    totalStock: stocks.reduce((s, r) => s + (r.quantity_full ?? 0), 0),
  })
}

// PATCH — сохранить стратегию / лог / план
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ nm_id: string }> }
) {
  const db = await createClient()
  const { data: { user } } = await db.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const storeIds = await getUserStoreIds(user.id)
  if (!storeIds.length) return NextResponse.json({ error: 'No store' }, { status: 404 })
  const storeId = storeIds[0]

  const { nm_id } = await params
  const nmId = parseInt(nm_id)
  const body = await req.json() as {
    strategy?: string
    date?: string
    action_log?: string
    plan_orders?: number | null
  }

  const adb = adminDb()

  // Обновить стратегию
  if (body.strategy !== undefined) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (adb.from('products') as any)
      .update({ strategy: body.strategy })
      .eq('nm_id', nmId)
      .in('store_id', storeIds)
  }

  // Обновить лог / план на дату
  if (body.date) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (adb.from('sku_matrix_notes') as any).upsert({
      store_id:    storeId,
      nm_id:       nmId,
      date:        body.date,
      action_log:  body.action_log,
      plan_orders: body.plan_orders,
      updated_at:  new Date().toISOString(),
    }, { onConflict: 'store_id,nm_id,date' })
  }

  return NextResponse.json({ ok: true })
}
