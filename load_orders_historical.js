/**
 * Исторический импорт заказов 2026-01-01 — сегодня
 * Порядок: июнь → май → апрель → март → февраль → январь
 * Цель: отклонение ≤ 0.5% по количеству позиций и сумме
 */
require('dotenv').config({ path: '.env.local' })
const { createClient } = require('@supabase/supabase-js')

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)
const STORE_ID = '73d40959-1920-4c68-a0f5-3684846b923f'

async function getToken() {
  const { data } = await db.from('stores')
    .select('wb_token').eq('id', STORE_ID).single()
  if (!data?.wb_token) throw new Error('Токен не найден')
  return data.wb_token
}

async function loadOrders(token, dateFrom) {
  const url = `https://statistics-api.wildberries.ru/api/v1/supplier/orders?dateFrom=${dateFrom}&flag=0`
  console.log(`Загружаем заказы с ${dateFrom}...`)
  const res = await fetch(url, { headers: { Authorization: token } })
  if (!res.ok) throw new Error(`WB API error ${res.status}: ${await res.text()}`)
  return res.json()
}

// Загружаем несколькими запросами чтобы обойти лимит 80к записей
async function loadAllOrders(token) {
  // 1й запрос: с 2026-01-01 — покроет январь-март
  // 2й запрос: с 2026-04-01 — покроет апрель-июнь (меньше 80к)
  const [batch1, batch2] = await Promise.all([
    loadOrders(token, '2026-01-01'),
    loadOrders(token, '2026-04-01'),
  ])
  console.log(`Батч 1 (с 01.01): ${batch1.length} | Батч 2 (с 01.04): ${batch2.length}`)
  // Объединяем, исключая дубли (batch2 может перекрываться с batch1 для конца марта)
  const all = [...batch1, ...batch2]
  const seen = new Set()
  const deduped = []
  for (const r of all) {
    const k = `${r.gNumber}|${r.nmId}|${r.barcode}|${r.date?.slice(0,10)}`
    if (seen.has(k)) continue
    seen.add(k); deduped.push(r)
  }
  console.log(`Итого уникальных: ${deduped.length}`)
  return deduped
}

function mapOrder(r, storeId) {
  return {
    store_id: storeId,
    g_number: r.gNumber || null,
    date: r.date || null,
    last_change_date: r.lastChangeDate || null,
    supplier_article: r.supplierArticle || null,
    techsize: r.techSize || null,
    barcode: r.barcode || null,
    total_price: r.totalPrice || null,
    discount_percent: r.discountPercent || null,
    spp: r.spp || null,
    finished_price: r.finishedPrice || null,
    price_with_disc: r.priceWithDiscount || null,
    price_after_discount: r.priceWithDiscount || null,
    oblast: r.oblast || null,
    income_id: r.incomeId || null,
    nm_id: r.nmId || null,
    subject: r.subject || null,
    category: r.category || null,
    brand: r.brand || null,
    is_cancel: r.isCancel || false,
    cancel_dt: r.cancelDt || null,
    is_supply: r.isSupply || false,
    is_realization: r.isRealization || false,
    order_type: r.orderType || null,
    srid: r.srid || null,
  }
}

// Эталон из файла report 2026-6-22.xlsx (позиций шт / сумма руб)
const FILE_DATA = {
  '2026-06': { cnt: 10211, sum: 19956750 },
  '2026-05': { cnt: 21370, sum: 37853488 },
  '2026-04': { cnt: 18663, sum: 35873852 },
  '2026-03': { cnt: 28412, sum: 62903153 },
  '2026-02': { cnt: 27523, sum: 59427588 },
  '2026-01': { cnt: 28035, sum: 58021404 },
}

