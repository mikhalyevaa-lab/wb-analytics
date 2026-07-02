import { adminDb } from '@/lib/db-compat'
import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-server'
import { getUserStoreIds } from '@/lib/queries'

export const dynamic = 'force-dynamic'

// Обратная логистика: базовый тариф по объёму, без ИЛ и ИРП
// Источник: seller.wildberries.ru/instructions/ru/ru/material/logistics-types-and-cost-calculation
const REVERSE_FIXATION_START = '2026-05-15' // Фиксация обратной логистики с 15.05.2026

function calcReverseLogisticsTariff(volumeLiters: number): number {
  if (volumeLiters <= 0.200) return 23
  if (volumeLiters <= 0.400) return 26
  if (volumeLiters <= 0.600) return 29
  if (volumeLiters <= 0.800) return 30
  if (volumeLiters <= 1.000) return 32
  return 46 + 14 * (volumeLiters - 1)
}

// Категории с периодом фиксации 90 дней (п. 6.6.3 оферты Wildberries) — для остальных 60 дней
const FIXATION_90_DAY_PARENT_CATEGORIES = new Set([
  'спортивная одежда',
  'обувь',
  'аксессуары для малышей',
  'одежда для малышей',
  'белье для малышей',
  'бельё для малышей',
  'одежда',
  'головные уборы',
])

function fixationPeriodDays(parentName: string | null): number {
  if (!parentName) return 90 // нет данных о категории — консервативный дефолт (как раньше)
  return FIXATION_90_DAY_PARENT_CATEGORIES.has(parentName.toLowerCase().trim()) ? 90 : 60
}

// Нормализация названия склада для матчинга с тарифами
function normalizeWarehouse(name: string): string {
  return name.toLowerCase().trim().replace(/[_\-]/g, ' ')
}

// Матчинг склада из отчёта с тарифами
function matchTariff(
  reportWarehouse: string,
  tariffs: { warehouse_name: string; delivery_base: number; delivery_liter: number | null; delivery_coef_expr: number | null; loaded_at?: string | null; dt_till_max?: string | null }[]
) {
  const norm = normalizeWarehouse(reportWarehouse)
  // Точное совпадение
  let t = tariffs.find(t => normalizeWarehouse(t.warehouse_name) === norm)
  if (!t) {
    // Частичное совпадение (одно название содержит другое)
    t = tariffs.find(t => {
      const tNorm = normalizeWarehouse(t.warehouse_name)
      return norm.includes(tNorm) || tNorm.includes(norm)
    })
  }
  if (!t) {
    // Матчинг по ключевому слову (≥5 букв) — "СЦ Шушары" ↔ "СПБ Шушары"
    const words = norm.split(' ').filter(w => w.length >= 5)
    if (words.length) {
      t = tariffs.find(t => {
        const tNorm = normalizeWarehouse(t.warehouse_name)
        return words.some(w => tNorm.includes(w))
      })
    }
  }
  return t ?? null
}

