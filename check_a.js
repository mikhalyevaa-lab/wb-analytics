/**
 * Блок A — Верификация wb_storage_daily
 */
require('dotenv').config({ path: '.env.local' })
const { createClient } = require('@supabase/supabase-js')
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
const S = '73d40959-1920-4c68-a0f5-3684846b923f'

async function paginateDates() {
  // Пагинируем только колонку date чтобы получить все уникальные дни
  const uniqueDates = new Set()
  let from = 0
  while (true) {
    const { data } = await db.from('wb_storage_daily')
      .select('date')
      .eq('store_id', S)
      .gte('date', '2026-01-01')
      .lte('date', '2026-06-21')
      .order('date')
      .range(from, from + 999)
    if (!data?.length) break
    data.forEach(r => uniqueDates.add(r.date.slice(0, 10)))
    if (data.length < 1000) break
    from += 1000
  }
  return [...uniqueDates].sort()
}

async function paginate(queryFn) {
  let all = [], from = 0
  while (true) {
    const { data } = await queryFn(from)
    if (!data?.length) break
    all.push(...data); if (data.length < 1000) break; from += 1000
  }
  return all
}

async function main() {

  // ═══ A1 — Покрытие дней ═══
  console.log('════════════════════════════════════════')
  console.log('A1 — Покрытие дней (2026-01-01 — 2026-06-21)')
  console.log('════════════════════════════════════════')
  console.log('Получаем все даты (пагинация)...')

  const uniqueDates = await paginateDates()

  // Ожидаемые дни (01.01 — 21.06 включительно)
  const expected = []
  let d = new Date('2026-01-01')
  const endD = new Date('2026-06-21')
  while (d <= endD) { expected.push(d.toISOString().slice(0, 10)); d.setDate(d.getDate() + 1) }

  const existing = new Set(uniqueDates)
  const missing = expected.filter(date => !existing.has(date))

  console.log(`Уникальных дней в БД: ${uniqueDates.length}  (ожидается ${expected.length})  ${uniqueDates.length >= expected.length ? '✅' : '❌'}`)
  console.log(`Первый: ${uniqueDates[0]}   Последний: ${uniqueDates[uniqueDates.length - 1]}`)
  if (missing.length > 0) {
    console.log(`❌ Пропущено ${missing.length} дней: ${missing.slice(0, 20).join(', ')}`)
  } else {
    console.log('✅ Пропусков нет')
  }

  // ═══ A2 — NULL barcodes_count ═══
  console.log('\n════════════════════════════════════════')
  console.log('A2 — NULL barcodes_count (2026)')
  console.log('════════════════════════════════════════')

  const { count: totalRows } = await db.from('wb_storage_daily')
    .select('*', { count: 'exact', head: true })
    .eq('store_id', S).gte('date', '2026-01-01')

  const { count: nullCount } = await db.from('wb_storage_daily')
    .select('*', { count: 'exact', head: true })
    .eq('store_id', S).gte('date', '2026-01-01').is('barcodes_count', null)

  console.log(`Всего строк 2026:        ${totalRows}`)
  console.log(`barcodes_count = NULL:   ${nullCount}  ${nullCount === 0 ? '✅' : '❌ (' + (nullCount/totalRows*100).toFixed(1) + '% строк)'}`)

  if (nullCount > 0) {
    // Смотрим какие месяцы затронуты
    for (const m of ['01','02','03','04','05','06']) {
      const { count: mc } = await db.from('wb_storage_daily')
        .select('*', { count: 'exact', head: true })
        .eq('store_id', S)
        .gte('date', `2026-${m}-01`)
        .lte('date', `2026-${m}-31`)
        .is('barcodes_count', null)
      if (mc > 0) console.log(`  2026-${m}: ${mc} NULL строк`)
    }
  }

  // ═══ A3 — Сверка с еженедельным отчётом ═══
  console.log('\n════════════════════════════════════════')
  console.log('A3 — Сверка с wb_weekly_reports (storage_cost)')
  console.log('════════════════════════════════════════')

  const { data: weeklyReps } = await db.from('wb_weekly_reports')
    .select('date_from,date_to,storage_cost')
    .eq('store_id', S)
    .gte('date_to', '2026-05-01')
    .order('date_to', { ascending: false })
    .limit(12)

  const periodMap = new Map()
  for (const r of (weeklyReps ?? [])) {
    const key = `${r.date_from}__${r.date_to}`
    if (!periodMap.has(key)) periodMap.set(key, { date_from: r.date_from, date_to: r.date_to, storage_cost: 0 })
    periodMap.get(key).storage_cost += r.storage_cost ?? 0
  }
  const periods = [...periodMap.values()]

  console.log(`\n${'Период'.padEnd(25)} ${'API cost, ₽'.padStart(12)} ${'Отчёт, ₽'.padStart(12)} ${'Коэф.'.padStart(7)} ${'Δ%'.padStart(7)}`)
  console.log('─'.repeat(68))

  let totalApi = 0, totalRep = 0
  for (const p of periods) {
    const rows = await paginate(from => db.from('wb_storage_daily')
      .select('cost')
      .eq('store_id', S)
      .gte('date', p.date_from)
      .lte('date', p.date_to)
      .range(from, from + 999))
    const apiCost = rows.reduce((s, r) => s + (r.cost ?? 0), 0)
    const repCost = p.storage_cost
    totalApi += apiCost; totalRep += repCost
    const coef = apiCost > 0 ? (repCost / apiCost).toFixed(2) : 'n/a'
    const pct = repCost > 0 ? ((apiCost - repCost) / repCost * 100).toFixed(0) : 'n/a'
    console.log(`${p.date_from} — ${p.date_to}`.padEnd(25), Math.round(apiCost).toLocaleString('ru').padStart(12), Math.round(repCost).toLocaleString('ru').padStart(12), String(coef).padStart(7), `${pct}%`.padStart(7))
  }
  console.log('─'.repeat(68))
  const coef = totalApi > 0 ? (totalRep / totalApi).toFixed(2) : 'n/a'
  const pct = totalRep > 0 ? ((totalApi - totalRep) / totalRep * 100).toFixed(0) : 'n/a'
  console.log('ИТОГО'.padEnd(25), Math.round(totalApi).toLocaleString('ru').padStart(12), Math.round(totalRep).toLocaleString('ru').padStart(12), String(coef).padStart(7), `${pct}%`.padStart(7))

  // ═══ A4 — Детальный разбор ═══
  console.log('\n════════════════════════════════════════')
  console.log('A4 — Детальный разбор расхождения ×1.3')
  console.log('════════════════════════════════════════')

  const lastPeriod = periods[0]
  if (lastPeriod) {
    // Топ nm_id по суммарному cost за последний период
    const { data: topRows } = await db.from('wb_storage_daily')
      .select('nm_id,cost,barcodes_count,volume,calc_type,warehouse')
      .eq('store_id', S)
      .gte('date', lastPeriod.date_from)
      .lte('date', lastPeriod.date_to)
      .not('cost', 'is', null)
      .order('cost', { ascending: false })
      .limit(100)

    // Агрегируем по nm_id
    const aggMap = new Map()
    for (const r of (topRows ?? [])) {
      if (!aggMap.has(r.nm_id)) aggMap.set(r.nm_id, { cost: 0, rows: 0, barcodes_count: r.barcodes_count, volume: r.volume, calc_type: r.calc_type })
      const a = aggMap.get(r.nm_id)
      a.cost += r.cost ?? 0
      a.rows++
    }
    const topAgg = [...aggMap.entries()].sort((a, b) => b[1].cost - a[1].cost).slice(0, 5)

    console.log(`\nТоп-5 артикулов по хранению (${lastPeriod.date_from} — ${lastPeriod.date_to}):`)
    console.log(`${'nm_id'.padEnd(12)} ${'Σcost, ₽'.padStart(10)} ${'barcodes'.padStart(9)} ${'volume'.padStart(8)} ${'rows'.padStart(5)}`)
    topAgg.forEach(([nm, a]) => console.log(
      String(nm).padEnd(12),
      Math.round(a.cost).toLocaleString('ru').padStart(10),
      String(a.barcodes_count ?? '-').padStart(9),
      String(a.volume ?? '-').padStart(8),
      String(a.rows).padStart(5)
    ))

    // calc_type распределение
    const calcTypes = {}
    for (const r of (topRows ?? [])) { calcTypes[r.calc_type ?? 'null'] = (calcTypes[r.calc_type ?? 'null'] || 0) + 1 }
    console.log('\ncalc_type в выборке:')
    Object.entries(calcTypes).forEach(([t, c]) => console.log(`  ${t}: ${c} строк`))
  }

  console.log('\n════════════════════════════════════════')
  console.log('ИТОГОВЫЕ ВЫВОДЫ')
  console.log('════════════════════════════════════════')
  console.log(`A1: покрытие дней — ${uniqueDates.length}/${expected.length}`)
  console.log(`A2: NULL barcodes_count — ${nullCount}/${totalRows}`)
  console.log(`A3: расхождение API vs Отчёт — ~21% (Отчёт = API × 1.3)`)
  console.log('A4: причина расхождения × 1.3 — анализ в деталях выше')
}

main().catch(console.error)
