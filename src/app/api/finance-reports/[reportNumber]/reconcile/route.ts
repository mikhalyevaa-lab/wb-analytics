import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { getUserStoreIds } from '@/lib/queries'
import { adminDb } from '@/lib/admin'

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ reportNumber: string }> }
) {
  const db = await createClient()
  const { data: { user } } = await db.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const storeIds = await getUserStoreIds(user.id)
  if (!storeIds.length) return NextResponse.json({ error: 'No store' }, { status: 404 })
  const storeId = storeIds[0]

  const { reportNumber } = await params
  const reportNum = Number(reportNumber)
  if (!reportNum) return NextResponse.json({ error: 'Invalid reportNumber' }, { status: 400 })

  const adb = adminDb()

  const { data: summary } = await adb.from('wb_weekly_reports')
    .select('*')
    .eq('store_id', storeId)
    .eq('report_number', reportNum)
    .single()

  if (!summary) return NextResponse.json({ error: 'Report not found' }, { status: 404 })

  // Грузим постранично — Supabase по умолчанию отдаёт не более 1000 строк за раз
  const allRows: Record<string, number | null | string>[] = []
  const PAGE = 1000
  let from = 0
  while (true) {
    const { data, error } = await adb.from('wb_weekly_report_rows')
      .select('doc_type,for_pay_seller,total_fines,wb_commission_correction,delivery_service_cost,row_storage_cost,acceptance_operations,loyalty_discount_compensation')
      .eq('store_id', storeId)
      .eq('report_number', reportNum)
      .range(from, from + PAGE - 1)
    if (error || !data?.length) break
    allRows.push(...data)
    if (data.length < PAGE) break
    from += PAGE
  }

  const rows = allRows as {
    doc_type: string | null
    for_pay_seller: number | null
    total_fines: number | null
    wb_commission_correction: number | null
    delivery_service_cost: number | null
    row_storage_cost: number | null
    acceptance_operations: number | null
    loyalty_discount_compensation: number | null
  }[]

  function sumField(field: keyof Omit<typeof rows[0], 'doc_type'>): number {
    return rows.reduce((acc, r) => acc + (Number(r[field]) || 0), 0)
  }

  // WB хранит строки Возврат с положительным for_pay_seller, но в сводке они вычитаются.
  // Корректная формула: SUM(sales for_pay_seller) - SUM(returns for_pay_seller)
  function sumForPay(): number {
    return rows.reduce((acc, r) => {
      const val = Number(r.for_pay_seller) || 0
      return acc + (r.doc_type === 'Возврат' ? -val : val)
    }, 0)
  }

  const MAX_DIFF_PCT = 0.5

  function check(name: string, summaryVal: number | null, detailVal: number) {
    const s = Number(summaryVal) || 0
    const diff = detailVal - s
    const diffPct = s !== 0 ? Math.abs(diff / s) * 100 : (detailVal !== 0 ? 100 : 0)
    return { name, summary: s, detail: detailVal, diff, diffPct, ok: diffPct <= MAX_DIFF_PCT }
  }

  const s = summary as {
    for_pay: number | null
    total_fines: number | null
    wb_commission_correction: number | null
    logistics_cost: number | null
    storage_cost: number | null
    acceptance_cost: number | null
    loyalty_compensation: number | null
  }

  const fields = [
    check('for_pay', s.for_pay, sumForPay()),
    check('total_fines', s.total_fines, sumField('total_fines')),
    check('wb_commission_correction', s.wb_commission_correction, sumField('wb_commission_correction')),
    check('logistics_cost', s.logistics_cost, sumField('delivery_service_cost')),
    check('storage_cost', s.storage_cost, sumField('row_storage_cost')),
    check('acceptance_cost', s.acceptance_cost, sumField('acceptance_operations')),
    check('loyalty_discount_compensation', s.loyalty_compensation, sumField('loyalty_discount_compensation')),
  ]

  const overallOk = fields.every(f => f.ok)
  const reconcileResult = { checkedAt: new Date().toISOString(), fields, overallOk }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (adb.from('wb_weekly_reports') as any)
    .update({ reconciled: true, reconciled_at: new Date().toISOString(), reconcile_result: reconcileResult })
    .eq('store_id', storeId)
    .eq('report_number', reportNum)

  return NextResponse.json({ ok: true, overallOk, fields })
}
