/**
 * Обновление продаж 2026. Загружает с 2026-01-01, сравнивает с файлом.
 */
require('dotenv').config({ path: '.env.local' })
const { createClient } = require('@supabase/supabase-js')

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)
const STORE_ID = '73d40959-1920-4c68-a0f5-3684846b923f'

// Эталон из файла (Выкупили шт / Сумма продаж руб / К перечислению руб)
const FILE = {
  '01': { cnt: 14582, sum: 29259482, pay: 18824924 },
  '02': { cnt: 13842, sum: 29404243, pay: 19036000 },
  '03': { cnt: 17157, sum: 37312018, pay: 24112522 },
  '04': { cnt: 10086, sum: 19473405, pay: 12455756 },
  '05': { cnt: 11791, sum: 20487160, pay: 13202213 },
  '06': { cnt:  6059, sum: 10486904, pay:  6708026 },
  total: { cnt: 73517, sum: 146423212, pay: 94339441 },
}

async function main() {
  const { data: store } = await db.from('stores').select('wb_token').eq('id', STORE_ID).single()
  if (!store?.wb_token) throw new Error('Токен не найден')
  const token = store.wb_token

  const sleep = ms => new Promise(r => setTimeout(r, ms))

  async function fetchWithRetry(url) {
    for (let attempt = 1; attempt <= 5; attempt++) {
      const res = await fetch(url, { headers: { Authorization: token } })
      if (res.ok) return res.json()
      if (res.status === 429) {
        console.log(`429 rate limit, пауза 65с (попытка ${attempt}/5)...`)
        await sleep(65000)
      } else {
        throw new Error(`API error ${res.status}: ${await res.text()}`)
      }
    }
    throw new Error('Превышено число попыток')
  }

  console.log('Загружаем продажи с 2026-01-01...')
  const r1 = await fetchWithRetry('https://statistics-api.wildberries.ru/api/v1/supplier/sales?dateFrom=2026-01-01&flag=0')
  console.log(`Батч1: ${r1.length}. Пауза 65с...`)
  await sleep(65000)

  console.log('Загружаем продажи с 2026-04-01...')
  const r2 = await fetchWithRetry('https://statistics-api.wildberries.ru/api/v1/supplier/sales?dateFrom=2026-04-01&flag=0')
  console.log(`Батч2: ${r2.length}`)

  // Объединяем, дедупликация по sale_id
  const byId = new Map()
  for (const r of [...r1, ...r2]) {
    if (r.saleID && !byId.has(r.saleID)) byId.set(r.saleID, r)
  }
  const raw = [...byId.values()]
  console.log(`Уникальных по saleID: ${raw.length}`)

  // Фильтруем только продажи (S...) а не возвраты (R...)
  const sales = raw.filter(r => (r.saleID || '').startsWith('S'))
  const returns = raw.filter(r => (r.saleID || '').startsWith('R'))
  console.log(`Продаж (S): ${sales.length} | Возвратов (R): ${returns.length}`)

  // Предварительная сверка из API (только продажи, до 21.06)
  const byMonth = {}
  for (const r of raw) {
    const date = r.date?.slice(0, 10)
    if (!date || date > '2026-06-21') continue
    const m = date.slice(5, 7)
    byMonth[m] = byMonth[m] ?? { cnt: 0, sum: 0, pay: 0 }
    if ((r.saleID || '').startsWith('S')) {
      byMonth[m].cnt++
      byMonth[m].sum += r.priceWithDisc ?? 0
      byMonth[m].pay += r.forPay ?? 0
    }
  }

  console.log('\n=== WB API vs Файл (только продажи S...) ===')
  console.log('Мес | API шт | Файл шт | Δ%  | API сумма   | Файл сумма  | Δ%')
  for (const m of ['01','02','03','04','05','06']) {
    const d = byMonth[m] ?? { cnt: 0, sum: 0 }
    const f = FILE[m]
    const dc = f.cnt ? ((d.cnt - f.cnt) / f.cnt * 100).toFixed(1) : '-'
    const ds = f.sum ? ((d.sum - f.sum) / f.sum * 100).toFixed(1) : '-'
    console.log(`${m} | ${d.cnt.toString().padStart(6)} | ${f.cnt.toString().padStart(7)} | ${dc.padStart(5)}% | ${Math.round(d.sum).toLocaleString('ru').padStart(11)} | ${f.sum.toLocaleString('ru').padStart(11)} | ${ds.padStart(5)}%`)
  }

  // Маппинг для upsert
  const rows = raw
    .filter(r => r.date?.slice(0, 10) <= '2026-06-21')
    .map(r => ({
      store_id: STORE_ID,
      sale_id: r.saleID || null,
      g_number: r.gNumber || null,
      date: r.date || null,
      last_change_date: r.lastChangeDate || null,
      supplier_article: r.supplierArticle || null,
      techsize: r.techSize || null,
      barcode: r.barcode || null,
      total_price: r.totalPrice || null,
      discount_percent: r.discountPercent || null,
      spp: r.spp || null,
      payment_sale_amount: r.paymentSaleAmount || null,
      for_pay: r.forPay || null,
      finished_price: r.finishedPrice || null,
      price_with_disc: r.priceWithDisc || null,
      nm_id: r.nmId || null,
      subject: r.subject || null,
      category: r.category || null,
      brand: r.brand || null,
      income_id: r.incomeId || null,
      is_supply: r.isSupply || false,
      is_realization: r.isRealization || false,
      order_type: r.orderType || null,
    }))

  console.log(`\nГотово к загрузке: ${rows.length} строк`)

  // Upsert батчами
  const BATCH = 1000
  let loaded = 0, errors = 0
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH)
    const { error } = await db.from('wb_sales').upsert(batch, {
      onConflict: 'sale_id',
      ignoreDuplicates: false, // обновляем существующие
    })
    if (error) { errors++; if (errors <= 3) console.error('Ошибка:', error.message) }
    else loaded += batch.length
    if ((i + BATCH) % 10000 === 0 || i + BATCH >= rows.length)
      process.stdout.write(`\rЗагружено: ${loaded}/${rows.length}`)
  }
  console.log(`\nОшибок батчей: ${errors}\n`)

  // Финальная сверка из БД
  console.log('=== ФИНАЛЬНАЯ СВЕРКА БД vs Файл ===')
  let totC = 0, totS = 0, totFC = 0, totFS = 0
  for (const m of ['06','05','04','03','02','01']) {
    const dateFrom = `2026-${m}-01`
    const lastDay = new Date(2026, +m, 0).getDate()
    const dateTo = `2026-${m}-${lastDay}T23:59:59`

    let all = [], from = 0
    while (true) {
      const { data } = await db.from('wb_sales')
        .select('price_with_disc,for_pay')
        .eq('store_id', STORE_ID)
        .like('sale_id', 'S%')
        .gte('date', dateFrom).lte('date', dateTo)
        .range(from, from + 999)
      if (!data?.length) break
      all.push(...data); if (data.length < 1000) break; from += 1000
    }
    const cnt = all.length
    const sum = all.reduce((s, r) => s + (r.price_with_disc ?? 0), 0)
    const f = FILE[m]
    const dc = ((cnt - f.cnt) / f.cnt * 100).toFixed(2)
    const ds = ((sum - f.sum) / f.sum * 100).toFixed(2)
    const okC = Math.abs(cnt - f.cnt) / f.cnt * 100 <= 0.5
    const okS = Math.abs(sum - f.sum) / f.sum * 100 <= 0.5
    console.log(`2026-${m}: ${cnt} шт (Δ${dc}% ${okC?'✅':'❌'}) | ${Math.round(sum).toLocaleString('ru')} руб (Δ${ds}% ${okS?'✅':'❌'})`)
    totC += cnt; totS += sum; totFC += f.cnt; totFS += f.sum
  }
  const okTC = Math.abs(totC - totFC) / totFC * 100 <= 0.5
  const okTS = Math.abs(totS - totFS) / totFS * 100 <= 0.5
  console.log(`\nИТОГО: ${totC} шт (Δ${((totC-totFC)/totFC*100).toFixed(2)}% ${okTC?'✅':'❌'}) | ${Math.round(totS).toLocaleString('ru')} руб (Δ${((totS-totFS)/totFS*100).toFixed(2)}% ${okTS?'✅':'❌'})`)
  console.log(`Файл: ${totFC} шт | ${totFS.toLocaleString('ru')} руб`)
}

main().catch(console.error)
