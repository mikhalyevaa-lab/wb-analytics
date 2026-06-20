import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { getUserStoreIds } from '@/lib/queries'

interface CostRow { nm_id: number; cost_price: number }

export async function POST(req: NextRequest) {
  const db = await createClient()
  const { data: { user } } = await db.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const storeIds = await getUserStoreIds(user.id)
  if (!storeIds.length) return NextResponse.json({ error: 'No stores' }, { status: 403 })

  const { rows }: { rows: CostRow[] } = await req.json()
  if (!Array.isArray(rows) || rows.length === 0) {
    return NextResponse.json({ error: 'Empty rows' }, { status: 400 })
  }

  const valid = rows.filter(r => Number.isFinite(r.nm_id) && Number.isFinite(r.cost_price) && r.cost_price > 0)
  if (!valid.length) return NextResponse.json({ error: 'No valid rows' }, { status: 400 })

  // Update only products belonging to user's stores
  let updated = 0
  for (const r of valid) {
    const { error } = await db.from('products')
      .update({ cost_price: r.cost_price })
      .eq('nm_id', r.nm_id)
      .in('store_id', storeIds)
    if (!error) updated++
  }

  return NextResponse.json({ updated, total: valid.length })
}
