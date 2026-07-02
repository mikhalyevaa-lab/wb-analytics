/**
 * Синк детализации рекламы по артикулу (nmId) из /adv/v3/fullstats
 * Использует те же данные что и основной синк — дополнительных API-запросов нет.
 *
 * Запуск:
 *   npx tsx scripts/sync-ad-spend-nm.ts [beginDate] [endDate]
 *   npx tsx scripts/sync-ad-spend-nm.ts 2026-04-01 2026-06-22
 */
import { config } from 'dotenv'
config({ path: '.env.local' })

const STORE_ID = '73d40959-1920-4c68-a0f5-3684846b923f'
const BATCH_SIZE = 50
const DELAY_MS = 20_000

// Динамический импорт — чтобы .env.local гарантированно подгрузился ДО того,
// как @/lib/db прочитает process.env.DATABASE_URL при инициализации соединения
const { adminDb } = await import('../src/lib/db-compat')
const db = adminDb()

function moscowDateStr(offsetDays = 0) {
  const d = new Date(Date.now() + 3 * 60 * 60 * 1000)
  d.setUTCDate(d.getUTCDate() - offsetDays)
  return d.toISOString().split('T')[0]
}

async function sleep(ms: number) {
  return new Promise(r => setTimeout(r, ms))
}

interface NmRow {
  store_id: string
  campaign_id: number
  nm_id: number
  nm_name: string | null
  date: string
  spend: number
  views: number
  clicks: number
  orders_count: number
  orders_sum: number
  atbs: number
  canceled: number
  [key: string]: unknown
}

async function fetchAndSaveNmData(
  token: string,
  campaignIds: number[],
  beginDate: string,
  endDate: string
): Promise<{ saved: number; campaigns: number }> {
  const url = `https://advert-api.wildberries.ru/adv/v3/fullstats?ids=${campaignIds.join(',')}&beginDate=${beginDate}&endDate=${endDate}`
  const res = await fetch(url, { headers: { Authorization: token } })

  if (res.status === 429) {
    console.log('  Rate limit, waiting 65s...')
    await sleep(65_000)
    return fetchAndSaveNmData(token, campaignIds, beginDate, endDate)
  }
  if (!res.ok) {
    console.warn(`  API error ${res.status} for batch`)
    return { saved: 0, campaigns: 0 }
  }

  const data = await res.json()
  if (!Array.isArray(data)) return { saved: 0, campaigns: 0 }

  const rows: NmRow[] = []

  for (const camp of data) {
    const campaignId = camp.advertId as number
    for (const day of (camp.days ?? []) as { date: string; apps?: { nms?: { nmId: number; name?: string; sum: number; views: number; clicks: number; orders: number; sum_price: number; atbs: number; canceled: number }[] }[] }[]) {
      // Aggregate all appTypes into one row per (nmId, date)
      const byNm = new Map<number, NmRow>()
      for (const app of day.apps ?? []) {
        for (const nm of app.nms ?? []) {
          const existing = byNm.get(nm.nmId)
          if (existing) {
            existing.spend        += nm.sum ?? 0
            existing.views        += nm.views ?? 0
            existing.clicks       += nm.clicks ?? 0
            existing.orders_count += nm.orders ?? 0
            existing.orders_sum   += nm.sum_price ?? 0
            existing.atbs         += nm.atbs ?? 0
            existing.canceled     += nm.canceled ?? 0
          } else {
            byNm.set(nm.nmId, {
              store_id:     STORE_ID,
              campaign_id:  campaignId,
              nm_id:        nm.nmId,
              nm_name:      nm.name ?? null,
              date:         day.date.split('T')[0],
              spend:        nm.sum ?? 0,
              views:        nm.views ?? 0,
              clicks:       nm.clicks ?? 0,
              orders_count: nm.orders ?? 0,
              orders_sum:   nm.sum_price ?? 0,
              atbs:         nm.atbs ?? 0,
              canceled:     nm.canceled ?? 0,
            })
          }
        }
      }
      // Only save rows within the requested date range
      for (const row of byNm.values()) {
        if (row.date >= beginDate && row.date <= endDate) {
          rows.push(row)
        }
      }
    }
  }

  if (rows.length === 0) return { saved: 0, campaigns: data.length }

  const { error } = await db.from('wb_ad_spend_nm').upsert(rows, {
    onConflict: 'store_id,campaign_id,nm_id,date',
    ignoreDuplicates: false,
  })
  if (error) throw new Error(`Upsert error: ${error.message}`)

  return { saved: rows.length, campaigns: data.length }
}

