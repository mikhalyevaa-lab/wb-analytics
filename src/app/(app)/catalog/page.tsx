import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase-server'
import { getUserStoreIds, getStores } from '@/lib/queries'
import { adminDb } from '@/lib/admin'
import { CatalogTable } from '@/components/catalog/catalog-table'

export const dynamic = 'force-dynamic'

export default async function CatalogPage() {
  const db = await createClient()
  const { data: { user } } = await db.auth.getUser()
  if (!user) redirect('/login')

  const storeIds = await getUserStoreIds(user.id)
  if (!storeIds.length) redirect('/dashboard')

  const stores = await getStores(storeIds)
  const storeId = stores[0]?.id

  const dateFrom30 = new Date(); dateFrom30.setDate(dateFrom30.getDate() - 30)
  const dateFrom30Str = dateFrom30.toISOString().split('T')[0]

  const [{ data: products }, { data: groups }, { data: colSettings }, { data: lastSync }, { data: salesRows }] = await Promise.all([
    db.from('products')
      .select('nm_id, vendor_code, brand, title, subject_name, color, photo_url, cost_price, group_id, current_stock, avg_price_before_spp, avg_price_after_spp, avg_orders_per_day, buyout_rate, product_groups(id, name, color)')
      .in('store_id', storeIds)
      .order('nm_id'),
    db.from('product_groups').select('*').in('store_id', storeIds).order('name'),
    db.from('user_column_settings')
      .select('columns')
      .eq('user_id', user.id)
      .eq('page', 'catalog')
      .single(),
    db.from('products')
      .select('updated_at')
      .in('store_id', storeIds)
      .order('updated_at', { ascending: false })
      .limit(1)
      .single(),
    // Скорость продаж: количество операций "Продажа" за последние 30 дней
    adminDb()
      .from('wb_finance')
      .select('nm_id, quantity')
      .in('store_id', storeIds)
      .eq('supplier_oper_name', 'Продажа')
      .gte('date_from', dateFrom30Str)
      .limit(100000),
  ])

  // Агрегируем продажи по nm_id → шт/день
  const salesMap = new Map<number, number>()
  for (const r of (salesRows ?? []) as { nm_id: number | null; quantity: number | null }[]) {
    if (!r.nm_id) continue
    salesMap.set(r.nm_id, (salesMap.get(r.nm_id) ?? 0) + (r.quantity ?? 0))
  }

  const todayStr = new Date().toISOString().split('T')[0]

  const enriched = (products ?? []).map(p => {
    const pg = Array.isArray(p.product_groups) ? p.product_groups[0] ?? null : (p.product_groups ?? null)
    const totalSales = salesMap.get(p.nm_id) ?? 0
    const salesPerDay = totalSales / 30
    const stock = p.current_stock ?? 0
    let days_of_stock: number | null = null
    let empty_date: string | null = null
    if (salesPerDay > 0 && stock > 0) {
      days_of_stock = Math.round(stock / salesPerDay)
      const d = new Date(); d.setDate(d.getDate() + days_of_stock)
      empty_date = d.toISOString().split('T')[0]
    } else if (salesPerDay === 0 && stock > 0) {
      days_of_stock = null // нет продаж → ∞
      empty_date = null
    } else {
      days_of_stock = 0
      empty_date = todayStr
    }
    return { ...p, product_groups: pg, days_of_stock, empty_date }
  })

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Справочник товаров</h1>
        <span className="text-sm text-muted-foreground">{products?.length ?? 0} артикулов</span>
      </div>
      <CatalogTable
        products={enriched}
        groups={groups ?? []}
        savedColumns={colSettings?.columns ?? null}
        storeId={storeId ?? ''}
        syncedAt={lastSync?.updated_at ?? undefined}
      />
    </div>
  )
}
