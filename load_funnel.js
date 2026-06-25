/**
 * Загрузка архивных данных воронки из Excel в wb_funnel.
 * Файл: Новая таблица (1).xlsx — Oct 2025 — Mar 2026 (10 877 строк)
 *
 * Маппинг колонок Excel → wb_funnel:
 *   Дата                   → date
 *   Артикул WB             → nm_id
 *   Переходы в карточку    → open_count
 *   Положили в корзину     → cart_count
 *   Добавили в отложенные  → add_to_wishlist_count
 *   Заказали, шт           → order_count
 *   Заказали на сумму, ₽   → order_sum
 *   Выкупили, шт           → buyout_count
 *   Выкупили на сумму, ₽   → buyout_sum
 *   Процент выкупа         → buyout_percent
 *   Конверсия в корзину, % → add_to_cart_conversion
 *   Конверсия в заказ, %   → cart_to_order_conversion
 */
require('dotenv').config({ path: '/Users/glazzki/Desktop/Claude_workspace/projects/wb-analytics/.env.local' })
const { Pool } = require('pg')
const XLSX = require('xlsx')

const STORE_ID = 'f809c4fb-3ddb-460a-8174-bc872d06571b'
const BATCH = 500
const pool = new Pool({ connectionString: process.env.DATABASE_URL })

function toDate(v) {
  if (!v) return null
  let d = v instanceof Date ? v : new Date(String(v))
  if (isNaN(d.getTime())) return null
  return d.toISOString().slice(0, 10) // YYYY-MM-DD
}

function toInt(v) {
  if (v == null || v === '' || v === '-') return null
  const n = parseInt(String(v), 10)
  return isNaN(n) ? null : n
}

function toFloat(v) {
  if (v == null || v === '' || v === '-') return null
  const n = parseFloat(String(v))
  return isNaN(n) ? null : n
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

    const date  = toDate(r[h['Дата']])
    const nm_id = toInt(r[h['Артикул WB']])
    if (!date || !nm_id) continue

    rows.push({
      store_id:                 STORE_ID,
      nm_id,
      date,
      open_count:               toInt(r[h['Переходы в карточку']]),
      cart_count:               toInt(r[h['Положили в корзину']]),
      add_to_wishlist_count:    toInt(r[h['Добавили в отложенные']]),
      order_count:              toInt(r[h['Заказали, шт']]),
      order_sum:                toFloat(r[h['Заказали на сумму, ₽']]),
      buyout_count:             toInt(r[h['Выкупили, шт']]),
      buyout_sum:               toFloat(r[h['Выкупили на сумму, ₽']]),
      buyout_percent:           toFloat(r[h['Процент выкупа']]),
      add_to_cart_conversion:   toFloat(r[h['Конверсия в корзину, %']]),
      cart_to_order_conversion: toFloat(r[h['Конверсия в заказ, %']]),
      created_at:               new Date().toISOString(),
    })
  }
  console.log(`  ${rows.length} строк`)
  return rows
}

async function upsertBatch(client, rows) {
  if (!rows.length) return

  const cols = [
    'store_id','nm_id','date',
    'open_count','cart_count','add_to_wishlist_count',
    'order_count','order_sum',
    'buyout_count','buyout_sum','buyout_percent',
    'add_to_cart_conversion','cart_to_order_conversion',
    'created_at'
  ]

  const placeholders = rows.map((_, ri) =>
    `(${cols.map((_, ci) => `$${ri * cols.length + ci + 1}`).join(',')})`
  ).join(',')

  const values = rows.flatMap(r => cols.map(c => r[c] ?? null))

  const updateCols = [
    'open_count','cart_count','add_to_wishlist_count',
    'order_count','order_sum',
    'buyout_count','buyout_sum','buyout_percent',
    'add_to_cart_conversion','cart_to_order_conversion'
  ]
  const updateSet = updateCols.map(c => `${c} = EXCLUDED.${c}`).join(', ')

  await client.query(`
    INSERT INTO wb_funnel (${cols.join(',')})
    VALUES ${placeholders}
    ON CONFLICT (store_id, nm_id, date)
    DO UPDATE SET ${updateSet}
  `, values)
}

async function main() {
  const rows = parseXlsx('/Users/glazzki/Downloads/Новая таблица (1).xlsx')

  const client = await pool.connect()
  try {
    const { rows: [{ count: before }] } = await client.query(
      `SELECT COUNT(*) FROM wb_funnel WHERE store_id=$1`, [STORE_ID]
    )
    const { rows: [{ min: minBefore, max: maxBefore }] } = await client.query(
      `SELECT MIN(date) as min, MAX(date) as max FROM wb_funnel WHERE store_id=$1`, [STORE_ID]
    )
    console.log(`\nСтрок в БД до: ${before} (${minBefore ?? '—'} → ${maxBefore ?? '—'})`)

    let done = 0
    for (let i = 0; i < rows.length; i += BATCH) {
      await upsertBatch(client, rows.slice(i, i + BATCH))
      done += Math.min(BATCH, rows.length - i)
      if (done % 3000 === 0 || done === rows.length) {
        process.stdout.write(`\r  ${done}/${rows.length} (${(done/rows.length*100).toFixed(0)}%)`)
      }
    }
    console.log()

    const { rows: [{ count: after }] } = await client.query(
      `SELECT COUNT(*) FROM wb_funnel WHERE store_id=$1`, [STORE_ID]
    )
    const { rows: [{ min, max }] } = await client.query(
      `SELECT MIN(date) as min, MAX(date) as max FROM wb_funnel WHERE store_id=$1`, [STORE_ID]
    )
    console.log(`\n✅ Строк в БД: ${before} → ${after} (+${after - before})`)
    console.log(`   Период в БД: ${min} → ${max}`)
  } finally {
    client.release()
    await pool.end()
  }
}

main().catch(e => { console.error(e.message); process.exit(1) })