// Split date range into chunks of max MAX_DAYS days (WB API limit)
const MAX_DAYS = 31
function dateChunks(beginDate: string, endDate: string): Array<{ from: string; to: string }> {
  const chunks: Array<{ from: string; to: string }> = []
  let cur = new Date(beginDate + 'T00:00:00Z')
  const end = new Date(endDate + 'T00:00:00Z')
  while (cur <= end) {
    const chunkEnd = new Date(cur)
    chunkEnd.setUTCDate(chunkEnd.getUTCDate() + MAX_DAYS - 1)
    if (chunkEnd > end) chunkEnd.setTime(end.getTime())
    chunks.push({
      from: cur.toISOString().split('T')[0],
      to:   chunkEnd.toISOString().split('T')[0],
    })
    cur = new Date(chunkEnd)
    cur.setUTCDate(cur.getUTCDate() + 1)
  }
  return chunks
}

async function main() {
  const args = process.argv.slice(2)
  const beginDate = args[0] ?? moscowDateStr(1)
  const endDate   = args[1] ?? moscowDateStr(1)

  console.log(`\nСинк nm-детализации: ${beginDate} → ${endDate}`)

  // Get token
  const { data: storeData, error: storeErr } = await db
    .from('stores').select('wb_token').eq('id', STORE_ID).single()
  if (storeErr || !storeData?.wb_token) throw new Error('No WB token')
  const token = storeData.wb_token

  // Get all campaign IDs from wb_ad_spend for this period
  const campIds = new Set<number>()
  let page = 0
  while (true) {
    const { data } = await db.from('wb_ad_spend')
      .select('campaign_id')
      .eq('store_id', STORE_ID)
      .gte('date', beginDate)
      .lte('date', endDate)
      .range(page * 1000, (page + 1) * 1000 - 1)
    if (!data?.length) break
    for (const r of data) if (r.campaign_id) campIds.add(r.campaign_id)
    if (data.length < 1000) break
    page++
  }

  const ids = [...campIds]
  const chunks = dateChunks(beginDate, endDate)
  console.log(`Кампаний: ${ids.length}, периодов по ≤${MAX_DAYS} дней: ${chunks.length}`)

  let totalSaved = 0
  let reqCount = 0

  for (const chunk of chunks) {
    console.log(`\n=== Период ${chunk.from} → ${chunk.to} ===`)
    for (let i = 0; i < ids.length; i += BATCH_SIZE) {
      const batch = ids.slice(i, i + BATCH_SIZE)
      const batchNum = Math.floor(i / BATCH_SIZE) + 1
      const batchTotal = Math.ceil(ids.length / BATCH_SIZE)
      console.log(`  Партия ${batchNum}/${batchTotal}: ${batch.length} кампаний`)

      if (reqCount > 0) {
        console.log(`  Ждём ${DELAY_MS / 1000}с (rate limit)...`)
        await sleep(DELAY_MS)
      }

      const { saved, campaigns } = await fetchAndSaveNmData(token, batch, chunk.from, chunk.to)
      totalSaved += saved
      reqCount++
      console.log(`  Сохранено nm-строк: ${saved}, кампаний в ответе: ${campaigns}`)
    }
  }

  console.log(`\nГотово. Всего сохранено: ${totalSaved} строк`)
}

main().catch(e => { console.error(e); process.exit(1) })
