import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-server'
import { adminDb } from '@/lib/db-compat'
import { getUserStoreIds } from '@/lib/queries'
import * as XLSX from 'xlsx'

export const dynamic = 'force-dynamic'

// Тарифы доступны только за последние 90 дней до 30.06.2026 → с 01.04.2026
const AVAILABLE_FROM = '2026-04-01'
const AVAILABLE_TO   = '2026-06-30'

// Дата из имени файла: "warehouse coefficients 2026-06-30.xlsx" → "2026-06-30"
function extractDateFromFilename(name: string): string | null {
  const m = name.match(/(\d{4}-\d{2}-\d{2})/)
  return m ? m[1] : null
}

// Нормализация числа: "34,5" → 34.5
function parseNum(v: unknown): number | null {
  if (v == null || v === '-' || v === '') return null
  const s = String(v).replace(',', '.')
  const n = parseFloat(s)
  return isNaN(n) ? null : n
}

type SheetRow = {
  store_id: string
  snapshot_date: string
  warehouse_name: string
  tariff_type: string
  delivery_coef_expr: number | null
  delivery_base: number | null
  delivery_liter: number | null
  storage_coef_expr: number | null
  storage_base: number | null
  storage_liter: number | null
}

function parseSheet(
  ws: XLSX.WorkSheet,
  tariffType: string,
  storeId: string,
  snapshotDate: string
): SheetRow[] {
  const rows: SheetRow[] = []
  const data = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: null })

  // Ищем строку-заголовок (содержит "Склад")
  let headerIdx = 0
  for (let i = 0; i < Math.min(5, data.length); i++) {
    const row = data[i] as unknown[]
    if (row && String(row[0] ?? '').toLowerCase().includes('склад')) {
      headerIdx = i
      break
    }
  }

  for (let i = headerIdx + 1; i < data.length; i++) {
    const row = data[i] as unknown[]
    if (!row || !row[0]) continue

    const warehouseName = String(row[0]).trim()
    if (!warehouseName) continue

    const deliveryCoef  = parseNum(row[1])
    const deliveryBase  = parseNum(row[2])
    const deliveryLiter = parseNum(row[3])
    const storageCoef   = parseNum(row[4])
    const storageBase   = parseNum(row[5])
    const storageLiter  = parseNum(row[6])

    // Пропускаем строки без данных по логистике
    if (deliveryCoef == null && deliveryBase == null) continue

    rows.push({
      store_id:          storeId,
      snapshot_date:     snapshotDate,
      warehouse_name:    warehouseName,
      tariff_type:       tariffType,
      delivery_coef_expr: deliveryCoef,
      delivery_base:     deliveryBase,
      delivery_liter:    deliveryLiter,
      storage_coef_expr: storageCoef,
      storage_base:      storageBase,
      storage_liter:     storageLiter,
    })
  }
  return rows
}

export async function POST(req: Request) {
  try {
    const user = await requireAuth()

    const storeIds = await getUserStoreIds(user.id)
    if (!storeIds.length) return NextResponse.json({ error: 'Нет магазина' }, { status: 400 })
    const storeId = storeIds[0]

    const formData = await req.formData()
    const file = formData.get('file') as File | null
    if (!file) return NextResponse.json({ error: 'Файл не передан' }, { status: 400 })

    const snapshotDate = extractDateFromFilename(file.name)
    if (!snapshotDate) {
      return NextResponse.json(
        { error: 'Не удалось определить дату из имени файла. Ожидается формат: "... YYYY-MM-DD.xlsx"' },
        { status: 400 }
      )
    }

    // WB хранит тарифы только 90 дней — данные до 01.04.2026 недоступны
    if (snapshotDate < AVAILABLE_FROM) {
      return NextResponse.json(
        { error: `Тарифы за ${snapshotDate} недоступны: WB хранит данные только за последние 90 дней (с ${AVAILABLE_FROM})` },
        { status: 422 }
      )
    }
    if (snapshotDate > AVAILABLE_TO) {
      return NextResponse.json(
        { error: `Дата ${snapshotDate} позже ${AVAILABLE_TO} — тарифы за этот период загружаются автоматически через API` },
        { status: 422 }
      )
    }

    // Читаем Excel
    const buffer = await file.arrayBuffer()
    const wb = XLSX.read(buffer, { type: 'buffer' })

    // Маппинг листов на тип тарифа
    const sheetMap: Record<string, string> = {
      'Короба':      'box',
      'Монопаллеты': 'monopalette',
      'QR':          'qr',
    }

    const allRows: SheetRow[] = []
    for (const [sheetName, tariffType] of Object.entries(sheetMap)) {
      if (wb.SheetNames.includes(sheetName)) {
        const rows = parseSheet(wb.Sheets[sheetName], tariffType, storeId, snapshotDate)
        allRows.push(...rows)
      }
    }

    if (allRows.length === 0) {
      return NextResponse.json({ error: 'Не найдено данных для загрузки' }, { status: 400 })
    }

    const adb = adminDb()

    // Upsert тарифов
    const { error: upsertErr } = await adb.from('wb_tariffs_history').upsert(
      allRows,
      { onConflict: 'store_id,snapshot_date,tariff_type,warehouse_name' }
    )
    if (upsertErr) throw new Error(upsertErr.message)

    // Трекинг загрузки
    await adb.from('wb_tariffs_uploads').upsert(
      { effective_date: snapshotDate, filename: file.name, rows_count: allRows.length },
      { onConflict: 'effective_date' }
    )

    return NextResponse.json({ ok: true, effective_date: snapshotDate, rows: allRows.length })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[tariffs/upload]', e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
