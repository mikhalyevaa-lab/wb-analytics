/**
 * WB Analytics — Модуль синхронизации данных
 *
 * Запускается по cron каждые 120 мин через Vercel Cron Jobs (/api/sync)
 * Ночной cron 3:00 UTC (/api/sync/nightly) — пересчёт агрегатов товаров
 *
 * Лимиты WB API: Token Bucket, при 429 читаем X-Ratelimit-Retry (сек).
 * Retry-логика встроена в WBApiClient.fetch (до 4 попыток, exponential backoff).
 */

import { createClient } from '@supabase/supabase-js'
import { createWBClient, formatDateForWB, daysAgo } from './wb-api'
import { recalcProductAggregates } from './sync-initial'
import type { WBFunnelItem } from './wb-api'

// Административный клиент с service_role — обходит RLS, используется только в cron/API
function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

type SupabaseAdminClient = ReturnType<typeof createAdminClient>

// ---------- Типы ----------

type Store = {
  id: string
  name: string
  wb_token: string
  wb_analytics_token: string | null
}

// ---------- Главная функция ----------

export async function syncStore(store: Store): Promise<{
  success: boolean
  results: Record<string, { count: number; error?: string }>
}> {
  console.log(`[sync] Начало: ${store.name}`)
  const db = createAdminClient()
  const wb = createWBClient(store.wb_token)
  const results: Record<string, { count: number; error?: string }> = {}

  await syncOrders(store, wb, db, results)
  await sleep(1000)
  await syncSales(store, wb, db, results)
  await sleep(1000)
  await syncStocks(store, wb, db, results)
  await sleep(1000)
  await syncFinance(store, wb, db, results)
  await sleep(1000)
  await syncIncomes(store, wb, db, results)
  await sleep(1000)
  await syncProducts(store, wb, db, results)
  await sleep(1000)
  await syncAdvert(store, wb, db, results)
  await sleep(1000)
  await syncFunnel(store, db, results)
  await sleep(500)

  // Пересчёт агрегатов в таблице products (buyout_rate, avg_price, avg_orders_per_day, current_stock)
  try {
    await recalcProductAggregates(store.id, db, msg => console.log(`[sync] ${msg}`))
    results.recalc = { count: 1 }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[sync] recalc error:', msg)
    results.recalc = { count: 0, error: msg }
  }

  const hasErrors = Object.values(results).some(r => r.error)
  console.log(`[sync] ${store.name}: завершено`, results)
  return { success: !hasErrors, results }
}

// ---------- Заказы ----------

async function syncOrders(
  store: Store,
  wb: ReturnType<typeof createWBClient>,
  db: SupabaseAdminClient,
  results: Record<string, { count: number; error?: string }>
) {
  try {
    const dateFrom = formatDateForWB(daysAgo(7))
    const orders = await wb.getOrders(dateFrom, 0)
    if (!orders?.length) { results.orders = { count: 0 }; return }

    const rows = orders.map(o => ({
      store_id: store.id,
      g_number: o.gNumber,
      date: o.date,
      last_change_date: o.lastChangeDate,
      supplier_article: o.supplierArticle,
      nm_id: o.nmId,
      barcode: o.barcode,
      category: o.category,
      subject: o.subject,
      brand: o.brand,
      techsize: o.techSize,
      income_id: o.incomeID,
      total_price: o.totalPrice,
      discount_percent: o.discountPercent,
      is_cancel: o.isCancel,
      cancel_dt: o.cancel_dt || null,
    }))

    const chunks = chunkArray(rows, 500)
    let total = 0
    for (const chunk of chunks) {
      const { error, count } = await db
        .from('wb_orders')
        .upsert(chunk, { onConflict: 'store_id,g_number,nm_id,barcode,date' })
      if (error) throw error
      total += count || chunk.length
    }
    results.orders = { count: total }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[sync] orders error:', msg)
    results.orders = { count: 0, error: msg }
  }
}

// ---------- Продажи ----------

