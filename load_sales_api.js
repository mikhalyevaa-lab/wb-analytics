/**
 * Загрузка продаж из WB API за пробельный период Mar 21 – Jun 23, 2026.
 * WB API /api/v1/supplier/sales?dateFrom=YYYY-MM-DD&flag=0
 * flag=0 — все продажи начиная с dateFrom (по lastChangeDate)
 */
require('dotenv').config({ path: '/Users/glazzki/Desktop/Claude_workspace/projects/wb-analytics/.env.local' })
const { Pool } = require('pg')
const https = require('https')

const STORE_ID  = 'f809c4fb-3ddb-460a-8174-bc872d06571b'
const DATE_FROM = '2026-03-21'  // начало пробела
const BATCH     = 500
const pool      = new Pool({ connectionString: process.env.DATABASE_URL })

// Токен — из базы (уже знаем)
const WB_TOKEN = process.env.WB_TOKEN || (() => {
  // достанем из .env.local или передадим явно
  throw new Error('WB_TOKEN не задан')
})()

function wbFetch(url) {
  return new Promise((resolve, reject) => {
    const opts = {
      method: 'GET',
      headers: { Authorization: WB_TOKEN },
    }
    const req = https.request(url, opts, res => {
      const chunks = []
      res.on('data', c => chunks.push(c))
      res.on('end', () => {
        try {
          const body = Buffer.concat(chunks).toString()
          resolve(JSON.parse(body))
        } catch (e) { reject(e) }
      })
    })
    req.on('error', reject)
    req.end()
  })
}

function toStr(v) {
  if (v == null) return null
  const s = String(v).trim()
  return s || null
}

function toInt(v) {
  if (v == null) return null
  const n = parseInt(String(v), 10)
  return isNaN(n) ? null : n
}

function toFloat(v) {
  if (v == null) return null
  const n = parseFloat(String(v))
  return isNaN(n) ? null : n
}

async function upsertBatch(client, rows) {
  if (!rows.length) return 0

  const cols = [
    'store_id','sale_id','g_number','date','last_change_date',
    'supplier_article','nm_id','barcode','category','subject','brand','techsize',
    'income_id','is_supply','is_realization',
    'total_price','discount_percent','spp',
    'for_pay','finished_price','price_with_disc',
    'payment_sale_amount','order_type','created_at'
  ]

  const placeholders = rows.map((_, ri) =>
    `(${cols.map((_, ci) => `$${ri * cols.length + ci + 1}`).join(',')})`
  ).join(',')
  const values = rows.flatMap(r => cols.map(c => r[c] ?? null))

  const updateCols = [
    'g_number','date','last_change_date','supplier_article','nm_id','barcode',
    'category','subject','brand','techsize','income_id','is_supply','is_realization',
    'total_price','discount_percent','spp','for_pay','finished_price','price_with_disc'
  ]
  const updateSet = updateCols.map(c => `${c} = EXCLUDED.${c}`).join(', ')

  const result = await client.query(`
    INSERT INTO wb_sales (${cols.join(',')})
    VALUES ${placeholders}
    ON CONFLICT (sale_id) DO UPDATE SET ${updateSet}
  `, values)
  return result.rowCount
}

async function main() {
  console.log(`Загружаем продажи из WB API с ${DATE_FROM}...`)

  const url = `https://statistics-api.wildberries.ru/api/v1/supplier/sales?dateFrom=${DATE_FROM}&flag=0`
  console.log('Запрос к WB API...')
  const data = await wbFetch(url)

  if (!Array.isArray(data)) {
    console.error('Неожиданный ответ WB API:', JSON.stringify(data).slice(0, 200))
    process.exit(1)
  }

  console.log(`Получено от API: ${data.length} записей`)
  if (!data.length) { console.log('Нет данных'); process.exit(0) }

  // Показываем диапазон дат
  const dates = data.map(s => s.date?.slice(0, 10)).filter(Boolean).sort()
  console.log(`Период: ${dates[0]} → ${dates[dates.length - 1]}`)

  // Маппинг в wb_sales
  const rows = data.map(s => ({
    store_id:            STORE_ID,
    sale_id:             toStr(s.saleID),
    g_number:            toStr(s.gNumber),
    date:                s.date || null,
    last_change_date:    s.lastChangeDate || null,
    supplier_article:    toStr(s.supplierArticle),
    nm_id:               toInt(s.nmId),
    barcode:             toStr(s.barcode),
    category:            toStr(s.category),
    subject:             toStr(s.subject),
    brand:               toStr(s.brand),
    techsize:            toStr(s.techSize),
    income_id:           toInt(s.incomeID),
    is_supply:           s.isSupply ?? null,
    is_realization:      s.isRealization ?? null,
    total_price:         toFloat(s.totalPrice),
    discount_percent:    toInt(s.discountPercent),
    spp:                 toInt(s.spp),
    for_pay:             toFloat(s.forPay),
    finished_price:      toFloat(s.finishedPrice),
    price_with_disc:     toFloat(s.priceWithDisc),
    payment_sale_amount: null,
    order_type:          null,
    created_at:          new Date().toISOString(),
  })).filter(r => r.sale_id)

  // Дедупликация
  const seen = new Set()
  const deduped = rows.filter(r => {
    if (seen.has(r.sale_id)) return false
    seen.add(r.sale_id)
    return true
  })
  console.log(`Уникальных записей: ${deduped.length}`)

  const client = await pool.connect()
  try {
    const { rows: [{ count: before }] } = await client.query(
      `SELECT COUNT(*) FROM wb_sales WHERE store_id=$1`, [STORE_ID]
    )

    let done = 0, upserted = 0
    for (let i = 0; i < deduped.length; i += BATCH) {
      const cnt = await upsertBatch(client, deduped.slice(i, i + BATCH))
      upserted += cnt || 0
      done += Math.min(BATCH, deduped.length - i)
      process.stdout.write(`\r  ${done}/${deduped.length} (${(done/deduped.length*100).toFixed(0)}%)`)
    }
    console.log()

    const { rows: [{ count: after }] } = await client.query(
      `SELECT COUNT(*) FROM wb_sales WHERE store_id=$1`, [STORE_ID]
    )

    // Покрытие по месяцам
    const { rows: months } = await client.query(`
      SELECT
        date_trunc('month', date AT TIME ZONE 'UTC')::date as month,
        COUNT(*) FILTER (WHERE is_realization = true) as sales,
        COUNT(*) FILTER (WHERE is_realization IS NULL OR is_realization = false) as other
      FROM wb_sales
      WHERE store_id=$1 AND date >= '2026-01-01'
      GROUP BY 1 ORDER BY 1
    `, [STORE_ID])

    console.log(`\n✅ Строк в БД: ${before} → ${after} (+${Number(after) - Number(before)})`)
    console.log('\nПокрытие 2026:')
    for (const m of months) {
      console.log(`  ${String(m.month).slice(0, 7)}: продаж=${m.sales}, прочих=${m.other}`)
    }
  } finally {
    client.release()
    await pool.end()
  }
}

main().catch(e => { console.error(e.message); process.exit(1) })
