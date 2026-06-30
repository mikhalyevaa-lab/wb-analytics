import { adminDb } from '@/lib/db-compat'
import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-server'
import { getUserStoreIds } from '@/lib/queries'

export const dynamic = 'force-dynamic'

// Нормализация названия склада для матчинга с тарифами
function normalizeWarehouse(name: string): string {
  return name.toLowerCase().trim().replace(/[_\-]/g, ' ')
}

// Матчинг склада из отчёта с тарифами
function matchTariff(
  reportWarehouse: string,
  tariffs: { warehouse_name: string; delivery_base: number; delivery_liter: number | null; delivery_coef_expr: number | null }[]
) {
  const norm = normalizeWarehouse(reportWarehouse)
  // Точное совпадение
  let t = tariffs.find(t => normalizeWarehouse(t.warehouse_name) === norm)
  if (!t) {
    // Частичное совпадение (склад из отчёта содержит имя тарифа или наоборот)
    t = tariffs.find(t => {
      const tNorm = normalizeWarehouse(t.warehouse_name)
      return norm.includes(tNorm) || tNorm.includes(norm)
    })
  }
  return t ?? null
}

export async function GET(req: Request) {
  const user = await requireAuth().catch(() => null)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const storeIds = await getUserStoreIds(user.id)
  if (!storeIds.length) return NextResponse.json({ error: 'No store' }, { status: 404 })

  const { searchParams } = new URL(req.url)
  const limitParam = parseInt(searchParams.get('limit') ?? '500', 10)

  const adb = adminDb()

  const [indexRows, products, tariffs, reportRows] = await Promise.all([
    // Последний актуальный индекс (ИРП + ИЛ)
    adb.from('wb_logistics_indexes')
      .select('week_date, irp, localization_index')
      .in('store_id', storeIds)
      .order('week_date', { ascending: false })
      .limit(1),

    // Продукты с объёмом и средней ценой (для ИРП когда retail_price = 0)
    adb.from('products')
      .select('nm_id, vendor_code, title, volume_liters, avg_price_before_spp')
      .in('store_id', storeIds)
      .not('volume_liters', 'is', null)
      .limit(10000),

    // Тарифы складов (тип box)
    adb.from('wb_tariffs')
      .select('warehouse_name, delivery_base, delivery_liter, delivery_coef_expr')
      .in('store_id', storeIds)
      .eq('tariff_type', 'box')
      .not('delivery_base', 'is', null),

    // Строки еженедельных отчётов — только ПРЯМЫЕ ДОСТАВКИ (deliveries_count > 0)
    // Возвраты (returns_count > 0) исключаем — у них другой тариф
    adb.from('wb_weekly_report_rows')
      .select(`
        nm_id, barcode, supplier_article, title, warehouse,
        delivery_service_cost, retail_price_with_discount, quantity,
        doc_type, report_number, deliveries_count, returns_count
      `)
      .in('store_id', storeIds)
      .not('delivery_service_cost', 'is', null)
      .gt('delivery_service_cost', 0)
      .gt('deliveries_count', 0)
      .order('report_number', { ascending: false })
      .limit(limitParam),
  ])

  const indexes = indexRows.data ?? []
  const latestIndex = indexes[0] ?? null

  const productMap = new Map<number, { vendor_code: string | null; title: string | null; volume_liters: number | null; avg_price_before_spp: number | null }>()
  for (const p of products.data ?? []) {
    if (p.nm_id) productMap.set(p.nm_id, p)
  }

  type TariffRow = { warehouse_name: string; delivery_base: number; delivery_liter: number | null; delivery_coef_expr: number | null }
  const tariffList = ((tariffs.data ?? []).filter(
    (t: { delivery_base: number | null }) => t.delivery_base != null
  ) as TariffRow[])

  type ReportRow = {
    nm_id: number | null
    barcode: string | null
    supplier_article: string | null
    title: string | null
    warehouse: string | null
    delivery_service_cost: number | null
    retail_price_with_discount: number | null
    quantity: number | null
    doc_type: string | null
    report_number: number | null
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
    const volumeLiters = product?.volume_liters ?? null
    const tariff = row.warehouse ? matchTariff(row.warehouse, tariffList) : null

    let calcLogistics: number | null = null
    let hasTariff = false
    const hasVolume = volumeLiters != null && volumeLiters > 0

    if (tariff && hasVolume && volumeLiters != null) {
      hasTariff = true
      const deliveryBase  = tariff.delivery_base
      const deliveryLiter = tariff.delivery_liter ?? 0

      // volume_liters хранится в м³, переводим в литры (* 1000)
      const volLiters = volumeLiters * 1000

      // delivery_base уже включает коэф. склада — применяем только ИЛ
      const tariffBase = deliveryBase + deliveryLiter * Math.max(0, volLiters - 1)

      // retail_price_with_discount часто = 0 в отчётах → берём avg_price_before_spp из карточки
      const price = (row.retail_price_with_discount && row.retail_price_with_discount > 0)
        ? row.retail_price_with_discount
        : (product?.avg_price_before_spp ?? 0)

      // Полная формула (оферта п.13.1.10):
      //   (base + liter × max(0, vol − 1)) × ИЛ + цена × ИРП
      calcLogistics = Math.round(
        (tariffBase * ilCoef + price * irpRate) * 100
      ) / 100
    }

    const actualLogistics = row.delivery_service_cost ?? 0
    const delta = calcLogistics != null ? calcLogistics - actualLogistics : null
    const deltaPct = (calcLogistics != null && actualLogistics > 0)
      ? ((calcLogistics - actualLogistics) / actualLogistics) * 100
      : null

    // Фактическая цена, использованная в расчёте ИРП
    const effectivePrice = (row.retail_price_with_discount && row.retail_price_with_discount > 0)
      ? row.retail_price_with_discount
      : (product?.avg_price_before_spp ?? null)

    return {
      nm_id:             row.nm_id,
      barcode:           row.barcode,
      supplier_article:  row.supplier_article ?? product?.vendor_code ?? '—',
      title:             row.title ?? product?.title ?? '—',
      warehouse:         row.warehouse ?? '—',
      volume_liters:     volumeLiters,
      volume_liters_val: volumeLiters != null ? volumeLiters * 1000 : null,
      retail_price:      effectivePrice,
      calc_logistics:    calcLogistics,
      actual_logistics:  actualLogistics,
      delta:             delta,
      delta_pct:         deltaPct,
      has_tariff:        hasTariff,
      has_volume:        hasVolume,
      tariff_coef:       tariff?.delivery_coef_expr ?? null,
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
}
