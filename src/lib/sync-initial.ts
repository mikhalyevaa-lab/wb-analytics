/**
 * Начальная загрузка данных из WB API
 *
 * Лимиты WB Statistics API (statistics-api.wildberries.ru):
 *   - 1 запрос в минуту на каждый метод (rate limit по методу, не по запросу)
 *   - Ошибка 429 при превышении
 *
 * Лимиты WB Content API (content-api.wildberries.ru):
 *   - 100 запросов в минуту
 *
 * Стратегия:
 *   orders / sales / incomes — ОДИН запрос с максимальным dateFrom (flag=1 отдаёт всё)
 *   finance                  — пагинация по rrd_id (100k строк/запрос), 65с между страницами
 *   stocks                   — один запрос, текущее состояние
 *   products                 — курсор Content API, 700мс между страницами
 *
 * 65 секунд между вызовами Statistics API методов.
 */

import { createClient } from '@supabase/supabase-js'
import { createWBClient, formatDateForWB } from './wb-api'

const STATS_RATE_LIMIT_MS = 65_000   // 65с между методами Stats API
const CONTENT_RATE_LIMIT_MS = 700    // 700мс между страницами Content API
const MAX_HISTORY_DAYS = 180         // WB Statistics API возвращает данные максимум за ~180 дней

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)) }

function dateStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function addDays(d: Date, n: number) {
  const r = new Date(d)
  r.setDate(r.getDate() + n)
  return r
}

