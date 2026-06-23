import Link from 'next/link'
import type { Insights } from '@/lib/queries-overview'

function fmt(n: number) {
  return new Intl.NumberFormat('ru-RU').format(Math.abs(n))
}

function InsightBadge({ emoji, text, href }: { emoji: string; text: string; href?: string }) {
  const inner = (
    <div className="flex items-start gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2.5 text-sm">
      <span className="mt-0.5 shrink-0">{emoji}</span>
      <span className="text-muted-foreground">{text}</span>
    </div>
  )
  if (href) return <Link href={href} className="block hover:opacity-80 transition-opacity">{inner}</Link>
  return inner
}

export function InsightsRow({ insights }: { insights: Insights }) {
  return (
    <div>
      <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">Авто-инсайты</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
        {insights.worstProduct && (
          <InsightBadge
            emoji="🔴"
            text={`Главный убыток: ${insights.worstProduct.title} — −${fmt(insights.worstProduct.profit)} ₽`}
            href={`/catalog/${insights.worstProduct.nm_id}`}
          />
        )}
        {insights.bestProduct && (
          <InsightBadge
            emoji="🟢"
            text={`Лучший по прибыли: ${insights.bestProduct.title} — +${fmt(insights.bestProduct.profit)} ₽`}
            href={`/catalog/${insights.bestProduct.nm_id}`}
          />
        )}
        {insights.bestRoi && (
          <InsightBadge
            emoji="⚡"
            text={`Лучший ROI: ${insights.bestRoi.title} — ${insights.bestRoi.roi}%`}
            href={`/catalog/${insights.bestRoi.nm_id}`}
          />
        )}
        {insights.highDrrCampaign && (
          <InsightBadge
            emoji="🔥"
            text={`Высокий ДРР: кампания ${insights.highDrrCampaign.campaign_name ?? insights.highDrrCampaign.campaign_id} — ${insights.highDrrCampaign.drr}% (${new Intl.NumberFormat('ru-RU').format(insights.highDrrCampaign.spend)} ₽)`}
            href="/advertising"
          />
        )}
        {insights.emptyStockSoon && (
          <InsightBadge
            emoji="📉"
            text={`Пустой склад через ${insights.emptyStockSoon.days}д: ${insights.emptyStockSoon.title}`}
            href={`/catalog/${insights.emptyStockSoon.nm_id}`}
          />
        )}
        <InsightBadge
          emoji="↩️"
          text={`Возвраты: ${fmt(insights.returnsAmount)} ₽ · ${insights.returnsShare}% от реализации`}
        />
        <InsightBadge
          emoji="✅"
          text={`Выкуп по кабинету: ${insights.buyoutRate}%`}
        />
      </div>
    </div>
  )
}
