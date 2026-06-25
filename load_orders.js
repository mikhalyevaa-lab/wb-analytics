/**
 * Загрузка архивных заказов из Excel в wb_orders.
 * wb_orders.xlsx : Oct 2025 — Mar 2026 (89 712 строк)
 * wb_zakaz.xlsx  : Mar 2026 — Jun 2026 (53 385 строк)
 */
require('dotenv').config({ path: '/Users/glazzki/Desktop/Claude_workspace/projects/wb-analytics/.env.local' })
const { Pool } = require('pg')
const XLSX = require('xlsx')
const crypto = require('crypto')

const STORE_ID = 'f809c4fb-3ddb-460a-8174-bc872d06571b'
const BATCH = 500

const pool = new Pool({ connectionString: process.env.DATABASE_URL })

// ── хелперы ──────────────────────────────────────────────────────
function makeId(srid, gNumber, nmId, barcode, date) {
  const key = `${STORE_ID}|${srid}|${gNumber}|${nmId}|${barcode}|${date}`
  return crypto.createHash('md5').update(key).digest('hex')
}

function toTs(v) {
  if (v == null || v === '') return null
  let d
  if (v instanceof Date) d = v
  else if (typeof v === 'number') {
    // Excel serial date
    d = new Date(Math.round((v - 25569) * 86400 * 1000))
  } else {
    d = new Date(String(v))
  }
  if (isNaN(d.getTime())) return null
  // WB пустая дата = 2001-01-01
  if (d.getFullYear() === 2001 && d.getMonth() === 0 && d.getDate() === 1) return null
  return d.toISOString()
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
  if (v == null || v === '' || v === 0 || v === '0' || v === false) return false
  return true
}

function toBarcode(v) {
  if (v == null) return null
  const s = String(v).trim()
  // убираем .0 у float-представлений
  if (s.endsWith('.0')) return s.slice(0, -2)
  return s
}

function toStr(v) {
  if (v == null) return null
  let s = String(v).trim()
  if (s === '' || s === 'None' || s === 'null') return null
  // убираем .0 у числовых строк (barcode-like значения)
  if (/^\d+\.0$/.test(s)) s = s.slice(0, -2)
  return s
}

// ── парсинг wb_orders.xlsx ───────────────────────────────────────
function parseOrdersXlsx(path) {
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

    const date = toTs(r[h['date']])
    if (!date) continue

    const gNumber  = toStr(r[h['gNumber']])
    const nmId     = toInt(r[h['nmId']])
    const barcode  = toBarcode(r[h['barcode']])
    const srid     = toStr(r[h['srid']])
    const rowHash  = toStr(r[h['rowHash']])

    rows.push({
      id:               rowHash || makeId(srid, gNumber, nmId, barcode, date),
      store_id:         STORE_ID,
      date,
      last_change_date: toTs(r[h['lastChangeDate']]),
      supplier_article: toStr(r[h['supplierArticle']]),
      nm_id:            nmId,
      barcode,
      category:         toStr(r[h['category']]),
      subject:          toStr(r[h['subject']]),
      brand:            toStr(r[h['brand']]),
      techsize:         toStr(r[h['techSize']]),
      income_id:        toInt(r[h['incomeID']]),
      g_number:         gNumber,
      total_price:      toFloat(r[h['totalPrice']]),
      discount_percent: toFloat(r[h['discountPercent']]),
      spp:              toInt(r[h['Spp']]),
      price_after_spp:  toFloat(r[h['Цена заказа']]),
      is_cancel:        toBool(r[h['is_cancel']]),
      cancel_dt:        toTs(r[h['cancel_dt']]),
      warehouse_name:   toStr(r[h['warehouseName']]),
      oblast:           toStr(r[h['oblast']]),
      oblast_okrug_name:null,
      srid,
      created_at:       new Date().toISOString(),
    })
  }
  console.log(`  ${rows.length} строк`)
  return rows
}

