import { adminDb } from '@/lib/db-compat'
import { NextResponse } from 'next/server'

// Runs daily. Creates tasks for products with < 15 days of stock.
// Deduplication: skips if open task with same nm_id + "Пустой склад" text exists.

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(req: Request) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const adb = adminDb()

  // 1. Get all stores
  const { data: storesRaw } = await adb.from('stores').select('id').limit(100)
  const storeIds = ((storesRaw ?? []) as { id: string }[]).map(s => s.id)
  if (!storeIds.length) return NextResponse.json({ created: 0 })

  // 2. Sales speed: last 30 days "Продажа" per nm_id per store
  const dateFrom = new Date(); dateFrom.setDate(dateFrom.getDate() - 30)
  const dateFromStr = dateFrom.toISOString().split('T')[0]

  const { data: salesRows } = await adb
    .from('wb_finance')
    .select('store_id, nm_id, quantity')
    .in('store_id', storeIds)
    .eq('supplier_oper_name', 'Продажа')
    .gte('date_from', dateFromStr)
    .limit(200000)

  // Map: storeId → nm_id → total_sold_30d
  type SalesKey = `${string}:${number}`
  const salesMap = new Map<SalesKey, number>()
  for (const r of (salesRows ?? []) as { store_id: string; nm_id: number | null; quantity: number | null }[]) {
    if (!r.nm_id || !r.store_id) continue
    const key: SalesKey = `${r.store_id}:${r.nm_id}`
    salesMap.set(key, (salesMap.get(key) ?? 0) + (r.quantity ?? 0))
  }

  // 3. Current stocks per store + nm_id
  const { data: stockRows } = await adb
    .from('wb_stocks')
    .select('store_id, nm_id, quantity_full')
    .in('store_id', storeIds)
    .limit(50000)

  const stockMap = new Map<SalesKey, number>()
  for (const s of (stockRows ?? []) as { store_id: string; nm_id: number; quantity_full: number | null }[]) {
    const key: SalesKey = `${s.store_id}:${s.nm_id}`
    stockMap.set(key, (stockMap.get(key) ?? 0) + (s.quantity_full ?? 0))
  }

  // 4. Products meta
  const { data: products } = await adb
    .from('products')
    .select('store_id, nm_id, vendor_code, photo_url, title')
    .in('store_id', storeIds)
    .limit(10000)

  // 5. Existing open "Пустой склад" tasks (deduplicate)
  const { data: existingTasks } = await adb
    .from('tasks')
    .select('store_id, nm_id')
    .in('store_id', storeIds)
    .neq('status', 'done')
    .ilike('title', '%Пустой склад%')
    .limit(5000)

  const existingSet = new Set<SalesKey>()
  for (const t of (existingTasks ?? []) as { store_id: string; nm_id: number | null }[]) {
    if (t.store_id && t.nm_id) existingSet.add(`${t.store_id}:${t.nm_id}`)
  }

  // 6. Find products with days_of_stock < 15
  const toCreate: { store_id: string; nm_id: number; vendor_code: string | null; photo_url: string | null; title: string | null }[] = []

  for (const p of (products ?? []) as { store_id: string; nm_id: number; vendor_code: string | null; photo_url: string | null; title: string | null }[]) {
    const key: SalesKey = `${p.store_id}:${p.nm_id}`
    if (existingSet.has(key)) continue // already has open task

    const totalSold = salesMap.get(key) ?? 0
    const stock = stockMap.get(key) ?? 0
    if (totalSold === 0) continue // no sales → can't compute days

    const salesPerDay = totalSold / 30
    const daysOfStock = stock / salesPerDay

    if (daysOfStock < 15) {
      toCreate.push(p)
    }
  }

  if (!toCreate.length) return NextResponse.json({ created: 0 })

  // 7. Insert tasks
  const rows = toCreate.map(p => ({
    store_id: p.store_id,
    nm_id: p.nm_id,
    title: `Пустой склад раньше чем через 15 дней — ${p.nm_id} — ${p.vendor_code ?? ''}`,
    description: p.photo_url ? `Фото: ${p.photo_url}` : null,
    status: 'todo',
    priority: 'critical',
  }))

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await adb.from('tasks').insert(rows as any)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ created: rows.length })
}
