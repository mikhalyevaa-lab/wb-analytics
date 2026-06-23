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

  const [{ data: weeklyRows }, { data: adRows }, costs] = await Promise.all([
    db.from('wb_weekly_reports')
      .select('sale,for_pay,logistics_cost,storage_cost,total_fines,wb_commission_correction,other_deductions,total_to_pay,date_from,date_to')
      .in('store_id', storeIds)
      .gte('date_from', from)
      .lte('date_to', to),
    db.from('wb_ad_spend')
      .select('spend,date,campaign_name')
      .in('store_id', storeIds)
      .gte('date', from)
      .lte('date', to),
    getManualCosts(storeIds, from, to),
  ])

  type WeeklyRow = Record<string, number | string | null>
  const sumField = (field: string) =>
    (weeklyRows ?? []).reduce((a, r) => a + (((r as WeeklyRow)[field] as number) ?? 0), 0)

  const sale       = sumField('sale')
  const forPay     = sumField('for_pay')
  const logistics  = sumField('logistics_cost')
  const storage    = sumField('storage_cost')
  const penalties  = sumField('total_fines')
  const correction = sumField('wb_commission_correction')
  const otherDed   = sumField('other_deductions')
  const totalToPay = sumField('total_to_pay')
  const adSpend    = (adRows ?? []).reduce((a, r) => a + (r.spend ?? 0), 0)
  const manualTotal = costs.reduce((s, c) => s + c.amount, 0)
  const grossProfit = totalToPay - adSpend - manualTotal

  const pct = (n: number) => sale ? `${(n / sale * 100).toFixed(1)}%` : '—'

  const summaryData = [
    ['P&L Отчёт', `${from} — ${to}`],
    [],
    ['Показатель', 'Сумма, ₽', '% от выручки'],
    ['Выручка (Продажа WB)', Math.round(sale), '100%'],
    ['Комиссия WB', -Math.round(sale - forPay), pct(-(sale - forPay))],
    ['К перечислению за товар', Math.round(forPay), pct(forPay)],
    ['Логистика WB', -Math.round(logistics), pct(-logistics)],
    ['Хранение WB', -Math.round(storage), pct(-storage)],
    ['Штрафы', -Math.round(penalties), ''],
    ...(otherDed ? [['Прочие удержания', -Math.round(otherDed), '']] : []),
    ...(correction ? [['Корректировка ВВ', -Math.round(correction), '']] : []),
    ['Итого к оплате WB', Math.round(totalToPay), pct(totalToPay)],
    [],
    ['Реклама WB', -Math.round(adSpend), pct(-adSpend)],
    ['Ручные затраты', -Math.round(manualTotal), pct(-manualTotal)],
    [],
    ['МАРЖИНАЛЬНАЯ ПРИБЫЛЬ', Math.round(grossProfit), pct(grossProfit)],
  ]

  const financeData = [
    ['Период от', 'Период до', 'Продажа', 'К перечислению', 'Логистика', 'Хранение', 'Штрафы', 'Прочие удержания', 'Итого к оплате'],
    ...(weeklyRows ?? []).map(r => [
      String(r.date_from ?? '').split('T')[0],
      String(r.date_to ?? '').split('T')[0],
      r.sale, r.for_pay, r.logistics_cost, r.storage_cost,
      r.total_fines, r.other_deductions, r.total_to_pay,
    ]),
  ]

  const costsData = [
    ['Дата', 'Категория', 'Описание', 'Сумма, ₽'],
    ...costs.map(c => [c.date, c.category, c.description || '', c.amount]),
  ]

  const book = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(summaryData), 'P&L')
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(financeData), 'Отчёты WB')
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(costsData), 'Затраты')

  const buf = XLSX.write(book, { type: 'buffer', bookType: 'xlsx' })
  const filename = `pnl_${from}_${to}.xlsx`

  return new NextResponse(buf, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}
