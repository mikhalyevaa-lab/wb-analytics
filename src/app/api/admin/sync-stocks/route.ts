import { NextResponse } from 'next/server'
import { adminDb } from '@/lib/admin'
import { createWBClient } from '@/lib/wb-api'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

function createAdminSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

export async function POST(req: Request) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const adb = adminDb()
  const { data: storesRaw } = await adb.from('stores').select('id, name, wb_token').limit(50)
  const stores = (storesRaw ?? []) as { id: string; name: string; wb_token: string }[]
  if (!stores.length) return NextResponse.json({ error: 'no stores' }, { status: 404 })

  const db = createAdminSupabase()
  const today = new Date().toISOString().split('T')[0]
  const results: Record<string, { count: number; error?: string }> = {}

  for (const store of stores) {
    try {
      const wb = createWBClient(store.wb_token)
      const stocks = await wb.getStocks('2000-01-01')
      if (!stocks?.length) { results[store.name] = { count: 0 }; continue }

      // Удаляем сегодняшний снапшот и пишем свежий
      await db.from('wb_stocks').delete().eq('store_id', store.id).eq('date', today)

      const rows = stocks.map(s => ({
        store_id:               store.id,
        date:                   today,
        last_change_date:       s.lastChangeDate,
        supplier_article:       s.supplierArticle,
        tech_size:              s.techSize,
        barcode:                s.barcode,
        quantity:               s.quantity,
        quantity_full:          s.quantityFull,
        quantity_not_in_orders: s.quantityNotInOrders,
        warehouse:              s.warehouseName,
        nm_id:                  s.nmId,
        subject:                s.subject,
        category:               s.category,
        brand:                  s.brand,
        price:                  s.Price,
        discount:               s.Discount,
      }))

      let total = 0
      for (let i = 0; i < rows.length; i += 500) {
        const { error, count } = await db.from('wb_stocks').insert(rows.slice(i, i + 500))
        if (error) throw error
        total += count || 500
      }
      results[store.name] = { count: total }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      results[store.name] = { count: 0, error: msg }
    }
  }

  return NextResponse.json({ ok: true, date: today, results })
}
