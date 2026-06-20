const TG_API = 'https://api.telegram.org'

export async function sendTelegramMessage(chatId: string | number, text: string): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN
  if (!token) return

  await fetch(`${TG_API}/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
  })
}

export async function setWebhook(webhookUrl: string): Promise<unknown> {
  const token = process.env.TELEGRAM_BOT_TOKEN
  if (!token) throw new Error('TELEGRAM_BOT_TOKEN not set')

  const res = await fetch(`${TG_API}/bot${token}/setWebhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: webhookUrl }),
  })
  return res.json()
}

export function formatDailySummary(data: {
  storeName: string
  revenue: number
  orders: number
  sales: number
  lowStock: Array<{ supplier_article: string; quantity: number; days_left: number | null }>
}): string {
  const fmt = (n: number) => n.toLocaleString('ru')
  const date = new Date().toLocaleDateString('ru', { day: 'numeric', month: 'long' })

  let text = `<b>📊 ${data.storeName} — ${date}</b>\n\n`
  text += `💰 Выручка: <b>${fmt(data.revenue)} ₽</b>\n`
  text += `📦 Заказы: <b>${fmt(data.orders)}</b>\n`
  text += `✅ Выкупы: <b>${fmt(data.sales)}</b>\n`

  if (data.lowStock.length > 0) {
    text += `\n⚠️ <b>Заканчиваются остатки:</b>\n`
    for (const item of data.lowStock.slice(0, 5)) {
      const days = item.days_left != null ? `${item.days_left} дн.` : 'скоро'
      text += `  • ${item.supplier_article}: ${item.quantity} шт (${days})\n`
    }
  }

  return text
}
