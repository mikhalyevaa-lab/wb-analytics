import { redirect } from 'next/navigation'
import { getServerSession } from '@/lib/auth-server'
import { getUserStoreIds, getStores, getManualCosts } from '@/lib/queries'
import { CATEGORY_LABELS } from '@/lib/types'
import { CostsForm } from '@/components/costs/costs-form'
import { CostsTable } from '@/components/costs/costs-table'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ExportButton } from '@/components/export-button'

export const dynamic = 'force-dynamic'

function localDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function monthBounds(offset = 0) {
  const now = new Date()
  const y = now.getFullYear()
  const m = now.getMonth() + offset
  const from = localDate(new Date(y, m, 1))
  const to = localDate(new Date(y, m + 1, 0))
  return { from, to }
}

export default async function CostsPage() {
  const session = await getServerSession()
  if (!session?.user) redirect('/login')
  const user = session.user

  const storeIds = await getUserStoreIds(user.id)
  if (!storeIds.length) redirect('/dashboard')

  const stores = await getStores(storeIds)
  const primaryStore = stores[0]

  const today = new Date().toISOString().split('T')[0]
  const { from, to } = monthBounds(0)

  const costs = await getManualCosts(storeIds, from, to)

  const totalByCategory = costs.reduce<Record<string, number>>((acc, c) => {
    acc[c.category] = (acc[c.category] ?? 0) + c.amount
    return acc
  }, {})
  const grandTotal = costs.reduce((s, c) => s + c.amount, 0)

  const fmt = (n: number) => n.toLocaleString('ru') + ' ₽'

  return (
    <div className="p-6 space-y-6 max-w-[1100px]">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">Ручные затраты</h1>
          <p className="text-sm text-zinc-400 mt-0.5">
            {new Date(from).toLocaleDateString('ru', { month: 'long', year: 'numeric' })}
          </p>
        </div>
        <ExportButton href={`/api/export/pnl?from=${from}&to=${to}`} label="Экспорт P&L" />
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {Object.entries(CATEGORY_LABELS).map(([key, label]) => (
          <Card key={key} className="py-3">
            <CardContent className="px-4 py-0">
              <p className="text-xs text-zinc-500">{label}</p>
              <p className="text-sm font-semibold mt-0.5">{fmt(totalByCategory[key] ?? 0)}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Добавить затрату</CardTitle>
            <span className="text-sm text-zinc-500">Итого за месяц: <strong className="text-zinc-800 dark:text-zinc-100">{fmt(grandTotal)}</strong></span>
          </div>
        </CardHeader>
        <CardContent>
          <CostsForm storeId={primaryStore.id} today={today} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">История</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <CostsTable items={costs} />
        </CardContent>
      </Card>
    </div>
  )
}
