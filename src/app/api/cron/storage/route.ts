import { NextResponse } from 'next/server'
import { adminDb } from '@/lib/admin'
import { syncPaidStoragePeriod } from '@/lib/sync'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function GET(req: Request) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const adb = adminDb()
  const { data: storesRaw } = await (adb.from('stores') as any)
    .select('id, name, wb_analytics_token')
    .not('wb_analytics_token', 'is', null)
    .limit(50)

  const stores = (storesRaw ?? []) as { id: string; name: string }[]
  if (!stores.length) return NextResponse.json({ ok: true, message: 'no stores with analytics token' })

  const today = new Date().toISOString().split('T')[0]
  const from3 = new Date(Date.now() - 3 * 86400000).toISOString().split('T')[0]
  const results: Record<string, number> = {}

  for (const store of stores) {
    try {
      const { inserted } = await syncPaidStoragePeriod(store.id, from3, today)
      results[store.name] = inserted
    } catch (err) {
      console.error(`[cron/storage] ${store.name}:`, err)
      results[store.name] = -1
    }
  }

  return NextResponse.json({ ok: true, results })
}