async function syncSales(
  store: Store,
  wb: ReturnType<typeof createWBClient>,
  db: SupabaseAdminClient,
  results: Record<string, { count: number; error?: string }>
) {
  try {
    const dateFrom = formatDateForWB(daysAgo(7))
    const sales = await wb.getSales(dateFrom, 0)
    if (!sales?.length) { results.sales = { count: 0 }; return }

    const rows = sales.map(s => ({
      store_id: store.id,
      g_number: s.gNumber,
      date: s.date,
      last_change_date: s.lastChangeDate,
      supplier_article: s.supplierArticle,
      nm_id: s.nmId,
      barcode: s.barcode,
      category: s.category,
      subject: s.subject,
      brand: s.brand,
      techsize: s.techSize,
      income_id: s.incomeID,
      total_price: s.totalPrice,
      discount_percent: s.discountPercent,
      spp: s.spp ?? null,
      for_pay: s.forPay,
      finished_price: s.finishedPrice,
      price_with_disc: s.priceWithDisc,
      sale_id: s.saleID,
    }))

    const chunks = chunkArray(rows, 500)
    let total = 0
    for (const chunk of chunks) {
      const { error, count } = await db
        .from('wb_sales')
        .upsert(chunk, { onConflict: 'sale_id', ignoreDuplicates: true })
      if (error) throw error
      total += count || chunk.length
    }
    results.sales = { count: total }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[sync] sales error:', msg)
    results.sales = { count: 0, error: msg }
  }
}

// ---------- Остатки ----------

async function syncStocks(
  store: Store,
  wb: ReturnType<typeof createWBClient>,
  db: SupabaseAdminClient,
  results: Record<string, { count: number; error?: string }>
) {
  try {
    const today = new Date().toISOString().split('T')[0]
    // dateFrom=2000-01-01 — получаем ВСЕ остатки, а не только "изменившиеся за вчера"
    const stocks = await wb.getStocks('2000-01-01')
    if (!stocks?.length) { results.stocks = { count: 0 }; return }

    // Удаляем сегодняшние остатки и пишем свежие
    await db.from('wb_stocks').delete().eq('store_id', store.id).eq('date', today)

    const rows = stocks.map(s => ({
      store_id: store.id,
      date: today,
      last_change_date: s.lastChangeDate,
      supplier_article: s.supplierArticle,
      tech_size: s.techSize,
      barcode: s.barcode,
      quantity: s.quantity,
      quantity_full: s.quantityFull,
      quantity_not_in_orders: s.quantityNotInOrders,
      warehouse: s.warehouseName,
      nm_id: s.nmId,
      subject: s.subject,
      category: s.category,
      brand: s.brand,
      price: s.Price,
      discount: s.Discount,
    }))

    const chunks = chunkArray(rows, 500)
    let total = 0
    for (const chunk of chunks) {
      const { error, count } = await db.from('wb_stocks').insert(chunk)
      if (error) throw error
      total += count || chunk.length
    }
    results.stocks = { count: total }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[sync] stocks error:', msg)
    results.stocks = { count: 0, error: msg }
  }
}

// ---------- Финансовый отчёт ----------

async function syncFinance(
  store: Store,
  wb: ReturnType<typeof createWBClient>,
  db: SupabaseAdminClient,
  results: Record<string, { count: number; error?: string }>
) {
  try {
    const dateFrom = daysAgo(30).toISOString().split('T')[0]
    const dateTo = new Date().toISOString().split('T')[0]
    const report = await wb.getFinanceReport(dateFrom, dateTo)
    if (!report?.length) { results.finance = { count: 0 }; return }

    const rows = report.map(r => ({
      store_id: store.id,
      realizationreport_id: r.realizationreport_id,
      date_from: r.date_from,
      date_to: r.date_to,
      rrd_id: r.rrd_id,
      nm_id: r.nm_id,
      sa_name: r.sa_name,
      ts_name: r.ts_name,
      barcode: r.barcode,
      doc_type_name: r.doc_type_name,
      supplier_oper_name: r.supplier_oper_name,
      quantity: r.quantity,
      retail_price: r.retail_price,
      retail_amount: r.retail_amount,
      sale_percent: r.sale_percent,
      commission_percent: r.commission_percent,
      delivery_amount: r.delivery_amount,
      return_amount: r.return_amount,
      delivery_rub: r.delivery_rub,
      ppvz_for_pay: r.ppvz_for_pay,
      penalty: r.penalty,
      additional_payment: r.additional_payment,
    }))

    const chunks = chunkArray(rows, 500)
    let total = 0
    for (const chunk of chunks) {
      const { error, count } = await db
        .from('wb_finance')
        .upsert(chunk, { onConflict: 'store_id,rrd_id', ignoreDuplicates: true })
      if (error) throw error
      total += count || chunk.length
    }
    results.finance = { count: total }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[sync] finance error:', msg)
    results.finance = { count: 0, error: msg }
  }
}

