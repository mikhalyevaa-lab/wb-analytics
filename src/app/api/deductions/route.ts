import { adminDb } from '@/lib/db-compat'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-server'
import { getUserStoreIds } from '@/lib/queries'

// Derive ISO week label from date string YYYY-MM-DD
function isoWeek(dateStr: string): string {
  const d = new Date(dateStr)
  const dayOfWeek = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - dayOfWeek)
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  const weekNum = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)
  return `${d.getUTCFullYear()}-W${String(weekNum).padStart(2, '0')}`
}

function categorize(operName: string | null): 'penalties' | 'storage' | 'acceptance' | 'other' {
  if (!operName) return 'other'
  const n = operName.toLowerCase()
  if (n === 'штраф') return 'penalties'
  if (n === 'хранение') return 'storage'
  if (n.includes('приём') || n.includes('прием')) return 'acceptance'
  return 'other'
}

// Amount for a deduction row (positive = cost to seller)
function rowAmount(r: {
  supplier_oper_name: string | null
  penalty: number | null
  delivery_rub: number | null
  additional_payment: number | null
}): number {
  const cat = categorize(r.supplier_oper_name)
  if (cat === 'penalties') return Math.abs(r.penalty ?? 0)
  if (cat === 'storage') return Math.abs(r.delivery_rub ?? 0)
  if (cat === 'acceptance') return Math.abs(r.delivery_rub ?? 0)
  // other: additional_payment can be negative (credit) or positive (debit)
  return -(r.additional_payment ?? 0)
}

const SALE_OPS = ['продажа', 'возврат', 'логистика']

export async function GET(req: NextRequest) {
  const user = await requireAuth().catch(() => null)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const storeIds = await getUserStoreIds(user.id)
  if (!storeIds.length) return NextResponse.json({ error: 'No store' }, { status: 404 })

  const url = req.nextUrl
  const dateFrom = url.searchParams.get('from') ?? new Date().toISOString().split('T')[0].slice(0, 7) + '-01'
  const dateTo = url.searchParams.get('to') ?? new Date().toISOString().split('T')[0]

  const { data: rows, error } = await adminDb()
    .from('wb_finance')
    .select('supplier_oper_name, date_from, nm_id, sa_name, penalty, delivery_rub, additional_payment, rrd_id')
    .in('store_id', storeIds)
    .gte('date_from', dateFrom)
    .lte('date_from', dateTo)
    .not('supplier_oper_name', 'in', `(${SALE_OPS.map(s => `"${s}"`).join(',')})`)
    .order('date_from', { ascending: false })
    .limit(50000)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  type FinRow = { supplier_oper_name: string | null; date_from: string | null; nm_id: number | null; sa_name: string | null; penalty: number | null; delivery_rub: number | null; additional_payment: number | null; rrd_id: number }
  const allRows = (rows ?? []) as FinRow[]
  const deductionRows = allRows.filter(r => {
    const n = (r.supplier_oper_name ?? '').toLowerCase()
    return !SALE_OPS.includes(n) && n !== 'продажа' && n !== 'возврат'
  })

  // KPI
  const kpi = { penalties: 0, storage: 0, acceptance: 0, other: 0 }
  for (const r of deductionRows) {
    const cat = categorize(r.supplier_oper_name)
    kpi[cat] += rowAmount(r)
  }
  const kpiTotal = kpi.penalties + kpi.storage + kpi.acceptance + kpi.other

  // By type
  const byTypeMap = new Map<string, { amount: number; count: number }>()
  for (const r of deductionRows) {
    const name = r.supplier_oper_name ?? 'Неизвестно'
    const cur = byTypeMap.get(name) ?? { amount: 0, count: 0 }
    byTypeMap.set(name, { amount: cur.amount + rowAmount(r), count: cur.count + 1 })
  }
  const byType = [...byTypeMap.entries()]
    .map(([name, v]) => ({ name, ...v, pct: kpiTotal > 0 ? (v.amount / kpiTotal) * 100 : 0 }))
    .sort((a, b) => b.amount - a.amount)

  // By week
  const byWeekMap = new Map<string, { penalties: number; storage: number; acceptance: number; other: number }>()
  for (const r of deductionRows) {
    if (!r.date_from) continue
    const week = isoWeek(r.date_from)
    const cur = byWeekMap.get(week) ?? { penalties: 0, storage: 0, acceptance: 0, other: 0 }
    const cat = categorize(r.supplier_oper_name)
    cur[cat] += rowAmount(r)
    byWeekMap.set(week, cur)
  }
  const byWeek = [...byWeekMap.entries()]
    .map(([week, v]) => ({
      week,
      penalties: v.penalties,
      storage: v.storage,
      acceptance: v.acceptance,
      other: v.other,
      total: v.penalties + v.storage + v.acceptance + v.other,
    }))
    .sort((a, b) => a.week.localeCompare(b.week))

  // Detail rows (limit 500)
  const detail = deductionRows.slice(0, 500).map(r => ({
    rrd_id: r.rrd_id,
    date: r.date_from,
    supplier_oper_name: r.supplier_oper_name ?? '',
    category: categorize(r.supplier_oper_name),
    nm_id: r.nm_id,
    sa_name: r.sa_name ?? '',
    amount: rowAmount(r),
  }))

  return NextResponse.json({ kpi: { ...kpi, total: kpiTotal }, byType, byWeek, detail })
}
