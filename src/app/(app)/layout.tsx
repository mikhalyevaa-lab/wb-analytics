import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase-server'
import { getUserStoreIds, getStores } from '@/lib/queries'
import { Sidebar } from '@/components/layout/sidebar'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const db = await createClient()
  const { data: { user } } = await db.auth.getUser()

  if (!user) redirect('/login')

  const storeIds = await getUserStoreIds(user.id)
  const stores = await getStores(storeIds)
  const storeName = stores[0]?.name

  return (
    <div className="flex min-h-screen">
      <Sidebar storeName={storeName} />
      <main className="flex-1 bg-zinc-50 dark:bg-zinc-950 overflow-auto">
        {children}
      </main>
    </div>
  )
}
