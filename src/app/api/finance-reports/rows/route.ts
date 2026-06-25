import { adminDb } from '@/lib/db-compat'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-server'
import { getUserStoreIds } from '@/lib/queries'

export async function GET(req: NextRequest) {
  const user = await requireAuth().catch(() => null)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const storeIds = await getUserStoreIds(user.id)
  if (!storeIds.length) return NextResponse.json({ error: 'No store' }, { status: 404 })

  const { searchParams } = new URL(req.url)
  const dateFrom    = searchParams.get('date_from') ?? ''
  const dateTo      = searchParams.get('date_to') ?? ''
  const nmId        = searchParams.get('nm_id') ?? ''
  const barcode     = searchParams.get('barcode') ?? ''
  const reportId    = searchParams.get('report_id') ?? ''
  const docType     = searchParams.get('doc_type') ?? ''
  const page        = Math.max(1, Number(searchParams.get('page') ?? '1'))
  const limit       = Math.min(200, Number(searchParams.get('limit') ?? '50'))
  const offset      = (page - 1) * limit

  const adb = adminDb()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let q = (adb.from('wb_finance') as any)
    .select(
      'realizationreport_id, date_from, date_to, rrd_id, nm_id, sa_name, brand_name, barcode, ' +
      'doc_type_name, supplier_oper_name, quantity, sale_dt, order_dt, ' +
      'retail_price, retail_price_withdisc_rub, retail_amount, ppvz_for_pay, ' +
      'ppvz_sales_commission, delivery_rub, penalty, additional_payment, ' +
      'storage_fee, deduction, acceptance, srid, office_name, ts_name',
      { count: 'exact' }
    )
    .in('store_id', storeIds)
    .order('date_to', { ascending: false })
    .order('rrd_id',  { ascending: false })
    .range(offset, offset + limit - 1)

  if (dateFrom) q = q.gte('date_from', dateFrom)
  if (dateTo)   q = q.lte('date_to', dateTo)
  if (nmId)     q = q.eq('nm_id', parseInt(nmId))
  if (barcode)  q = q.eq('barcode', barcode)
  if (reportId) q = q.eq('realizationreport_id', parseInt(reportId))
  if (docType)  q = q.eq('doc_type_name', docType)

  const { data, count, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Сводные итоги за фильтр (без пагинации)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let sumQ = (adb.from('wb_finance') as any)
    .select('ppvz_for_pay.sum(), penalty.sum(), storage_fee.sum(), delivery_rub.sum(), acceptance.sum(), deduction.sum(), additional_payment.sum()')
    .in('store_id', storeIds)

  if (dateFrom) sumQ = sumQ.gte('date_from', dateFrom)
  if (dateTo)   sumQ = sumQ.lte('date_to', dateTo)
  if (nmId)     sumQ = sumQ.eq('nm_id', parseInt(nmId))
  if (barcode)  sumQ = sumQ.eq('barcode', barcode)
  if (reportId) sumQ = sumQ.eq('realizationreport_id', parseInt(reportId))
  if (docType)  sumQ = sumQ.eq('doc_type_name', docType)

  const { data: sumData } = await sumQ.single()

  // Список уникальных номеров отчётов для фильтра
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: reportsRaw } = await (adb.from('wb_finance') as any)
    .select('realizationreport_id, date_from, date_to')
    .in('store_id', storeIds)
    .order('date_to', { ascending: false })
    .limit(200)

  // Дедупликация по номеру отчёта
  const seen = new Set<number>()
  const reports = ((reportsRaw ?? []) as { realizationreport_id: number; date_from: string; date_to: string }[])
    .filter(r => { if (seen.has(r.realizationreport_id)) return false; seen.add(r.realizationreport_id); return true })
    .map(r => ({ id: r.realizationreport_id, date_from: r.date_from, date_to: r.date_to }))

  return NextResponse.json({
    rows: data ?? [],
    total: count ?? 0,
    page,
    limit,
    totals: sumData ?? null,
    reports,
  })
}
