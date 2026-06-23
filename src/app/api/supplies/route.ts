import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { getUserStoreIds } from '@/lib/queries'
import { adminDb } from '@/lib/admin'

// Маппинг склада WB → федеральный округ и рекомендуемый склад назначения
const WAREHOUSE_OKRUG: Record<string, { okrug: string; label: string }> = {
  // ЦФО
  'электросталь':   { okrug: 'ЦФО', label: 'Электросталь' },
  'коледино':       { okrug: 'ЦФО', label: 'Коледино' },
  'подольск':       { okrug: 'ЦФО', label: 'Коледино' },
  'обухово':        { okrug: 'ЦФО', label: 'Электросталь' },
  'домодедово':     { okrug: 'ЦФО', label: 'Электросталь' },
  'москва':         { okrug: 'ЦФО', label: 'Электросталь' },
  'серпухов':       { okrug: 'ЦФО', label: 'Коледино' },
  'чехов':          { okrug: 'ЦФО', label: 'Коледино' },
  'белая дача':     { okrug: 'ЦФО', label: 'Коледино' },
  // СЗФО
  'шушары':         { okrug: 'СЗФО', label: 'Шушары' },
  'санкт-петербург': { okrug: 'СЗФО', label: 'Шушары' },
  'спб':            { okrug: 'СЗФО', label: 'Шушары' },
  'пушкино':        { okrug: 'СЗФО', label: 'Шушары' },
  // ПФО
  'казань':         { okrug: 'ПФО', label: 'Казань' },
  'нижний новгород': { okrug: 'ПФО', label: 'Казань' },
  'самара':         { okrug: 'ПФО', label: 'Казань' },
  'уфа':            { okrug: 'ПФО', label: 'Казань' },
  'пермь':          { okrug: 'ПФО', label: 'Казань' },
  // УФО
  'екатеринбург':   { okrug: 'УФО', label: 'Екатеринбург' },
  'тюмень':         { okrug: 'УФО', label: 'Екатеринбург' },
  'челябинск':      { okrug: 'УФО', label: 'Екатеринбург' },
  // СФО + ДФО
  'новосибирск':    { okrug: 'СФО+ДФО', label: 'Новосибирск' },
  'красноярск':     { okrug: 'СФО+ДФО', label: 'Новосибирск' },
  'иркутск':        { okrug: 'СФО+ДФО', label: 'Новосибирск' },
  'хабаровск':      { okrug: 'СФО+ДФО', label: 'Новосибирск' },
  'владивосток':    { okrug: 'СФО+ДФО', label: 'Новосибирск' },
  'томск':          { okrug: 'СФО+ДФО', label: 'Новосибирск' },
  // ЮФО + СКФО
  'краснодар':      { okrug: 'ЮФО+СКФО', label: 'Краснодар' },
  'ростов':         { okrug: 'ЮФО+СКФО', label: 'Краснодар' },
  'ставрополь':     { okrug: 'ЮФО+СКФО', label: 'Краснодар' },
  'волгоград':      { okrug: 'ЮФО+СКФО', label: 'Краснодар' },
}

const OKRUG_ORDER = ['ЦФО', 'СЗФО', 'ПФО', 'УФО', 'СФО+ДФО', 'ЮФО+СКФО']
const LEAD_DAYS = 14   // срок поставки по умолчанию
const SAFETY_DAYS = 7  // страховой запас

function getOkrug(warehouse: string): { okrug: string; label: string } {
  const wl = warehouse.toLowerCase()
  for (const [key, val] of Object.entries(WAREHOUSE_OKRUG)) {
    if (wl.includes(key)) return val
  }
  return { okrug: 'ЦФО', label: 'Электросталь' } // fallback
}

