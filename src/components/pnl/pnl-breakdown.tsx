import { PnLSummary } from '@/lib/queries'

function fmt(n: number) {
  return (n >= 0 ? '+' : '') + Math.round(n).toLocaleString('ru') + ' ₽'
}
function fmtAbs(n: number) {
  return Math.round(n).toLocaleString('ru') + ' ₽'
}

interface PnLBreakdownProps {
  wb: PnLSummary
  manualTotal: number
  manualByCategory: Record<string, number>
}

export function PnLBreakdown({ wb, manualTotal, manualByCategory }: PnLBreakdownProps) {
  const netProfit = wb.netPayable - manualTotal

  const rows: Array<{ label: string; value: number; type: 'plus' | 'minus' | 'total' | 'sub' }> = [
    { label: 'Выручка WB (ppvz)', value: wb.revenue, type: 'plus' },
    { label: 'Возвраты', value: -wb.returns, type: 'minus' },
    { label: 'Логистика WB', value: -wb.logistics, type: 'minus' },
    { label: 'Штрафы', value: -wb.penalties, type: 'minus' },
    { label: 'Дополнительные выплаты', value: wb.additionalPayments, type: 'plus' },
    { label: 'Чистые выплаты WB', value: wb.netPayable, type: 'total' },
  ]

  const costCategories = [
    { key: 'salary', label: 'ФОТ' },
    { key: 'rent', label: 'Аренда' },
    { key: 'tax', label: 'Налоги' },
    { key: 'loan', label: 'Кредиты' },
    { key: 'other', label: 'Прочее' },
  ]

  return (
    <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
      {rows.map(row => (
        <div key={row.label} className={`flex items-center justify-between px-5 py-3 ${row.type === 'total' ? 'bg-zinc-50 dark:bg-zinc-800/50' : ''}`}>
          <span className={`text-sm ${row.type === 'total' ? 'font-semibold text-zinc-800 dark:text-zinc-100' : 'text-zinc-600 dark:text-zinc-400'}`}>
            {row.label}
          </span>
          <span className={`text-sm font-medium tabular-nums ${
            row.type === 'total' ? 'text-zinc-900 dark:text-zinc-100 font-semibold' :
            row.value >= 0 ? 'text-emerald-600' : 'text-red-500'
          }`}>
            {row.type === 'total' ? fmtAbs(row.value) : fmt(row.value)}
          </span>
        </div>
      ))}

      <div className="px-5 py-2 bg-zinc-50/50 dark:bg-zinc-900/30">
        <p className="text-xs font-medium text-zinc-500 uppercase tracking-wide py-1">Ручные затраты</p>
      </div>

      {costCategories.map(({ key, label }) => {
        const v = manualByCategory[key] ?? 0
        if (!v) return null
        return (
          <div key={key} className="flex items-center justify-between px-5 py-2.5">
            <span className="text-sm text-zinc-500 pl-4">— {label}</span>
            <span className="text-sm font-medium text-red-500 tabular-nums">−{fmtAbs(v)}</span>
          </div>
        )
      })}

      <div className="flex items-center justify-between px-5 py-3 bg-zinc-50 dark:bg-zinc-800/50">
        <span className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">Итого ручных затрат</span>
        <span className="text-sm font-medium text-red-500 tabular-nums">−{fmtAbs(manualTotal)}</span>
      </div>

      <div className={`flex items-center justify-between px-5 py-4 ${netProfit >= 0 ? 'bg-emerald-50 dark:bg-emerald-900/20' : 'bg-red-50 dark:bg-red-900/20'}`}>
        <span className="text-base font-bold text-zinc-900 dark:text-zinc-100">Чистая прибыль</span>
        <span className={`text-lg font-bold tabular-nums ${netProfit >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
          {fmt(netProfit)}
        </span>
      </div>
    </div>
  )
}
