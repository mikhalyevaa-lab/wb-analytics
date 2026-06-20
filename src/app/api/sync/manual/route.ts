import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { getUserStoreIds } from '@/lib/queries'
import { syncStore } from '@/lib/sync'
import { createClient as createAdminClient } from '@supabase/supabase-js'

export async function POST(req: NextRequest) {
  const db = await createClient()
  const { data: { user } } = await db.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const storeIds = await getUserStoreIds(user.id)
  if (!storeIds.length) return NextResponse.json({ error: 'No stores' }, { status: 400 })

  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  const { data: stores } = await admin
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
