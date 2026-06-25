/**
 * Загрузка данных платного хранения из WB API за 2026 год.
 * WB API: GET /api/v1/paid_storage?dateFrom=...&dateTo=... → { taskId }
 *        GET /api/v1/paid_storage/tasks/{taskId}/status
 *        GET /api/v1/paid_storage/tasks/{taskId}/download → данные
 *
 * ВАЖНО: API возвращает несколько строк на один barcode+warehouse с разными calcType:
 *   - "короба: товары свыше базы" → положительный warehousePrice (начисление)
 *   - "скидка на период поставки" → отрицательный warehousePrice (скидка/льгота)
 * Правильная формула: cost = SUM(warehousePrice) по всем calcType для ключа (nm_id, warehouse, barcode, date)
 *
 * ПРОВЕРКА: SUM(warehousePrice) по API = сумме в WB Кабинете "Хранение".
 */
require('dotenv').config({ path: '/Users/glazzki/Desktop/Claude_workspace/projects/wb-analytics/.env.local' })
const { Pool } = require('pg')
const https = require('https')

const STORE_ID         = 'f809c4fb-3ddb-460a-8174-bc872d06571b'
const WB_ANALYTICS_URL = 'https://seller-analytics-api.wildberries.ru'
const WINDOW_DAYS      = 7   // WB API: максимальное окно 7 дней
const BATCH            = 1000
const pool = new Pool({ connectionString: process.env.DATABASE_URL })

