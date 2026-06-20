import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { getUserStoreIds, getManualCosts } from '@/lib/queries'
import * as XLSX from 'xlsx'

export async function GET(req: NextRequest) {
  const db = await createClient()
  const { data: { user } } = await db.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const storeIds = await getUserStoreIds(user.id)
  if (!storeIds.length) return NextResponse.json({ error: 'No stores' }, { status: 400 })

  const { searchParams } = new URL(req.url)
  const from = searchParams.get('from') || new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0]
  const to = searchParams.get('to') || new Date().toISOString().split('T')[0]

  const [{ data: dirRows }, { data: finRows }, costs] = await Promise.all([
    db.from('directory').select('doc_type_name, multiplier'),
    db.from('wb_finance')
      .select('doc_type_name, ppvz_for_pay, delivery_rub, penalty, additional_payment, date_from, date_to, sa_name, nm_id')
      .in('store_id', storeIds)
      .gte('date_from', from)
      .lte('date_to', to),
    getManualCosts(storeIds, from, to),
  ])

  const multMap: Record<string, number> = {}
  for (const d of dirRows ?? []) multMap[d.doc_type_name] = d.multiplier

  // Sheet 1: P&L Summary
  let revenue = 0, returns = 0, logistics = 0, penalties = 0, additional = 0
  for (const r of finRows ?? []) {
    const m = multMap[r.doc_type_name] ?? 0
    if (m === 1) revenue += r.ppvz_for_pay ?? 0
    if (m === -1) returns += Math.abs(r.ppvz_for_pay ?? 0)
    logistics += r.delivery_rub ?? 0
    penalties += r.penalty ?? 0
    additional += r.additional_payment ?? 0
  }
  const manualTotal = costs.reduce((s, c) => s + c.amount, 0)
  const net = revenue - returns - logistics - penalties + additional - manualTotal

  const summaryData = [
    ['P&L Отчёт', `${from} — ${to}`],
    [],
    ['Показатель', 'Сумма, ₽'],
    ['Выручка WB (ppvz)', Math.round(revenue)],
    ['Возвраты', -Math.round(returns)],
    ['Логистика WB', -Math.round(logistics)],
    ['Штрафы', -Math.round(penalties)],
    ['Доп. выплаты', Math.round(additional)],
    ['Чистые выплаты WB', Math.round(revenue - returns - logistics - penalties + additional)],
    [],
    ['Ручные затраты', -Math.round(manualTotal)],
    [],
    ['ЧИСТАЯ ПРИБЫЛЬ', Math.round(net)],
  ]

  // Sheet 2: Finance details
  const financeData = [
    ['Дата от', 'Дата до', 'Тип операции', 'Артикул', 'nmId', 'К выплате', 'Логистика', 'Штраф', 'Доп. выплата'],
    ...(finRows ?? []).map(r => [
      r.date_from?.split('T')[0],
      r.date_to?.split('T')[0],
      r.doc_type_name,
      r.sa_name,
      r.nm_id,
      r.ppvz_for_pay,
      r.delivery_rub,
      r.penalty,
      r.additional_payment,
    ]),
  ]

  // Sheet 3: Manual costs
  const costsData = [
    ['Дата', 'Категория', 'Описание', 'Сумма, ₽'],
    ...costs.map(c => [c.date, c.category, c.description || '', c.amount]),
  ]

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summaryData), 'P&L')
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(financeData), 'Детали WB')
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(costsData), 'Затраты')

  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })
  const filename = `pnl_${from}_${to}.xlsx`

  return new NextResponse(buf, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}
