import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-server'
import { getUserStoreIds } from '@/lib/queries'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

export type ReportSource = 'weekly' | 'daily' | 'api'

export interface SmartReportRow {
  id: string              // уникальный ключ для React
  source: ReportSource
  superseded: boolean     // true = перекрыта более приоритетным источником
  report_number: number | null
  date_from: string | null
  date_to: string | null
  nm_id: number | null
  supplier_article: string | null
  title: string | null
  barcode: string | null
  doc_type: string | null
  payment_reason: string | null
  sale_date: string | null
  quantity: number | null
  for_pay_seller: number | null
  delivery_service_cost: number | null
  row_storage_cost: number | null
  total_fines: number | null
  deductions: number | null
  acceptance_operations: number | null
  srid: string | null
  warehouse: string | null
  brand: string | null
}

export interface SmartReportResponse {
  rows: SmartReportRow[]
  total: number
  page: number
  totals: {
    for_pay: number
    delivery: number
    storage: number
    fines: number
    deductions: number
    acceptance: number
  }
  // Покрытие по источникам за период
  coverage: {
    weekly_periods: string[]   // report_numbers с source='weekly'
    daily_periods: string[]    // report_numbers с source='daily'
  }
}

function fmtDate(d: Date | string | null): string | null {
  if (!d) return null
  const s = typeof d === 'string' ? d : d.toISOString()
  return s.slice(0, 10)
}

