import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { getUserStoreIds } from '@/lib/queries'
import { adminDb } from '@/lib/admin'

// Специализированный импорт файла wb_orders с барокодами, размерами, srid
// Уникальный ключ: store_id + g_number + nm_id + barcode + date

const CHUNK = 500

export async function POST(req: NextRequest) {
  const db = await createClient()
  const { data: { user } } = await db.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const storeIds = await getUserStoreIds(user.id)
  if (!storeIds.length) return NextResponse.json({ error: 'No store' }, { status: 404 })
  const storeId = storeIds[0]

  const adb = adminDb()
  const body = await req.json() as { rows: Record<string, unknown>[] }
  const { rows } = body
  if (!rows?.length) return NextResponse.json({ error: 'No rows' }, { status: 400 })

  // Build dedup set from existing data (g_number + nm_id + barcode + date)
  const { data: existing } = await adb
    .from('wb_orders')
    .select('g_number, nm_id, barcode, date')
    .eq('store_id', storeId)
    .limit(500000)

  const existingSet = new Set<string>()
  for (const r of (existing ?? []) as { g_number: string | null; nm_id: number | null; barcode: string | null; date: string | null }[]) {
    existingSet.add(`${r.g_number}|${r.nm_id}|${r.barcode}|${r.date?.slice(0, 10)}`)
  }

  const toInsert: Record<string, unknown>[] = []
  let skipped = 0
  let errors = 0

  for (const r of rows) {
    // Barcode: Excel сохраняет как float (2.03874E+12) → преобразуем в строку
    const barcodeRaw = r['barcode']
    const barcode = barcodeRaw != null
      ? String(Math.round(Number(barcodeRaw)))
      : null

    const gNumber  = String(r['gNumber'] ?? r['g_number'] ?? '').trim()
    const nmId     = Number(r['nmId'] ?? r['nm_id']) || null
    const dateRaw  = String(r['date'] ?? '').slice(0, 10)

    if (!gNumber || !nmId || !dateRaw) { errors++; continue }

    const deduKey = `${gNumber}|${nmId}|${barcode}|${dateRaw}`
    if (existingSet.has(deduKey)) { skipped++; continue }
    existingSet.add(deduKey)

    // Цены: сохраняем без округления до целого (файл содержит точные значения)
    const totalPrice  = r['totalPrice']      != null ? Number(r['totalPrice'])      : null
    const discountPct = r['discountPercent'] != null ? Number(r['discountPercent']) : null

    // Цена до СПП = totalPrice × (1 − discountPercent / 100)
    const priceAfterDiscount = (totalPrice != null && discountPct != null)
      ? totalPrice * (1 - discountPct / 100)
      : null

    // Цена заказа из файла = цена после СПП (фактическая цена покупателя)
    const priceAfterSpp = r['Цена заказа'] != null ? Number(r['Цена заказа']) : null

    toInsert.push({
      store_id:             storeId,
      g_number:             gNumber,
      date:                 dateRaw + 'T' + (String(r['date'] ?? '').slice(11) || '00:00:00'),
      last_change_date:     r['lastChangeDate'] ?? r['last_change_date'] ?? null,
      supplier_article:     r['supplierArticle'] ?? r['supplier_article'] ?? null,
      nm_id:                nmId,
      barcode:              barcode,
      techsize:             r['techSize'] ?? r['tech_size'] ?? r['techsize'] ?? null,
      category:             r['category'] ?? null,
      subject:              r['subject']  ?? null,
      brand:                r['brand']    ?? null,
      income_id:            Number(r['incomeID'] ?? r['income_id']) || null,
      total_price:          totalPrice,
      discount_percent:     discountPct,
      is_cancel:            r['is_cancel'] === true || r['is_cancel'] === 'true' || r['is_cancel'] === '1',
      cancel_dt:            r['cancel_dt'] ?? null,
      srid:                 r['srid'] ? String(r['srid']) : null,
      price_after_discount: priceAfterDiscount,  // до СПП
      price_after_spp:      priceAfterSpp,        // после СПП (Цена заказа из файла)
      oblast:               r['oblast'] ?? null,
    })
  }

  let inserted = 0
  for (let i = 0; i < toInsert.length; i += CHUNK) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await adb.from('wb_orders').upsert(toInsert.slice(i, i + CHUNK) as any, {
      onConflict: 'store_id,g_number,nm_id,barcode,date',
      ignoreDuplicates: true,
    })
    if (error) {
      errors += CHUNK
      console.error('[import/wb-orders]', error.message)
    } else {
      inserted += toInsert.slice(i, i + CHUNK).length
    }
  }

  return NextResponse.json({ inserted, skipped, errors, total: rows.length })
}
