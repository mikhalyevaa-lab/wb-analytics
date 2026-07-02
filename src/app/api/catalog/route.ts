import { adminDb } from '@/lib/db-compat'
import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-server'

export async function GET() {
  const user = await requireAuth().catch(() => null)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: stores } = await adminDb().from('user_stores').select('store_id').eq('user_id', user.id)
  const storeIds = (stores ?? []).map((s: { store_id: string }) => s.store_id)

  // Два отдельных запроса — db-compat не поддерживает JOIN/relationship-синтаксис
  const [{ data: products, error }, { data: groups }] = await Promise.all([
    adminDb()
      .from('products')
      .select('nm_id, vendor_code, brand, title, subject_name, color, photo_url, cost_price, group_id, current_stock, avg_price_before_spp, avg_price_after_spp, avg_orders_per_day, buyout_rate, store_id')
      .in('store_id', storeIds)
      .order('nm_id'),
    adminDb()
      .from('product_groups')
      .select('id, name, color')
      .in('store_id', storeIds),
  ])

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Присоединяем группу к каждому товару
  const groupMap = new Map((groups ?? []).map((g: { id: string; name: string; color: string }) => [g.id, g]))
  const result = (products ?? []).map((p: { group_id: string | null; [key: string]: unknown }) => ({
    ...p,
    product_groups: p.group_id ? (groupMap.get(p.group_id) ?? null) : null,
  }))

  return NextResponse.json(result)
}
