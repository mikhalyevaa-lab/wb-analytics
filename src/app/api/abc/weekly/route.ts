import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { getUserStoreIds } from '@/lib/queries'
import { adminDb } from '@/lib/admin'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const db = await createClient()
  const { data: { user } } = await db.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const storeIds = await getUserStoreIds(user.id)
  if (!storeIds.length) return NextResponse.json({ weeks: [] })

  const url = req.nextUrl
  const nmId    = Number(url.searchParams.get('nm_id'))
  const dateFrom = url.searchParams.get('from') ?? ''
  const dateTo   = url.searchParams.get('to') ?? ''
  if (!nmId) return NextResponse.json({ weeks: [] })

  const adb = adminDb()
  type SaleRow = { date: string; finished_price: number }
  const { data: sales } = await (adb
    .from('wb_sales')
    .select('date,finished_price')
    .in('store_id', storeIds)
    .eq('nm_id', nmId)
    .like('sale_id', 'S%')
    .gte('date', dateFrom)
    .lte('date', dateTo + 'T23:59:59')
    .limit(5000) as unknown as Promise<{ data: SaleRow[] | null }>)

  if (!sales?.length) return NextResponse.json({ weeks: [] })

  // Group by ISO week (Mon–Sun)
  const weekMap = new Map<string, { revenue: number; orders: number }>()
  for (const s of sales) {
    const d = new Date(s.date)
    const day = d.getDay() === 0 ? 6 : d.getDay() - 1
    const mon = new Date(d)
    mon.setDate(d.getDate() - day)
    const key = mon.toISOString().slice(5, 10)
    const prev = weekMap.get(key) ?? { revenue: 0, orders: 0 }
    weekMap.set(key, { revenue: prev.revenue + (s.finished_price ?? 0), orders: prev.orders + 1 })
  }

  const weeks = [...weekMap.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([week, v]) => ({ week, revenue: Math.round(v.revenue), orders: v.orders }))

  return NextResponse.json({ weeks })
}
