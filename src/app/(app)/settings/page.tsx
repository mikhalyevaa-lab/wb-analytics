import { adminDb } from '@/lib/db-compat'
import { redirect } from 'next/navigation'
import { getServerSession } from '@/lib/auth-server'
import { getUserStoreIds, getStores } from '@/lib/queries'
import { SettingsForm } from '@/components/settings/settings-form'
import { StoreSettingsForm } from '@/components/settings/store-settings-form'
import { SyncStatus } from '@/components/settings/sync-status'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { PageHeader } from '@/components/ui/page-header'

export const dynamic = 'force-dynamic'

export default async function SettingsPage() {
  const session = await getServerSession()
  if (!session?.user) redirect('/login')
  const user = session.user

  const storeIds = await getUserStoreIds(user.id)
  if (!storeIds.length) redirect('/dashboard')

  const stores = await getStores(storeIds)
  const primaryStore = stores[0]

  const { data: storeData } = await adminDb()
    .from('stores')
    .select('id, name, wb_token, wb_analytics_token')
    .eq('id', primaryStore.id)
    .single()

  const { data: profile } = await adminDb()
    .from('profiles')
    .select('telegram_chat_id')
    .eq('id', user.id)
    .maybeSingle()

  return (
    <div className="p-6 space-y-6 max-w-[700px]">
      <PageHeader
        picto="settings"
        title="Настройки"
        subtitle="Управление магазином и уведомлениями"
      />

      <SettingsForm
        storeId={primaryStore.id}
        storeName={storeData?.name || ''}
        wbToken={storeData?.wb_token || ''}
        wbAnalyticsToken={storeData?.wb_analytics_token || ''}
        telegramChatId={profile?.telegram_chat_id?.toString() || null}
      />

      <StoreSettingsForm />

      <Card className="overflow-hidden p-0">
        <CardHeader className="px-5 py-4 border-b border-zinc-100 dark:border-zinc-800">
          <CardTitle className="text-base">Синхронизация данных</CardTitle>
        </CardHeader>
        <CardContent className="p-5">
          <SyncStatus />
        </CardContent>
      </Card>

      <a
        href="/settings/users"
        className="flex items-center justify-between px-5 py-4 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
      >
        <div>
          <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">Пользователи</p>
          <p className="text-xs text-zinc-400 mt-0.5">Управление доступом к магазину</p>
        </div>
        <span className="text-zinc-400 text-lg">›</span>
      </a>
    </div>
  )
}
