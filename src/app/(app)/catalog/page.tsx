import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase-server'
import { getUserStoreIds, getStores } from '@/lib/queries'
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

  const [{ data: products }, { data: groups }, { data: colSettings }, { data: lastSync }] = await Promise.all([
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
  ])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Справочник товаров</h1>
        <span className="text-sm text-muted-foreground">{products?.length ?? 0} артикулов</span>
      </div>
      <CatalogTable
        products={(products ?? []).map(p => ({
          ...p,
          product_groups: Array.isArray(p.product_groups) ? p.product_groups[0] ?? null : (p.product_groups ?? null),
        }))}
        groups={groups ?? []}
        savedColumns={colSettings?.columns ?? null}
        storeId={storeId ?? ''}
        syncedAt={lastSync?.updated_at ?? undefined}
      />
    </div>
  )
}
