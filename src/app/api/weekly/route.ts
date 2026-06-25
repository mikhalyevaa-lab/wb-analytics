import { adminDb } from '@/lib/db-compat'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-server'
import { getUserStoreIds } from '@/lib/queries'

function daysAgo(n: number) {
  const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().split('T')[0]
}

export async function GET(req: NextRequest) {
  const user = await requireAuth().catch(() => null)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const storeIds = await getUserStoreIds(user.id)
  if (!storeIds.length) return NextResponse.json({ error: 'No store' }, { status: 404 })

  const url = req.nextUrl
  const dateFrom = url.searchParams.get('from') ?? daysAgo(84)
  const dateTo = url.searchParams.get('to') ?? new Date().toISOString().split('T')[0]

  const adb = adminDb()

  // ── Детализация финансового отчёта ──
  const { data: rows, error } = await adb
    .from('wb_finance')
    .select('realizationreport_id, date_from, date_to, doc_type_name, supplier_oper_name, ppvz_for_pay, delivery_rub, penalty, additional_payment, retail_amount, commission_percent')
    .in('store_id', storeIds)
    .gte('date_from', dateFrom)
    .lte('date_from', dateTo)
    .limit(200000)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // ── Платное хранение (API-метод paid_storage) ──
  type StorageRow = { date: string; cost: number | null }
  const { data: storageRows } = await (adb
    .from('wb_storage_daily')
    .select('date, cost')
    .in('store_id', storeIds)
    .gte('date', dateFrom)
    .lte('date', dateTo)
    .limit(100000) as unknown as Promise<{ data: StorageRow[] | null }>)

  // ── Расходы на рекламу ──
  type AdRow = { date: string; spend: number | null }
  const { data: adRows } = await (adb
    .from('wb_ad_spend')
    .select('date, spend')
    .in('store_id', storeIds)
    .gte('date', dateFrom)
    .lte('date', dateTo)
    .limit(100000) as unknown as Promise<{ data: AdRow[] | null }>)

  // ── Группировка по неделям (по realizationreport_id) ──
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
    paid_storage: number
    advertising: number
  }

  const reportMap = new Map<number, WeekAcc>()

  type FinRow = {
    realizationreport_id: number
    date_from: string | null
    date_to: string | null
    doc_type_name: string | null
    supplier_oper_name: string | null
    ppvz_for_pay: number | null
    delivery_rub: number | null
    penalty: number | null
    additional_payment: number | null
    retail_amount: number | null
    commission_percent: number | null
  }

  for (const r of (rows ?? []) as FinRow[]) {
    const rid = r.realizationreport_id
    if (!reportMap.has(rid)) {
      reportMap.set(rid, {
        realizationreport_id: rid,
        date_from: r.date_from ?? '',
        date_to: r.date_to ?? '',
        revenue: 0, returns: 0, commission: 0,
        logistics: 0, storage: 0, penalties: 0, additional: 0,
        paid_storage: 0, advertising: 0,
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
      if (deliv !== 0) acc.logistics += Math.abs(deliv)
    }

    acc.penalties += Math.abs(r.penalty ?? 0)
    acc.additional += r.additional_payment ?? 0
  }

  // ── Распределяем paid_storage и advertising по неделям (по диапазону дат) ──
  // Собираем список недель с диапазонами
  const weeks = [...reportMap.values()].sort((a, b) => b.date_from.localeCompare(a.date_from))

  // Для каждой строки хранения/рекламы находим нужную неделю
  for (const s of (storageRows ?? [])) {
    const d = s.date?.slice(0, 10) ?? ''
    for (const w of weeks) {
      if (d >= w.date_from.slice(0, 10) && d <= w.date_to.slice(0, 10)) {
        w.paid_storage += s.cost ?? 0
        break
      }
    }
  }

  for (const a of (adRows ?? [])) {
    const d = a.date?.slice(0, 10) ?? ''
    for (const w of weeks) {
      if (d >= w.date_from.slice(0, 10) && d <= w.date_to.slice(0, 10)) {
        w.advertising += a.spend ?? 0
        break
      }
    }
  }

  // ── Итоговый расчёт ──
  const result = weeks.map((w, i) => {
    // payout: то, что WB платит по отчёту
    const payout = w.revenue - w.returns - w.logistics - w.storage - w.penalties + w.additional
    // reconciled: то же по нашей формуле с явными статьями
    const reconciled = w.revenue - w.logistics - w.commission - w.advertising - w.penalties - Math.abs(Math.min(0, w.additional))
    const prev = weeks[i + 1]
    const delta = prev != null ? payout - (prev.revenue - prev.returns - prev.logistics - prev.storage - prev.penalties + prev.additional) : null
    return {
      ...w,
      payout: Math.round(payout),
      reconciled: Math.round(reconciled),
      delta: delta != null ? Math.round(delta) : null,
    }
  })

  return NextResponse.json({ weeks: result })
}
