import { redirect } from 'next/navigation'
import { getServerSession } from '@/lib/auth-server'
import { getUserStoreIds, getStores } from '@/lib/queries'
import { Sidebar } from '@/components/layout/sidebar'
import { RoleProvider } from '@/contexts/role-context'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession()
  if (!session?.user) redirect('/login')

  const storeIds = await getUserStoreIds(session.user.id)
  const stores = await getStores(storeIds)
  const storeName = stores[0]?.name

  return (
    <RoleProvider>
      <div className="flex min-h-screen">
        <Sidebar storeName={storeName} />
        <main className="flex-1 bg-zinc-50 dark:bg-zinc-950 overflow-auto">
          {children}
        </main>
      </div>
    </RoleProvider>
  )
}
