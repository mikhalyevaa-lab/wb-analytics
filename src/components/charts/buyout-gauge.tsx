/** Диаграмма 3 — Радар выкупа: % выкупа vs возвраты, gauge/donut на чистом SVG */
export function BuyoutGauge({ buyoutRate, returnsShare }: { buyoutRate: number; returnsShare: number }) {
  const pct = Math.max(0, Math.min(100, buyoutRate))
  // path length ~ 306 (as in reference), offset scales inversely with pct
  const pathLen = 306
  const offset = pathLen - (pathLen * pct) / 100

  return (
    <div>
      <div className="flex items-center justify-center" style={{ height: 150 }}>
        <svg width={180} height={150} viewBox="0 0 180 150" fill="none">
          <path d="M30 130 A65 65 0 1 1 150 130" stroke="var(--app-fog)" strokeWidth={14} strokeLinecap="round" />
          <path d="M30 130 A65 65 0 1 1 150 130" stroke="var(--app-rust)" strokeWidth={14} strokeLinecap="round"
            strokeDasharray={pathLen} strokeDashoffset={offset} />
          <text x="90" y="82" textAnchor="middle" fontFamily="var(--app-font-serif)" fontSize="36" fill="var(--app-text)">{pct.toFixed(0)}%</text>
          <text x="90" y="104" textAnchor="middle" fontFamily="var(--app-font-sans)" fontSize="12" fill="var(--app-graphite)">выкуплено</text>
        </svg>
      </div>
      <div className="flex justify-between pt-3 text-[13px]" style={{ borderTop: '1px solid #ededef', color: 'var(--app-ash)' }}>
        <span>Возвраты <b style={{ color: 'var(--app-rust)' }}>{returnsShare.toFixed(1)}%</b></span>
        <span>Норма WB <b>50–80%</b></span>
      </div>
    </div>
  )
}