// ---------- Поставки ----------

async function syncIncomes(
  store: Store,
  wb: ReturnType<typeof createWBClient>,
  db: SupabaseAdminClient,
  results: Record<string, { count: number; error?: string }>
) {
  try {
    const dateFrom = formatDateForWB(daysAgo(30))
    const incomes = await wb.getIncomes(dateFrom)
    if (!incomes?.length) { results.incomes = { count: 0 }; return }

    const rows = incomes.map(i => ({
      store_id: store.id,
      income_id: i.incomeId,
      date: i.date,
      last_change_date: i.lastChangeDate,
      supplier_article: i.supplierArticle,
      tech_size: i.techSize,
      barcode: i.barcode,
      quantity: i.quantity,
      total_price: i.totalPrice,
      date_close: i.dateClose || null,
      warehouse_name: i.warehouseName,
      nm_id: i.nmId,
      status: i.status,
    }))

    const chunks = chunkArray(rows, 500)
    let total = 0
    for (const chunk of chunks) {
      const { error, count } = await db
        .from('wb_incomes')
        .upsert(chunk, { onConflict: 'store_id,income_id', ignoreDuplicates: true })
      if (error) throw error
      total += count || chunk.length
    }
    results.incomes = { count: total }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[sync] incomes error:', msg)
    results.incomes = { count: 0, error: msg }
  }
}

// ---------- Товары ----------

async function syncProducts(
  store: Store,
  wb: ReturnType<typeof createWBClient>,
  db: SupabaseAdminClient,
  results: Record<string, { count: number; error?: string }>
) {
  try {
    let cursor: { updatedAt?: string; nmID?: number } | undefined
    let total = 0

    while (true) {
      const res = await wb.getProducts(cursor)
      if (!res?.cards?.length) break

      const rows = res.cards.map(p => {
        const colorChar = p.characteristics?.find((c: { name: string }) =>
          c.name.toLowerCase().includes('цвет') || c.name.toLowerCase() === 'color'
        )
        return {
          store_id: store.id,
          nm_id: p.nmID,
          imt_id: p.imtID,
          vendor_code: p.vendorCode,
          brand: p.brand,
          title: p.title,
          subject_id: p.subjectID,
          subject_name: p.subjectName,
          photo_url: p.photos?.[0]?.c246x328 ?? null,
          color: colorChar?.value?.[0] ?? null,
          updated_at: p.updatedAt,
        }
      })

      const { error, count } = await db
        .from('products')
        .upsert(rows, { onConflict: 'store_id,nm_id' })
      if (error) throw error
      total += count || rows.length

      if (res.cursor.total < 100) break
      cursor = { updatedAt: res.cursor.updatedAt, nmID: res.cursor.nmID }
      await sleep(500)
    }

    results.products = { count: total }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[sync] products error:', msg)
    results.products = { count: 0, error: msg }
  }
}

// ---------- Реклама (v2) ----------

async function syncAdvert(
  store: Store,
  wb: ReturnType<typeof createWBClient>,
  db: SupabaseAdminClient,
  results: Record<string, { count: number; error?: string }>
) {
  try {
    const campaigns = await wb.getAdCampaigns()
    if (!campaigns?.length) { results.advert = { count: 0 }; return }

    const moscowNow = new Date(Date.now() + 3 * 60 * 60 * 1000)
    // Последние 7 дней
    const endDate   = moscowNow.toISOString().split('T')[0]
    const beginDate = new Date(moscowNow.getTime() - 6 * 86400000).toISOString().split('T')[0]

    const campaignIds = campaigns.map(c => c.advertId)
    let total = 0

    // /adv/v3/fullstats: макс 50 кампаний за запрос, 3 req/min → задержка 20 сек
    for (let i = 0; i < campaignIds.length; i += 50) {
      const batch = campaignIds.slice(i, i + 50)
      if (i > 0) await sleep(20_000)

      let stats
      try {
        stats = await wb.getAdStatsCampaigns(batch, beginDate, endDate)
      } catch (e) {
        console.error('[sync] advert fullstats batch error:', e)
        continue
      }

      const campaignNames = Object.fromEntries(campaigns.map(c => [c.advertId, c.name]))
      for (const camp of stats ?? []) {
        for (const day of camp.days ?? []) {
          const date = day.date?.split('T')[0]
          if (!date) continue
          const { error } = await db.from('wb_ad_spend').upsert({
            store_id:      store.id,
            campaign_id:   camp.advertId,
            campaign_name: campaignNames[camp.advertId] ?? String(camp.advertId),
            date,
            views:        day.views     ?? 0,
            clicks:       day.clicks    ?? 0,
            spend:        day.sum       ?? 0,
            orders_count: day.orders    ?? 0,
            orders_sum:   day.sum_price ?? 0,
          }, { onConflict: 'store_id,campaign_id,date' })
          if (error) console.error('[sync] advert upsert:', error.message)
          else total++
        }
      }
    }

    results.advert = { count: total }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[sync] advert error:', msg)
    results.advert = { count: 0, error: msg }
  }
}

