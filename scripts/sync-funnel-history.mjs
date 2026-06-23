import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'

config({ path: '.env.local' })

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
const S = '73d40959-1920-4c68-a0f5-3684846b923f'
const URL = 'https://seller-analytics-api.wildberries.ru/api/analytics/v3/sales-funnel/products/history'
const BATCH = 100
const sleep = ms => new Promise(r => setTimeout(r, ms))

async function fetchWithRetry(token, nmIds, start, end, attempt = 0) {
  const res = await fetch(URL, {
    method: 'POST',
    headers: { Authorization: token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ selectedPeriod: { start, end }, nmIds, skipDeletedNm: false, aggregationLevel: 'day' }),
  })
  if (res.status === 429) {
    const wait = (attempt + 1) * 60000
    console.log(`  429 rate limit, жду ${wait / 1000}с...`)
    await sleep(wait)
    return fetchWithRetry(token, nmIds, start, end, attempt + 1)
  }
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

function dateChunks(startDate, endDate, chunkDays = 30) {
  const chunks = []
  let cur = new Date(startDate + 'T00:00:00Z')
  const end = new Date(endDate + 'T00:00:00Z')
  while (cur <= end) {
    const chunkEnd = new Date(cur)
    chunkEnd.setUTCDate(chunkEnd.getUTCDate() + chunkDays - 1)
    if (chunkEnd > end) chunkEnd.setTime(end.getTime())
    chunks.push({ from: cur.toISOString().split('T')[0], to: chunkEnd.toISOString().split('T')[0] })
    cur = new Date(chunkEnd)
    cur.setUTCDate(cur.getUTCDate() + 1)
  }
  return chunks
}

async function run() {
  const { data: store } = await db.from('stores').select('wb_token,wb_analytics_token').eq('id', S).single()
  const token = store.wb_analytics_token || store.wb_token

  const { data: prods } = await db.from('products').select('nm_id').eq('store_id', S)
  const nmIds = [...new Set(prods?.map(p => p.nm_id).filter(Boolean))]
  console.log('Артикулов:', nmIds.length)

  // Проверяем что уже есть
  const { data: existing } = await db.from('wb_funnel').select('date').eq('store_id', S)
    .order('date', { ascending: true }).limit(1)
  const firstExisting = existing?.[0]?.date
  console.log('Первая существующая дата:', firstExisting ?? 'нет данных')

  const moscowNow = new Date(Date.now() + 3 * 60 * 60 * 1000)
  const endDate = moscowNow.toISOString().split('T')[0]
  // 90 дней назад
  const startDate = new Date(moscowNow.getTime() - 90 * 86400000).toISOString().split('T')[0]

  console.log(`\nСинк: ${startDate} → ${endDate}`)
  const chunks = dateChunks(startDate, endDate, 30)
  console.log(`Периодов: ${chunks.length}`)

  let grandTotal = 0
  for (const chunk of chunks) {
    console.log(`\n=== ${chunk.from} → ${chunk.to} ===`)
    for (let i = 0; i < nmIds.length; i += BATCH) {
      if (i > 0) await sleep(21000)
      const batch = nmIds.slice(i, i + BATCH)
      const items = await fetchWithRetry(token, batch, chunk.from, chunk.to)
      const rows = []
      for (const item of (Array.isArray(items) ? items : [])) {
        const nmId = item.product?.nmId; if (!nmId) continue
        for (const h of item.history ?? []) {
          rows.push({
            store_id: S, nm_id: nmId, date: h.date,
            open_count: h.openCount ?? 0, cart_count: h.cartCount ?? 0,
            order_count: h.orderCount ?? 0, order_sum: h.orderSum ?? 0,
            buyout_count: h.buyoutCount ?? 0, buyout_sum: h.buyoutSum ?? 0,
            buyout_percent: h.buyoutPercent ?? 0,
            add_to_cart_conversion: h.addToCartConversion ?? 0,
            cart_to_order_conversion: h.cartToOrderConversion ?? 0,
          })
        }
      }
      if (rows.length) {
        for (let j = 0; j < rows.length; j += 500) {
          const { error } = await db.from('wb_funnel').upsert(rows.slice(j, j + 500),
            { onConflict: 'store_id,nm_id,date', ignoreDuplicates: false })
          if (error) console.log('  Upsert error:', error.message)
        }
        grandTotal += rows.length
      }
      console.log(`  Партия ${Math.floor(i / BATCH) + 1}: ${rows.length} строк`)
    }
    await sleep(2000)
  }

  console.log(`\nГотово. Всего сохранено: ${grandTotal} строк`)

  // Проверка итога
  const { data: check } = await db.from('wb_funnel').select('date').eq('store_id', S)
    .order('date', { ascending: true }).limit(1)
  const { data: check2 } = await db.from('wb_funnel').select('date').eq('store_id', S)
    .order('date', { ascending: false }).limit(1)
  console.log(`БД: ${check?.[0]?.date} → ${check2?.[0]?.date}`)
}

run().catch(console.error)
