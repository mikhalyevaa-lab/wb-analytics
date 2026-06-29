export const dynamic = 'force-dynamic'

import { getServerSession } from '@/lib/auth-server'
import { redirect } from 'next/navigation'
import { RnpMatrix } from '@/components/rnp/rnp-matrix'
import { PageHeader } from '@/components/ui/page-header'

export default async function RnpPage() {
  const session = await getServerSession()
  if (!session?.user) redirect('/login')
  const user = session.user

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        picto="rnp"
        title="РНП — Сводная"
        subtitle="Ежедневная матрица показателей. Колонка = дата, строка = метрика."
      />
      <RnpMatrix />
    </div>
  )
}
