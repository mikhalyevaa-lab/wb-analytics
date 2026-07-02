import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-server'
import { getUserStoreIds } from '@/lib/queries'
import { syncStore } from '@/lib/sync'
import { adminDb } from '@/lib/db-compat'

export async function POST(req: NextRequest) {
  const user = await requireAuth().catch(() => null)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const storeIds = await getUserStoreIds(user.id)
  if (!storeIds.length) return NextResponse.json({ error: 'No stores' }, { status: 400 })

  const { data: stores } = await adminDb()
    .from('stores')
    .select('id, name, wb_token')
    .in('id', storeIds)

  if (!stores?.length) return NextResponse.json({ error: 'No stores found' }, { status: 404 })

  const results: Record<string, unknown> = {}
  for (const store of stores) {
    const result = await syncStore(store as { id: string; name: string; wb_token: string; wb_analytics_token: string | null })
    results[store.name] = result
  }

  return NextResponse.json({ ok: true, results })
}
