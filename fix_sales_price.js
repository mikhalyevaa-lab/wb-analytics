/**
 * Обновляет price_with_disc и for_pay в wb_sales для 2026 из WB API
 */
require('dotenv').config({ path: '.env.local' })
const { createClient } = require('@supabase/supabase-js')
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
const S = '73d40959-1920-4c68-a0f5-3684846b923f'

const sleep = ms => new Promise(r => setTimeout(r, ms))

async function fetchWithRetry(url, token) {
  for (let i = 1; i <= 5; i++) {
    const res = await fetch(url, { headers: { Authorization: token } })
    if (res.ok) return res.json()
    if (res.status === 429) { console.log(`429 rate limit, пауза 65с...`); await sleep(65000) }
    else throw new Error(`API ${res.status}`)
  }
}

const FILE = {
  '01': { cnt: 14582, sum: 29259482 }, '02': { cnt: 13842, sum: 29404243 },
  '03': { cnt: 17157, sum: 37312018 }, '04': { cnt: 10086, sum: 19473405 },
  '05': { cnt: 11791, sum: 20487160 }, '06': { cnt:  6059, sum: 10486904 },
}

async function main() {
  const { data: store } = await db.from('stores').select('wb_token').eq('id', S).single()
  const token = store.wb_token

  console.log('Загружаем продажи 2026 с API...')
  const raw = await fetchWithRetry('https://statistics-api.wildberries.ru/api/v1/supplier/sales?dateFrom=2026-01-01&flag=0', token)
  console.log(`Получено: ${raw.length} записей`)

  // Строим карту saleID → {priceWithDisc, forPay}
  const priceMap = new Map()
  for (const r of raw) {
    if (r.saleID && r.date?.slice(0, 10) <= '2026-06-21') {
      priceMap.set(r.saleID, { price: r.priceWithDisc ?? null, pay: r.forPay ?? null })
    }
  }
  console.log(`В карте ${priceMap.size} продаж до 21.06`)

  // Загружаем все sale_id из БД за 2026
  let dbRows = [], from = 0
  while (true) {
    const { data } = await db.from('wb_sales')
      .select('sale_id')
      .eq('store_id', S)
      .gte('date', '2026-01-01').lte('date', '2026-06-21T23:59:59')
      .range(from, from + 999)
    if (!data?.length) break
    dbRows.push(...data); if (data.length < 1000) break; from += 1000
  }
  console.log(`В БД за 2026: ${dbRows.length} записей`)

  // Обновляем батчами через update по sale_id
  let updated = 0, skipped = 0
  const BATCH = 500
  const saleIds = dbRows.map(r => r.sale_id).filter(Boolean)

  for (let i = 0; i < saleIds.length; i += BATCH) {
    const batch = saleIds.slice(i, i + BATCH)
    const updates = batch
      .map(sid => {
        const p = priceMap.get(sid)
        return p ? { sale_id: sid, price_with_disc: p.price, for_pay: p.pay } : null
      })
      .filter(Boolean)

    // Обновляем каждую запись через upsert с полным набором полей
    // Используем прямой UPDATE через match
    for (const upd of updates) {
      const { error } = await db.from('wb_sales')
        .update({ price_with_disc: upd.price_with_disc, for_pay: upd.for_pay })
        .eq('store_id', S)
        .eq('sale_id', upd.sale_id)
      if (error) { skipped++; if (skipped <= 3) console.error('Ошибка:', error.message) }
      else updated++
    }
    if ((i + BATCH) % 5000 === 0 || i + BATCH >= saleIds.length)
      process.stdout.write(`\rОбновлено: ${updated}/${saleIds.length} (пропущено: ${skipped})`)
  }
  console.log('\n')

  // Финальная сверка
  console.log('=== СВЕРКА ПРОДАЖ (только S...) vs Файл ===')
  let totC = 0, totS = 0, totFC = 0, totFS = 0
  for (const m of ['06','05','04','03','02','01']) {
    const dateFrom = `2026-${m}-01`
    const lastDay = new Date(2026, parseInt(m), 0).getDate()
    const dateTo = `2026-${m}-${String(lastDay).padStart(2,'0')}T23:59:59`
    let all = [], from2 = 0
    while (true) {
      const { data } = await db.from('wb_sales')
        .select('price_with_disc').eq('store_id', S).like('sale_id', 'S%')
        .gte('date', dateFrom).lte('date', dateTo)
        .range(from2, from2 + 999)
      if (!data?.length) break
      all.push(...data); if (data.length < 1000) break; from2 += 1000
    }
    const cnt = all.length
    const sum = all.reduce((s, r) => s + (r.price_with_disc ?? 0), 0)
    const f = FILE[m]
    const dc = ((cnt - f.cnt) / f.cnt * 100).toFixed(2)
    const ds = ((sum - f.sum) / f.sum * 100).toFixed(2)
    const okC = Math.abs(cnt - f.cnt) / f.cnt * 100 <= 0.5
    const okS = Math.abs(sum - f.sum) / f.sum * 100 <= 0.5
    console.log(`2026-${m}: ${cnt} шт (Δ${dc}% ${okC?'✅':'❌'}) | ${Math.round(sum).toLocaleString('ru')} руб (Δ${ds}% ${okS?'✅':'❌'})  ← файл: ${f.cnt} / ${f.sum.toLocaleString('ru')}`)
    totC += cnt; totS += sum; totFC += f.cnt; totFS += f.sum
  }
  const okC = Math.abs(totC - totFC) / totFC * 100 <= 0.5
  const okS = Math.abs(totS - totFS) / totFS * 100 <= 0.5
  console.log(`\nИТОГО: ${totC} шт (Δ${((totC-totFC)/totFC*100).toFixed(2)}% ${okC?'✅':'❌'}) | ${Math.round(totS).toLocaleString('ru')} руб (Δ${((totS-totFS)/totFS*100).toFixed(2)}% ${okS?'✅':'❌'})`)
  console.log(`Файл:   ${totFC} шт | ${totFS.toLocaleString('ru')} руб`)
}

main().catch(console.error)
