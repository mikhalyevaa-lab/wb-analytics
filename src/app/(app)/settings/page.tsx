import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase-server'
import { getUserStoreIds, getStores } from '@/lib/queries'
import { SettingsForm } from '@/components/settings/settings-form'

export const dynamic = 'force-dynamic'

export default async function SettingsPage() {
  const db = await createClient()
  const { data: { user } } = await db.auth.getUser()
  if (!user) redirect('/login')

  const storeIds = await getUserStoreIds(user.id)
  if (!storeIds.length) redirect('/dashboard')

  const stores = await getStores(storeIds)
  const primaryStore = stores[0]

  const { data: storeData } = await db
    .from('stores')
    .select('id, name, wb_token')
    .eq('id', primaryStore.id)
    .single()

  const { data: profile } = await db
    .from('profiles')
    .select('telegram_chat_id')
    .eq('id', user.id)
    .single()

  return (
    <div className="p-6 space-y-6 max-w-[600px]">
      <div>
        <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">Настройки</h1>
        <p className="text-sm text-zinc-400 mt-0.5">Управление магазином и уведомлениями</p>
      </div>

      <SettingsForm
        storeId={primaryStore.id}
        storeName={storeData?.name || ''}
        wbToken={storeData?.wb_token || ''}
        telegramChatId={profile?.telegram_chat_id?.toString() || null}
      />
    </div>
  )
}