// ---------- Начальная загрузка заказов ----------

/**
 * Загрузка исторических заказов за произвольный период.
 * Использует flag=1 (по дате создания заказа, не по lastChangeDate).
 * Вызывается из /api/sync/orders-initial.
 */
export async function syncOrdersPeriod(
  storeId: string,
  dateFrom: string   // YYYY-MM-DD
): Promise<{ inserted: number; skipped: number }> {
  const db = createAdminClient()
  const { data: storeRow } = await db
    .from('stores')
    .select('wb_token')
    .eq('id', storeId)
    .single()
  if (!storeRow) throw new Error('store not found')

  const wb = createWBClient(storeRow.wb_token)
  // flag=1: все заказы, дата создания >= dateFrom
  const dateFromFormatted = formatDateForWB(new Date(dateFrom + 'T00:00:00'))
  const orders = await wb.getOrders(dateFromFormatted, 1)
  if (!orders?.length) return { inserted: 0, skipped: 0 }

  const rows = orders.map(o => ({
    store_id:         storeId,
    g_number:         o.gNumber,
    date:             o.date,
    last_change_date: o.lastChangeDate,
    supplier_article: o.supplierArticle,
    nm_id:            o.nmId,
    barcode:          o.barcode,
    category:         o.category,
    subject:          o.subject,
    brand:            o.brand,
    techsize:         o.techSize,
    income_id:        o.incomeID,
    total_price:      o.totalPrice,
    discount_percent: o.discountPercent,
    is_cancel:        o.isCancel,
    cancel_dt:        o.cancel_dt || null,
  }))

  let inserted = 0
  const chunks = chunkArray(rows, 500)
  for (const chunk of chunks) {
    const { error } = await db
      .from('wb_orders')
      .upsert(chunk, { onConflict: 'store_id,g_number,nm_id,barcode,date', ignoreDuplicates: false })
    if (error) console.error('[orders-initial] upsert error:', error.message)
    else inserted += chunk.length
  }

  return { inserted, skipped: rows.length - inserted }
}

// ---------- Воронка продаж ----------

const FUNNEL_BATCH = 20 // лимит API — 20 nm_id за запрос

/** Возвращает все nm_id для магазина из таблицы wb_products */
async function getStoreNmIds(storeId: string, db: SupabaseAdminClient): Promise<number[]> {
  const { data } = await db.from('wb_products').select('nm_id').eq('store_id', storeId)
  return (data ?? []).map(r => r.nm_id as number).filter(Boolean)
}

/** Записывает строки воронки в Supabase (upsert по store_id+date+nm_id) */
async function upsertFunnelRows(
  storeId: string,
  items: WBFunnelItem[],
  db: SupabaseAdminClient
): Promise<number> {
  const rows = items.flatMap(item =>
    (item.history ?? []).map(day => ({
      store_id:                storeId,
      date:                    day.date.substring(0, 10),
      nm_id:                   item.product.nmId,
      supplier_article:        item.product.vendorCode ?? null,
      open_count:              day.openCount ?? 0,
      cart_count:              day.cartCount ?? 0,
      order_count:             day.orderCount ?? 0,
      order_sum:               day.orderSum ?? 0,
      buyout_count:            day.buyoutCount ?? 0,
      buyout_sum:              day.buyoutSum ?? 0,
      buyout_percent:          day.buyoutPercent ?? 0,
      add_to_cart_conversion:  day.addToCartConversion ?? 0,
      cart_to_order_conversion:day.cartToOrderConversion ?? 0,
      add_to_wishlist_count:   day.addToWishlistCount ?? 0,
      updated_at:              new Date().toISOString(),
    }))
  )
  if (!rows.length) return 0

  // Upsert чанками по 500 строк
  let total = 0
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500)
    const { error } = await db
      .from('wb_funnel')
      .upsert(chunk, { onConflict: 'store_id,date,nm_id' })
    if (error) console.error('[sync] funnel upsert error:', error.message)
    else total += chunk.length
  }
  return total
}

