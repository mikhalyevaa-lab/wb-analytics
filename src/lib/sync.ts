/**
 * WB Analytics — Модуль синхронизации данных
 *
 * Запускается по cron каждые 120 мин через Vercel Cron Jobs (/api/sync)
 * Ночной cron 3:00 UTC (/api/sync/nightly) — пересчёт агрегатов товаров
 *
 * Лимиты WB API: Token Bucket, при 429 читаем X-Ratelimit-Retry (сек).
 * Retry-логика встроена в WBApiClient.fetch (до 4 попыток, exponential backoff).
 */

import { createAdminClient } from './db-compat'
import { createWBClient, formatDateForWB, daysAgo, parseWBNum } from './wb-api'
import { recalcProductAggregates } from './sync-initial'
import type { WBFunnelItem } from './wb-api'

function adminClient() { return createAdminClient() }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseAdminClient = any

// ---------- Типы ----------

type Store = {
  id: string
  name: string
  wb_token: string
  wb_analytics_token: string | null
}

// ---------- Throttle: пропустить синк если он запускался недавно ----------

// Throttle: проверяем когда последний раз успешно завершился синк этого типа
async function shouldSync(
  storeId: string,
  method: string,
  minIntervalHours: number,
  db: SupabaseAdminClient
): Promise<boolean> {
  const { data } = await db
    .from('sync_log')
    .select('finished_at')
    .eq('store_id', storeId)
    .eq('method', method)
    .is('error', null)
    .not('finished_at', 'is', null)
    .order('finished_at', { ascending: false })
    .limit(1)
    .single()

  if (!data?.finished_at) return true
  const hoursSince = (Date.now() - new Date(data.finished_at).getTime()) / 3_600_000
  return hoursSince >= minIntervalHours
}

