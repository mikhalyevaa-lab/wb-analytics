import { adminDb } from '@/lib/db-compat'
import { requireAuth } from '@/lib/auth-server'
import { NextRequest, NextResponse } from 'next/server'

export async function PATCH(req: NextRequest) {
  const user = await requireAuth().catch(() => null)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { store_id, store_name, wb_token, wb_analytics_token, telegram_chat_id } = body

  if (!store_id) return NextResponse.json({ error: 'Missing store_id' }, { status: 400 })

  const { data: membership } = await adminDb()
    .from('user_stores')
    .select('store_id')
    .eq('user_id', user.id)
    .eq('store_id', store_id)
    .single()

  if (!membership) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const admin = adminDb()

  if (store_name !== undefined || wb_token !== undefined || wb_analytics_token !== undefined) {
    const updates: Record<string, unknown> = {}
    if (store_name !== undefined) updates.name = store_name
    if (wb_token !== undefined) updates.wb_token = wb_token
    if (wb_analytics_token !== undefined) updates.wb_analytics_token = wb_analytics_token || null

    const { error } = await admin.from('stores').update(updates).eq('id', store_id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (telegram_chat_id !== undefined) {
    const { error } = await admin
      .from('profiles')
      .update({ telegram_chat_id: telegram_chat_id || null })
      .eq('id', user.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