/**
 * Синхронизация воронки: вчера + позавчера (WB поздно финализирует данные)
 */
async function syncFunnel(
  store: Store,
  db: SupabaseAdminClient,
  results: Record<string, { count: number; error?: string }>
) {
  const analyticsToken = store.wb_analytics_token || store.wb_token
  if (!analyticsToken) {
    results.funnel = { count: 0, error: 'no analytics token' }
    return
  }
  try {
    const nmIds = await getStoreNmIds(store.id, db)
    if (!nmIds.length) { results.funnel = { count: 0 }; return }

    const yesterday  = daysAgo(1).toISOString().split('T')[0]
    const dayBefore  = daysAgo(2).toISOString().split('T')[0]
    const wb = createWBClient(analyticsToken)
    let total = 0

    for (const dateStr of [yesterday, dayBefore]) {
      let items: WBFunnelItem[] = []
      for (let i = 0; i < nmIds.length; i += FUNNEL_BATCH) {
        if (i > 0) await sleep(21000)
        const batch = nmIds.slice(i, i + FUNNEL_BATCH)
        try {
          const chunk = await wb.getFunnelHistory(batch, dateStr, dateStr)
          items = items.concat(chunk)
        } catch (e) {
          console.error(`[sync] funnel batch i=${i} date=${dateStr}:`, (e as Error).message)
        }
      }
      if (items.length) {
        total += await upsertFunnelRows(store.id, items, db)
      }
    }

    results.funnel = { count: total }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[sync] funnel error:', msg)
    results.funnel = { count: 0, error: msg }
  }
}

/**
 * Начальная загрузка воронки за произвольный период (используется в /api/sync/funnel-initial)
 * Загружает по 30 дней, чтобы не превысить таймаут Vercel.
 */
export async function syncFunnelPeriod(
  storeId: string,
  startDate: string,
  endDate: string
): Promise<{ count: number; days: number }> {
  const db = createAdminClient()
  const { data: storeRow } = await db
    .from('stores')
    .select('wb_token, wb_analytics_token')
    .eq('id', storeId)
    .single()
  if (!storeRow) throw new Error('store not found')

  const analyticsToken = storeRow.wb_analytics_token || storeRow.wb_token
  const wb = createWBClient(analyticsToken)
  const nmIds = await getStoreNmIds(storeId, db)
  if (!nmIds.length) return { count: 0, days: 0 }

  // Разбиваем на 30-дневные чанки
  const start = new Date(startDate)
  const end   = new Date(endDate)
  let total = 0
  let chunkStart = new Date(start)

  while (chunkStart <= end) {
    const chunkEnd = new Date(chunkStart)
    chunkEnd.setDate(chunkEnd.getDate() + 29)
    if (chunkEnd > end) chunkEnd.setTime(end.getTime())

    const s = chunkStart.toISOString().split('T')[0]
    const e = chunkEnd.toISOString().split('T')[0]
    let items: WBFunnelItem[] = []

    for (let i = 0; i < nmIds.length; i += FUNNEL_BATCH) {
      if (i > 0) await sleep(21000)
      const batch = nmIds.slice(i, i + FUNNEL_BATCH)
      try {
        const chunk = await wb.getFunnelHistory(batch, s, e)
        items = items.concat(chunk)
      } catch (err) {
        console.error(`[funnel-initial] batch i=${i} ${s}—${e}:`, (err as Error).message)
      }
    }

    if (items.length) total += await upsertFunnelRows(storeId, items, db)
    console.log(`[funnel-initial] ${s}—${e}: ${items.length} записей`)

    chunkStart.setDate(chunkStart.getDate() + 30)
    await sleep(2000)
  }

  const days = Math.round((end.getTime() - start.getTime()) / 86400000) + 1
  return { count: total, days }
}

// ---------- Синхронизация всех магазинов ----------

