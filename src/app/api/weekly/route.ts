import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { getUserStoreIds } from '@/lib/queries'
import { adminDb } from '@/lib/admin'

function daysAgo(n: number) {
  const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().split('T')[0]
}

export async function GET(req: NextRequest) {
  const db = await createClient()
  const { data: { user } } = await db.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const storeIds = await getUserStoreIds(user.id)
  if (!storeIds.length) return NextResponse.json({ error: 'No store' }, { status: 404 })

  const url = req.nextUrl
  const dateFrom = url.searchParams.get('from') ?? daysAgo(84) // 12 weeks
  const dateTo = url.searchParams.get('to') ?? new Date().toISOString().split('T')[0]

  const { data: rows, error } = await adminDb()
    .from('wb_finance')
    .select('realizationreport_id, date_from, date_to, doc_type_name, supplier_oper_name, ppvz_for_pay, delivery_rub, penalty, additional_payment, retail_amount, commission_percent')
    .in('store_id', storeIds)
    .gte('date_from', dateFrom)
    .lte('date_from', dateTo)
    .limit(200000)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Group by realizationreport_id
  type WeekAcc = {
    realizationreport_id: number
    date_from: string
    date_to: string
    revenue: number
    returns: number
    commission: number
    logistics: number
    storage: number
    penalties: number
    additional: number
  }

  const reportMap = new Map<number, WeekAcc>()

  type FinRow = { realizationreport_id: number; date_from: string | null; date_to: string | null; doc_type_name: string | null; supplier_oper_name: string | null; ppvz_for_pay: number | null; delivery_rub: number | null; penalty: number | null; additional_payment: number | null; retail_amount: number | null; commission_percent: number | null }
  for (const r of (rows ?? []) as FinRow[]) {
    const rid = r.realizationreport_id
    if (!reportMap.has(rid)) {
      reportMap.set(rid, {
        realizationreport_id: rid,
        date_from: r.date_from ?? '',
        date_to: r.date_to ?? '',
        revenue: 0, returns: 0, commission: 0,
        logistics: 0, storage: 0, penalties: 0, additional: 0,
      })
    }
    const acc = reportMap.get(rid)!
    const operName = (r.supplier_oper_name ?? '').toLowerCase()
    const pay = r.ppvz_for_pay ?? 0
    const deliv = r.delivery_rub ?? 0

    if (operName === 'продажа') {
      acc.revenue += pay
      acc.commission += Math.max(0, (r.retail_amount ?? 0) * ((r.commission_percent ?? 0) / 100))
    } else if (operName === 'возврат') {
      acc.returns += Math.abs(pay)
    } else if (operName === 'хранение') {
      acc.storage += Math.abs(deliv)
    } else {
      // логистика и прочие delivery_rub (non-storage, non-sale rows)
      if (deliv !== 0 && operName !== 'хранение') acc.logistics += Math.abs(deliv)
    }

    acc.penalties += Math.abs(r.penalty ?? 0)
    acc.additional += r.additional_payment ?? 0
  }

  // Build sorted array
  const weeks = [...reportMap.values()]
    .sort((a, b) => b.date_from.localeCompare(a.date_from))
    .map(w => ({
      ...w,
      payout: w.revenue - w.returns - w.logistics - w.storage - w.penalties + w.additional,
    }))

  // Compute delta vs previous week (array is newest-first, so prev = index+1)
  const result = weeks.map((w, i) => {
    const prev = weeks[i + 1]
    const delta = prev != null ? w.payout - prev.payout : null
    return { ...w, delta }
  })

  return NextResponse.json({ weeks: result })
}