function wbGet(url, token) {
  return new Promise((resolve, reject) => {
    const req = https.request(url, { method: 'GET', headers: { Authorization: token } }, res => {
      const chunks = []
      res.on('data', c => chunks.push(c))
      res.on('end', () => {
        try { resolve(JSON.parse(Buffer.concat(chunks).toString())) }
        catch (e) { reject(e) }
      })
    })
    req.on('error', reject)
    req.end()
  })
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

function fmtDate(d) {
  return d.toISOString().split('T')[0]
}

async function fetchPaidStorage(token, dateFrom, dateTo, retries = 5) {
  for (let attempt = 0; attempt < retries; attempt++) {
    // 1. Создаём задачу
    const taskRes = await wbGet(
      `${WB_ANALYTICS_URL}/api/v1/paid_storage?dateFrom=${dateFrom}&dateTo=${dateTo}`,
      token
    )
    const taskId = taskRes?.data?.taskId

    if (!taskId) {
      if (taskRes?.status === 429 || JSON.stringify(taskRes).includes('429') || JSON.stringify(taskRes).includes('too many')) {
        const waitSec = 70
        process.stdout.write(` [429 rate limit, ждём ${waitSec}с]`)
        await sleep(waitSec * 1000)
        continue
      }
      throw new Error(`Нет taskId: ${JSON.stringify(taskRes)}`)
    }

    // 2. Поллинг статуса
    for (let poll = 0; poll < 30; poll++) {
      const statusRes = await wbGet(
        `${WB_ANALYTICS_URL}/api/v1/paid_storage/tasks/${taskId}/status`,
        token
      )
      const status = statusRes?.data?.status
      if (status === 'done') break
      if (status === 'error') throw new Error(`Задача упала: ${JSON.stringify(statusRes)}`)
      if (poll < 29) await sleep(10_000)
      else throw new Error(`Таймаут ожидания задачи ${taskId}`)
    }

    // 3. Скачиваем
    const rows = await wbGet(
      `${WB_ANALYTICS_URL}/api/v1/paid_storage/tasks/${taskId}/download`,
      token
    )
    return Array.isArray(rows) ? rows : []
  }
  throw new Error(`Не удалось получить данные за ${dateFrom}→${dateTo} после ${retries} попыток`)
}

async function upsertBatch(client, rows) {
  if (!rows.length) return 0
  const cols = [
    'store_id','date','nm_id','vendor_code','barcode','subject','brand','warehouse',
    'volume','cost','cost_per_unit','barcodes_count','calc_type'
  ]
  const placeholders = rows.map((_, ri) =>
    `(${cols.map((_, ci) => `$${ri * cols.length + ci + 1}`).join(',')})`
  ).join(',')
  const values = rows.flatMap(r => cols.map(c => r[c] ?? null))
  const updateCols = ['vendor_code','subject','brand','volume','cost','cost_per_unit','barcodes_count','calc_type']
  const updateSet = updateCols.map(c => `${c} = EXCLUDED.${c}`).join(', ')
  const result = await client.query(`
    INSERT INTO wb_storage_daily (${cols.join(',')})
    VALUES ${placeholders}
    ON CONFLICT (store_id, date, nm_id, warehouse, barcode) DO UPDATE SET ${updateSet}
  `, values)
  return result.rowCount
}

async function main() {
  // Получаем токен из БД
  const { rows: [store] } = await pool.query(
    `SELECT wb_analytics_token FROM stores WHERE id=$1`, [STORE_ID]
  )
  if (!store?.wb_analytics_token) throw new Error('Нет wb_analytics_token в stores')
  const token = store.wb_analytics_token
  console.log('Токен получен из БД')

  // Окна загрузки: Jan 1 → вчера, по 7 дней
  const start     = new Date('2026-01-01T00:00:00Z')
  const yesterday = new Date()
  yesterday.setDate(yesterday.getDate() - 1)
  yesterday.setHours(0, 0, 0, 0)

  const windows = []
  let cur = new Date(start)
  while (cur <= yesterday) {
    const winEnd = new Date(Math.min(cur.getTime() + WINDOW_DAYS * 86400000 - 1000, yesterday.getTime()))
    windows.push({ from: fmtDate(cur), to: fmtDate(winEnd) })
    cur = new Date(winEnd.getTime() + 86400000)
  }
  console.log(`\nПериод: 2026-01-01 → ${fmtDate(yesterday)} (${windows.length} окон по ${WINDOW_DAYS} дней)`)

  const client = await pool.connect()
  let totalInserted = 0
  let totalRows = 0

  try {
    for (let i = 0; i < windows.length; i++) {
      const { from, to } = windows[i]
      process.stdout.write(`[${i+1}/${windows.length}] ${from} → ${to} ... `)

      // Пауза между запросами чтобы не словить rate limit (WB: ~1 req/min)
      if (i > 0) await sleep(65_000)

      let rawRows
      try {
        rawRows = await fetchPaidStorage(token, from, to)
      } catch (e) {
        console.error(`\nОшибка окна ${from}→${to}: ${e.message}`)
        continue
      }

      if (!rawRows.length) {
        process.stdout.write(`пусто\n`)
        continue
      }

      // Агрегируем warehousePrice по ключу (date, nm_id, warehouse, barcode)
      // Строки скидок имеют отрицательный warehousePrice — суммируем все
      const aggMap = new Map()
      for (const r of rawRows) {
        const key = `${r.date?.slice(0,10)}|${r.nmId}|${r.warehouse ?? ''}|${r.barcode ?? ''}`
        if (!aggMap.has(key)) {
          aggMap.set(key, {
            store_id:      STORE_ID,
            date:          r.date?.slice(0, 10),
            nm_id:         r.nmId,
            vendor_code:   r.vendorCode ?? null,
            barcode:       r.barcode ?? null,
            subject:       r.subject ?? null,
            brand:         r.brand ?? null,
            warehouse:     r.warehouse ?? null,
            volume:        r.volume ?? null,
            cost:          0,
            cost_per_unit: r.warehousePrice ?? null,  // тариф первой строки как справочное значение
            barcodes_count: r.barcodesCount ?? null,
            calc_type:     r.calcType ?? null,
          })
        }
        // Суммируем warehousePrice (включая скидки с отрицательным значением)
        aggMap.get(key).cost += (r.warehousePrice ?? 0)
      }

      const dbRows = Array.from(aggMap.values()).map(r => ({
        ...r,
        cost: Math.round(r.cost * 10000) / 10000,
      }))

      // Вставляем батчами
      let winInserted = 0
      for (let j = 0; j < dbRows.length; j += BATCH) {
        const cnt = await upsertBatch(client, dbRows.slice(j, j + BATCH))
        winInserted += cnt || 0
      }

      totalRows     += rawRows.length
      totalInserted += winInserted
      process.stdout.write(`получено=${rawRows.length} → агрег.=${dbRows.length} → вставлено/обновлено=${winInserted}\n`)
    }

    // Итоговая сводка по месяцам
    const { rows: monthly } = await client.query(`
      SELECT date_trunc('month', date)::date as month,
             COUNT(DISTINCT date) as days,
             ROUND(SUM(cost)::numeric, 0) as total_cost
      FROM wb_storage_daily
      WHERE store_id=$1 AND date >= '2026-01-01'
      GROUP BY 1 ORDER BY 1
    `, [STORE_ID])

    console.log(`\n✅ Загружено API строк: ${totalRows}, вставлено/обновлено в БД: ${totalInserted}`)
    console.log('\nИтоги по месяцам в БД:')
    let dbTotal = 0
    for (const m of monthly) {
      console.log(`  ${String(m.month).slice(0,7)}: ${Number(m.days)} дней, ${Number(m.total_cost).toLocaleString('ru')} ₽`)
      dbTotal += Number(m.total_cost)
    }
    console.log(`  ИТОГО: ${dbTotal.toLocaleString('ru')} ₽`)

  } finally {
    client.release()
    await pool.end()
  }
}

main().catch(e => { console.error(e.message); process.exit(1) })
