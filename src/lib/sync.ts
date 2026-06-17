/**
 * WB Analytics — Модуль синхронизации данных
 * Адаптирован под схему БД проекта (поля: wb_token, supplier_article)
 *
 * Запускается по cron каждые 30 мин через Vercel Cron Jobs
 */

import { createClient } from '@supabase/supabase-js'
import { createWBClient, formatDateForWB, daysAgo } from './wb-api'

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
  wb_token: string  // название поля в этой схеме
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
      const { error, count } = await db.from('wb_orders').insert(chunk)
      if (error && !error.message.includes('duplicate')) throw error
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
    const dateFrom = formatDateForWB(daysAgo(1))
    const stocks = await wb.getStocks(dateFrom)
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

// ---------- Синхронизация всех магазинов ----------

export async function syncAllStores(): Promise<void> {
  const db = createAdminClient()
  const { data: stores, error } = await db
    .from('stores')
    .select('id, name, wb_token')

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