async function main() {
  const token = await getToken()

  const raw = await loadAllOrders(token)
  console.log(`Получено от WB (итого): ${raw.length} записей`)

  // Группируем по месяцам для сверки (только строки до 2026-06-21)
  const byMonth = {}
  const rows = []
  for (const r of raw) {
    const date = r.date?.slice(0, 10)
    if (!date || date > '2026-06-21') continue
    const month = date.slice(0, 7)
    byMonth[month] = byMonth[month] ?? { cnt: 0, sum: 0 }
    byMonth[month].cnt++
    const price = (r.priceWithDiscount ?? (r.totalPrice * (1 - (r.discountPercent ?? 0) / 100)))
    byMonth[month].sum += price ?? 0
    rows.push(mapOrder(r, STORE_ID))
  }

  // Предварительная сверка (до загрузки)
  console.log('\n=== Данные от WB (до загрузки в БД) ===')
  console.log('Мес     | WB шт  | Файл шт | Δ%    | WB руб      | Файл руб    | Δ%')
  for (const m of ['2026-06','2026-05','2026-04','2026-03','2026-02','2026-01']) {
    const d = byMonth[m] ?? { cnt: 0, sum: 0 }
    const f = FILE_DATA[m]
    const dc = f.cnt ? ((d.cnt - f.cnt) / f.cnt * 100).toFixed(1) : '-'
    const ds = f.sum ? ((d.sum - f.sum) / f.sum * 100).toFixed(1) : '-'
    const okC = Math.abs((d.cnt - f.cnt) / f.cnt * 100) <= 0.5
    const okS = Math.abs((d.sum - f.sum) / f.sum * 100) <= 0.5
    console.log(`${m} | ${d.cnt.toString().padStart(6)} | ${f.cnt.toString().padStart(7)} | ${dc.padStart(5)}% ${okC?'✅':'❌'} | ${Math.round(d.sum).toLocaleString('ru').padStart(11)} | ${f.sum.toLocaleString('ru').padStart(11)} | ${ds.padStart(5)}% ${okS?'✅':'❌'}`)
  }

  console.log(`\nГотово к загрузке: ${rows.length} строк`)
  if (!rows.length) return

  // Дедупликация по составному ключу
  const seen = new Set()
  const unique = []
  for (const r of rows) {
    const k = `${r.g_number}|${r.nm_id}|${r.barcode}|${r.date?.slice(0,10)}`
    if (seen.has(k)) continue
    seen.add(k)
    unique.push(r)
  }
  console.log(`После дедупликации: ${unique.length} строк`)

  // Загружаем батчами по 1000
  const BATCH = 1000
  let inserted = 0
  for (let i = 0; i < unique.length; i += BATCH) {
    const batch = unique.slice(i, i + BATCH)
    const { error } = await db.from('wb_orders')
      .upsert(batch, {
        onConflict: 'store_id,g_number,nm_id,barcode,date',
        ignoreDuplicates: true
      })
    if (error) {
      console.error(`Ошибка батча ${i}:`, error.message)
    } else {
      inserted += batch.length
      if (inserted % 10000 === 0 || i + BATCH >= unique.length) {
        process.stdout.write(`\rЗагружено: ${inserted}/${unique.length}`)
      }
    }
  }
  console.log('\n')

  // Финальная сверка из БД
  console.log('=== Финальная сверка с БД ===')
  const months = ['2026-06','2026-05','2026-04','2026-03','2026-02','2026-01']
  for (const m of months) {
    const [y, mo] = m.split('-')
    const dateFrom = `${y}-${mo}-01`
    const lastDay = new Date(+y, +mo, 0).getDate()
    const dateTo = `${y}-${mo}-${lastDay}T23:59:59`

    let all = [], from = 0
    while (true) {
      const { data } = await db.from('wb_orders')
        .select('total_price,discount_percent,price_after_discount')
        .eq('store_id', STORE_ID)
        .gte('date', dateFrom).lte('date', dateTo)
        .range(from, from + 999)
      if (!data?.length) break
      all.push(...data); if (data.length < 1000) break; from += 1000
    }
    const cnt = all.length
    const sum = all.reduce((s, r) => s + (r.price_after_discount ?? (r.total_price ?? 0) * (1 - (r.discount_percent ?? 0) / 100)), 0)
    const f = FILE_DATA[m]
    const dc = ((cnt - f.cnt) / f.cnt * 100).toFixed(2)
    const ds = ((sum - f.sum) / f.sum * 100).toFixed(2)
    const okC = Math.abs(cnt - f.cnt) / f.cnt * 100 <= 0.5
    const okS = Math.abs(sum - f.sum) / f.sum * 100 <= 0.5
    console.log(`${m}: ${cnt} поз. (Δ${dc}% ${okC?'✅':'❌'}) | ${Math.round(sum).toLocaleString('ru')} руб (Δ${ds}% ${okS?'✅':'❌'})`)
  }
}

main().catch(console.error)
