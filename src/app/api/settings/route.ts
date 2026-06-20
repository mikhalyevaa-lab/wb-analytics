import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase-server'

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export async function PATCH(req: NextRequest) {
  const db = await createServerClient()
  const { data: { user } } = await db.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { store_id, store_name, wb_token, telegram_chat_id } = body

  if (!store_id) return NextResponse.json({ error: 'Missing store_id' }, { status: 400 })

  const { data: membership } = await db
    .from('user_stores')
    .select('store_id')
    .eq('user_id', user.id)
    .eq('store_id', store_id)
    .single()

  if (!membership) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const admin = adminClient()

  if (store_name !== undefined || wb_token !== undefined) {
    const updates: Record<string, unknown> = {}
    if (store_name !== undefined) updates.name = store_name
    if (wb_token !== undefined) updates.wb_token = wb_token

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
