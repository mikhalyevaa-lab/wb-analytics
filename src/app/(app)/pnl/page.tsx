import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase-server'
import { getUserStoreIds, getPnL, getManualCosts } from '@/lib/queries'
import { PnLBreakdown } from '@/components/pnl/pnl-breakdown'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ExportButton } from '@/components/export-button'

export const dynamic = 'force-dynamic'

function localDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function periodBounds(period: string) {
  const now = new Date()
  const y = now.getFullYear()
  const m = now.getMonth()

  if (period === 'prev') {
    return {
      from: localDate(new Date(y, m - 1, 1)),
      to: localDate(new Date(y, m, 0)),
      label: new Date(y, m - 1).toLocaleDateString('ru', { month: 'long', year: 'numeric' }),
    }
  }
  if (period === '30d') {
    return {
      from: localDate(new Date(now.getTime() - 30 * 864e5)),
      to: localDate(now),
      label: 'Последние 30 дней',
    }
  }
  return {
    from: localDate(new Date(y, m, 1)),
    to: localDate(new Date(y, m + 1, 0)),
    label: new Date(y, m).toLocaleDateString('ru', { month: 'long', year: 'numeric' }),
  }
}

export default async function PnLPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>
}) {
  const db = await createClient()
  const { data: { user } } = await db.auth.getUser()
  if (!user) redirect('/login')

  const storeIds = await getUserStoreIds(user.id)
  if (!storeIds.length) redirect('/dashboard')

  const { period = 'current' } = await searchParams
  const { from, to, label } = periodBounds(period)

  const [wb, costs] = await Promise.all([
    getPnL(storeIds, from, to),
    getManualCosts(storeIds, from, to),
  ])

  const manualByCategory = costs.reduce<Record<string, number>>((acc, c) => {
    acc[c.category] = (acc[c.category] ?? 0) + c.amount
    return acc
  }, {})
  const manualTotal = costs.reduce((s, c) => s + c.amount, 0)

  const periods = [
    { value: 'current', label: 'Этот месяц' },
    { value: 'prev', label: 'Прошлый месяц' },
    { value: '30d', label: '30 дней' },
  ]

  return (
    <div className="p-6 space-y-6 max-w-[800px]">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">P&L отчёт</h1>
          <p className="text-sm text-zinc-400 mt-0.5">{label}</p>
        </div>
        <div className="flex items-center gap-3">
          <ExportButton href={`/api/export/pnl?from=${from}&to=${to}`} />
          <div className="flex gap-1.5">
            {periods.map(p => (
              <a
                key={p.value}
                href={`/pnl?period=${p.value}`}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  period === p.value
                    ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
                    : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400'
                }`}
              >
                {p.label}
              </a>
            ))}
          </div>
        </div>
      </div>

      <Card className="overflow-hidden p-0">
        <CardHeader className="px-5 py-4 border-b border-zinc-100 dark:border-zinc-800">
          <CardTitle className="text-base">Разбивка</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <PnLBreakdown wb={wb} manualTotal={manualTotal} manualByCategory={manualByCategory} />
        </CardContent>
      </Card>

      {wb.revenue === 0 && (
        <p className="text-sm text-zinc-400 text-center py-4">
          Нет данных из финансового отчёта WB за этот период.{' '}
          <a href="/dashboard" className="underline">Запустите синхронизацию</a> или выберите другой период.
        </p>
      )}
    </div>
  )
}
