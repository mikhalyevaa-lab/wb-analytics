import { adminDb } from '@/lib/db-compat'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-server'
import { getUserStoreIds } from '@/lib/queries'
import * as XLSX from 'xlsx'

function getISOWeek(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  const day = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - day)
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)
}

function currentISOWeek(): { week: number; year: number } {
  const now = new Date()
  const week = getISOWeek(now)
  const d = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()))
  const day = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - day)
  return { week, year: d.getUTCFullYear() }
}

function parseWeekLabel(label: string): { week: number; year: number } | null {
  const m = String(label).trim().match(/^(\d+)\s*\((\d+)\)$/)
  if (!m) return null
  const week = parseInt(m[1], 10)
  const yr = parseInt(m[2], 10)
  const year = yr < 100 ? 2000 + yr : yr
  if (week < 1 || week > 53) return null
  return { week, year }
}

export async function POST(req: NextRequest) {
  const user = await requireAuth().catch(() => null)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const storeIds = await getUserStoreIds(user.id)
  if (!storeIds.length) return NextResponse.json({ error: 'No store' }, { status: 404 })
  const storeId = storeIds[0]

  const formData = await req.formData()
  const file = formData.get('file') as File | null
  if (!file) return NextResponse.json({ error: 'No file' }, { status: 400 })

  const buf = Buffer.from(await file.arrayBuffer())
  const wb = XLSX.read(buf, { type: 'buffer' })
  const ws = wb.Sheets[wb.SheetNames[0]]
  const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: null })

  if (!raw.length) return NextResponse.json({ error: 'Файл пустой' }, { status: 400 })

  const cur = currentISOWeek()
  const errors: string[] = []
  const toInsert: {
    store_id: string
    week_label: string
    week_number: number
    year: number
    supplier_article: string | null
    nm_id: number | null
    orders_per_week: number
    orders_per_day: number
  }[] = []

  for (let i = 0; i < raw.length; i++) {
    const row = raw[i]
    const rowNum = i + 2

    const weekRaw = row['Неделя плана']
    const supplierArticle = row['Артикул поставщика'] ? String(row['Артикул поставщика']) : null
    const nmIdRaw = row['Артикул ВБ']
    const ordersWeekRaw = row['Заказы в неделю']
    const ordersDayRaw = row['Заказы в день']

    // Валидация недели
    if (!weekRaw) { errors.push(`Строка ${rowNum}: пустое поле «Неделя плана»`); continue }
    const parsed = parseWeekLabel(String(weekRaw))
    if (!parsed) {
      errors.push(`Строка ${rowNum}: неверный формат недели «${weekRaw}». Ожидается «21 (26)»`)
      continue
    }
    if (parsed.year < cur.year || (parsed.year === cur.year && parsed.week < cur.week)) {
      errors.push(`Строка ${rowNum}: неделя «${weekRaw}» уже прошла. Загружать план можно только на текущую или будущие недели`)
      continue
    }

    // Валидация заказов
    const ordersWeek = parseInt(String(ordersWeekRaw ?? ''), 10)
    const ordersDay = parseInt(String(ordersDayRaw ?? ''), 10)
    if (isNaN(ordersWeek) || ordersWeek < 0) {
      errors.push(`Строка ${rowNum}: «Заказы в неделю» должно быть целым числом ≥ 0`)
      continue
    }
    if (isNaN(ordersDay) || ordersDay < 0) {
      errors.push(`Строка ${rowNum}: «Заказы в день» должно быть целым числом ≥ 0`)
      continue
    }

    toInsert.push({
      store_id: storeId,
      week_label: String(weekRaw).trim(),
      week_number: parsed.week,
      year: parsed.year,
      supplier_article: supplierArticle,
      nm_id: nmIdRaw != null ? Number(nmIdRaw) : null,
      orders_per_week: ordersWeek,
      orders_per_day: ordersDay,
    })
  }

  if (errors.length > 0) {
    return NextResponse.json({ ok: false, errors }, { status: 422 })
  }

  const adb = adminDb()

  // Заменяем, а не суммируем: удаляем все строки по неделям из файла, затем вставляем новые
  const weeksInFile = [...new Set(toInsert.map(r => r.week_label))]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: delError } = await (adb.from('wb_sales_plan') as any)
    .delete()
    .eq('store_id', storeId)
    .in('week_label', weeksInFile)
  if (delError) return NextResponse.json({ ok: false, errors: [delError.message] }, { status: 500 })

  const CHUNK = 500
  let inserted = 0
  for (let i = 0; i < toInsert.length; i += CHUNK) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (adb.from('wb_sales_plan') as any)
      .insert(toInsert.slice(i, i + CHUNK))
    if (error) return NextResponse.json({ ok: false, errors: [error.message] }, { status: 500 })
    inserted += Math.min(CHUNK, toInsert.length - i)
  }

  return NextResponse.json({ ok: true, inserted })
}
