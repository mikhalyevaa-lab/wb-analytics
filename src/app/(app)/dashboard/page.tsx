import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase-server'
import { getDailySales, getTodayStats, getMonthStats, getUserStoreIds } from '@/lib/queries'
import { TodayCards } from '@/components/dashboard/today-cards'
import { MonthCards } from '@/components/dashboard/month-cards'
import { SalesChart } from '@/components/dashboard/sales-chart'

export const dynamic = 'force-dynamic'

export default async function DashboardPage() {
  const db = await createClient()
  const { data: { user } } = await db.auth.getUser()
  if (!user) redirect('/login')

  const storeIds = await getUserStoreIds(user.id)

  if (!storeIds.length) {
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-[60vh] text-center px-4">
        <div className="w-12 h-12 rounded-xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-2xl mb-4">
          🏪
        </div>
        <h2 className="text-lg font-semibold text-zinc-800 dark:text-zinc-200">Магазин не подключён</h2>
        <p className="text-sm text-zinc-500 mt-2 max-w-xs">
          Запустите seed_store.sql в Supabase и добавьте ваш аккаунт в таблицу user_stores
        </p>
        <code className="mt-4 text-xs bg-zinc-100 dark:bg-zinc-800 px-3 py-2 rounded-lg text-zinc-600 dark:text-zinc-400">
          INSERT INTO user_stores (user_id, store_id) VALUES (auth.uid(), &#39;&lt;store_id&gt;&#39;)
        </code>
      </div>
    )
  }

  const [today, month, dailySales] = await Promise.all([
    getTodayStats(storeIds),
    getMonthStats(storeIds),
    getDailySales(storeIds),
  ])

  const now = new Date().toLocaleString('ru', {
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  })

  return (
    <div className="p-6 space-y-6 max-w-[1400px]">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">Дашборд</h1>
          <p className="text-sm text-zinc-400 mt-0.5">Обновлено: {now}</p>
        </div>
      </div>

      <TodayCards stats={today} />

      <MonthCards stats={month} />

      <SalesChart data={dailySales} />
    </div>
  )
}
