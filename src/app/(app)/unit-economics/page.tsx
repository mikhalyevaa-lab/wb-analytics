export const dynamic = 'force-dynamic'

import { getServerSession } from '@/lib/auth-server'
import { redirect } from 'next/navigation'
import { UnitEconomicsClient } from '@/components/unit-economics/unit-economics-client'

export default async function UnitEconomicsPage() {
  const session = await getServerSession()
  if (!session?.user) redirect('/login')

  return (
    <div className="p-6 space-y-6 max-w-[1800px]">
      <div>
        <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">Юнит-экономика</h1>
        <p className="text-sm text-zinc-400 mt-0.5">
          Расчёт прибыльности по каждому SKU. Для симуляции цены — нажмите на «Цена до СПП» или «% СПП».
        </p>
      </div>
      <UnitEconomicsClient />
    </div>
  )
}