export async function GET(req: NextRequest) {
  const user = await requireAuth().catch(() => null)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const storeIds = await getUserStoreIds(user.id)
  if (!storeIds.length) return NextResponse.json({ error: 'No store' }, { status: 404 })

  const { searchParams } = new URL(req.url)
  const dateFrom  = searchParams.get('date_from') ?? ''
  const dateTo    = searchParams.get('date_to') ?? ''
  const nmId      = searchParams.get('nm_id') ?? ''
  const sourceFilter = searchParams.get('source') ?? 'all'  // 'all' | 'weekly' | 'daily' | 'api'
  const showSuperseded = searchParams.get('show_superseded') === '1'
  const page  = Math.max(1, Number(searchParams.get('page') ?? '1'))
  const limit = Math.min(200, Number(searchParams.get('limit') ?? '50'))
  const offset = (page - 1) * limit

  // 1. Получаем номера отчётов с еженедельными данными за период
  //    Для каждого такого отчёта ежедневные данные считаются замещёнными
  const weeklyReportsRaw = await db<{
    report_number: number
    date_from: string
    date_to: string
  }[]>`
    SELECT DISTINCT r.report_number, wr.date_from, wr.date_to
    FROM wb_weekly_report_rows r
    LEFT JOIN wb_weekly_reports wr ON wr.store_id = r.store_id AND wr.report_number = r.report_number
    WHERE r.store_id = ANY(${storeIds})
      AND r.report_source = 'weekly'
      ${dateFrom ? db`AND (wr.date_to IS NULL OR wr.date_to >= ${dateFrom}::date)` : db``}
      ${dateTo   ? db`AND (wr.date_from IS NULL OR wr.date_from <= ${dateTo}::date)` : db``}
  `
  const weeklyReportNumbers = new Set(weeklyReportsRaw.map(r => r.report_number))

  // 2. Получаем строки из wb_weekly_report_rows (оба источника)
  const detailRows = await db<{
    report_number: number
    report_source: 'weekly' | 'daily'
    date_from: string | null
    date_to: string | null
    nm_id: number | null
    supplier_article: string | null
    title: string | null
    barcode: string | null
    doc_type: string | null
    payment_reason: string | null
    sale_date: string | null
    quantity: number | null
    for_pay_seller: number | null
    delivery_service_cost: number | null
    row_storage_cost: number | null
    total_fines: number | null
    deductions: number | null
    acceptance_operations: number | null
    srid: string | null
    warehouse: string | null
    brand: string | null
    row_number: number
  }[]>`
    SELECT
      r.report_number, r.report_source,
      wr.date_from, wr.date_to,
      r.nm_id, r.supplier_article, r.title, r.barcode,
      r.doc_type, r.payment_reason, r.sale_date,
      r.quantity, r.for_pay_seller, r.delivery_service_cost,
      r.row_storage_cost, r.total_fines, r.deductions, r.acceptance_operations,
      r.srid, r.warehouse, r.brand, r.row_number
    FROM wb_weekly_report_rows r
    LEFT JOIN wb_weekly_reports wr ON wr.store_id = r.store_id AND wr.report_number = r.report_number
    WHERE r.store_id = ANY(${storeIds})
      ${dateFrom ? db`AND (wr.date_to IS NULL OR wr.date_to >= ${dateFrom}::date)` : db``}
      ${dateTo   ? db`AND (wr.date_from IS NULL OR wr.date_from <= ${dateTo}::date)` : db``}
      ${nmId     ? db`AND r.nm_id = ${parseInt(nmId)}` : db``}
    ORDER BY wr.date_to DESC NULLS LAST, r.report_number DESC, r.row_number ASC
    LIMIT 5000
  `

  // 3. Помечаем замещённые: ежедневные строки, период которых покрыт еженедельным отчётом
  const allRows: SmartReportRow[] = detailRows.map(r => {
    const isSuperseded = r.report_source === 'daily' && weeklyReportNumbers.size > 0 &&
      // Считаем замещённой если есть хоть один еженедельный отчёт, покрывающий ту же дату_продажи
      (() => {
        if (!r.sale_date) return false
        const saleDate = r.sale_date.slice(0, 10)
        return weeklyReportsRaw.some(wr => {
          const from = fmtDate(wr.date_from)
          const to   = fmtDate(wr.date_to)
          return from && to && saleDate >= from && saleDate <= to
        })
      })()

    return {
      id: `${r.report_source}-${r.report_number}-${r.row_number}`,
      source: r.report_source,
      superseded: isSuperseded,
      report_number: r.report_number,
      date_from: fmtDate(r.date_from),
      date_to: fmtDate(r.date_to),
      nm_id: r.nm_id,
      supplier_article: r.supplier_article,
      title: r.title,
      barcode: r.barcode,
      doc_type: r.doc_type,
      payment_reason: r.payment_reason,
      sale_date: fmtDate(r.sale_date),
      quantity: r.quantity,
      for_pay_seller: r.for_pay_seller,
      delivery_service_cost: r.delivery_service_cost,
      row_storage_cost: r.row_storage_cost,
      total_fines: r.total_fines,
      deductions: r.deductions,
      acceptance_operations: r.acceptance_operations,
      srid: r.srid,
      warehouse: r.warehouse,
      brand: r.brand,
    }
  })

  // 4. Если нет детальных строк за период — добавляем API fallback из wb_finance
  if (sourceFilter === 'all' || sourceFilter === 'api') {
    const coveredSrids = new Set(allRows.filter(r => !r.superseded).map(r => r.srid).filter(Boolean))

    const apiRows = await db<{
      realizationreport_id: number
      date_from: string | null
      date_to: string | null
      rrd_id: number
      nm_id: number | null
      sa_name: string | null
      brand_name: string | null
      barcode: string | null
      doc_type_name: string | null
      supplier_oper_name: string | null
      quantity: number | null
      sale_dt: string | null
      ppvz_for_pay: number | null
      delivery_rub: number | null
      storage_fee: number | null
      penalty: number | null
      deduction: number | null
      acceptance: number | null
      srid: string | null
      office_name: string | null
    }[]>`
      SELECT
        realizationreport_id, date_from, date_to, rrd_id,
        nm_id, sa_name, brand_name, barcode,
        doc_type_name, supplier_oper_name, quantity, sale_dt,
        ppvz_for_pay, delivery_rub, storage_fee, penalty, deduction, acceptance,
        srid, office_name
      FROM wb_finance
      WHERE store_id = ANY(${storeIds})
        ${dateFrom ? db`AND date_from >= ${dateFrom}::date` : db``}
        ${dateTo   ? db`AND date_to <= ${dateTo}::date` : db``}
        ${nmId     ? db`AND nm_id = ${parseInt(nmId)}` : db``}
      ORDER BY date_to DESC, rrd_id DESC
      LIMIT 5000
    `

    for (const r of apiRows) {
      const isSuperseded = (r.srid != null && coveredSrids.has(r.srid)) ||
        // Замещена если период покрыт еженедельным отчётом
        (() => {
          const saleDate = fmtDate(r.sale_dt)
          if (!saleDate) return false
          return weeklyReportsRaw.some(wr => {
            const from = fmtDate(wr.date_from)
            const to   = fmtDate(wr.date_to)
            return from && to && saleDate >= from && saleDate <= to
          }) || allRows.some(dr => !dr.superseded && dr.sale_date === saleDate && dr.srid === r.srid)
        })()

      allRows.push({
        id: `api-${r.realizationreport_id}-${r.rrd_id}`,
        source: 'api',
        superseded: isSuperseded,
        report_number: r.realizationreport_id,
        date_from: fmtDate(r.date_from),
        date_to: fmtDate(r.date_to),
        nm_id: r.nm_id,
        supplier_article: r.sa_name,
        title: null,
        barcode: r.barcode,
        doc_type: r.doc_type_name,
        payment_reason: r.supplier_oper_name,
        sale_date: fmtDate(r.sale_dt),
        quantity: r.quantity,
        for_pay_seller: r.ppvz_for_pay,
        delivery_service_cost: r.delivery_rub,
        row_storage_cost: r.storage_fee,
        total_fines: r.penalty,
        deductions: r.deduction,
        acceptance_operations: r.acceptance,
        srid: r.srid,
        warehouse: r.office_name,
        brand: r.brand_name,
      })
    }
  }

  // 5. Фильтрация по источнику
  let filtered = allRows
  if (sourceFilter === 'weekly') filtered = allRows.filter(r => r.source === 'weekly')
  else if (sourceFilter === 'daily') filtered = allRows.filter(r => r.source === 'daily')
  else if (sourceFilter === 'api') filtered = allRows.filter(r => r.source === 'api')
  else if (!showSuperseded) {
    // По умолчанию: показываем все активные + замещённые приглушены (не скрыты)
    // Замещённые идут после активных
    filtered = [
      ...allRows.filter(r => !r.superseded),
      ...allRows.filter(r => r.superseded),
    ]
  }

  const total = filtered.length
  const page_rows = filtered.slice(offset, offset + limit)

  // 6. Итоги только по активным строкам
  const activeRows = allRows.filter(r => !r.superseded)
  const totals = {
    for_pay:    activeRows.reduce((s, r) => s + (r.for_pay_seller ?? 0), 0),
    delivery:   activeRows.reduce((s, r) => s + (r.delivery_service_cost ?? 0), 0),
    storage:    activeRows.reduce((s, r) => s + (r.row_storage_cost ?? 0), 0),
    fines:      activeRows.reduce((s, r) => s + (r.total_fines ?? 0), 0),
    deductions: activeRows.reduce((s, r) => s + (r.deductions ?? 0), 0),
    acceptance: activeRows.reduce((s, r) => s + (r.acceptance_operations ?? 0), 0),
  }

  // 7. Coverage
  const weeklyPeriods = [...new Set(allRows.filter(r => r.source === 'weekly').map(r => String(r.report_number)))]
  const dailyPeriods  = [...new Set(allRows.filter(r => r.source === 'daily').map(r => String(r.report_number)))]

  return NextResponse.json({
    rows: page_rows,
    total,
    page,
    totals,
    coverage: { weekly_periods: weeklyPeriods, daily_periods: dailyPeriods },
  } satisfies SmartReportResponse)
}