export async function GET(req: Request) {
  try {
  const user = await requireAuth().catch(() => null)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const storeIds = await getUserStoreIds(user.id)
  if (!storeIds.length) return NextResponse.json({ error: 'No store' }, { status: 404 })

  const { searchParams } = new URL(req.url)
  const limitParam = parseInt(searchParams.get('limit') ?? '10000', 10)
  const weekParam  = searchParams.get('week') ? parseInt(searchParams.get('week')!, 10) : null

  const adb = adminDb()

  // Строки отчётов — все строки с расходами на логистику (включая возвраты)
  let reportQuery = adb.from('wb_weekly_report_rows')
    .select(`
      nm_id, barcode, supplier_article, title, warehouse, office_name,
      delivery_service_cost, retail_price_with_discount, retail_price, quantity,
      doc_type, report_number, deliveries_count, returns_count,
      order_date, sale_date, supply_number,
      fix_start_date, fix_end_date, box_type
    `)
    .in('store_id', storeIds)
    .not('delivery_service_cost', 'is', null)
    .gt('delivery_service_cost', 0)
  if (weekParam) reportQuery = reportQuery.eq('report_number', weekParam)
  reportQuery = reportQuery.order('report_number', { ascending: false }).limit(limitParam)

  const [indexRows, products, commissions, tariffs, reportRows, suppliesRows] = await Promise.all([
    // Последний актуальный индекс (ИРП + ИЛ)
    adb.from('wb_logistics_indexes')
      .select('week_date, irp, localization_index')
      .in('store_id', storeIds)
      .order('week_date', { ascending: false })
      .limit(1),

    // Продукты с объёмом и средней ценой (для ИРП когда retail_price = 0)
    adb.from('products')
      .select('nm_id, vendor_code, title, volume_liters, avg_price_before_spp, subject_id')
      .in('store_id', storeIds)
      .not('volume_liters', 'is', null)
      .limit(10000),

    // Родительская категория предмета (для периода фиксации тарифа — 90/60 дней)
    adb.from('wb_commissions')
      .select('subject_id, parent_name')
      .in('store_id', storeIds),

    // Тарифы складов (тип box)
    adb.from('wb_tariffs')
      .select('warehouse_name, delivery_base, delivery_liter, delivery_coef_expr, loaded_at, dt_till_max')
      .in('store_id', storeIds)
      .eq('tariff_type', 'box')
      .not('delivery_base', 'is', null),

    reportQuery,

    // Поставки — для получения даты фактической приёмки (factDate)
    adb.from('wb_supplies')
      .select('supply_id, fact_date')
      .in('store_id', storeIds)
      .not('supply_id', 'is', null)
      .not('fact_date', 'is', null),
  ])

  const indexes = indexRows.data ?? []
  const latestIndex = indexes[0] ?? null

  // subject_id → parent_name (родительская категория) — из комиссий WB
  const parentNameBySubject = new Map<number, string | null>()
  for (const c of commissions.data ?? []) {
    if (c.subject_id != null) parentNameBySubject.set(c.subject_id, c.parent_name ?? null)
  }

  const productMap = new Map<number, { vendor_code: string | null; title: string | null; volume_liters: number | null; avg_price_before_spp: number | null; parent_name: string | null }>()
  for (const p of products.data ?? []) {
    if (p.nm_id) {
      productMap.set(p.nm_id, {
        ...p,
        parent_name: p.subject_id != null ? (parentNameBySubject.get(p.subject_id) ?? null) : null,
      })
    }
  }

  type TariffRow = { warehouse_name: string; delivery_base: number; delivery_liter: number | null; delivery_coef_expr: number | null; loaded_at?: string | null; dt_till_max?: string | null }
  const tariffList = ((tariffs.data ?? []).filter(
    (t: { delivery_base: number | null }) => t.delivery_base != null
  ) as TariffRow[])

  // supply_id → fact_date (YYYY-MM-DD). Ключ — строка: postgres.js возвращает bigint как string
  const supplyMap = new Map<string, string>()
  for (const s of suppliesRows.data ?? []) {
    if (s.supply_id != null && s.fact_date) {
      supplyMap.set(String(s.supply_id), (s.fact_date as string).slice(0, 10))
    }
  }

  type ReportRow = {
    nm_id: number | null
    barcode: string | null
    supplier_article: string | null
    title: string | null
    warehouse: string | null
    office_name: string | null
    delivery_service_cost: number | null
    retail_price_with_discount: number | null
    retail_price: number | null
    quantity: number | null
    doc_type: string | null
    report_number: number | null
    deliveries_count: number | null
    returns_count: number | null
    order_date: string | null
    sale_date: string | null
    supply_number: string | null
    fix_start_date: string | null
    fix_end_date: string | null
    box_type: string | null
  }

  const rows = (reportRows.data ?? []) as ReportRow[]

  // ИРП: процент (0.62 → делим на 100)
  // ИЛ: коэффициент (1.0 = 100% = без изменений, НЕ делим на 100)
  // delivery_base из WB API уже включает коэффициент склада (delivery_coef_expr),
  // поэтому delivery_coef_expr в формулу НЕ подставляем
  const irpRate = latestIndex ? (latestIndex.irp ?? 0) / 100 : 0
  const ilCoef  = latestIndex ? (latestIndex.localization_index ?? 1) : 1

  // Рассчитываем по каждой строке
  const details = rows.map(row => {
    const product = row.nm_id ? productMap.get(row.nm_id) : null

    // Дата поставки: fact_date из wb_supplies по supply_number
    const supplyDate = row.supply_number ? (supplyMap.get(row.supply_number) ?? null) : null

    // Тип строки: возврат (обратная логистика) или прямая доставка
    // deliveries_count=0 + returns_count>0 → покупатель вернул товар
    const isReturn = (row.deliveries_count === 0 || row.deliveries_count == null)
      && (row.returns_count != null && row.returns_count > 0)

    // Тип тарифа:
    // 1. Приоритет — fix_end_date из отчёта (точные даты фиксации от WB)
    // 2. Fallback — разница order_date − supply_date (90 дн. для одежды/обуви, 60 дн. иначе)
    // 3. Для обратной логистики: фиксация только с 15.05.2026; до этой даты — Текущий
    let tariffType: 'Фиксированный' | 'Текущий' | 'Нет данных' = 'Нет данных'
    if (row.fix_end_date && row.order_date) {
      tariffType = row.order_date <= row.fix_end_date ? 'Фиксированный' : 'Текущий'
    } else if (supplyDate && row.order_date) {
      const daysDiff = Math.round(
        (new Date(row.order_date).getTime() - new Date(supplyDate).getTime()) / 86400000
      )
      const periodDays = fixationPeriodDays(product?.parent_name ?? null)
      tariffType = daysDiff < periodDays ? 'Фиксированный' : 'Текущий'
    }
    // Обратная логистика фиксируется только с 15.05.2026
    if (isReturn && supplyDate && supplyDate < REVERSE_FIXATION_START) {
      tariffType = 'Текущий'
    }

    const volumeLiters = product?.volume_liters ?? null
    const tariff = row.warehouse ? matchTariff(row.warehouse, tariffList) : null

    let calcLogistics: number | null = null
    let hasTariff = false
    const hasVolume = volumeLiters != null && volumeLiters > 0

    let deliveryBaseUsed: number | null = null
    let deliveryLiterUsed: number | null = null
    let volUsed: number | null = null
    let priceUsed: number | null = null
    let tariffBase: number | null = null
    let irpPart: number | null = null

    if (isReturn) {
      // Обратная логистика: только базовый тариф по объёму, без ИЛ и ИРП
      // Источник: seller.wildberries.ru/instructions/ru/ru/material/logistics-types-and-cost-calculation
      if (hasVolume && volumeLiters != null) {
        hasTariff = true
        volUsed = volumeLiters
        calcLogistics = Math.round(calcReverseLogisticsTariff(volumeLiters) * 100) / 100
      }
    } else if (tariff && hasVolume && volumeLiters != null) {
      // Прямая логистика: (base + liter × max(0, vol − 1)) × ИЛ + цена × ИРП
      hasTariff = true
      deliveryBaseUsed  = tariff.delivery_base
      deliveryLiterUsed = tariff.delivery_liter ?? 0
      volUsed = volumeLiters

      // delivery_base уже включает коэф. склада (delivery_coef_expr) — применяем только ИЛ
      tariffBase = deliveryBaseUsed + deliveryLiterUsed * Math.max(0, volUsed - 1)

      // retail_price_with_discount часто = 0 в отчётах → берём avg_price_before_spp из карточки
      priceUsed = (row.retail_price_with_discount && row.retail_price_with_discount > 0)
        ? row.retail_price_with_discount
        : (product?.avg_price_before_spp ?? 0)

      irpPart = priceUsed * irpRate

      calcLogistics = Math.round(
        (tariffBase * ilCoef + irpPart) * 100
      ) / 100
    }

    const actualLogistics = row.delivery_service_cost ?? 0
    // Нет тарифа или объёма → расчётная = фактической (нет отклонения)
    if (calcLogistics == null) calcLogistics = actualLogistics
    const delta = hasTariff ? calcLogistics - actualLogistics : null
    const deltaPct = (hasTariff && actualLogistics > 0)
      ? ((calcLogistics - actualLogistics) / actualLogistics) * 100
      : null

    return {
      // Основные поля таблицы
      nm_id:            row.nm_id,
      barcode:          row.barcode,
      supplier_article: row.supplier_article ?? product?.vendor_code ?? '—',
      title:            row.title ?? product?.title ?? '—',
      warehouse:        row.warehouse ?? '—',
      volume_liters:    volumeLiters,
      retail_price:     priceUsed,
      calc_logistics:   calcLogistics,
      actual_logistics: actualLogistics,
      delta:            delta,
      delta_pct:        deltaPct,
      has_tariff:       hasTariff,
      has_volume:       hasVolume,
      is_return:        isReturn,
      tariff_coef:      isReturn ? null : (tariff?.delivery_coef_expr ?? null),
      // Детализация для раскрытия строки
      order_date:       row.order_date,
      sale_date:        row.sale_date,
      supply_number:    row.supply_number,
      supply_date:      supplyDate,
      tariff_type:      tariffType,
      office_name:      row.office_name,
      fix_start_date:   row.fix_start_date,
      fix_end_date:     row.fix_end_date,
      tariff_warehouse: isReturn ? null : (tariff?.warehouse_name ?? null),
      tariff_date:      isReturn ? null : (tariff?.loaded_at ? tariff.loaded_at.slice(0, 10) : null),
      delivery_base:    deliveryBaseUsed,
      delivery_liter:   deliveryLiterUsed,
      vol_used:         volUsed,
      price_used:       priceUsed,
      tariff_base:      tariffBase,
      irp_part:         irpPart,
      il_coef:          isReturn ? null : ilCoef,
      irp_rate:         isReturn ? null : irpRate,
    }
  })

  // KPI итого
  const withCalc = details.filter(d => d.calc_logistics != null)
  const totalCalc   = withCalc.reduce((s, d) => s + (d.calc_logistics ?? 0), 0)
  const totalActual = withCalc.reduce((s, d) => s + d.actual_logistics, 0)
  const totalDelta  = totalCalc - totalActual
  // volume = null или 0 — объём не заполнен в карточке товара
  const noVolume = details.filter(d => !d.has_volume).length
  const noTariff = details.filter(d => d.has_volume && !d.has_tariff).length

  return NextResponse.json({
    kpi: {
      rows_total:     details.length,
      rows_with_calc: withCalc.length,
      total_calc:     Math.round(totalCalc),
      total_actual:   Math.round(totalActual),
      total_delta:    Math.round(totalDelta),
      delta_pct:      totalActual > 0 ? ((totalDelta / totalActual) * 100).toFixed(1) : null,
      no_volume:      noVolume,
      no_tariff:      noTariff,
    },
    indexes: {
      week_date:          latestIndex?.week_date ?? null,
      irp:                latestIndex?.irp ?? null,
      localization_index: latestIndex?.localization_index ?? null,
    },
    details,
  })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[logistics/check]', e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
