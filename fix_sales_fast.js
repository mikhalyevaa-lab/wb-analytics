/**
 * Быстрое обновление price_with_disc/for_pay через upsert с полным набором полей
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
    if (res.status === 429) { console.log(`429, пауза 65с (попытка ${i}/5)...`); await sleep(65000) }
    else throw new Error(`API ${res.status}: ${await res.text()}`)
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
  const raw = await fetchWithRetry(
    'https://statistics-api.wildberries.ru/api/v1/supplier/sales?dateFrom=2026-01-01&flag=0',
    token
  )
  console.log(`Получено: ${raw.length} записей`)

  // Фильтруем до 21.06 и дедуп по saleID
  const seen = new Set()
  const rows = []
  for (const r of raw) {
    const date = r.date?.slice(0, 10)
    if (!date || date > '2026-06-21') continue
    if (seen.has(r.saleID)) continue
    seen.add(r.saleID)
    rows.push({
      store_id: S,
      sale_id: r.saleID || null,
      g_number: r.gNumber || null,
      date: r.date || null,
      last_change_date: r.lastChangeDate || null,
      supplier_article: r.supplierArticle || null,
      techsize: r.techSize || null,
      barcode: r.barcode || null,
      total_price: r.totalPrice != null ? r.totalPrice : null,
      discount_percent: r.discountPercent != null ? r.discountPercent : null,
      spp: r.spp != null ? r.spp : null,
      payment_sale_amount: r.paymentSaleAmount != null ? r.paymentSaleAmount : null,
      for_pay: r.forPay != null ? r.forPay : null,
      finished_price: r.finishedPrice != null ? r.finishedPrice : null,
      price_with_disc: r.priceWithDisc != null ? r.priceWithDisc : null,  // ← правильное поле
      nm_id: r.nmId || null,
      subject: r.subject || null,
      category: r.category || null,
      brand: r.brand || null,
      income_id: r.incomeID || null,
      is_supply: r.isSupply ?? false,
      is_realization: r.isRealization ?? false,
      order_type: r.orderType || null,
    })
  }
  console.log(`Подготовлено к upsert: ${rows.length} строк`)

  // Upsert батчами — Supabase v2 с merge-duplicates обновляет существующие строки
  const BATCH = 500
  let loaded = 0, errors = 0
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH)
    const { error } = await db.from('wb_sales').upsert(batch, {
      onConflict: 'sale_id',
      ignoreDuplicates: false,
    })
    if (error) {
      errors++
      if (errors <= 3) console.error('\nОшибка upsert:', error.message)
    } else {
      loaded += batch.length
    }
    if ((i + BATCH) % 5000 === 0 || i + BATCH >= rows.length)
      process.stdout.write(`\rUpsert: ${Math.min(i + BATCH, rows.length)}/${rows.length}`)
  }
  console.log(`\nОшибок: ${errors}`)

  // Проверяем обновилось ли
  const { data: check } = await db.from('wb_sales')
    .select('sale_id,price_with_disc')
    .eq('store_id', S).gte('date', '2026-06-20').like('sale_id', 'S%').limit(3)
  console.log('Проверка после upsert:', check?.map(r => `${r.sale_id}: ${r.price_with_disc}`))

  // Если upsert не помог — делаем UPDATE напрямую через SQL батчами
  if (check?.[0]?.price_with_disc == null) {
    console.log('\nUpsert не обновил — пробуем через .update() батчами по 100...')
    const priceMap = new Map(rows.map(r => [r.sale_id, r.price_with_disc]))
    const saleIds = [...priceMap.keys()]
    let upd = 0
    for (let i = 0; i < saleIds.length; i += 100) {
      const batch = saleIds.slice(i, i + 100)
      // Для каждого sale_id в батче делаем update
      await Promise.all(batch.map(sid =>
        db.from('wb_sales')
          .update({ price_with_disc: priceMap.get(sid) })
          .eq('store_id', S).eq('sale_id', sid)
      ))
      upd += batch.length
      if (upd % 5000 === 0 || i + 100 >= saleIds.length)
        process.stdout.write(`\rUpdate: ${upd}/${saleIds.length}`)
    }
    console.log('\nГотово')
  }

  // Финальная сверка
  console.log('\n=== ФИНАЛЬНАЯ СВЕРКА wb_sales vs Файл ===')
  let totC = 0, totS = 0, totFC = 0, totFS = 0
  for (const m of ['06','05','04','03','02','01']) {
    const y2 = 2026, mo = parseInt(m)
    const dateFrom = `2026-${m}-01`
    const lastDay = new Date(y2, mo, 0).getDate()
    const dateTo = `2026-${m}-${String(lastDay).padStart(2,'0')}T23:59:59`
    let all = [], from = 0
    while (true) {
      const { data } = await db.from('wb_sales')
        .select('price_with_disc').eq('store_id', S).like('sale_id', 'S%')
        .gte('date', dateFrom).lte('date', dateTo)
        .range(from, from + 999)
      if (!data?.length) break
      all.push(...data); if (data.length < 1000) break; from += 1000
    }
    const cnt = all.length
    const sum = all.reduce((s, r) => s + (r.price_with_disc ?? 0), 0)
    const f = FILE[m]
    const dc = ((cnt - f.cnt) / f.cnt * 100).toFixed(2)
    const ds = sum > 0 ? ((sum - f.sum) / f.sum * 100).toFixed(2) : 'нет данных'
    const okC = Math.abs(cnt - f.cnt) / f.cnt * 100 <= 0.5
    const okS = sum > 0 && Math.abs(sum - f.sum) / f.sum * 100 <= 0.5
    console.log(`2026-${m}: ${cnt} шт (Δ${dc}% ${okC?'✅':'❌'}) | ${Math.round(sum).toLocaleString('ru')} руб (Δ${ds}% ${okS?'✅':'❌'})`)
    totC += cnt; totS += sum; totFC += f.cnt; totFS += f.sum
  }
  const okC = Math.abs(totC - totFC) / totFC * 100 <= 0.5
  const okS = totS > 0 && Math.abs(totS - totFS) / totFS * 100 <= 0.5
  console.log(`\nИТОГО: ${totC} шт (Δ${((totC-totFC)/totFC*100).toFixed(2)}% ${okC?'✅':'❌'}) | ${Math.round(totS).toLocaleString('ru')} руб (Δ${((totS-totFS)/totFS*100).toFixed(2)}% ${okS?'✅':'❌'})`)
  console.log(`Файл:   ${totFC} шт | ${totFS.toLocaleString('ru')} руб`)
}

main().catch(console.error)
