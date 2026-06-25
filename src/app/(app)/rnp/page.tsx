export const dynamic = 'force-dynamic'

import { getServerSession } from '@/lib/auth-server'
import { redirect } from 'next/navigation'
import { RnpMatrix } from '@/components/rnp/rnp-matrix'

export default async function RnpPage() {
  const session = await getServerSession()
  if (!session?.user) redirect('/login')
  const user = session.user

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">РНП — Сводная</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Ежедневная матрица показателей. Колонка = дата, строка = метрика.
        </p>
      </div>
      <RnpMatrix />
    </div>
  )
}
