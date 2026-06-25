// @ts-nocheck
import { adminDb } from '@/lib/db-compat'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-server'
import { getUserStoreIds } from '@/lib/queries'
import * as XLSX from 'xlsx'

function getISOWeek(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  const day = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - day)
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)
}

function formatWeek(date: Date): string {
  const week = getISOWeek(date)
  const year = date.getFullYear() % 100
  return `${week} (${String(year).padStart(2, '0')})`
}

export async function GET(_req: NextRequest) {
  const user = await requireAuth().catch(() => null)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const storeIds = await getUserStoreIds(user.id)

  const { data: products } = await adminDb()
    .from('products')
    .select('nm_id, vendor_code')
    .in('store_id', storeIds)
    .order('vendor_code')

  const now = new Date()
  const monday = new Date(now)
  monday.setDate(now.getDate() - ((now.getDay() + 6) % 7))

  const weeks = Array.from({ length: 8 }, (_, i) => {
    const d = new Date(monday)
    d.setDate(monday.getDate() + i * 7)
    return formatWeek(d)
  })

  const currentWeek = weeks[0]
  const rows = (products ?? []).map(p => ({
    'Неделя плана': currentWeek,
    'Артикул поставщика': (p as { nm_id: number; vendor_code: string | null }).vendor_code ?? '',
    'Артикул ВБ': p.nm_id ?? '',
    'Заказы в неделю': 0,
    'Заказы в день': 0,
  }))

  const weekRef = weeks.map(w => ({ 'Доступные недели': w }))

  const wb = XLSX.utils.book_new()
  const ws = XLSX.utils.json_to_sheet(rows)
  ws['!cols'] = [{ wch: 14 }, { wch: 22 }, { wch: 14 }, { wch: 18 }, { wch: 16 }]
  XLSX.utils.book_append_sheet(wb, ws, 'План продаж')

  const wsRef = XLSX.utils.json_to_sheet(weekRef)
  wsRef['!cols'] = [{ wch: 18 }]
  XLSX.utils.book_append_sheet(wb, wsRef, 'Недели')

  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })
  return new NextResponse(buf, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="sales_plan_template.xlsx"',
    },
  })
}
