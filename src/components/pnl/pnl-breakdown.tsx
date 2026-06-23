import type { PnLSummary } from '@/lib/queries'

function fmtRub(n: number) {
  return Math.round(n).toLocaleString('ru') + ' ₽'
}

function fmtPct(part: number, total: number) {
  if (!total) return ''
  return (part / total * 100).toFixed(1) + '%'
}

interface PnLBreakdownProps {
  wb: PnLSummary
  manualTotal: number
  manualByCategory: Record<string, number>
  adSpendOverride?: number // if provided, use instead of wb.adSpend
}

type RowType = 'revenue' | 'deduction' | 'subtotal' | 'total' | 'section' | 'profit'

interface Row {
  label: string
  value?: number
  pctOf?: number
  type: RowType
  note?: string
  indent?: boolean
}

const COST_CATEGORIES: { key: string; label: string }[] = [
  { key: 'salary', label: 'ФОТ' },
  { key: 'rent',   label: 'Аренда' },
  { key: 'tax',    label: 'Налоги' },
  { key: 'loan',   label: 'Кредиты' },
  { key: 'other',  label: 'Прочее' },
]

export function PnLBreakdown({ wb, manualTotal, manualByCategory }: PnLBreakdownProps) {
  const totalOperational = wb.adSpend + manualTotal
  const grossProfit      = wb.totalToPay - wb.adSpend - manualTotal

  const rows: Row[] = [
    // ── WB часть ──
    { label: 'Выручка (Продажа WB)', value: wb.sale, type: 'revenue' },
    { label: 'Комиссия WB',          value: wb.commission,     type: 'deduction', indent: true, pctOf: wb.sale },
    { label: 'К перечислению за товар', value: wb.forPay,      type: 'subtotal', note: '= Выручка − Комиссия' },
    { label: 'Логистика WB',         value: wb.logistics,      type: 'deduction', indent: true, pctOf: wb.sale },
    { label: 'Хранение WB',          value: wb.storage,        type: 'deduction', indent: true, pctOf: wb.sale },
    { label: 'Штрафы',               value: wb.penalties,      type: 'deduction', indent: true },
    ...(wb.otherDeductions !== 0 ? [{
      label: 'Прочие удержания',     value: Math.abs(wb.otherDeductions), type: 'deduction' as RowType, indent: true,
      note: wb.otherDeductions < 0 ? '(выплата)' : undefined,
    }] : []),
    ...(wb.correction !== 0 ? [{
      label: 'Корректировка ВВ',     value: Math.abs(wb.correction), type: (wb.correction > 0 ? 'deduction' : 'revenue') as RowType, indent: true,
    }] : []),
    { label: 'Итого к оплате WB',    value: wb.totalToPay,     type: 'total', note: `${wb.reportCount} отчётов` },

    // ── Операционные расходы ──
    { label: 'Операционные расходы', type: 'section' },
    { label: 'Реклама WB',           value: wb.adSpend,        type: 'deduction', indent: true, pctOf: wb.sale },
    ...COST_CATEGORIES
      .filter(c => manualByCategory[c.key])
      .map(c => ({
        label: c.label,
        value: manualByCategory[c.key],
        type: 'deduction' as RowType,
        indent: true,
        pctOf: wb.sale,
      })),
    { label: 'Итого расходов',       value: totalOperational,  type: 'subtotal', pctOf: wb.sale },

    // ── Итог ──
    { label: 'Маржинальная прибыль', value: grossProfit,        type: 'profit', pctOf: wb.sale },
  ]

  return (
    <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
      {rows.map((row, i) => {
        if (row.type === 'section') {
          return (
            <div key={i} className="px-5 py-2 bg-zinc-50/50 dark:bg-zinc-900/30">
              <p className="text-xs font-medium text-zinc-500 uppercase tracking-wide">{row.label}</p>
            </div>
          )
        }

        const val = row.value ?? 0
        const isNegative = row.type === 'deduction'
        const displayVal = isNegative ? -val : val

        const valueColor = row.type === 'profit'
          ? displayVal >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500'
          : row.type === 'revenue' ? 'text-zinc-900 dark:text-zinc-100'
          : row.type === 'deduction' ? 'text-red-500'
          : 'text-zinc-900 dark:text-zinc-100'

        const rowBg = row.type === 'total' ? 'bg-zinc-50 dark:bg-zinc-800/50'
          : row.type === 'profit' ? (displayVal >= 0 ? 'bg-emerald-50 dark:bg-emerald-900/20' : 'bg-red-50 dark:bg-red-900/20')
          : row.type === 'subtotal' ? 'bg-zinc-50/50 dark:bg-zinc-900/20'
          : ''

        const labelSize = row.type === 'profit' ? 'text-base font-bold text-zinc-900 dark:text-zinc-100'
          : row.type === 'total' ? 'text-sm font-semibold text-zinc-800 dark:text-zinc-100'
          : row.type === 'subtotal' ? 'text-sm font-medium text-zinc-700 dark:text-zinc-200'
          : 'text-sm text-zinc-500 dark:text-zinc-400'

        const valSize = row.type === 'profit' ? 'text-xl font-bold'
          : row.type === 'total' ? 'text-sm font-semibold'
          : 'text-sm font-medium'

        const prefix = isNegative ? '−' : row.type === 'revenue' ? '' : ''
        const pctStr = row.pctOf ? ` · ${fmtPct(val, row.pctOf)}` : ''

        return (
          <div key={i} className={`flex items-center justify-between px-5 py-2.5 ${rowBg}`}>
            <span className={`${labelSize} ${row.indent ? 'pl-4' : ''} flex items-center gap-1.5`}>
              {row.label}
              {row.note && <span className="text-xs text-zinc-400 font-normal">({row.note})</span>}
            </span>
            <span className={`${valSize} tabular-nums ${valueColor}`}>
              {prefix}{fmtRub(val)}
              {pctStr && <span className="text-xs font-normal text-zinc-400 ml-1">{pctStr}</span>}
            </span>
          </div>
        )
      })}
    </div>
  )
}
