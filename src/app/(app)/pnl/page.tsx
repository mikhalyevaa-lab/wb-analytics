import { redirect } from 'next/navigation'
import { getServerSession } from '@/lib/auth-server'
import { getUserStoreIds, getPnL, getManualCosts } from '@/lib/queries'
import { PnLBreakdown } from '@/components/pnl/pnl-breakdown'
import { DeductionsSection } from '@/components/pnl/deductions-section'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ExportButton } from '@/components/export-button'
import Link from 'next/link'
import { PageHeader } from '@/components/ui/page-header'

export const dynamic = 'force-dynamic'

function localDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function periodBounds(period: string, from?: string, to?: string) {
  const now = new Date()
  const y = now.getFullYear()
  const m = now.getMonth()

  if (period === 'custom' && from && to) {
    return {
      from,
      to,
      label: `${from} — ${to}`,
      preset: 'custom',
    }
  }
  if (period === 'prev') {
    return {
      from: localDate(new Date(y, m - 1, 1)),
      to:   localDate(new Date(y, m, 0)),
      label: new Date(y, m - 1).toLocaleDateString('ru', { month: 'long', year: 'numeric' }),
      preset: 'prev',
    }
  }
  if (period === '30d') {
    return {
      from: localDate(new Date(now.getTime() - 30 * 864e5)),
      to:   localDate(now),
      label: 'Последние 30 дней',
      preset: '30d',
    }
  }
  // default: current month
  return {
    from: localDate(new Date(y, m, 1)),
    to:   localDate(new Date(y, m + 1, 0)),
    label: new Date(y, m).toLocaleDateString('ru', { month: 'long', year: 'numeric' }),
    preset: 'current',
  }
}

const PRESETS = [
  { value: 'current', label: 'Этот месяц' },
  { value: 'prev',    label: 'Прошлый месяц' },
  { value: '30d',     label: '30 дней' },
]

export default async function PnLPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; from?: string; to?: string }>
}) {
  const session = await getServerSession()
  if (!session?.user) redirect('/login')
  const user = session.user

  const storeIds = await getUserStoreIds(user.id)
  if (!storeIds.length) redirect('/dashboard')

  const params = await searchParams
  const { period = 'current', from: qFrom, to: qTo } = params
  const { from, to, label, preset } = periodBounds(period, qFrom, qTo)

  const [wb, costs] = await Promise.all([
    getPnL(storeIds, from, to),
    getManualCosts(storeIds, from, to),
  ])

  const manualByCategory = costs.reduce<Record<string, number>>((acc, c) => {
    acc[c.category] = (acc[c.category] ?? 0) + c.amount
    return acc
  }, {})
  const manualTotal = costs.reduce((s, c) => s + c.amount, 0)

  const noData = wb.sale === 0

  return (
    <div className="p-6 space-y-6 max-w-[760px]">
      <PageHeader picto="pnl" title="P&L отчёт" subtitle={label}>
        <ExportButton href={`/api/export/pnl?from=${from}&to=${to}`} />
        <Link
          href="/costs"
          className="px-3 py-1.5 text-xs border border-zinc-200 dark:border-zinc-700 rounded-lg text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
        >
          + Добавить затраты
        </Link>
      </PageHeader>

      {/* Period selector */}
      <div className="flex items-center gap-2 flex-wrap">
        {PRESETS.map(p => (
          <a
            key={p.value}
            href={`/pnl?period=${p.value}`}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              preset === p.value
                ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
                : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400'
            }`}
          >
            {p.label}
          </a>
        ))}
        {/* Custom range */}
        <form method="get" action="/pnl" className="flex items-center gap-1 ml-1">
          <input type="hidden" name="period" value="custom" />
          <input
            type="date"
            name="from"
            defaultValue={from}
            className="text-xs px-2 py-1.5 border border-zinc-200 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300"
          />
          <span className="text-zinc-400 text-xs">—</span>
          <input
            type="date"
            name="to"
            defaultValue={to}
            className="text-xs px-2 py-1.5 border border-zinc-200 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300"
          />
          <button
            type="submit"
            className="px-3 py-1.5 text-xs bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-lg hover:opacity-90"
          >
            Применить
          </button>
        </form>
      </div>

      {/* No data */}
      {noData && (
        <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-xl px-4 py-3 text-sm text-amber-800 dark:text-amber-300">
          Нет данных из еженедельных отчётов WB за этот период.
          Загрузите отчёты через раздел <Link href="/reports" className="underline">Отчёты WB</Link>.
        </div>
      )}

      {/* P&L waterfall */}
      <Card className="overflow-hidden p-0">
        <CardHeader className="px-5 py-4 border-b border-zinc-100 dark:border-zinc-800 flex flex-row items-center justify-between">
          <CardTitle className="text-base">Водопад P&L</CardTitle>
          {wb.reportCount > 0 && (
            <span className="text-xs text-zinc-400">{wb.reportCount} отчётов WB</span>
          )}
        </CardHeader>
        <CardContent className="p-0">
          <PnLBreakdown wb={wb} manualTotal={manualTotal} manualByCategory={manualByCategory} />
        </CardContent>
      </Card>

      {/* Deductions detail */}
      <Card className="overflow-hidden p-0">
        <CardHeader className="px-5 py-4 border-b border-zinc-100 dark:border-zinc-800">
          <CardTitle className="text-base">Детализация удержаний</CardTitle>
        </CardHeader>
        <CardContent className="p-5">
          <DeductionsSection dateFrom={from} dateTo={to} />
        </CardContent>
      </Card>
    </div>
  )
}
