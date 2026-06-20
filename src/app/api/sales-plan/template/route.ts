/**
 * GET /api/sales-plan/template
 * Скачать шаблон XLSX для загрузки Плана продаж.
 * Заголовки: Артикул продавца | Артикул WB | Заказы в неделю | Номер недели
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import * as XLSX from 'xlsx'

function getISOWeek(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  const day = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - day)
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)
}

function formatWeek(date: Date): string {
  const week = getISOWeek(date)
  const year = date.getFullYear() % 100
  return `${week} (${String(year).padStart(2, '0')})`
}

export async function GET(req: NextRequest) {
  const db = await createClient()
  const { data: { user } } = await db.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Получаем артикулы пользователя
  const { data: storeRows } = await db
    .from('user_stores')
    .select('store_id')
    .eq('user_id', user.id)
  const storeIds = (storeRows ?? []).map(r => r.store_id as string)

  const { data: products } = await db
    .from('wb_products')
    .select('nm_id, supplier_article')
    .in('store_id', storeIds)
    .order('supplier_article')

  // Текущая неделя + следующие 3
  const now = new Date()
  const monday = new Date(now)
  monday.setDate(now.getDate() - ((now.getDay() + 6) % 7))

  const weeks = [0, 1, 2, 3].map(offset => {
    const d = new Date(monday)
    d.setDate(monday.getDate() + offset * 7)
    return formatWeek(d)
  })

  // Строки шаблона — один артикул × текущая неделя
  const currentWeek = weeks[0]
  const rows = (products ?? []).map(p => ({
    'Артикул продавца': p.supplier_article ?? '',
    'Артикул WB': p.nm_id ?? '',
    'Заказы в неделю': '',
    'Номер недели': currentWeek,
  }))

  // Добавляем справочник недель отдельным листом
  const weekRef = weeks.map(w => ({ 'Доступные недели': w }))

  const wb = XLSX.utils.book_new()
  const ws = XLSX.utils.json_to_sheet(rows)
  ws['!cols'] = [{ wch: 22 }, { wch: 14 }, { wch: 18 }, { wch: 14 }]
  XLSX.utils.book_append_sheet(wb, ws, 'План продаж')

  const wsRef = XLSX.utils.json_to_sheet(weekRef)
  wsRef['!cols'] = [{ wch: 18 }]
  XLSX.utils.book_append_sheet(wb, wsRef, 'Недели')

  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })
  return new NextResponse(buf, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="sales_plan_template.xlsx"',
    },
  })
}
