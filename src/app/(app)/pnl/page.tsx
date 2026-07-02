import { redirect } from 'next/navigation'
import { getServerSession } from '@/lib/auth-server'
import { getUserStoreIds, getPnL, getManualCosts } from '@/lib/queries'
import { PnLBreakdown } from '@/components/pnl/pnl-breakdown'
import { DeductionsSection } from '@/components/pnl/deductions-section'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ExportButton } from '@/components/export-button'
import Link from 'next/link'
import { WaterfallChart } from '@/components/pnl/waterfall-chart'
import { SectionShell } from '@/components/layout/section-shell'

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
    <SectionShell maxWidth={760}>
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <p className="text-[13px] font-semibold uppercase tracking-wider" style={{ color: 'var(--app-graphite)' }}>Финансы</p>
          <h1 style={{ fontFamily: 'var(--app-font-serif)', fontSize: 32, color: 'var(--app-text)', marginTop: 4 }}>P&L отчёт</h1>
          <p className="text-[14px] mt-1" style={{ color: 'var(--app-graphite)' }}>{label}</p>
        </div>
        <div className="flex items-center gap-2">
          <ExportButton href={`/api/export/pnl?from=${from}&to=${to}`} />
          <Link
            href="/costs"
            className="px-3.5 py-1.5 text-[14px] rounded-full transition-colors"
            style={{ border: '1px solid var(--app-dove)', color: 'var(--app-text)' }}
          >
            + Добавить затраты
          </Link>
        </div>
      </div>

      {/* Period selector */}
      <div className="flex items-center gap-2 flex-wrap">
        {PRESETS.map(p => (
          <a
            key={p.value}
            href={`/pnl?period=${p.value}`}
            className="px-3 py-1.5 text-[14px] rounded-full transition-colors"
            style={{
              background: preset === p.value ? 'var(--app-cta-bg)' : 'transparent',
              color: preset === p.value ? 'var(--app-cta-text)' : 'var(--app-graphite)',
              border: preset === p.value ? 'none' : '1px solid var(--app-dove)',
            }}
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
            className="text-[14px] px-2 py-1.5 rounded-lg"
            style={{ border: '1px solid var(--app-dove)' }}
          />
          <span style={{ color: 'var(--app-dove)' }}>—</span>
          <input
            type="date"
            name="to"
            defaultValue={to}
            className="text-[14px] px-2 py-1.5 rounded-lg"
            style={{ border: '1px solid var(--app-dove)' }}
          />
          <button
            type="submit"
            className="px-3.5 py-1.5 text-[14px] rounded-full"
            style={{ background: 'var(--app-cta-bg)', color: 'var(--app-cta-text)' }}
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

      {/* Waterfall P&L */}
      <Card className="overflow-hidden p-0">
        <CardHeader className="px-5 py-4 border-b border-zinc-100 dark:border-zinc-800">
          <CardTitle className="text-base">Waterfall P&L</CardTitle>
        </CardHeader>
        <CardContent className="p-5">
          <WaterfallChart wb={wb} manualTotal={manualTotal} />
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
    </SectionShell>
  )
}
