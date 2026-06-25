require('dotenv').config({ path: '/Users/glazzki/Desktop/Claude_workspace/projects/wb-analytics/.env.local' })
const https = require('https')
const { Pool } = require('pg')

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const STORE_ID = 'f809c4fb-3ddb-460a-8174-bc872d06571b'
const START_DATE = '2026-01-01'

function wait(ms) { return new Promise(r => setTimeout(r, ms)) }

function get(url, token) {
  return new Promise((res, rej) => {
    const u = new URL(url)
    const req = https.request({ hostname: u.hostname, path: u.pathname + u.search, headers: { Authorization: token } }, r => {
      let d = ''; r.on('data', c => d += c)
      r.on('end', () => { try { res(JSON.parse(d)) } catch { res(d) } })
    })
    req.on('error', rej)
    req.setTimeout(30000, () => { req.destroy(); rej(new Error('timeout')) })
    req.end()
  })
}

function parseNum(s) {
  if (s == null || s === '' || s === '--') return null
  const n = parseFloat(String(s).replace(',', '.'))
  return isNaN(n) ? null : n
}

function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().split('T')[0]
}

function yesterday() {
  return addDays(new Date().toISOString().split('T')[0], -1)
}

async function loadBoxTariffs(token, date) {
  const url = `https://common-api.wildberries.ru/api/v1/tariffs/box?date=${date}`
  const resp = await get(url, token)
  const data = resp?.response?.data
  if (!data) { console.log(`  [box] ${date}: пустой ответ`); return null }
  return {
    list: data.warehouseList ?? [],
    dtNextChange: data.dtNextBox ? data.dtNextBox.split('T')[0] : null,
    dtTillMax: data.dtTillMax ? data.dtTillMax.split('T')[0] : null,
  }
}

async function loadReturnTariffs(token, date) {
  const url = `https://common-api.wildberries.ru/api/v1/tariffs/return?date=${date}`
  const resp = await get(url, token)
  const data = resp?.response?.data
  if (!data) { console.log(`  [return] ${date}: пустой ответ`); return null }
  return {
    list: data.warehouseList ?? [],
    dtTillMax: data.dtTillMax ? data.dtTillMax.split('T')[0] : null,
  }
}

async function saveBoxSnapshot(client, date, list, dtNextChange, dtTillMax) {
  if (!list.length) return 0
  const rows = list.map(t => ({
    store_id: STORE_ID,
    snapshot_date: date,
    tariff_type: 'box',
    warehouse_name: t.warehouseName,
    geo_name: t.geoName ?? null,
    delivery_base: parseNum(t.boxDeliveryBase),
    delivery_liter: parseNum(t.boxDeliveryLiter),
    delivery_coef_expr: parseNum(t.boxDeliveryCoefExpr),
    storage_base: parseNum(t.boxStorageBase),
    storage_liter: parseNum(t.boxStorageLiter),
    storage_coef_expr: parseNum(t.boxStorageCoefExpr),
    dt_next_change: dtNextChange,
    dt_till_max: dtTillMax,
    loaded_at: new Date().toISOString(),
  }))

  let count = 0
  for (const r of rows) {
    await client.query(`
      INSERT INTO wb_tariffs_history
        (store_id, snapshot_date, tariff_type, warehouse_name, geo_name,
         delivery_base, delivery_liter, delivery_coef_expr,
         storage_base, storage_liter, storage_coef_expr,
         dt_next_change, dt_till_max, loaded_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
      ON CONFLICT (store_id, tariff_type, warehouse_name, snapshot_date) DO UPDATE SET
        delivery_base=EXCLUDED.delivery_base, delivery_liter=EXCLUDED.delivery_liter,
        storage_base=EXCLUDED.storage_base, storage_liter=EXCLUDED.storage_liter,
        dt_next_change=EXCLUDED.dt_next_change, dt_till_max=EXCLUDED.dt_till_max,
        loaded_at=EXCLUDED.loaded_at
    `, [r.store_id, r.snapshot_date, r.tariff_type, r.warehouse_name, r.geo_name,
        r.delivery_base, r.delivery_liter, r.delivery_coef_expr,
        r.storage_base, r.storage_liter, r.storage_coef_expr,
        r.dt_next_change, r.dt_till_max, r.loaded_at])
    count++
  }
  return count
}

