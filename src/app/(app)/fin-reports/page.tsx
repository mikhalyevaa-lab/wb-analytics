export const dynamic = 'force-dynamic'

import { getServerSession } from '@/lib/auth-server'
import { redirect } from 'next/navigation'
import { FinReportsClient } from '@/components/fin-reports/fin-reports-client'

export default async function FinReportsPage() {
  const session = await getServerSession()
  if (!session?.user) redirect('/login')

  return (
    <div className="p-6 space-y-6 max-w-[1600px]">
      <div>
        <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">Финансовые отчёты</h1>
        <p className="text-sm text-zinc-400 mt-0.5">
          Детализация по строкам отчётов WB. Обновляется автоматически каждый понедельник в 14:00 МСК.
        </p>
      </div>
      <FinReportsClient />
    </div>
  )
}