// ── парсинг wb_zakaz.xlsx ────────────────────────────────────────
function parseZakazXlsx(path) {
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

    const date = toTs(r[h['date']])
    if (!date) continue

    const gNumber  = toStr(r[h['gNumber']])
    const nmId     = toInt(r[h['nmId']])
    const barcode  = toBarcode(r[h['barcode']])
    const srid     = toStr(r[h['srid']])

    rows.push({
      id:               makeId(srid, gNumber, nmId, barcode, date),
      store_id:         STORE_ID,
      date,
      last_change_date: toTs(r[h['lastChangeDate']]),
      supplier_article: toStr(r[h['supplierArticle']]),
      nm_id:            nmId,
      barcode,
      category:         toStr(r[h['category']]),
      subject:          toStr(r[h['subject']]),
      brand:            toStr(r[h['brand']]),
      techsize:         toStr(r[h['techSize']]),
      income_id:        toInt(r[h['incomeID']]),
      g_number:         gNumber,
      total_price:      toFloat(r[h['totalPrice']]),
      discount_percent: toFloat(r[h['discountPercent']]),
      spp:              toInt(r[h['Spp']]),
      price_after_spp:  toFloat(r[h['Цена заказа']]),
      is_cancel:        toBool(r[h['is_cancel']]),
      cancel_dt:        toTs(r[h['cancel_dt']]),
      warehouse_name:   toStr(r[h['warehouseName']]),
      oblast:           toStr(r[h['oblast']]),
      oblast_okrug_name:toStr(r[h['region']]),
      srid,
      created_at:       new Date().toISOString(),
    })
  }
  console.log(`  ${rows.length} строк`)
  return rows
}

// ── upsert батч ─────────────────────────────────────────────────
async function upsertBatch(client, rows) {
  if (!rows.length) return

  const cols = [
    'id','store_id','date','last_change_date','supplier_article','nm_id','barcode',
    'category','subject','brand','techsize','income_id','g_number',
    'total_price','discount_percent','spp','price_after_spp',
    'is_cancel','cancel_dt','warehouse_name','oblast','oblast_okrug_name','srid','created_at'
  ]

  // Строим VALUES ($1,$2,...), ($N+1,...) ...
  const placeholders = rows.map((_, ri) =>
    `(${cols.map((_, ci) => `$${ri * cols.length + ci + 1}`).join(',')})`
  ).join(',')

  const values = rows.flatMap(r => cols.map(c => r[c] ?? null))

  const updateCols = [
    'last_change_date','supplier_article','total_price','discount_percent',
    'spp','price_after_spp','is_cancel','cancel_dt',
    'warehouse_name','oblast','oblast_okrug_name','srid'
  ]
  const updateSet = updateCols.map(c => `${c} = EXCLUDED.${c}`).join(', ')

  await client.query(`
    INSERT INTO wb_orders (${cols.join(',')})
    VALUES ${placeholders}
    ON CONFLICT (store_id, g_number, nm_id, barcode, date)
    WHERE g_number IS NOT NULL
    DO UPDATE SET ${updateSet}
  `, values)
}

// ── main ─────────────────────────────────────────────────────────
async function main() {
  const orders = parseOrdersXlsx('/Users/glazzki/Downloads/wb_orders.xlsx')
  const zakaz  = parseZakazXlsx('/Users/glazzki/Downloads/wb_zakaz.xlsx')
  const allRaw = [...orders, ...zakaz].sort((a, b) => (a.date > b.date ? 1 : -1))

  // Дедупликация по UNIQUE ключу (store_id, g_number, nm_id, barcode, date)
  const seen = new Set()
  const all = allRaw.filter(r => {
    if (!r.g_number) return true  // без g_number конфликт невозможен
    const key = `${r.g_number}|${r.nm_id}|${r.barcode}|${r.date}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })

  console.log(`\nВсего строк: ${allRaw.length} (после дедупликации: ${all.length}, дублей: ${allRaw.length - all.length})`)
  console.log(`Период: ${all[0].date.slice(0, 10)} → ${all[all.length - 1].date.slice(0, 10)}`)

  const client = await pool.connect()
  try {
    const { rows: [{ count: before }] } = await client.query(
      `SELECT COUNT(*) FROM wb_orders WHERE store_id=$1`, [STORE_ID]
    )
    console.log(`Строк в БД до: ${before}`)

    let done = 0
    for (let i = 0; i < all.length; i += BATCH) {
      await upsertBatch(client, all.slice(i, i + BATCH))
      done += Math.min(BATCH, all.length - i)
      if (done % 10000 === 0 || done === all.length) {
        process.stdout.write(`\r  ${done}/${all.length} (${(done/all.length*100).toFixed(0)}%)`)
      }
    }
    console.log()

    const { rows: [{ count: after }] } = await client.query(
      `SELECT COUNT(*) FROM wb_orders WHERE store_id=$1`, [STORE_ID]
    )
    const { rows: [{ min, max }] } = await client.query(
      `SELECT MIN(date)::date as min, MAX(date)::date as max FROM wb_orders WHERE store_id=$1`, [STORE_ID]
    )
    console.log(`\n✅ Строк в БД: ${before} → ${after} (+${after - before})`)
    console.log(`   Период в БД: ${min} → ${max}`)
  } finally {
    client.release()
    await pool.end()
  }
}

main().catch(e => { console.error(e.message); process.exit(1) })
