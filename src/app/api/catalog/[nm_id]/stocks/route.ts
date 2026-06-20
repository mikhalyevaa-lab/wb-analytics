import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { getUserStoreIds } from '@/lib/queries'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ nm_id: string }> }
) {
  const { nm_id } = await params
  const nmId = parseInt(nm_id, 10)
  if (isNaN(nmId)) return NextResponse.json({ error: 'Invalid nm_id' }, { status: 400 })

  const db = await createClient()
  const { data: { user } } = await db.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const storeIds = await getUserStoreIds(user.id)
  if (!storeIds.length) return NextResponse.json([])

  const { data: latestRow } = await db
    .from('wb_stocks')
    .select('date')
    .in('store_id', storeIds)
    .eq('nm_id', nmId)
    .order('date', { ascending: false })
    .limit(1)
    .single()

  if (!latestRow?.date) return NextResponse.json([])

  const { data: rows } = await db
    .from('wb_stocks')
    .select('tech_size, quantity')
    .in('store_id', storeIds)
    .eq('nm_id', nmId)
    .eq('date', latestRow.date)

  const bySize: Record<string, number> = {}
  for (const r of rows ?? []) {
    const size = r.tech_size || '—'
    bySize[size] = (bySize[size] ?? 0) + (r.quantity ?? 0)
  }

  const result = Object.entries(bySize)
    .map(([size, qty]) => ({ size, qty }))
    .sort((a, b) => a.size.localeCompare(b.size, 'ru'))

  return NextResponse.json(result)
}
