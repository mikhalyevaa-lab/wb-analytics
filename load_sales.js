/**
 * Загрузка архивных продаж из Excel в wb_sales.
 * Файл: Новая таблица (2).xlsx — Sep 2025 — Mar 2026 (80 924 строки)
 * UNIQUE: sale_id
 */
require('dotenv').config({ path: '/Users/glazzki/Desktop/Claude_workspace/projects/wb-analytics/.env.local' })
const { Pool } = require('pg')
const XLSX = require('xlsx')
const crypto = require('crypto')

const STORE_ID = 'f809c4fb-3ddb-460a-8174-bc872d06571b'
const BATCH = 500
const pool = new Pool({ connectionString: process.env.DATABASE_URL })

function toTs(v) {
  if (!v) return null
  const d = v instanceof Date ? v : new Date(String(v))
  return isNaN(d.getTime()) ? null : d.toISOString()
}

function toInt(v) {
  if (v == null || v === '') return null
  const n = parseInt(String(v), 10)
  return isNaN(n) ? null : n
}

function toFloat(v) {
  if (v == null || v === '') return null
  const n = parseFloat(String(v))
  return isNaN(n) ? null : n
}

function toBool(v) {
  if (v == null) return null
  if (typeof v === 'boolean') return v
  const s = String(v).toLowerCase()
  if (s === 'true' || s === '1') return true
  if (s === 'false' || s === '0') return false
  return null
}

function toStr(v) {
  if (v == null) return null
  let s = String(v).trim()
  if (s === '' || s === 'None') return null
  if (/^\d+\.0$/.test(s)) s = s.slice(0, -2)
  return s
}

function toBarcode(v) {
  if (v == null) return null
  const s = String(v).trim()
  return s.endsWith('.0') ? s.slice(0, -2) : s
}

function parseXlsx(path) {
  console.log(`Читаем ${path}...`)
  const wb = XLSX.readFile(path, { cellDates: true, dense: true })
  const ws = wb.Sheets[wb.SheetNames[0]]
  const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null })

  const headers = raw[0].map(h => h == null ? '' : String(h).trim())
  const h = Object.fromEntries(headers.map((k, i) => [k, i]))

  const rows = []
  for (let i = 1; i < raw.length; i++) {
    const r = raw[i]
    if (!r || r.every(v => v == null)) continue

    const saleId = toStr(r[h['saleID']])
    if (!saleId) continue

    const rowHash = toStr(r[h['rowHash']])

    rows.push({
      id:                  rowHash || crypto.randomUUID(),
      store_id:            STORE_ID,
      sale_id:             saleId,
      g_number:            toStr(r[h['gNumber']]),
      date:                toTs(r[h['date']]),
      last_change_date:    toTs(r[h['lastChangeDate']]),
      supplier_article:    toStr(r[h['supplierArticle']]),
      nm_id:               toInt(r[h['nmId']]),
      barcode:             toBarcode(r[h['barcode']]),
      category:            toStr(r[h['category']]),
      subject:             toStr(r[h['subject']]),
      brand:               toStr(r[h['brand']]),
      techsize:            toStr(r[h['techSize']]),
      income_id:           toInt(r[h['incomeID']]),
      is_supply:           toBool(r[h['isSupply']]),
      is_realization:      toBool(r[h['isRealization']]),
      total_price:         toFloat(r[h['totalPrice']]),
      discount_percent:    toInt(r[h['discountPercent']]),
      spp:                 toInt(r[h['spp']]),
      for_pay:             toFloat(r[h['forPay']]),
      finished_price:      toFloat(r[h['finishedPrice']]),
      price_with_disc:     toFloat(r[h['priceWithDisc']]),
      payment_sale_amount: null,
      order_type:          null,
      created_at:          new Date().toISOString(),
    })
  }
  console.log(`  ${rows.length} строк`)
  return rows
}

async function upsertBatch(client, rows) {
  if (!rows.length) return

  const cols = [
    'id','store_id','sale_id','g_number','date','last_change_date',
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

  await client.query(`
    INSERT INTO wb_sales (${cols.join(',')})
    VALUES ${placeholders}
    ON CONFLICT (sale_id)
    DO UPDATE SET ${updateSet}
  `, values)
}

async function main() {
  const rows = parseXlsx('/Users/glazzki/Downloads/Новая таблица (2).xlsx')

  // Дедупликация по sale_id внутри файла
  const seen = new Set()
  const deduped = rows.filter(r => {
    if (seen.has(r.sale_id)) return false
    seen.add(r.sale_id)
    return true
  })
  if (deduped.length < rows.length)
    console.log(`  Дедуплицировано: ${rows.length - deduped.length} дублей`)

  const client = await pool.connect()
  try {
    const { rows: [{ count: before }] } = await client.query(
      `SELECT COUNT(*) FROM wb_sales WHERE store_id=$1`, [STORE_ID]
    )
    const { rows: [{ min: minB, max: maxB }] } = await client.query(
      `SELECT MIN(date)::date as min, MAX(date)::date as max FROM wb_sales WHERE store_id=$1`, [STORE_ID]
    )
    console.log(`\nСтрок в БД до: ${before} (${minB ?? '—'} → ${maxB ?? '—'})`)

    let done = 0
    for (let i = 0; i < deduped.length; i += BATCH) {
      await upsertBatch(client, deduped.slice(i, i + BATCH))
      done += Math.min(BATCH, deduped.length - i)
      if (done % 10000 === 0 || done === deduped.length)
        process.stdout.write(`\r  ${done}/${deduped.length} (${(done/deduped.length*100).toFixed(0)}%)`)
    }
    console.log()

    const { rows: [{ count: after }] } = await client.query(
      `SELECT COUNT(*) FROM wb_sales WHERE store_id=$1`, [STORE_ID]
    )
    const { rows: [{ min, max }] } = await client.query(
      `SELECT MIN(date)::date as min, MAX(date)::date as max FROM wb_sales WHERE store_id=$1`, [STORE_ID]
    )
    console.log(`\n✅ Строк в БД: ${before} → ${after} (+${Number(after) - Number(before)})`)
    console.log(`   Период в БД: ${min} → ${max}`)
    console.log(`   Выкупов (is_realization): ${(await client.query(`SELECT COUNT(*) FROM wb_sales WHERE store_id=$1 AND is_realization=true`, [STORE_ID])).rows[0].count}`)
  } finally {
    client.release()
    await pool.end()
  }
}

main().catch(e => { console.error(e.message); process.exit(1) })
