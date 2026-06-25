export const dynamic = 'force-dynamic'

import { getServerSession } from '@/lib/auth-server'
import { redirect } from 'next/navigation'
import { SuppliesPage } from '@/components/supplies/supplies-page'

export default async function Page() {
  const session = await getServerSession()
  if (!session?.user) redirect('/login')
  const user = session.user

  return (
    <div className="p-6">
      <SuppliesPage />
    </div>
  )
}
