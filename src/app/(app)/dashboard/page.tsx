import { redirect } from 'next/navigation'
import { getServerSession } from '@/lib/auth-server'
import { getDailySales, getMonthStats, getUserStoreIds } from '@/lib/queries'
import { Hint } from '@/components/ui/hint'
import { TodayCards } from '@/components/dashboard/today-cards'
import { MonthCards } from '@/components/dashboard/month-cards'
import { SalesChart } from '@/components/dashboard/sales-chart'
import { TopProducts } from '@/components/dashboard/top-products'
import { DataQualityAlert } from '@/components/dashboard/data-quality-alert'

export const dynamic = 'force-dynamic'

export default async function DashboardPage() {
  const session = await getServerSession()
  if (!session?.user) redirect('/login')
  const user = session.user

  const storeIds = await getUserStoreIds(user.id)

  if (!storeIds.length) {
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-[60vh] text-center px-4">
        <div className="w-12 h-12 rounded-xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-2xl mb-4">
          🏪
        </div>
        <h2 className="text-lg font-semibold text-zinc-800 dark:text-zinc-200">Магазин не подключён</h2>
        <p className="text-sm text-zinc-500 mt-2 max-w-xs">
          Добавьте WB API токен в настройках, чтобы начать синхронизацию данных
        </p>
        <a
          href="/settings"
          className="mt-4 px-4 py-2 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-sm rounded-lg hover:opacity-80 transition-opacity"
        >
          Перейти в Настройки
        </a>
      </div>
    )
  }

  const [month, dailySales] = await Promise.all([
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
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">Дашборд</h1>
            <Hint width={340}>
              <strong>Источники данных дашборда</strong><br /><br />
              <strong>Заказы / Сумма</strong> — воронка продаж WB (wb_funnel). Обновляется вручную или по расписанию.<br /><br />
              <strong>Выручка</strong> — wb_sales, только выкупленные позиции (for_pay &gt; 0).<br /><br />
              <strong>Реклама / Переходы</strong> — API рекламы WB (wb_ad_spend). WB хранит данные за последние 90 дней.<br /><br />
              <strong>Прогноз</strong> — линейная экстраполяция текущего темпа на весь месяц.
            </Hint>
          </div>
          <p className="text-sm text-zinc-400 mt-0.5">Обновлено: {now}</p>
        </div>
      </div>

      <DataQualityAlert />

      <TodayCards />

      <MonthCards stats={month} />

      <SalesChart data={dailySales} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <TopProducts />
      </div>
    </div>
  )
}
