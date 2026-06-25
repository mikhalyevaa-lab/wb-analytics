import { adminDb } from '@/lib/db-compat'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-server'
import { getUserStoreIds } from '@/lib/queries'

export async function GET(req: NextRequest) {
  const user = await requireAuth().catch(() => null)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const storeIds = await getUserStoreIds(user.id)
  if (!storeIds.length) return NextResponse.json({ error: 'No store' }, { status: 404 })
  const storeId = storeIds[0]

  const { searchParams } = new URL(req.url)
  const search = searchParams.get('search') ?? ''
  const page = Math.max(1, Number(searchParams.get('page') ?? '1'))
  const limit = Math.min(100, Number(searchParams.get('limit') ?? '20'))
  const offset = (page - 1) * limit

  const adb = adminDb()

  let query = adb.from('wb_weekly_reports')
    .select('*', { count: 'exact' })
    .eq('store_id', storeId)
    .gte('date_from', '2026-01-01')
    .order('date_to', { ascending: false })
    .range(offset, offset + limit - 1)

  if (search) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    query = (query as any).ilike('report_number::text', `%${search}%`)
  }

  const { data, count, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const { data: lastRow } = await adb.from('wb_weekly_reports')
    .select('date_to')
    .eq('store_id', storeId)
    .order('date_to', { ascending: false })
    .limit(1)
    .single()

  return NextResponse.json({
    reports: data ?? [],
    total: count ?? 0,
    lastDate: (lastRow as { date_to: string | null } | null)?.date_to ?? null,
  })
}