export async function GET() {
  const db = await createClient()
  const { data: { user } } = await db.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const storeIds = await getUserStoreIds(user.id)
  if (!storeIds.length) return NextResponse.json({ error: 'No store' }, { status: 404 })

  const adb = adminDb()
  const today = new Date()
  const day28 = new Date(today); day28.setDate(today.getDate() - 28)
  const day28Str = day28.toISOString().split('T')[0]

  const [productsRes, stocksRes, ordersRes, finRes, incomesRes] = await Promise.all([
    // Все продукты со скоростью продаж
    adb.from('products')
      .select('nm_id, vendor_code, title, brand, photo_url, cost_price, current_stock, avg_orders_per_day, subject_name')
      .in('store_id', storeIds)
      .limit(5000),

    // Остатки по складам (для распределения по округам)
    adb.from('wb_stocks')
      .select('nm_id, warehouse, quantity_full, quantity, tech_size')
      .in('store_id', storeIds)
      .limit(50000),

    // Заказы за 28 дней (для залежей и подтверждения скорости)
    adb.from('wb_orders')
      .select('nm_id, date, is_cancel')
      .in('store_id', storeIds)
      .gte('date', day28Str)
      .eq('is_cancel', false)
      .limit(200000),

    // Хранение из wb_storage_daily (точные данные по SKU)
    (adb.from('wb_storage_daily') as any)
      .select('nm_id, cost')
      .in('store_id', storeIds)
      .gte('date', day28Str)
      .limit(200000),

    // Поставки в пути (статус = 1 = в пути)
    adb.from('wb_incomes')
      .select('nm_id, quantity, status')
      .in('store_id', storeIds)
      .limit(50000),
  ])

  type ProductRow = { nm_id: number | null; vendor_code: string | null; title: string | null; brand: string | null; photo_url: string | null; cost_price: number | null; current_stock: number | null; avg_orders_per_day: number | null; subject_name: string | null }
  type StockRow   = { nm_id: number | null; warehouse: string | null; quantity_full: number | null; quantity: number | null; tech_size: string | null }
  type OrderRow   = { nm_id: number | null; date: string | null; is_cancel: boolean | null }
  type FinRow     = { nm_id: number | null; cost: number | null }
  type IncomeRow  = { nm_id: number | null; quantity: number | null; status: string | null }

  const products = (productsRes.data ?? []) as ProductRow[]
  const stocks   = (stocksRes.data   ?? []) as StockRow[]
  const orders   = (ordersRes.data   ?? []) as OrderRow[]
  const finRows  = (finRes.data      ?? []) as FinRow[]
  const incomes  = (incomesRes.data  ?? []) as IncomeRow[]

  // Заказы за 28д по nm_id
  const orders28 = new Map<number, number>()
  for (const o of orders) {
    if (o.nm_id) orders28.set(o.nm_id, (orders28.get(o.nm_id) ?? 0) + 1)
  }

  // В пути по nm_id (статус не "closed")
  const inTransit = new Map<number, number>()
  for (const i of incomes) {
    if (i.nm_id && i.status !== 'closed' && i.status !== 'отменён') {
      inTransit.set(i.nm_id, (inTransit.get(i.nm_id) ?? 0) + (i.quantity ?? 0))
    }
  }

  // Хранение по nm_id за 28д (из wb_storage_daily)
  const storageFee = new Map<number, number>()
  for (const f of finRows) {
    if (f.nm_id && f.cost) {
      storageFee.set(f.nm_id, (storageFee.get(f.nm_id) ?? 0) + f.cost)
    }
  }

  // Остатки по nm_id → по складу → по округу
  const stockByNm = new Map<number, number>()
  const stockByNmOkrug = new Map<number, Map<string, number>>()
  for (const s of stocks) {
    if (!s.nm_id || !s.warehouse) continue
    const qty = s.quantity_full ?? 0
    stockByNm.set(s.nm_id, (stockByNm.get(s.nm_id) ?? 0) + qty)
    const { okrug } = getOkrug(s.warehouse)
    const oMap = stockByNmOkrug.get(s.nm_id) ?? new Map()
    oMap.set(okrug, (oMap.get(okrug) ?? 0) + qty)
    stockByNmOkrug.set(s.nm_id, oMap)
  }

  // ABC-классификация по заказам за 28д
  const sorted = [...orders28.entries()].sort((a, b) => b[1] - a[1])
  const totalOrders = sorted.reduce((s, [, v]) => s + v, 0)
  const abcMap = new Map<number, string>()
  let cum = 0
  for (const [nmId, cnt] of sorted) {
    cum += cnt / totalOrders
    abcMap.set(nmId, cum <= 0.8 ? 'A' : cum <= 0.95 ? 'B' : 'C')
  }

  // Расчёт поставок
  const supplyRows = products.map(p => {
    if (!p.nm_id) return null

    const ordersPerDay = p.avg_orders_per_day ?? (orders28.get(p.nm_id) ?? 0) / 28
    const stock = stockByNm.get(p.nm_id) ?? p.current_stock ?? 0
    const transit = inTransit.get(p.nm_id) ?? 0

    // К отгрузке = скорость × (срок + запас) − остаток − в пути
    const needed = Math.ceil(ordersPerDay * (LEAD_DAYS + SAFETY_DAYS)) - stock - transit
    const toShip = Math.max(0, needed)

    // Распределение по округам: пропорционально заказам из этого округа
    // Упрощение: если остаток по округу < (нужный запас / кол-во округов), добавляем туда
    const okrugStock = stockByNmOkrug.get(p.nm_id) ?? new Map()
    const okrugNeeded: Record<string, number> = {}

    if (toShip > 0) {
      const okrugShare = toShip / OKRUG_ORDER.length
      for (const okrug of OKRUG_ORDER) {
        const okrugQty = okrugStock.get(okrug) ?? 0
        const okrugMin = Math.ceil(ordersPerDay * SAFETY_DAYS)
        const delta = Math.max(0, Math.ceil(okrugMin - okrugQty))
        if (delta > 0) okrugNeeded[okrug] = Math.ceil(Math.min(delta, okrugShare * 1.5))
      }
    }

    return {
      nm_id:          p.nm_id,
      vendor_code:    p.vendor_code ?? '—',
      title:          p.title ?? '',
      brand:          p.brand ?? '',
      photo_url:      p.photo_url,
      abc:            abcMap.get(p.nm_id) ?? 'C',
      orders_28d:     orders28.get(p.nm_id) ?? 0,
      orders_per_day: Math.round(ordersPerDay * 10) / 10,
      stock:          stock,
      transit:        transit,
      days_of_stock:  ordersPerDay > 0 ? Math.round(stock / ordersPerDay) : null,
      to_ship:        toShip,
      okrug_needed:   okrugNeeded,
      storage_fee_28d: Math.round(storageFee.get(p.nm_id) ?? 0),
    }
  }).filter(Boolean)

  // Типизируем корректно
  type SupplyRow = {
    nm_id: number; vendor_code: string; title: string; brand: string
    photo_url: string | null; abc: string; orders_28d: number; orders_per_day: number
    stock: number; transit: number; days_of_stock: number | null; to_ship: number
    okrug_needed: Record<string, number>; storage_fee_28d: number
  }

  const typedRows = (supplyRows as unknown[]) as SupplyRow[]

  // Залежи: остаток > 0, заказов за 28д = 0
  const wasteland = typedRows.filter(r => r.stock > 0 && r.orders_28d === 0)
  const wastelandStorageCost = wasteland.reduce((s, r) => s + r.storage_fee_28d, 0)

  // Нужно к поставке (только с to_ship > 0), сортировка по убыванию
  const toShipRows = typedRows.filter(r => r.to_ship > 0).sort((a, b) => b.to_ship - a.to_ship)

  // Итог по округам
  const okrugTotals: Record<string, number> = {}
  for (const r of toShipRows) {
    for (const [okrug, qty] of Object.entries(r.okrug_needed)) {
      okrugTotals[okrug] = (okrugTotals[okrug] ?? 0) + qty
    }
  }

  // KPI локализации (упрощённый расчёт на основе распределения остатков)
  const totalStock = typedRows.reduce((s, r) => s + r.stock, 0)
  const cfoStock   = typedRows.reduce((s, r) => s + (r.stock > 0 ? (stockByNmOkrug.get(r.nm_id)?.get('ЦФО') ?? 0) : 0), 0)
  const localizationPct = totalStock > 0 ? Math.round((1 - cfoStock / totalStock) * 100) : 0

  return NextResponse.json({
    toShipRows,
    wasteland,
    wastelandStorageCost,
    okrugTotals,
    okrugOrder: OKRUG_ORDER,
    kpi: {
      total_skus:        typedRows.length,
      need_supply_skus:  toShipRows.length,
      wasteland_skus:    wasteland.length,
      localization_pct:  localizationPct,
      total_to_ship:     toShipRows.reduce((s, r) => s + r.to_ship, 0),
    },
    leadDays:   LEAD_DAYS,
    safetyDays: SAFETY_DAYS,
    dataDate:   today.toISOString().split('T')[0],
  })
}