function chunkArray<T>(arr: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

async function logSync(
  db: ReturnType<typeof adminClient>,
  storeId: string,
  method: string,
  dateFrom: string,
  dateTo: string,
  rowsCount: number,
  durationMs: number,
  error?: string,
) {
  await db.from('sync_log').insert({
    store_id: storeId,
    method,
    date_from: dateFrom,
    date_to: dateTo,
    rows_count: rowsCount,
    status: error ? 'error' : 'done',
    error: error || null,
    duration_ms: durationMs,
  })
}

// ─────────────────────────────────────────────
// ЗАКАЗЫ — один запрос за весь период
// ─────────────────────────────────────────────
async function initialOrders(store: { id: string; wb_token: string }, log: (m: string) => void) {
  const db = adminClient()
  const wb = createWBClient(store.wb_token)
  const dateFrom = dateStr(addDays(new Date(), -MAX_HISTORY_DAYS))
  const dateTo = dateStr(new Date())

  log(`orders: один запрос от ${dateFrom} (flag=1 → вся история)`)
  const t0 = Date.now()
  try {
    const orders = await wb.getOrders(formatDateForWB(addDays(new Date(), -MAX_HISTORY_DAYS)), 1)
    log(`orders: получено ${orders?.length ?? 0} строк от WB, сохраняю…`)

    if (orders?.length) {
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
      for (const chunk of chunkArray(rows, 500)) {
        await db.from('wb_orders').upsert(chunk, { onConflict: 'store_id,g_number', ignoreDuplicates: true })
      }
    }
    await logSync(db, store.id, 'orders', dateFrom, dateTo, orders?.length ?? 0, Date.now() - t0)
    log(`orders: ✓ ${orders?.length ?? 0} строк за ${Math.round((Date.now() - t0) / 1000)}с`)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    await logSync(db, store.id, 'orders', dateFrom, dateTo, 0, Date.now() - t0, msg)
    log(`orders: ошибка — ${msg}`)
  }
}

// ─────────────────────────────────────────────
// ПРОДАЖИ — один запрос за весь период
// ─────────────────────────────────────────────
async function initialSales(store: { id: string; wb_token: string }, log: (m: string) => void) {
  const db = adminClient()
  const wb = createWBClient(store.wb_token)
  const dateFrom = dateStr(addDays(new Date(), -MAX_HISTORY_DAYS))
  const dateTo = dateStr(new Date())

  log(`sales: один запрос от ${dateFrom}`)
  const t0 = Date.now()
  try {
    const sales = await wb.getSales(formatDateForWB(addDays(new Date(), -MAX_HISTORY_DAYS)), 1)
    log(`sales: получено ${sales?.length ?? 0} строк, сохраняю…`)

    if (sales?.length) {
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
      for (const chunk of chunkArray(rows, 500)) {
        await db.from('wb_sales').upsert(chunk, { onConflict: 'sale_id', ignoreDuplicates: true })
      }
    }
    await logSync(db, store.id, 'sales', dateFrom, dateTo, sales?.length ?? 0, Date.now() - t0)
    log(`sales: ✓ ${sales?.length ?? 0} строк за ${Math.round((Date.now() - t0) / 1000)}с`)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    await logSync(db, store.id, 'sales', dateFrom, dateTo, 0, Date.now() - t0, msg)
    log(`sales: ошибка — ${msg}`)
  }
}

// ─────────────────────────────────────────────
// ПОСТАВКИ — один запрос за весь период
// ─────────────────────────────────────────────
async function initialIncomes(store: { id: string; wb_token: string }, log: (m: string) => void) {
  const db = adminClient()
  const wb = createWBClient(store.wb_token)
  const dateFrom = dateStr(addDays(new Date(), -MAX_HISTORY_DAYS))
  const dateTo = dateStr(new Date())

  log(`incomes: один запрос от ${dateFrom}`)
  const t0 = Date.now()
  try {
    const incomes = await wb.getIncomes(formatDateForWB(addDays(new Date(), -MAX_HISTORY_DAYS)))
    log(`incomes: получено ${incomes?.length ?? 0} строк, сохраняю…`)

    if (incomes?.length) {
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
      for (const chunk of chunkArray(rows, 500)) {
        await db.from('wb_incomes').upsert(chunk, { onConflict: 'store_id,income_id', ignoreDuplicates: true })
      }
    }
    await logSync(db, store.id, 'incomes', dateFrom, dateTo, incomes?.length ?? 0, Date.now() - t0)
    log(`incomes: ✓ ${incomes?.length ?? 0} строк за ${Math.round((Date.now() - t0) / 1000)}с`)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    await logSync(db, store.id, 'incomes', dateFrom, dateTo, 0, Date.now() - t0, msg)
    log(`incomes: ошибка — ${msg}`)
  }
}

// ─────────────────────────────────────────────
// ФИНАНСЫ — пагинация по rrd_id, 65с между страницами
// ─────────────────────────────────────────────
async function initialFinance(store: { id: string; wb_token: string }, log: (m: string) => void) {
  const db = adminClient()
  const wb = createWBClient(store.wb_token)
  const dateFrom = dateStr(addDays(new Date(), -MAX_HISTORY_DAYS))
  const dateTo = dateStr(new Date())
  let rrdid = 0
  let page = 0
  let total = 0
  const t0 = Date.now()

  log(`finance: период ${dateFrom}…${dateTo}, пагинация rrd_id (100k строк/запрос)`)

  try {
    while (true) {
      page++
      log(`finance: страница ${page}, rrd_id=${rrdid}${page > 1 ? ` (ожидание ${STATS_RATE_LIMIT_MS / 1000}с лимита)` : ''}`)
      if (page > 1) await sleep(STATS_RATE_LIMIT_MS)

      const report = await wb.getFinanceReport(dateFrom, dateTo, rrdid, 100_000)
      if (!report?.length) { log(`finance: страница ${page} пустая, завершено`); break }

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

      for (const chunk of chunkArray(rows, 500)) {
        await db.from('wb_finance').upsert(chunk, { onConflict: 'store_id,rrd_id', ignoreDuplicates: true })
      }

      total += rows.length
      log(`finance: стр.${page} ✓ ${rows.length} строк (итого ${total})`)

      if (rows.length < 100_000) break
      rrdid = Math.max(...rows.map(r => r.rrd_id ?? 0))
    }

    await logSync(db, store.id, 'finance', dateFrom, dateTo, total, Date.now() - t0)
    log(`finance: ✓ всего ${total} строк за ${Math.round((Date.now() - t0) / 1000)}с`)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    await logSync(db, store.id, 'finance', dateFrom, dateTo, total, Date.now() - t0, msg)
    log(`finance: ошибка на стр.${page} — ${msg}`)
  }
}

// ─────────────────────────────────────────────
// ОСТАТКИ — текущее состояние
// ─────────────────────────────────────────────
async function initialStocks(store: { id: string; wb_token: string }, log: (m: string) => void) {
  const db = adminClient()
  const wb = createWBClient(store.wb_token)
  const today = dateStr(new Date())
  const yesterday = dateStr(addDays(new Date(), -1))
  const t0 = Date.now()

  log('stocks: загрузка текущих остатков…')
  try {
    await db.from('wb_stocks').delete().eq('store_id', store.id).eq('date', today)
    const stocks = await wb.getStocks(yesterday)
    if (stocks?.length) {
      const rows = stocks.map(s => ({
        store_id: store.id, date: today,
        last_change_date: s.lastChangeDate, supplier_article: s.supplierArticle,
        tech_size: s.techSize, barcode: s.barcode, quantity: s.quantity,
        quantity_full: s.quantityFull, quantity_not_in_orders: s.quantityNotInOrders,
        warehouse: s.warehouseName, nm_id: s.nmId, subject: s.subject,
        category: s.category, brand: s.brand, price: s.Price, discount: s.Discount,
      }))
      for (const chunk of chunkArray(rows, 500)) await db.from('wb_stocks').insert(chunk)
      await logSync(db, store.id, 'stocks', yesterday, today, rows.length, Date.now() - t0)
      log(`stocks: ✓ ${rows.length} позиций`)
    }
  } catch (err) {
    log(`stocks: ошибка — ${err instanceof Error ? err.message : String(err)}`)
  }
}

// ─────────────────────────────────────────────
// КАРТОЧКИ ТОВАРОВ — Content API, 700мс между страницами
// ─────────────────────────────────────────────
async function initialProducts(store: { id: string; wb_token: string }, log: (m: string) => void) {
  const db = adminClient()
  const wb = createWBClient(store.wb_token)
  let cursor: { updatedAt?: string; nmID?: number } | undefined
  let total = 0, page = 0

  log('products: загрузка карточек из Content API…')
  while (true) {
    page++
    try {
      const res = await wb.getProducts(cursor)
      if (!res?.cards?.length) break

      const rows = res.cards.map(p => {
        const colorChar = p.characteristics?.find(c =>
          c.name.toLowerCase().includes('цвет') || c.name.toLowerCase() === 'color'
        )
        return {
          store_id: store.id, nm_id: p.nmID, imt_id: p.imtID,
          vendor_code: p.vendorCode, brand: p.brand, title: p.title,
          subject_id: p.subjectID, subject_name: p.subjectName,
          photo_url: p.photos?.[0]?.c246x328 ?? null,
          color: colorChar?.value?.[0] || null,
          updated_at: p.updatedAt,
        }
      })
      for (const chunk of chunkArray(rows, 100)) {
        await db.from('products').upsert(chunk, { onConflict: 'store_id,nm_id' })
      }
      total += rows.length
      log(`products: стр.${page} ✓ ${rows.length} карточек (итого ${total})`)

      if (res.cursor.total < 100) break
      cursor = { updatedAt: res.cursor.updatedAt, nmID: res.cursor.nmID }
      await sleep(CONTENT_RATE_LIMIT_MS)
    } catch (err) {
      log(`products: ошибка стр.${page} — ${err instanceof Error ? err.message : String(err)}`)
      break
    }
  }

  log('products: пересчёт агрегатов…')
  await recalcProductAggregates(store.id, db, log)
  log(`products: ✓ всего ${total} карточек`)
}

// ─────────────────────────────────────────────
// ПЕРЕСЧЁТ АГРЕГАТОВ
// ─────────────────────────────────────────────
export async function recalcProductAggregates(
  storeId: string,
  db: ReturnType<typeof adminClient>,
  log: (m: string) => void,
) {
  const now = new Date()
  const day7 = dateStr(addDays(now, -7))
  const day30 = dateStr(addDays(now, -30))

  // Последняя доступная дата остатков (не привязываемся к "сегодня")
  const { data: latestStock } = await db
    .from('wb_stocks').select('date').eq('store_id', storeId)
    .order('date', { ascending: false }).limit(1).single()
  const latestStockDate = latestStock?.date ?? dateStr(now)

  const [{ data: products }, { data: sales7 }, { data: orders30 }, { data: sales30 }, { data: orders7 }, { data: sales30prices }] =
    await Promise.all([
      db.from('products').select('nm_id').eq('store_id', storeId),
      // price_with_disc = totalPrice*(1-discountPercent/100) = Цена до СПП
      // finished_price  = (1-spp/100)*price_with_disc       = Цена после СПП
      // gt('price_with_disc', 0) — исключаем возвраты (отрицательные значения)
      db.from('wb_sales').select('nm_id, price_with_disc, finished_price').eq('store_id', storeId).gte('date', day7).gt('price_with_disc', 0),
      db.from('wb_orders').select('nm_id').eq('store_id', storeId).gte('date', day30).eq('is_cancel', false),
      db.from('wb_sales').select('nm_id').eq('store_id', storeId).gte('date', day30),
      db.from('wb_orders').select('nm_id').eq('store_id', storeId).gte('date', day7).eq('is_cancel', false),
      // Фолбэк: цены за 30 дней если за 7 дней продаж не было
      db.from('wb_sales').select('nm_id, price_with_disc, finished_price').eq('store_id', storeId).gte('date', day30).gt('price_with_disc', 0),
    ])

  if (!products?.length) return

  // Paginate wb_stocks (Supabase hard cap = 1000 rows per request)
  const stocks: { nm_id: number | null; quantity: number | null }[] = []
  for (let page = 0; ; page++) {
    const { data: chunk } = await db.from('wb_stocks').select('nm_id, quantity')
      .eq('store_id', storeId).eq('date', latestStockDate).range(page * 1000, (page + 1) * 1000 - 1)
    if (!chunk?.length) break
    stocks.push(...chunk)
    if (chunk.length < 1000) break
  }

  const priceBefore7: Record<number, number[]> = {}
  const priceAfter7: Record<number, number[]> = {}
  for (const s of sales7 ?? []) {
    if (!s.nm_id) continue
    if (s.price_with_disc != null) (priceBefore7[s.nm_id] ||= []).push(s.price_with_disc)
    if (s.finished_price != null)  (priceAfter7[s.nm_id]  ||= []).push(s.finished_price)
  }
  const priceBefore30: Record<number, number[]> = {}
  const priceAfter30: Record<number, number[]> = {}
  for (const s of sales30prices ?? []) {
    if (!s.nm_id) continue
    if (s.price_with_disc != null) (priceBefore30[s.nm_id] ||= []).push(s.price_with_disc)
    if (s.finished_price != null)  (priceAfter30[s.nm_id]  ||= []).push(s.finished_price)
  }

  const ord30Map: Record<number, number> = {}
  const sal30Map: Record<number, number> = {}
  const ord7Map: Record<number, number> = {}
  const stockMap: Record<number, number> = {}
  for (const o of orders30 ?? []) if (o.nm_id) ord30Map[o.nm_id] = (ord30Map[o.nm_id] ?? 0) + 1
  for (const s of sales30 ?? []) if (s.nm_id) sal30Map[s.nm_id] = (sal30Map[s.nm_id] ?? 0) + 1
  for (const o of orders7 ?? []) if (o.nm_id) ord7Map[o.nm_id] = (ord7Map[o.nm_id] ?? 0) + 1
  for (const s of stocks) if (s.nm_id) stockMap[s.nm_id] = (stockMap[s.nm_id] ?? 0) + (s.quantity ?? 0)

  const avg = (arr: number[]) => arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : null

  const updates = (products ?? []).map(p => {
    const nm = p.nm_id
    const ord30 = ord30Map[nm] ?? 0
    const sal30 = sal30Map[nm] ?? 0
    // Если за 7 дней не было продаж — берём цену за 30 дней
    const hasSales7 = (priceBefore7[nm]?.length ?? 0) > 0
    const avgPriceBefore = hasSales7 ? avg(priceBefore7[nm]) : avg(priceBefore30[nm] ?? [])
    const avgPriceAfter = hasSales7 ? avg(priceAfter7[nm]) : avg(priceAfter30[nm] ?? [])
    return {
      store_id: storeId, nm_id: nm,
      avg_price_before_spp: avgPriceBefore,
      avg_price_after_spp: avgPriceAfter,
      avg_orders_per_day: (ord7Map[nm] ?? 0) / 7,
      buyout_rate: ord30 > 0 ? Math.round((sal30 / ord30) * 100) : null,
      current_stock: stockMap[nm] ?? 0,
    }
  })

  for (const chunk of chunkArray(updates, 100)) {
    await db.from('products').upsert(chunk, { onConflict: 'store_id,nm_id' })
  }
  log(`агрегаты: пересчитано ${updates.length} товаров`)
}

// ─────────────────────────────────────────────
// ГЛАВНАЯ ФУНКЦИЯ
// ─────────────────────────────────────────────
export type InitialSyncMethod = 'orders' | 'sales' | 'incomes' | 'finance' | 'stocks' | 'products' | 'all'

export async function runInitialSync(
  store: { id: string; name: string; wb_token: string },
  methods: InitialSyncMethod[] = ['all'],
  onProgress: (msg: string) => void = console.log,
) {
  const doAll = methods.includes('all')
  onProgress(`=== Начальная загрузка: ${store.name} ===`)
  onProgress(`Методы: ${doAll ? 'все' : methods.join(', ')}`)
  onProgress(`Период истории: ${MAX_HISTORY_DAYS} дней`)
  onProgress(`Лимит Stats API: 65с между методами`)

  // Без лимитов
  if (doAll || methods.includes('stocks'))   await initialStocks(store, onProgress)
  if (doAll || methods.includes('products')) await initialProducts(store, onProgress)

  // Один вызов за всю историю, 65с между методами
  if (doAll || methods.includes('orders')) {
    await initialOrders(store, onProgress)
    onProgress(`ожидание ${STATS_RATE_LIMIT_MS / 1000}с перед следующим методом…`)
    await sleep(STATS_RATE_LIMIT_MS)
  }
  if (doAll || methods.includes('sales')) {
    await initialSales(store, onProgress)
    onProgress(`ожидание ${STATS_RATE_LIMIT_MS / 1000}с…`)
    await sleep(STATS_RATE_LIMIT_MS)
  }
  if (doAll || methods.includes('incomes')) {
    await initialIncomes(store, onProgress)
    onProgress(`ожидание ${STATS_RATE_LIMIT_MS / 1000}с…`)
    await sleep(STATS_RATE_LIMIT_MS)
  }
  if (doAll || methods.includes('finance')) {
    await initialFinance(store, onProgress)
  }

  onProgress(`=== Загрузка завершена ===`)
}
