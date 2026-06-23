/**
 * Блок G — Корректность расчётов
 */
require('dotenv').config({ path: '.env.local' })
const { createClient } = require('@supabase/supabase-js')
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
const S = '73d40959-1920-4c68-a0f5-3684846b923f'

function dpct(a, b) { return b ? ((a - b) / b * 100).toFixed(2) + '%' : 'n/a' }
function chk(a, b, thr) { return (b && Math.abs((a - b) / b * 100) <= thr) ? '✅' : '❌' }

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

  // ── Получаем уникальные недельные периоды (агрегируем несколько номеров за одну неделю) ──
  const { data: allReps } = await db.from('wb_weekly_reports')
    .select('report_number,date_from,date_to,sale,for_pay,logistics_cost,storage_cost,total_fines')
    .eq('store_id', S).order('date_to', { ascending: false }).limit(20)

  // Группируем по периоду
  const periodMap = new Map()
  for (const r of (allReps ?? [])) {
    const key = `${r.date_from}__${r.date_to}`
    if (!periodMap.has(key)) periodMap.set(key, { date_from: r.date_from, date_to: r.date_to, sale: 0, for_pay: 0, logistics_cost: 0, storage_cost: 0, penalty: 0, reports: [] })
    const p = periodMap.get(key)
    p.sale          += r.sale ?? 0
    p.for_pay       += r.for_pay ?? 0
    p.logistics_cost += r.logistics_cost ?? 0
    p.storage_cost  += r.storage_cost ?? 0
    p.total_fines   += r.total_fines ?? 0
    p.reports.push(r.report_number)
  }
  const periods = [...periodMap.values()].slice(0, 3) // 3 последних уникальных периода

  console.log('Периоды для сверки:')
  periods.forEach(p => console.log(` ${p.date_from} — ${p.date_to}  (отчёты: ${p.reports.join(', ')})`))

  // ══════════════════════════════════════
  // G1 — % выкупа
  // ══════════════════════════════════════
  console.log('\n════════════════════════════════════════')
  console.log('G1 — % выкупа')
  console.log('════════════════════════════════════════')

  // Берём последний полный месяц (май 2026) — данные устоялись
  const MAY_FROM = '2026-05-01', MAY_TO = '2026-05-31T23:59:59'

  const [mayOrders, maySales] = await Promise.all([
    paginate(from => db.from('wb_orders')
      .select('is_cancel').eq('store_id', S)
      .gte('date', MAY_FROM).lte('date', MAY_TO)
      .range(from, from + 999)),
    paginate(from => db.from('wb_sales')
      .select('sale_id').eq('store_id', S).like('sale_id', 'S%')
      .gte('date', MAY_FROM).lte('date', MAY_TO)
      .range(from, from + 999)),
  ])

  const ordersNotCancel = mayOrders.filter(r => !r.is_cancel).length
  const salesCount = maySales.length
  const buyoutRate = ordersNotCancel > 0 ? (salesCount / ordersNotCancel * 100) : 0

  // Из файла (отчёт WB) за май: Выкупили/Заказано
  const fileMayBuyout = 11791, fileMayOrders = 19942
  const fileBuyoutRate = fileMayOrders > 0 ? (fileMayBuyout / fileMayOrders * 100) : 0

  console.log(`Май 2026:`)
  console.log(`  wb_orders (не отменённые):  ${ordersNotCancel}`)
  console.log(`  wb_sales S...:              ${salesCount}`)
  console.log(`  БД % выкупа:                ${buyoutRate.toFixed(1)}%`)
  console.log(`  Файл WB % выкупа:           ${fileBuyoutRate.toFixed(1)}%  (${fileMayBuyout}/${fileMayOrders})`)
  console.log(`  Отклонение:                 ${dpct(buyoutRate, fileBuyoutRate)}  ${chk(buyoutRate, fileBuyoutRate, 5)}`)

  // ══════════════════════════════════════
  // G2 + G3 + G4 + G5 по периодам отчётов
  // ══════════════════════════════════════
  for (const period of periods) {
    const { date_from: df, date_to: dt } = period
    const repNums = period.reports

    console.log(`\n════════════════════════════════════════`)
    console.log(`G2–G5  |  ${df} — ${dt}  (отчёты №${repNums.join(', №')})`)
    console.log(`════════════════════════════════════════`)

    // wb_sales за период
    const salesPeriod = await paginate(from => db.from('wb_sales')
      .select('sale_id,finished_price,for_pay,price_with_disc')
      .eq('store_id', S).like('sale_id', 'S%')
      .gte('date', df + 'T00:00:00').lte('date', dt + 'T23:59:59')
      .range(from, from + 999))

    const sumFinished  = salesPeriod.reduce((s, r) => s + (r.finished_price ?? 0), 0)
    const sumForPay    = salesPeriod.reduce((s, r) => s + (r.for_pay ?? 0), 0)
    const sumPriceDisc = salesPeriod.reduce((s, r) => s + (r.price_with_disc ?? 0), 0)

    // wb_weekly_report_rows — детализация за эти номера отчётов
    const rows = await paginate(from => db.from('wb_weekly_report_rows')
      .select('doc_type,for_pay_seller,retail_price_with_discount,delivery_service_cost')
      .not('doc_type', 'is', null)
      .eq('store_id', S).in('report_number', repNums)
      .range(from, from + 999))

    const saleRows   = rows.filter(r => r.doc_type === 'Продажа')
    const returnRows = rows.filter(r => r.doc_type === 'Возврат')
    const rowsSaleForPay   = saleRows.reduce((s, r) => s + (r.for_pay_seller ?? 0), 0)
    const rowsReturnForPay = returnRows.reduce((s, r) => s + (r.for_pay_seller ?? 0), 0)
    const rowsNetForPay    = rowsSaleForPay - rowsReturnForPay
    const rowsRetailSum    = saleRows.reduce((s, r) => s + (r.retail_price_with_discount ?? 0), 0)
    const rowsLogistics    = rows.reduce((s, r) => s + (r.delivery_service_cost ?? 0), 0)

    // Эталон: еженедельный отчёт
    const repSale   = period.sale
    const repForPay = period.for_pay
    const repLog    = period.logistics_cost

    // G2 — Выручка
    console.log(`\nG2 — Выручка (sale):`)
    console.log(`  Еженед. отчёт:           ${Math.round(repSale).toLocaleString('ru')} ₽`)
    console.log(`  wb_sales finished_price:  ${Math.round(sumFinished).toLocaleString('ru')} ₽   Δ=${dpct(sumFinished,repSale)} ${chk(sumFinished,repSale,2)}`)
    console.log(`  wb_sales price_with_disc: ${Math.round(sumPriceDisc).toLocaleString('ru')} ₽   Δ=${dpct(sumPriceDisc,repSale)} ${chk(sumPriceDisc,repSale,2)}`)
    console.log(`  report_rows retail:       ${Math.round(rowsRetailSum).toLocaleString('ru')} ₽   Δ=${dpct(rowsRetailSum,repSale)} ${chk(rowsRetailSum,repSale,2)}`)

    // G3 — К перечислению
    console.log(`\nG3 — К перечислению (for_pay):`)
    console.log(`  Еженед. отчёт:       ${Math.round(repForPay).toLocaleString('ru')} ₽`)
    console.log(`  wb_sales for_pay:    ${Math.round(sumForPay).toLocaleString('ru')} ₽   Δ=${dpct(sumForPay,repForPay)} ${chk(sumForPay,repForPay,0.5)}`)
    console.log(`  report_rows нетто:   ${Math.round(rowsNetForPay).toLocaleString('ru')} ₽   Δ=${dpct(rowsNetForPay,repForPay)} ${chk(rowsNetForPay,repForPay,0.5)}`)

    // G4 — Логистика
    console.log(`\nG4 — Логистика:`)
    console.log(`  Еженед. отчёт:     ${Math.round(repLog).toLocaleString('ru')} ₽`)
    console.log(`  report_rows сумма: ${Math.round(rowsLogistics).toLocaleString('ru')} ₽   Δ=${dpct(rowsLogistics,repLog)} ${chk(rowsLogistics,repLog,0.5)}`)

    // G5 — Средняя цена
    const avgSales = salesPeriod.length > 0 ? sumFinished / salesPeriod.length : 0
    const avgRows  = saleRows.length > 0 ? rowsRetailSum / saleRows.length : 0
    console.log(`\nG5 — Средняя цена продажи:`)
    console.log(`  wb_sales finished_price avg: ${Math.round(avgSales).toLocaleString('ru')} ₽  (${salesPeriod.length} шт)`)
    console.log(`  report_rows retail avg:      ${Math.round(avgRows).toLocaleString('ru')} ₽  (${saleRows.length} строк)   Δ=${dpct(avgSales,avgRows)} ${chk(avgSales,avgRows,5)}`)
  }

  console.log('\n════════════════════════════════════════')
  console.log('ИТОГ')
  console.log('════════════════════════════════════════')
}

main().catch(console.error)
