import type { AbcShares } from '@/lib/queries-overview'

/** Диаграмма 5 — ABC-вклад: доля SKU vs доля выручки по классам A/B/C (stacked ribbon) */
export function AbcRibbon({ abc }: { abc: AbcShares }) {
  if (!abc.totalSku) {
    return <div className="text-[13px] py-8 text-center" style={{ color: 'var(--app-graphite)' }}>Нет данных о продажах за период</div>
  }
  const classes = ['A', 'B', 'C'] as const
  // Заливки диаграммы намеренно не флипаются темой (частая практика для data-viz цветов) —
  // фиксированные hex вместо --app-* токенов, чтобы не ломать контраст с текстом на сегменте
  const skuColors = { A: '#17191c', B: '#777b86', C: '#e4e4e6' }
  const revColors = { A: '#5d2a1a', B: '#b06a4a', C: '#e6d3c9' }

  return (
    <div className="space-y-3">
      <div className="grid items-center gap-4" style={{ gridTemplateColumns: '96px 1fr' }}>
        <span className="text-[13px]" style={{ color: 'var(--app-graphite)' }}>Доля SKU</span>
        <span className="flex h-8 rounded-full overflow-hidden gap-[3px]">
          {classes.map(c => (
            <span key={c} className="flex items-center justify-center text-[13px] font-medium"
              style={{ width: `${Math.max(abc[c].skuShare, 2)}%`, background: skuColors[c], color: c === 'C' ? '#777b86' : '#fff' }}>
              {abc[c].skuShare >= 8 ? `${abc[c].skuShare}%` : ''}
            </span>
          ))}
        </span>
      </div>
      <div className="grid items-center gap-4" style={{ gridTemplateColumns: '96px 1fr' }}>
        <span className="text-[13px]" style={{ color: 'var(--app-graphite)' }}>Доля выручки</span>
        <span className="flex h-8 rounded-full overflow-hidden gap-[3px]">
          {classes.map(c => (
            <span key={c} className="flex items-center justify-center text-[13px] font-medium"
              style={{ width: `${Math.max(abc[c].revenueShare, 2)}%`, background: revColors[c], color: c === 'C' ? '#8a5a44' : '#fff' }}>
              {abc[c].revenueShare >= 8 ? `${c} · ${abc[c].revenueShare}%` : ''}
            </span>
          ))}
        </span>
      </div>
      <div className="flex gap-6 text-[13px] pt-1" style={{ color: 'var(--app-graphite)' }}>
        <span><b style={{ color: 'var(--app-text)' }}>A</b> — {abc.A.count} товаров, ядро</span>
        <span><b style={{ color: 'var(--app-text)' }}>B</b> — {abc.B.count} товаров, поддержка</span>
        <span><b style={{ color: 'var(--app-text)' }}>C</b> — {abc.C.count} товаров, кандидаты на вывод</span>
      </div>
    </div>
  )
}