async function saveReturnSnapshot(client, date, list, dtTillMax) {
  if (!list.length) return 0
  let count = 0
  for (const t of list) {
    await client.query(`
      INSERT INTO wb_tariffs_history
        (store_id, snapshot_date, tariff_type, warehouse_name,
         return_office_base, return_office_liter, return_courier_base, return_courier_liter,
         dt_till_max, loaded_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
      ON CONFLICT (store_id, tariff_type, warehouse_name, snapshot_date) DO UPDATE SET
        return_office_base=EXCLUDED.return_office_base,
        return_office_liter=EXCLUDED.return_office_liter,
        return_courier_base=EXCLUDED.return_courier_base,
        return_courier_liter=EXCLUDED.return_courier_liter,
        dt_till_max=EXCLUDED.dt_till_max, loaded_at=EXCLUDED.loaded_at
    `, [STORE_ID, date, 'return', t.warehouseName,
        parseNum(t.deliveryDumpSupOfficeBase), parseNum(t.deliveryDumpSupOfficeLiter),
        parseNum(t.deliveryDumpSupCourierBase), parseNum(t.deliveryDumpSupCourierLiter),
        dtTillMax, new Date().toISOString()])
    count++
  }
  return count
}

async function run() {
  const client = await pool.connect()
  try {
    // Получаем токен из БД
    const { rows: storeRows } = await client.query(
      `SELECT wb_token FROM stores WHERE id=$1`, [STORE_ID]
    )
    const token = storeRows[0]?.wb_token
    if (!token) throw new Error('wb_token не найден')
    console.log('Токен получен ✓')

    const end = yesterday()
    console.log(`Загружаем тарифы с ${START_DATE} по ${end}`)
    console.log('Лимит API: 1 req/min → пауза 62 сек между запросами\n')

    // ─── BOX ТАРИФЫ ──────────────────────────────────────────────
    console.log('=== BOX ТАРИФЫ (доставка + хранение) ===')
    let boxDate = START_DATE
    let boxTotal = 0
    let boxPeriods = 0

    while (boxDate <= end) {
      console.log(`[box] запрос за ${boxDate}...`)
      const result = await loadBoxTariffs(token, boxDate)
      if (!result) { boxDate = addDays(boxDate, 1); continue }

      const saved = await saveBoxSnapshot(client, boxDate, result.list, result.dtNextChange, result.dtTillMax)
      boxTotal += saved
      boxPeriods++
      console.log(`  → ${saved} складов. dtNextChange=${result.dtNextChange ?? 'нет'}, dtTillMax=${result.dtTillMax ?? 'нет'}`)

      // Следующая дата: либо дата изменения тарифа, либо +1 день
      const next = result.dtNextChange && result.dtNextChange > boxDate ? result.dtNextChange : addDays(boxDate, 1)
      if (next > end) { console.log(`  → достигли конца периода`); break }
      boxDate = next

      if (boxDate <= end) {
        console.log(`  ⏳ пауза 62 сек...`)
        await wait(62000)
      }
    }
    console.log(`\nBox: загружено ${boxTotal} строк за ${boxPeriods} периодов\n`)

    // ─── RETURN ТАРИФЫ ───────────────────────────────────────────
    console.log('=== RETURN ТАРИФЫ (возвраты) ===')
    let retDate = START_DATE
    let retTotal = 0
    let retPeriods = 0

    // Сначала узнаём периоды изменений return тарифов
    while (retDate <= end) {
      console.log(`[return] запрос за ${retDate}...`)
      const result = await loadReturnTariffs(token, retDate)
      if (!result) { retDate = addDays(retDate, 1); continue }

      const saved = await saveReturnSnapshot(client, retDate, result.list, result.dtTillMax)
      retTotal += saved
      retPeriods++
      console.log(`  → ${saved} складов. dtTillMax=${result.dtTillMax ?? 'нет'}`)

      // Return API не возвращает dtNextChange, используем dtTillMax
      const next = result.dtTillMax && result.dtTillMax > retDate ? addDays(result.dtTillMax, 1) : addDays(retDate, 1)
      if (next > end) { console.log(`  → достигли конца периода`); break }
      retDate = next

      if (retDate <= end) {
        console.log(`  ⏳ пауза 62 сек...`)
        await wait(62000)
      }
    }
    console.log(`\nReturn: загружено ${retTotal} строк за ${retPeriods} периодов\n`)

    // Итог
    const { rows: countRows } = await client.query(
      `SELECT COUNT(*) as total, COUNT(DISTINCT snapshot_date) as dates FROM wb_tariffs_history WHERE store_id=$1`,
      [STORE_ID]
    )
    console.log(`\n✅ Итог: ${countRows[0].total} строк, ${countRows[0].dates} уникальных дат в wb_tariffs_history`)

  } finally {
    client.release()
    await pool.end()
  }
}

run().catch(e => { console.error(e); process.exit(1) })
