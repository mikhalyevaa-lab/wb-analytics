import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { getUserStoreIds } from '@/lib/queries'
import { adminDb } from '@/lib/admin'

export async function GET(_req: NextRequest) {
  const db = await createClient()
  const { data: { user } } = await db.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const storeIds = await getUserStoreIds(user.id)
  if (!storeIds.length) return NextResponse.json({ rows: [] })

  const adb = adminDb()

  // Determine current ISO week for filtering
  const now = new Date()
  const d = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()))
  const day = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - day)
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  const curWeek = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)
  const curYear = d.getUTCFullYear()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (adb.from('wb_sales_plan') as any)
    .select('week_label,week_number,year,supplier_article,nm_id,orders_per_week,orders_per_day')
    .in('store_id', storeIds)
    .or(`year.gt.${curYear},and(year.eq.${curYear},week_number.gte.${curWeek})`)
    .order('year', { ascending: true })
    .order('week_number', { ascending: true })
    .order('supplier_article', { ascending: true })
    .limit(5000)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const rows = (data ?? []) as {
    week_label: string; week_number: number; year: number
    supplier_article: string | null; nm_id: number | null
    orders_per_week: number; orders_per_day: number
  }[]

  const needsEnrich = rows.some(r => !r.nm_id || !r.supplier_article)
  if (needsEnrich) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: prods } = await (adb.from('products') as any)
      .select('nm_id, vendor_code')
      .in('store_id', storeIds)
      .limit(10000)

    const byNmId = new Map<number, string>()
    const byVendor = new Map<string, number>()
    for (const p of (prods ?? [])) {
      if (p.nm_id) byNmId.set(p.nm_id, p.vendor_code ?? '')
      if (p.vendor_code) byVendor.set(p.vendor_code, p.nm_id)
    }

    for (const r of rows) {
      if (r.nm_id && !r.supplier_article) r.supplier_article = byNmId.get(r.nm_id) ?? null
      if (!r.nm_id && r.supplier_article) r.nm_id = byVendor.get(r.supplier_article) ?? null
    }
  }

  return NextResponse.json({ rows })
}
