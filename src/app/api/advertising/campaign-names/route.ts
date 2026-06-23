import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { adminDb } from '@/lib/admin'
import { getUserStoreIds } from '@/lib/queries'

// PATCH /api/advertising/campaign-names
// Body: { updates: [{ campaign_id: number, name: string }] }
export async function PATCH(req: NextRequest) {
  const db = await createClient()
  const { data: { user } } = await db.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const storeIds = await getUserStoreIds(user.id)
  if (!storeIds.length) return NextResponse.json({ error: 'No store' }, { status: 404 })

  const body = await req.json() as { updates?: { campaign_id: number; name: string }[] }
  const updates = body.updates ?? []
  if (!updates.length) return NextResponse.json({ updated: 0 })

  const adb = adminDb()
  let updated = 0
  const errors: string[] = []

  for (const { campaign_id, name } of updates) {
    if (!campaign_id || !name?.trim()) continue
    // Update all rows for this campaign_id across all stores of this user
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (adb.from('wb_ad_spend') as any)
      .update({ campaign_name: name.trim() })
      .in('store_id', storeIds)
      .eq('campaign_id', campaign_id)

    if (error) errors.push(`${campaign_id}: ${error.message}`)
    else updated++
  }

  return NextResponse.json({ updated, errors: errors.length ? errors : undefined })
}
