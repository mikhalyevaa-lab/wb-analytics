import { NextResponse } from 'next/server'
import { adminDb } from '@/lib/admin'
import { createWBClient } from '@/lib/wb-api'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

// Диагностический endpoint — показывает сырой ответ WB API paid_storage
export async function GET(req: Request) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const adb = adminDb()
  const { data: storeRaw } = await (adb.from('stores') as any)
    .select('id, name, wb_analytics_token')
    .not('wb_analytics_token', 'is', null)
    .limit(1)
    .single()

  if (!storeRaw?.wb_analytics_token) {
    return NextResponse.json({ error: 'no wb_analytics_token in stores' })
  }

  const WB_ANALYTICS_URL = 'https://seller-analytics-api.wildberries.ru'
  const token = storeRaw.wb_analytics_token

  const today = new Date()
  const dateTo   = today.toISOString().split('T')[0]
  const dateFrom = new Date(today.getTime() - 7 * 86400000).toISOString().split('T')[0]

  // 1. GET — инициируем задачу
  const step1 = await fetch(
    `${WB_ANALYTICS_URL}/api/v1/paid_storage?dateFrom=${dateFrom}&dateTo=${dateTo}`,
    { headers: { 'Authorization': token } }
  )
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const step1Body = await step1.json().catch(() => null) as any
  const taskId = step1Body?.data?.taskId ?? step1Body?.taskId
  if (!taskId) {
    return NextResponse.json({ step: 1, status: step1.status, body: step1Body, error: 'no taskId' })
  }

  // 2. Поллинг download — до 5 попыток по 10 сек
  const downloadUrl = `${WB_ANALYTICS_URL}/api/v1/paid_storage/tasks/${taskId}/download`
  const attempts: unknown[] = []
  for (let i = 0; i < 5; i++) {
    await new Promise(r => setTimeout(r, 10000))
    const resp = await fetch(downloadUrl, { headers: { 'Authorization': token } })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const body = await resp.json().catch(async () => ({ raw: await resp.text() })) as any
    attempts.push({ attempt: i + 1, status: resp.status, bodyKeys: Object.keys(body ?? {}), isArray: Array.isArray(body), sample: Array.isArray(body) ? body.slice(0, 1) : body })
    if (Array.isArray(body) && body.length > 0) {
      return NextResponse.json({ ok: true, taskId, dateFrom, dateTo, rowsCount: body.length, sample: body.slice(0, 2), attempts })
    }
    if (body?.data && Array.isArray(body.data) && body.data.length > 0) {
      return NextResponse.json({ ok: true, taskId, dateFrom, dateTo, rowsCount: body.data.length, sample: body.data.slice(0, 2), attempts })
    }
  }

  return NextResponse.json({ ok: false, taskId, dateFrom, dateTo, error: 'no data after 5 attempts', attempts })
}
