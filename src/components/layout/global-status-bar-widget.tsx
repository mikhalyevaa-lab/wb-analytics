import { getOverviewFinance, getStocksAlerts, getDataQualityAlerts } from '@/lib/queries-overview'
import { GlobalStatusBar, type StatusTone } from './global-status-bar'

function fmtHero(n: number) {
  const sign = n > 0 ? '+' : ''
  if (Math.abs(n) >= 1_000_000) return `${sign}${(n / 1_000_000).toFixed(1)} M ₽`
  if (Math.abs(n) >= 1_000) return `${sign}${(n / 1_000).toFixed(0)} k ₽`
  return `${sign}${n} ₽`
}
function daysAgo(n: number) {
  const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().split('T')[0]
}

/**
 * Серверная обёртка GlobalStatusBar — фиксированное окно 30 дней, один фетч
 * на уровне (app)/layout.tsx, видна во всех разделах (Ф4 редизайна Steep).
 */
export async function GlobalStatusBarWidget({ storeIds }: { storeIds: string[] }) {
  const dateFrom = daysAgo(30)
  const dateTo = daysAgo(0)

  const [finance, stocks, quality] = await Promise.all([
    getOverviewFinance(storeIds, dateFrom, dateTo),
    getStocksAlerts(storeIds),
    getDataQualityAlerts(storeIds),
  ])

  const hasRisk = stocks.critical.length > 0
  const tone: StatusTone = finance.netProfit < 0 ? 'down' : hasRisk ? 'warn' : 'up'

  const risks: { text: string; href: string }[] = []
  if (stocks.critical.length > 0) risks.push({ text: `${stocks.critical.length} SKU кончается на складе`, href: '/supplies' })
  if (quality.missingCost > 0) risks.push({ text: `${quality.missingCost} товаров без себестоимости`, href: '/quality' })
  if (quality.missingToken) risks.push({ text: 'нет WB Analytics токена', href: '/settings' })

  const updatedAt = new Date().toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Moscow' })

  return (
    <GlobalStatusBar
      tone={tone}
      headline={tone === 'up' ? 'В плюсе' : tone === 'warn' ? 'Внимание' : 'Риск'}
      metrics={[
        { label: 'Прибыль (30д)', value: fmtHero(finance.netProfit) },
        { label: 'Выручка', value: fmtHero(finance.revenue).replace('+', '') },
        { label: '% выкупа', value: `${finance.buyoutRate}%` },
      ]}
      risks={risks}
      updatedAt={`обновлено ${updatedAt} МСК`}
    />
  )
}
