import { adminDb } from '@/lib/db-compat'
import { NextResponse } from 'next/server'
import { createWBClient, formatDateForWB, daysAgo } from '@/lib/wb-api'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

export async function POST(req: Request) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const adb = adminDb()
  const { data: storesRaw } = await adb.from('stores').select('id, name, wb_token').limit(50)
  const stores = (storesRaw ?? []) as { id: string; name: string; wb_token: string }[]
  if (!stores.length) return NextResponse.json({ error: 'no stores' }, { status: 404 })

  const results: Record<string, { count: number; error?: string }> = {}

  for (const store of stores) {
    try {
      const wb = createWBClient(store.wb_token)
      const dateFrom = formatDateForWB(daysAgo(7))
      const orders = await wb.getOrders(dateFrom, 0)
      if (!orders?.length) { results[store.name] = { count: 0 }; continue }

      const rows = orders.map(o => ({
        store_id:         store.id,
        g_number:         o.gNumber,
        date:             o.date,
        last_change_date: o.lastChangeDate,
        supplier_article: o.supplierArticle,
        nm_id:            o.nmId,
        barcode:          o.barcode,
        category:         o.category,
        subject:          o.subject,
        brand:            o.brand,
        techsize:         o.techSize,
        income_id:        o.incomeID,
        total_price:      o.totalPrice,
        discount_percent: o.discountPercent,
        is_cancel:        o.isCancel,
        cancel_dt:        o.cancel_dt || null,
        oblast:           o.oblast || null,
        srid:             o.srid || null,
      }))

      // Дедупликация по уникальному ключу — WB иногда отдаёт дубли в одной выгрузке
      const seen = new Set<string>()
      const deduped = rows.filter(r => {
        const key = `${r.g_number}|${r.nm_id}|${r.barcode}|${r.date?.slice(0, 10)}`
        if (seen.has(key)) return false
        seen.add(key)
        return true
      })

      let total = 0
      for (let i = 0; i < deduped.length; i += 500) {
        const { error, count } = await adminDb()
    .from('wb_orders')
          .upsert(deduped.slice(i, i + 500), { onConflict: 'store_id,g_number,nm_id,barcode,date' })
        if (error) throw error
        total += count || 500
      }
      results[store.name] = { count: total }
    } catch (e) {
      const msg = e instanceof Error ? e.message : JSON.stringify(e)
      console.error('[sync-orders]', msg)
      results[store.name] = { count: 0, error: msg }
    }
  }

  return NextResponse.json({ ok: true, results })
}
