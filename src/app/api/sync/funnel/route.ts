import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-server'
import { getUserStoreIds } from '@/lib/queries'
import { syncFunnelPeriod } from '@/lib/sync'

export const maxDuration = 300

export async function POST() {
  const user = await requireAuth().catch(() => null)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const storeIds = await getUserStoreIds(user.id)
  if (!storeIds.length) return NextResponse.json({ error: 'No store' }, { status: 404 })

  const moscowNow = new Date(Date.now() + 3 * 60 * 60 * 1000)
  const today = moscowNow.toISOString().split('T')[0]

  const results: Record<string, { count: number; days: number } | { error: string }> = {}
  for (const storeId of storeIds) {
    try {
      const result = await syncFunnelPeriod(storeId, today, today)
      results[storeId] = result
    } catch (err) {
      results[storeId] = { error: err instanceof Error ? err.message : String(err) }
    }
  }

  return NextResponse.json({ ok: true, date: today, results })
}