export async function syncAllStores(): Promise<void> {
  const db = createAdminClient()
  const { data: stores, error } = await db
    .from('stores')
    .select('id, name, wb_token, wb_analytics_token')

  if (error || !stores) {
    console.error('[sync] Не удалось получить магазины:', error)
    return
  }

  for (const store of stores as Store[]) {
    try {
      await syncStore(store)
    } catch (err) {
      console.error(`[sync] Ошибка магазина ${store.name}:`, err)
    }
    await sleep(2000)
  }
}

// ---------- Ночной пересчёт агрегатов товаров ----------

export async function recalcAllStoresAggregates(): Promise<void> {
  const db = createAdminClient()
  const { data: stores } = await db.from('stores').select('id, name')
  if (!stores?.length) return

  for (const store of stores) {
    console.log(`[nightly] recalc aggregates: ${store.name}`)
    try {
      await recalcProductAggregates(store.id, db, msg => console.log(`[nightly] ${msg}`))
    } catch (err) {
      console.error(`[nightly] ошибка агрегатов ${store.name}:`, err)
    }
  }
}

// ---------- Хелперы ----------

function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size))
  }
  return chunks
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// ---------- Начальная загрузка рекламы (v1 — per-day данные за период) ----------

/**
 * Загрузка рекламной статистики за произвольный период.
 * Использует /adv/v3/fullstats (GET, макс. 50 кампаний, 31 день за запрос, 3 req/min).
 * Период разбивается на 31-дневные чанки, кампании — на батчи по 50.
 */
export async function syncAdvertPeriod(
  storeId: string,
  dateFrom: string,
  dateTo: string
): Promise<{ inserted: number; errors: number }> {
  const db = createAdminClient()
  const { data: storeRow } = await db.from('stores').select('id, name, wb_token').eq('id', storeId).single()
  if (!storeRow?.wb_token) throw new Error('Store not found or no token')

  const wb = createWBClient(storeRow.wb_token)

  // Получаем все кампании (включая завершённые — нужны для истории)
  const allCampaigns = await wb.getAdCampaigns()
  if (!allCampaigns?.length) return { inserted: 0, errors: 0 }
  const campaignIds = allCampaigns.map(c => c.advertId)
  const campaignNames = Object.fromEntries(allCampaigns.map(c => [c.advertId, c.name]))

  // Разбиваем период на 31-дневные чанки
  const chunks: Array<{ begin: string; end: string }> = []
  let cur = new Date(dateFrom + 'T00:00:00Z')
  const end = new Date(dateTo + 'T00:00:00Z')
  while (cur <= end) {
    const chunkEnd = new Date(Math.min(cur.getTime() + 30 * 86400000, end.getTime()))
    chunks.push({
      begin: cur.toISOString().split('T')[0],
      end:   chunkEnd.toISOString().split('T')[0],
    })
    cur = new Date(chunkEnd.getTime() + 86400000)
  }

  let inserted = 0
  let errors = 0
  let reqCount = 0

  for (const chunk of chunks) {
    for (let i = 0; i < campaignIds.length; i += 50) {
      const batch = campaignIds.slice(i, i + 50)

      // 3 req/min лимит → задержка 20 сек после каждого запроса
      if (reqCount > 0) await sleep(20_000)
      reqCount++

      let stats
      try {
        stats = await wb.getAdStatsCampaigns(batch, chunk.begin, chunk.end)
      } catch (e) {
        console.error(`[advert-period] fullstats error ${chunk.begin}–${chunk.end}:`, e)
        errors++
        continue
      }

      for (const camp of stats ?? []) {
        for (const day of camp.days ?? []) {
          const date = day.date?.split('T')[0]
          if (!date) continue
          const { error } = await db.from('wb_ad_spend').upsert({
            store_id:      storeId,
            campaign_id:   camp.advertId,
            campaign_name: campaignNames[camp.advertId] ?? String(camp.advertId),
            date,
            views:        day.views     ?? 0,
            clicks:       day.clicks    ?? 0,
            spend:        day.sum       ?? 0,
            orders_count: day.orders    ?? 0,
            orders_sum:   day.sum_price ?? 0,
          }, { onConflict: 'store_id,campaign_id,date' })
          if (error) { errors++; console.error('[advert-period] upsert:', error.message) }
          else inserted++
        }
      }
    }
  }

  return { inserted, errors }
}
