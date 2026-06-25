import { adminDb } from '@/lib/db-compat'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-server'
import { getUserStoreIds } from '@/lib/queries'
import { db as sql } from '@/lib/db'

// POST /api/tasks/check-storage-volume
// Сравнивает объём из карточки товара с объёмом в отчёте по платному хранению.
// При расхождении создаёт задачу: одна задача = один артикул + одна дата.
// Расхождение: |volume_storage - volume_card| / volume_card > 1% (исключаем погрешность округления)

const VOLUME_TOLERANCE = 0.01 // 1% допуск

export async function POST(req: NextRequest) {
  const user = await requireAuth().catch(() => null)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const storeIds = await getUserStoreIds(user.id)
  if (!storeIds.length) return NextResponse.json({ error: 'No store' }, { status: 404 })

  const body = await req.json().catch(() => ({}))
  // Опциональные фильтры: dateFrom, dateTo, nmId
  const dateFrom: string | null = body.dateFrom ?? null
  const dateTo: string | null = body.dateTo ?? null

  const storeId = storeIds[0]

  // Получаем строки хранения с объёмом, у которых есть карточка товара
  const mismatches = await sql<{
    nm_id: number
    vendor_code: string | null
    date: string
    storage_volume: number
    card_volume: number
    photo_url: string | null
  }[]>`
    SELECT
      s.nm_id,
      s.vendor_code,
      s.date::text,
      s.volume            AS storage_volume,
      p.volume_liters     AS card_volume,
      p.photo_url
    FROM wb_storage_daily s
    JOIN products p ON p.store_id = s.store_id AND p.nm_id = s.nm_id
    WHERE s.store_id = ${storeId}
      AND s.volume IS NOT NULL
      AND s.volume > 0
      AND p.volume_liters IS NOT NULL
      AND p.volume_liters > 0
      ${dateFrom ? sql`AND s.date >= ${dateFrom}::date` : sql``}
      ${dateTo   ? sql`AND s.date <= ${dateTo}::date`   : sql``}
      AND ABS(s.volume - p.volume_liters) / p.volume_liters > ${VOLUME_TOLERANCE}
    ORDER BY s.date DESC, s.nm_id
  `

  if (!mismatches.length) {
    return NextResponse.json({ created: 0, message: 'Расхождений не найдено' })
  }

  const adb = adminDb()

  // Проверяем уже существующие задачи по этому типу (is_auto + trigger_type)
  // чтобы не дублировать
  const { data: existingTasks } = await adb
    .from('tasks')
    .select('nm_id, description')
    .eq('store_id', storeId)
    .eq('is_auto', true)
    .eq('trigger_type', 'storage_volume_mismatch')

  // Ключ существующей задачи: nm_id + дата из description (ищем паттерн)
  const existingKeys = new Set<string>(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (existingTasks ?? []).map((t: any) => {
      const dateMatch = t.description?.match(/Дата хранения: (\d{4}-\d{2}-\d{2})/)
      return `${t.nm_id}_${dateMatch?.[1] ?? ''}`
    })
  )

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const toCreate = mismatches.filter((m: any) => !existingKeys.has(`${m.nm_id}_${m.date}`))

  if (!toCreate.length) {
    return NextResponse.json({ created: 0, message: 'Все задачи уже созданы ранее' })
  }

  // Строим задачи
  const tasks = toCreate.map(m => {
    const diff = ((m.storage_volume - m.card_volume) / m.card_volume * 100).toFixed(1)
    const sign = Number(diff) > 0 ? '+' : ''

    return {
      store_id: storeId,
      nm_id: m.nm_id,
      title: `Объём расходится: арт. ${m.nm_id}${m.vendor_code ? ` / ${m.vendor_code}` : ''} — ${m.date}`,
      description: [
        `Артикул WB: ${m.nm_id}`,
        m.vendor_code ? `Артикул поставщика: ${m.vendor_code}` : null,
        m.photo_url ? `Фото: ${m.photo_url}` : null,
        `Объём в карточке: ${m.card_volume} л`,
        `Объём в отчёте хранения: ${m.storage_volume} л (${sign}${diff}%)`,
        `Дата хранения: ${m.date}`,
        ``,
        `Проверьте габариты товара в карточке WB. Расхождение объёма влияет на стоимость хранения.`,
      ].filter(l => l !== null).join('\n'),
      status: 'in_progress',
      priority: Math.abs(Number(diff)) > 20 ? 'high' : 'medium',
      is_auto: true,
      trigger_type: 'storage_volume_mismatch',
      created_by: user.id,
    }
  })

  // Вставляем пачками по 100
  let created = 0
  for (let i = 0; i < tasks.length; i += 100) {
    const chunk = tasks.slice(i, i + 100)
    const { error } = await adb.from('tasks').insert(chunk)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    created += chunk.length
  }

  return NextResponse.json({
    created,
    total_mismatches: mismatches.length,
    message: `Создано ${created} задач по расхождению объёмов`,
  })
}

// GET — только статистика расхождений без создания задач
export async function GET(req: NextRequest) {
  const user = await requireAuth().catch(() => null)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const storeIds = await getUserStoreIds(user.id)
  if (!storeIds.length) return NextResponse.json({ error: 'No store' }, { status: 404 })

  const storeId = storeIds[0]
  const params = req.nextUrl.searchParams
  const dateFrom = params.get('dateFrom')
  const dateTo = params.get('dateTo')

  const rows = await sql<{
    nm_id: number
    vendor_code: string | null
    date: string
    storage_volume: number
    card_volume: number
    diff_pct: number
    photo_url: string | null
  }[]>`
    SELECT
      s.nm_id,
      s.vendor_code,
      s.date::text,
      s.volume                                                        AS storage_volume,
      p.volume_liters                                                 AS card_volume,
      ROUND(((s.volume - p.volume_liters) / p.volume_liters * 100)::numeric, 1) AS diff_pct,
      p.photo_url
    FROM wb_storage_daily s
    JOIN products p ON p.store_id = s.store_id AND p.nm_id = s.nm_id
    WHERE s.store_id = ${storeId}
      AND s.volume IS NOT NULL AND s.volume > 0
      AND p.volume_liters IS NOT NULL AND p.volume_liters > 0
      ${dateFrom ? sql`AND s.date >= ${dateFrom}::date` : sql``}
      ${dateTo   ? sql`AND s.date <= ${dateTo}::date`   : sql``}
      AND ABS(s.volume - p.volume_liters) / p.volume_liters > ${VOLUME_TOLERANCE}
    ORDER BY ABS(s.volume - p.volume_liters) / p.volume_liters DESC
    LIMIT 200
  `

  return NextResponse.json({ count: rows.length, rows })
}
