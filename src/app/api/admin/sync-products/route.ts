import { adminDb } from '@/lib/db-compat'
import { NextResponse } from 'next/server'
import { createWBClient } from '@/lib/wb-api'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

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
  const results: Record<string, { count: number; error?: string }> = {}

  for (const store of stores) {
    try {
      const wb = createWBClient(store.wb_token)
      let cursor: { updatedAt?: string; nmID?: number } | undefined
      let total = 0

      while (true) {
        const res = await wb.getProducts(cursor)
        if (!res?.cards?.length) break

        const rows = res.cards.map((p: any) => {
          const colorChar = p.characteristics?.find((c: any) =>
            c.name.toLowerCase().includes('цвет') || c.name.toLowerCase() === 'color'
          )
          return {
            store_id:    store.id,
            nm_id:       p.nmID,
            imt_id:      p.imtID,
            vendor_code: p.vendorCode,
            brand:       p.brand,
            title:       p.title,
            subject_id:  p.subjectID,
            subject_name: p.subjectName,
            photo_url:   p.photos?.[0]?.c246x328 ?? null,
            color:       colorChar?.value?.[0] ?? null,
            length_mm:   p.dimensions?.length ?? null,
            width_mm:    p.dimensions?.width ?? null,
            height_mm:   p.dimensions?.height ?? null,
            updated_at:  p.updatedAt,
          }
        })

        const { error, count } = await adminDb()
    .from('products')
          .upsert(rows, { onConflict: 'store_id,nm_id' })
        if (error) throw error
        total += count || rows.length

        if (res.cursor.total < 100) break
        cursor = { updatedAt: res.cursor.updatedAt, nmID: res.cursor.nmID }
        await new Promise(r => setTimeout(r, 500))
      }

      results[store.name] = { count: total }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      results[store.name] = { count: 0, error: msg }
    }
  }

  return NextResponse.json({ ok: true, results })
}
