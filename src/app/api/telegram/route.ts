import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendTelegramMessage, formatDailySummary } from '@/lib/telegram'
import { getKpi, getDailySales, getStockAlerts } from '@/lib/queries'

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// Webhook from Telegram
export async function POST(req: NextRequest) {
  const body = await req.json()
  const message = body?.message
  if (!message) return NextResponse.json({ ok: true })

  const chatId = message.chat?.id
  const text: string = message.text ?? ''

  if (text === '/start' || text === '/help') {
    await sendTelegramMessage(chatId, [
      '<b>WB Analytics Bot</b>',
      '',
      '/today — сводка за сегодня',
      '/stocks — остатки (критические)',
      '/pnl — P&amp;L за текущий месяц',
    ].join('\n'))
    return NextResponse.json({ ok: true })
  }

  if (text === '/today') {
    await handleToday(chatId)
    return NextResponse.json({ ok: true })
  }

  if (text === '/stocks') {
    await handleStocks(chatId)
    return NextResponse.json({ ok: true })
  }

  if (text === '/pnl') {
    await handlePnl(chatId)
    return NextResponse.json({ ok: true })
  }

  await sendTelegramMessage(chatId, 'Неизвестная команда. Напишите /help')
  return NextResponse.json({ ok: true })
}

// GET — ручной вызов для рассылки ежедневной сводки (из cron)
export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db = adminClient()
  const { data: stores } = await db.from('stores').select('id, name')
  if (!stores?.length) return NextResponse.json({ ok: true })

  const { data: subscribers } = await db
    .from('profiles')
    .select('telegram_chat_id')
    .not('telegram_chat_id', 'is', null)

  if (!subscribers?.length) return NextResponse.json({ ok: true, note: 'no subscribers' })

  for (const store of stores) {
    const storeIds = [store.id]
    const today = new Date()
    const dateStr = today.toISOString().split('T')[0]

    const [kpi, stocks] = await Promise.all([
      getKpi(storeIds),
      getStockAlerts(storeIds),
    ])

    const lowStock = stocks.filter(s => s.days_left != null && s.days_left <= 14)
    const text = formatDailySummary({
      storeName: store.name,
      revenue: kpi.revenue,
      orders: kpi.orders,
      sales: kpi.sales,
      lowStock,
    })

    for (const sub of subscribers) {
      if (sub.telegram_chat_id) {
        await sendTelegramMessage(sub.telegram_chat_id, text)
      }
    }
  }

  return NextResponse.json({ ok: true })
}

async function handleToday(chatId: number) {
  const db = adminClient()
  const { data: stores } = await db.from('stores').select('id, name')
  if (!stores?.length) { await sendTelegramMessage(chatId, 'Магазины не найдены'); return }

  const storeIds = stores.map(s => s.id)
  const kpi = await getKpi(storeIds)
  const stocks = await getStockAlerts(storeIds)
  const lowStock = stocks.filter(s => s.days_left != null && s.days_left <= 14)

  const text = formatDailySummary({
    storeName: stores.map(s => s.name).join(', '),
    revenue: kpi.revenue,
    orders: kpi.orders,
    sales: kpi.sales,
    lowStock,
  })
  await sendTelegramMessage(chatId, text)
}

async function handleStocks(chatId: number) {
  const db = adminClient()
  const { data: stores } = await db.from('stores').select('id, name')
  if (!stores?.length) { await sendTelegramMessage(chatId, 'Магазины не найдены'); return }

  const storeIds = stores.map(s => s.id)
  const stocks = await getStockAlerts(storeIds)
  const critical = stocks.filter(s => s.days_left != null && s.days_left <= 7)

  if (!critical.length) {
    await sendTelegramMessage(chatId, '✅ Критических остатков нет (≤7 дней)')
    return
  }

  let text = '<b>🔴 Критические остатки (≤7 дней):</b>\n\n'
  for (const item of critical) {
    text += `• <b>${item.supplier_article}</b> — ${item.quantity} шт, ${item.days_left} дн.\n`
  }
  await sendTelegramMessage(chatId, text)
}

async function handlePnl(chatId: number) {
  const db = adminClient()
  const { data: stores } = await db.from('stores').select('id, name')
  if (!stores?.length) { await sendTelegramMessage(chatId, 'Магазины не найдены'); return }

  const storeIds = stores.map(s => s.id)
  const now = new Date()
  const from = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
  const to = now.toISOString().split('T')[0]

  const { data: dirRows } = await db.from('directory').select('doc_type_name, multiplier')
  const { data: finRows } = await db
    .from('wb_finance')
    .select('doc_type_name, ppvz_for_pay, delivery_rub, penalty')
    .in('store_id', storeIds)
    .gte('date_from', from)
    .lte('date_to', to)

  const multMap: Record<string, number> = {}
  for (const d of dirRows ?? []) multMap[d.doc_type_name] = d.multiplier

  let revenue = 0, returns = 0, logistics = 0, penalties = 0
  for (const r of finRows ?? []) {
    const m = multMap[r.doc_type_name] ?? 0
    if (m === 1) revenue += r.ppvz_for_pay ?? 0
    if (m === -1) returns += Math.abs(r.ppvz_for_pay ?? 0)
    logistics += r.delivery_rub ?? 0
    penalties += r.penalty ?? 0
  }

  const fmt = (n: number) => Math.round(n).toLocaleString('ru') + ' ₽'
  const month = now.toLocaleDateString('ru', { month: 'long', year: 'numeric' })

  const text = [
    `<b>📈 P&amp;L — ${month}</b>`,
    '',
    `💰 Выручка WB: <b>${fmt(revenue)}</b>`,
    `↩️ Возвраты: −${fmt(returns)}`,
    `🚚 Логистика: −${fmt(logistics)}`,
    `⚡ Штрафы: −${fmt(penalties)}`,
    '',
    `<b>Чистые выплаты: ${fmt(revenue - returns - logistics - penalties)}</b>`,
  ].join('\n')

  await sendTelegramMessage(chatId, text)
}
