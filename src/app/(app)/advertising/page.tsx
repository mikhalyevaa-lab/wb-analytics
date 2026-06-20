import { createClient } from '@/lib/supabase-server'
import { getUserStoreIds, getAdPageData } from '@/lib/queries'
import { AdCards } from '@/components/advertising/ad-cards'
import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

export default async function AdvertisingPage() {
  const db = await createClient()
  const { data: { user } } = await db.auth.getUser()
  if (!user) redirect('/login')

  const storeIds = await getUserStoreIds(user.id)
  const adData   = await getAdPageData(storeIds)

  return (
    <div className="space-y-8 p-6">
      <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">Реклама</h1>
      <AdCards data={adData} />
    </div>
  )
}