// Логируем запуск/завершение синка в sync_log (существующая схема: method, created_at, finished_at, rows_count, error)
async function logSync(
  storeId: string,
  method: string,
  db: SupabaseAdminClient,
  fn: () => Promise<{ count: number; error?: string }>
): Promise<{ count: number; error?: string }> {
  const startMs = Date.now()
  const { data: logRow } = await db
    .from('sync_log')
    .insert({ store_id: storeId, method, status: 'running' })
    .select('id')
    .single()

  const result = await fn()

  if (logRow?.id) {
    await db.from('sync_log').update({
      finished_at:  new Date().toISOString(),
      rows_count:   result.count,
      status:       result.error ? 'error' : 'ok',
      error:        result.error ?? null,
      duration_ms:  Date.now() - startMs,
    }).eq('id', logRow.id)
  }
  return result
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

  // Заказы, продажи, финансы, поставки — каждый запуск (каждые 2 часа)
  await syncOrders(store, wb, db, results)
  await sleep(1000)
  await syncSales(store, wb, db, results)
  await sleep(1000)
  await syncFinance(store, wb, db, results)
  await sleep(1000)
  await syncIncomes(store, wb, db, results)
  await sleep(1000)

  // Остатки и товары — раз в 12 часов
  if (await shouldSync(store.id, 'stocks', 12, db)) {
    await syncStocks(store, wb, db, results)
    await sleep(1000)
  } else {
    console.log(`[sync] stocks: throttled`)
  }

  if (await shouldSync(store.id, 'products', 12, db)) {
    await syncProducts(store, wb, db, results)
    await sleep(1000)
  } else {
    console.log(`[sync] products: throttled`)
  }

  // Платное хранение — раз в 20 часов
  if (await shouldSync(store.id, 'storage', 20, db)) {
    await logSync(store.id, 'storage', db, async () => {
      await syncPaidStorageInternal(store, db, results)
      return results.storage ?? { count: 0 }
    })
  } else {
    console.log(`[sync] storage: throttled`)
  }
  await sleep(1000)

  await syncAdvert(store, wb, db, results)
  await sleep(1000)
  await syncFunnel(store, db, results)

  // Комиссии — раз в 240 часов (10 дней)
  if (await shouldSync(store.id, 'commissions', 240, db)) {
    await sleep(61000)
    await syncCommissions(store, wb, db, results)
  } else {
    console.log(`[sync] commissions: throttled`)
  }

  // Тарифы — раз в 24 часа
  if (await shouldSync(store.id, 'tariffs', 24, db)) {
    await sleep(61000)
    await syncTariffs(store, wb, db, results)
  } else {
    console.log(`[sync] tariffs: throttled`)
  }
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

    // Дедупликация по ключу — WB иногда отдаёт дубли в одной выгрузке
    const seen = new Set<string>()
    const deduped = rows.filter(r => {
      const key = `${r.g_number}|${r.nm_id}|${r.barcode}|${String(r.date).slice(0, 10)}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })

    const chunks = chunkArray(deduped, 500)
    let total = 0
    for (const chunk of chunks) {
      const { error, count } = await db
        .from('wb_orders')
        .upsert(chunk, { onConflict: 'store_id,g_number,nm_id,barcode,date' })
      if (error) throw new Error(error.message ?? JSON.stringify(error))
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
      if (error) throw new Error(error.message ?? JSON.stringify(error))
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
      if (error) throw new Error(error.message ?? JSON.stringify(error))
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
      if (error) throw new Error(error.message ?? JSON.stringify(error))
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
      if (error) throw new Error(error.message ?? JSON.stringify(error))
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
          length_mm: p.dimensions?.length ?? null,
          width_mm: p.dimensions?.width ?? null,
          height_mm: p.dimensions?.height ?? null,
          updated_at: p.updatedAt,
        }
      })

      const { error, count } = await db
        .from('products')
        .upsert(rows, { onConflict: 'store_id,nm_id' })
      if (error) throw new Error(error.message ?? JSON.stringify(error))
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

      // API no longer returns campaign names — preserve existing names in DB
      const campaignNames = Object.fromEntries(campaigns.map(c => [c.advertId, c.name]).filter(([, n]) => n))
      const nmRows: Record<string, unknown>[] = []

      for (const camp of stats ?? []) {
        for (const day of camp.days ?? []) {
          const date = day.date?.split('T')[0]
          if (!date) continue
          const row: Record<string, unknown> = {
            store_id:    store.id,
            campaign_id: camp.advertId,
            date,
            views:        day.views     ?? 0,
            clicks:       day.clicks    ?? 0,
            spend:        day.sum       ?? 0,
            orders_count: day.orders    ?? 0,
            orders_sum:   day.sum_price ?? 0,
          }
          // Only set campaign_name if we have a real name (not empty) — don't overwrite manual names
          const name = campaignNames[camp.advertId]
          if (name) row.campaign_name = name
          const { error } = await db.from('wb_ad_spend').upsert(row, {
            onConflict: 'store_id,campaign_id,date',
            ignoreDuplicates: false,
          })
          if (error) console.error('[sync] advert upsert:', error.message)
          else total++

          // Извлекаем nm-детализацию из того же ответа (apps → nms)
          const nmAgg = new Map<number, { nm_name: string | null; spend: number; views: number; clicks: number; orders_count: number; orders_sum: number }>()
          for (const app of day.apps ?? []) {
            for (const nm of app.nms ?? []) {
              if (!nm.nmId) continue
              const cur = nmAgg.get(nm.nmId) ?? { nm_name: nm.name ?? null, spend: 0, views: 0, clicks: 0, orders_count: 0, orders_sum: 0 }
              cur.spend        += nm.sum       ?? 0
              cur.views        += nm.views     ?? 0
              cur.clicks       += nm.clicks    ?? 0
              cur.orders_count += nm.orders    ?? 0
              cur.orders_sum   += nm.sum_price ?? 0
              nmAgg.set(nm.nmId, cur)
            }
          }
          for (const [nmId, agg] of nmAgg) {
            nmRows.push({
              store_id: store.id, campaign_id: camp.advertId, nm_id: nmId,
              nm_name: agg.nm_name, date,
              spend: agg.spend, views: agg.views, clicks: agg.clicks,
              orders_count: agg.orders_count, orders_sum: agg.orders_sum,
            })
          }
        }
      }

      // Batch upsert nm rows
      if (nmRows.length) {
        for (let j = 0; j < nmRows.length; j += 500) {
          const { error } = await db.from('wb_ad_spend_nm').upsert(nmRows.slice(j, j + 500), {
            onConflict: 'store_id,campaign_id,nm_id,date', ignoreDuplicates: false,
          })
          if (error) console.error('[sync] advert nm upsert:', error.message)
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

// ---------- Комиссии WB по предметам ----------

async function syncCommissions(
  store: Store,
  wb: ReturnType<typeof createWBClient>,
  db: SupabaseAdminClient,
  results: Record<string, { count: number; error?: string }>
) {
  results.commissions = await logSync(store.id, 'commissions', db, async () => {
    const commissions = await wb.getCommissions()
    if (!commissions.length) return { count: 0 }

    const rows = commissions.map(c => ({
      store_id:          store.id,
      subject_id:        c.subjectID,
      subject_name:      c.subjectName,
      parent_id:         c.parentID,
      parent_name:       c.parentName,
      kgvp_supplier:     c.kgvpSupplier,
      kgvp_marketplace:  c.kgvpMarketplace,
      kgvp_pickup:       c.kgvpPickup,
      kgvp_booking:      c.kgvpBooking,
      paid_storage_kgvp: c.paidStorageKgvp,
      loaded_at:         new Date().toISOString(),
    }))

    let total = 0
    for (const chunk of chunkArray(rows, 500)) {
      const { error, count } = await db
        .from('wb_commissions')
        .upsert(chunk, { onConflict: 'store_id,subject_id' })
      if (error) throw new Error(error.message ?? JSON.stringify(error))
      total += count || chunk.length
    }
    return { count: total }
  }).catch(err => {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[sync] commissions error:', msg)
    return { count: 0, error: msg }
  })
}

// ---------- Тарифы логистики, хранения, возврата ----------

async function syncTariffs(
  store: Store,
  wb: ReturnType<typeof createWBClient>,
  db: SupabaseAdminClient,
  results: Record<string, { count: number; error?: string }>
) {
  results.tariffs = await logSync(store.id, 'tariffs', db, async () => {
    const today = new Date().toISOString().split('T')[0]
    let total = 0

    // Box (доставка + хранение)
    const boxResp = await wb.getBoxTariffs(today)
    const boxList = boxResp?.response?.data?.warehouseList ?? []
    const dtNextBox    = boxResp?.response?.data?.dtNextBox ?? null
    const dtTillMaxBox = boxResp?.response?.data?.dtTillMax ?? null

    if (boxList.length) {
      const baseRow = (t: typeof boxList[0]) => ({
        store_id:           store.id,
        tariff_type:        'box',
        warehouse_name:     t.warehouseName,
        geo_name:           t.geoName ?? null,
        delivery_base:      parseWBNum(t.boxDeliveryBase),
        delivery_liter:     parseWBNum(t.boxDeliveryLiter),
        delivery_coef_expr: parseWBNum(t.boxDeliveryCoefExpr),
        storage_base:       parseWBNum(t.boxStorageBase),
        storage_liter:      parseWBNum(t.boxStorageLiter),
        storage_coef_expr:  parseWBNum(t.boxStorageCoefExpr),
        dt_next_change:     dtNextBox ? dtNextBox.split('T')[0] : null,
        dt_till_max:        dtTillMaxBox ? dtTillMaxBox.split('T')[0] : null,
        loaded_at:          new Date().toISOString(),
      })

      // Актуальный snapshot
      for (const chunk of chunkArray(boxList.map(baseRow), 200)) {
        const { error, count } = await db
          .from('wb_tariffs')
          .upsert(chunk, { onConflict: 'store_id,tariff_type,warehouse_name' })
        if (error) throw new Error(error.message ?? JSON.stringify(error))
        total += count || chunk.length
      }

      // История
      const histRows = boxList.map(t => ({ ...baseRow(t), snapshot_date: today }))
      for (const chunk of chunkArray(histRows, 200)) {
        await db.from('wb_tariffs_history')
          .upsert(chunk, { onConflict: 'store_id,tariff_type,warehouse_name,snapshot_date' })
      }
    }

    await sleep(61000) // 1 req/min лимит

    // Return (возврат)
    const retResp = await wb.getReturnTariffs(today)
    const retList = retResp?.response?.data?.warehouseList ?? []
    const dtTillMaxRet = retResp?.response?.data?.dtTillMax ?? null

    if (retList.length) {
      const baseRow = (t: typeof retList[0]) => ({
        store_id:             store.id,
        tariff_type:          'return',
        warehouse_name:       t.warehouseName,
        return_office_base:   parseWBNum(t.deliveryDumpSupOfficeBase),
        return_office_liter:  parseWBNum(t.deliveryDumpSupOfficeLiter),
        return_courier_base:  parseWBNum(t.deliveryDumpSupCourierBase),
        return_courier_liter: parseWBNum(t.deliveryDumpSupCourierLiter),
        dt_till_max:          dtTillMaxRet ? dtTillMaxRet.split('T')[0] : null,
        loaded_at:            new Date().toISOString(),
      })

      for (const chunk of chunkArray(retList.map(baseRow), 200)) {
        const { error, count } = await db
          .from('wb_tariffs')
          .upsert(chunk, { onConflict: 'store_id,tariff_type,warehouse_name' })
        if (error) throw new Error(error.message ?? JSON.stringify(error))
        total += count || chunk.length
      }

      const histRows = retList.map(t => ({ ...baseRow(t), snapshot_date: today }))
      for (const chunk of chunkArray(histRows, 200)) {
        await db.from('wb_tariffs_history')
          .upsert(chunk, { onConflict: 'store_id,tariff_type,warehouse_name,snapshot_date' })
      }
    }

    return { count: total }
  }).catch(err => {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[sync] tariffs error:', msg)
    return { count: 0, error: msg }
  })
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

  const wb = createWBClient((storeRow as any).wb_token)
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

/** Возвращает все nm_id для магазина из таблицы products */
async function getStoreNmIds(storeId: string, db: SupabaseAdminClient): Promise<number[]> {
  const { data } = await db.from('products').select('nm_id').eq('store_id', storeId)
  return (data ?? []).map((r: any) => Number(r.nm_id)).filter(Boolean)
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
        if (i > 0) await sleep(3000)
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

  const analyticsToken = (storeRow as any).wb_analytics_token || (storeRow as any).wb_token
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
      if (i > 0) await sleep(3000)
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

// ---------- Платное хранение ----------

/**
 * Ежедневный синк платного хранения (последние 3 дня — WB поздно финализирует данные).
 * Требует wb_analytics_token.
 */
async function syncPaidStorageInternal(
  store: Store,
  db: SupabaseAdminClient,
  results: Record<string, { count: number; error?: string }>
) {
  if (!store.wb_analytics_token) {
    results.storage = { count: 0, error: 'no analytics token' }
    return
  }
  try {
    const today  = new Date().toISOString().split('T')[0]
    const from3  = new Date(Date.now() - 3 * 86400000).toISOString().split('T')[0]
    const wb = createWBClient(store.wb_analytics_token)
    const rows = await wb.getPaidStorage(from3, today)
    if (!rows?.length) { results.storage = { count: 0 }; return }

    const dbRows = rows.map(r => ({
      store_id:    store.id,
      date:        r.date?.split('T')[0] ?? r.originalDate?.split('T')[0] ?? today,
      nm_id:       r.nmId,
      vendor_code: r.vendorCode ?? null,
      barcode:     r.barcode ?? null,
      subject:     r.subject ?? null,
      brand:       r.brand ?? null,
      warehouse:   r.warehouse ?? null,
      volume:      r.volume ?? null,
      cost:           r.warehousePrice != null ? r.warehousePrice * (1 - (r.loyaltyDiscount ?? 0) / 100) : null,
      barcodes_count: r.barcodesCount ?? null,
      calc_type:      r.calcType ?? null,
    }))

    let total = 0
    for (const chunk of chunkArray(dbRows, 500)) {
      const { error, count } = await (db.from('wb_storage_daily') as any)
        .upsert(chunk, { onConflict: 'store_id,date,nm_id,warehouse,barcode' })
      if (error) throw new Error(error.message ?? JSON.stringify(error))
      total += count || chunk.length
    }
    results.storage = { count: total }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[sync] storage error:', msg)
    results.storage = { count: 0, error: msg }
  }
}

/**
 * Экспортируемая функция для загрузки платного хранения за произвольный период.
 * Окно: 31 день за запрос. Используется для исторической загрузки.
 */
export async function syncPaidStoragePeriod(
  storeId: string,
  dateFrom: string,
  dateTo: string
): Promise<{ inserted: number; chunks: number }> {
  const db = createAdminClient()
  const { data: storeRow } = await db
    .from('stores')
    .select('wb_analytics_token')
    .eq('id', storeId)
    .single()
  if (!storeRow?.wb_analytics_token) throw new Error('no wb_analytics_token')

  const wb = createWBClient((storeRow as any).wb_analytics_token)

  // Разбиваем период на 31-дневные чанки
  const periodChunks: Array<{ from: string; to: string }> = []
  let cur = new Date(dateFrom + 'T00:00:00Z')
  const end = new Date(dateTo + 'T00:00:00Z')
  while (cur <= end) {
    // WB paid_storage API: max 8 days per request (≤7 days diff)
    const chunkEnd = new Date(Math.min(cur.getTime() + 7 * 86400000, end.getTime()))
    periodChunks.push({
      from: cur.toISOString().split('T')[0],
      to:   chunkEnd.toISOString().split('T')[0],
    })
    cur = new Date(chunkEnd.getTime() + 86400000)
  }

  let inserted = 0
  for (const chunk of periodChunks) {
    let rows
    try {
      rows = await wb.getPaidStorage(chunk.from, chunk.to)
    } catch (e) {
      console.error(`[storage-period] ${chunk.from}–${chunk.to}:`, e)
      await sleep(5000)
      continue
    }

    if (!rows?.length) continue

    const allRows = rows.map(r => ({
      store_id:    storeId,
      date:        r.date?.split('T')[0] ?? r.originalDate?.split('T')[0] ?? chunk.from,
      nm_id:       r.nmId,
      vendor_code: r.vendorCode ?? null,
      barcode:     r.barcode ?? null,
      subject:     r.subject ?? null,
      brand:       r.brand ?? null,
      warehouse:   r.warehouse ?? null,
      volume:      r.volume ?? null,
      barcodes_count: r.barcodesCount ?? null,
      cost_per_unit:  r.warehousePrice ?? null,
      cost:           r.warehousePrice != null ? r.warehousePrice * (1 - (r.loyaltyDiscount ?? 0) / 100) : null,
      calc_type:      r.calcType ?? null,
    }))

    // WB может вернуть дубли в одном ответе — дедупликация по уникальному ключу
    const seen = new Set<string>()
    const dbRows = allRows.filter(r => {
      const key = `${r.date}|${r.nm_id}|${r.warehouse ?? ''}|${r.barcode ?? ''}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })

    for (const batch of chunkArray(dbRows, 500)) {
      const { error } = await (db.from('wb_storage_daily') as any)
        .upsert(batch, { onConflict: 'store_id,date,nm_id,warehouse,barcode' })
      if (error) console.error('[storage-period] upsert:', error.message)
      else inserted += batch.length
    }
    console.log(`[storage-period] ${chunk.from}–${chunk.to}: ${rows.length} строк`)
    await sleep(1000)
  }

  return { inserted, chunks: periodChunks.length }
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

  const wb = createWBClient((storeRow as any).wb_token)

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

      const nmRows: Record<string, unknown>[] = []

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

          // Детализация по артикулам (apps → nms)
          const nmAgg = new Map<number, { nm_name: string | null; spend: number; views: number; clicks: number; orders_count: number; orders_sum: number }>()
          for (const app of day.apps ?? []) {
            for (const nm of app.nms ?? []) {
              if (!nm.nmId) continue
              const cur = nmAgg.get(nm.nmId) ?? { nm_name: nm.name ?? null, spend: 0, views: 0, clicks: 0, orders_count: 0, orders_sum: 0 }
              cur.spend        += nm.sum       ?? 0
              cur.views        += nm.views     ?? 0
              cur.clicks       += nm.clicks    ?? 0
              cur.orders_count += nm.orders    ?? 0
              cur.orders_sum   += nm.sum_price ?? 0
              nmAgg.set(nm.nmId, cur)
            }
          }
          for (const [nmId, agg] of nmAgg) {
            nmRows.push({
              store_id: storeId, campaign_id: camp.advertId, nm_id: nmId,
              nm_name: agg.nm_name, date,
              spend: agg.spend, views: agg.views, clicks: agg.clicks,
              orders_count: agg.orders_count, orders_sum: agg.orders_sum,
            })
          }
        }
      }

      // Пакетный upsert nm-строк
      for (let j = 0; j < nmRows.length; j += 500) {
        const { error } = await db.from('wb_ad_spend_nm').upsert(nmRows.slice(j, j + 500), {
          onConflict: 'store_id,campaign_id,nm_id,date', ignoreDuplicates: false,
        })
        if (error) console.error('[advert-period] nm upsert:', error.message)
      }
    }
  }

  return { inserted, errors }
}
