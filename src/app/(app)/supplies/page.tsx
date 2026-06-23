export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import { SuppliesPage } from '@/components/supplies/supplies-page'

export default async function Page() {
  const db = await createClient()
  const { data: { user } } = await db.auth.getUser()
  if (!user) redirect('/login')

  return (
    <div className="p-6">
      <SuppliesPage />
    </div>
  )
}
