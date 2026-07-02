import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-server'
import { adminDb } from '@/lib/db-compat'
import { getUserStoreIds } from '@/lib/queries'

export const dynamic = 'force-dynamic'

const API_AUTO_START = '2026-07-01'
const MANUAL_AVAILABLE_FROM = '2026-04-01'

function toYearMonth(dateStr: string): string {
  return dateStr.slice(0, 7)
}

function monthsBetween(from: string, to: string): string[] {
  const result: string[] = []
  const d = new Date(from + '-01')
  const end = new Date(to + '-01')
  while (d <= end) {
    result.push(d.toISOString().slice(0, 7))
    d.setMonth(d.getMonth() + 1)
  }
  return result
}

// Все календарные даты от from до to включительно
function daysBetween(from: string, to: string): string[] {
  const result: string[] = []
  const d = new Date(from)
  const end = new Date(to)
  while (d <= end) {
    result.push(d.toISOString().split('T')[0])
    d.setDate(d.getDate() + 1)
  }
  return result
}

export async function GET() {
  try {
    const user = await requireAuth()
    const storeIds = await getUserStoreIds(user.id)
    if (!storeIds.length) return NextResponse.json({ error: 'Нет магазина' }, { status: 400 })

    const adb = adminDb()

    const { data: rangeRows } = await adb
      .from('wb_weekly_report_rows')
      .select('order_date')
      .in('store_id', storeIds)
      .not('order_date', 'is', null)
      .order('order_date', { ascending: true })
      .limit(1)

    const firstOrderDate = rangeRows?.[0]?.order_date ?? null

    const { data: tariffRows } = await adb
      .from('wb_tariffs_history')
      .select('snapshot_date')
      .in('store_id', storeIds)

    const coveredDates = new Set<string>((tariffRows ?? []).map((r: { snapshot_date: string }) => r.snapshot_date))
    const coveredMonths = new Set<string>([...coveredDates].map(toYearMonth))

    const { data: uploads } = await adb
      .from('wb_tariffs_uploads')
      .select('effective_date, filename, rows_count, uploaded_at')
      .order('effective_date', { ascending: false })

    if (!firstOrderDate) {
      return NextResponse.json({
        firstOrderDate: null,
        apiAutoStart: API_AUTO_START,
        coveredMonths: [],
        gapMonths: [],
        neededDates: [],
        missingDays: [],
        uploads: uploads ?? [],
        allCovered: true,
      })
    }

    // Месячная картина (для таймлайна)
    const gapEndMonth = toYearMonth(
      new Date(new Date(API_AUTO_START).getTime() - 86400000).toISOString()
    )
    const gapMonths = monthsBetween(toYearMonth(firstOrderDate), gapEndMonth)
    const neededMonths = gapMonths.filter(m => !coveredMonths.has(m))
    const neededDates = neededMonths.map(m => ({
      month: m,
      suggested_date: m + '-01',
      covered: false,
      available: (m + '-01') >= MANUAL_AVAILABLE_FROM,
    }))

    // Пропущенные дни в окне ручной загрузки (от первой даты тарифов до сегодня)
    const today = new Date().toISOString().split('T')[0]
    // Начало окна — первая дата тарифов в БД (или MANUAL_AVAILABLE_FROM если тарифов нет)
    const windowStart = coveredDates.size > 0
      ? [...coveredDates].sort()[0]
      : MANUAL_AVAILABLE_FROM
    const windowEnd = today < API_AUTO_START ? today : new Date(new Date(API_AUTO_START).getTime() - 86400000).toISOString().split('T')[0]

    const allDaysInWindow = daysBetween(windowStart, windowEnd)
    const missingDays = allDaysInWindow.filter(d => !coveredDates.has(d))

    return NextResponse.json({
      firstOrderDate,
      apiAutoStart: API_AUTO_START,
      coveredMonths: [...coveredMonths].sort(),
      gapMonths,
      neededDates,
      missingDays,        // конкретные даты без тарифов в окне ручной загрузки
      uploads: uploads ?? [],
      allCovered: neededDates.length === 0,
      stats: {
        total_months: gapMonths.length,
        covered_months: gapMonths.filter(m => coveredMonths.has(m)).length,
        missing_months: neededDates.length,
        missing_days: missingDays.length,
        window_start: windowStart,
        window_end: windowEnd,
      },
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
