import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'

export async function GET() {
  const db = await createClient()
  const { data: { user } } = await db.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: stores } = await db.from('user_stores').select('store_id').eq('user_id', user.id)
  const storeIds = (stores ?? []).map(s => s.store_id)

  const { data, error } = await db
    .from('products')
    .select(`
      nm_id, vendor_code, brand, title, subject_name, color, photo_url,
      cost_price, group_id, current_stock,
      avg_price_before_spp, avg_price_after_spp, avg_orders_per_day, buyout_rate,
      store_id,
      product_groups(id, name, color)
    `)
    .in('store_id', storeIds)
    .order('nm_id')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
