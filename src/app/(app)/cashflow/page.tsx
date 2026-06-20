import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase-server'
import { getUserStoreIds, getStores } from '@/lib/queries'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { CashflowForm } from '@/components/cashflow/cashflow-form'
import { CashflowTable } from '@/components/cashflow/cashflow-table'

export const dynamic = 'force-dynamic'

export default async function CashflowPage() {
  const db = await createClient()
  const { data: { user } } = await db.auth.getUser()
  if (!user) redirect('/login')

  const storeIds = await getUserStoreIds(user.id)
  if (!storeIds.length) redirect('/dashboard')

  const stores = await getStores(storeIds)
  const primaryStore = stores[0]

  const now = new Date()
  const threeMonthsLater = new Date(now.getFullYear(), now.getMonth() + 3, 1)
  const from = now.toISOString().split('T')[0]
  const to = threeMonthsLater.toISOString().split('T')[0]

  const { data: upcoming } = await db
    .from('credit_schedule')
    .select('id, credit_name, payment_date, principal, interest, total_payment, is_paid')
    .in('store_id', storeIds)
    .gte('payment_date', from)
    .lte('payment_date', to)
    .order('payment_date')

  const { data: overdue } = await db
    .from('credit_schedule')
    .select('id, credit_name, payment_date, principal, interest, total_payment, is_paid')
    .in('store_id', storeIds)
    .lt('payment_date', from)
    .eq('is_paid', false)
    .order('payment_date')

  const all = [...(overdue ?? []), ...(upcoming ?? [])]

  const totalUpcoming = (upcoming ?? [])
    .filter(r => !r.is_paid)
    .reduce((s, r) => s + r.total_payment, 0)

  const totalOverdue = (overdue ?? []).reduce((s, r) => s + r.total_payment, 0)

  const fmt = (n: number) => n.toLocaleString('ru') + ' ₽'

  return (
    <div className="p-6 space-y-6 max-w-[1000px]">
      <div>
        <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">Cash Flow — Кредиты</h1>
        <p className="text-sm text-zinc-400 mt-0.5">Платежи на 3 месяца вперёд</p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Card className="py-4">
          <CardContent className="px-5 py-0">
            <p className="text-xs text-zinc-500">Ближайшие 3 месяца</p>
            <p className="text-2xl font-bold mt-1 tabular-nums">{fmt(totalUpcoming)}</p>
          </CardContent>
        </Card>
        <Card className={`py-4 ${totalOverdue > 0 ? 'border-red-200 dark:border-red-800' : ''}`}>
          <CardContent className="px-5 py-0">
            <p className="text-xs text-zinc-500">Просроченные</p>
            <p className={`text-2xl font-bold mt-1 tabular-nums ${totalOverdue > 0 ? 'text-red-600' : 'text-zinc-400'}`}>
              {fmt(totalOverdue)}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-base">Добавить платёж</CardTitle>
        </CardHeader>
        <CardContent>
          <CashflowForm storeId={primaryStore.id} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">График платежей</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <CashflowTable items={all} />
        </CardContent>
      </Card>
    </div>
  )
}
