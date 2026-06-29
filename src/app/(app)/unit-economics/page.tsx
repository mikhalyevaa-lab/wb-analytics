export const dynamic = 'force-dynamic'

import { getServerSession } from '@/lib/auth-server'
import { redirect } from 'next/navigation'
import { UnitEconomicsClient } from '@/components/unit-economics/unit-economics-client'
import { PageHeader } from '@/components/ui/page-header'

export default async function UnitEconomicsPage() {
  const session = await getServerSession()
  if (!session?.user) redirect('/login')

  return (
    <div className="p-6 space-y-6 max-w-[1800px]">
      <PageHeader
        picto="unit-economics"
        title="Юнит-экономика"
        subtitle="Расчёт прибыльности по каждому SKU. Для симуляции цены — нажмите на «Цена до СПП» или «% СПП»."
      />
      <UnitEconomicsClient />
    </div>
  )
}
