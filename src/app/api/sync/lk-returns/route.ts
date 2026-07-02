import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-server'
import { getUserStoreIds } from '@/lib/queries'
import { db } from '@/lib/db'
import { syncLkReturnsForStore } from '@/lib/sync'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth().catch(() => null)
    console.log('[lk-returns] user:', user?.id ?? 'null')
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const storeIds = await getUserStoreIds(user.id)
    console.log('[lk-returns] storeIds:', storeIds)
    if (!storeIds.length) return NextResponse.json({ error: 'No stores' }, { status: 400 })

    const stores = await db<{ id: string; name: string; wb_token: string }[]>`
      SELECT id, name, wb_token FROM stores WHERE id = ANY(${storeIds})
    `
    console.log('[lk-returns] stores found:', stores.length, stores.map(s => s.name))
    if (!stores.length) return NextResponse.json({ error: 'No stores found' }, { status: 404 })

    const results: Record<string, unknown> = {}
    for (const store of stores) {
      console.log('[lk-returns] syncing store:', store.name)
      results[store.name] = await syncLkReturnsForStore(store)
      console.log('[lk-returns] result:', results[store.name])
    }

    return NextResponse.json({ ok: true, results })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[lk-returns] unhandled error:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
