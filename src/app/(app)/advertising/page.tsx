import { getServerSession } from '@/lib/auth-server'
import { getUserStoreIds, getAdPageData } from '@/lib/queries'
import { AdCards } from '@/components/advertising/ad-cards'
import { CampaignsTable } from '@/components/advertising/campaigns-table'
import { AdSyncPanel } from '@/components/advertising/ad-sync-panel'
import { redirect } from 'next/navigation'
import { Hint } from '@/components/ui/hint'
import { PageHeader } from '@/components/ui/page-header'

export const dynamic = 'force-dynamic'

export default async function AdvertisingPage() {
  const session = await getServerSession()
  if (!session?.user) redirect('/login')
  const user = session.user

  const storeIds = await getUserStoreIds(user.id)
  const adData   = await getAdPageData(storeIds)

  return (
    <div className="space-y-8 p-6">
      <PageHeader picto="advertising" title="Реклама" subtitle="Кампании WB · ДРР · данные за последние 90 дней">
        <Hint width={340}>
          <strong>Блок Реклама</strong><br /><br />
          <strong>Источник данных:</strong> WB API рекламы (wb_ad_spend). WB хранит данные только за последние 90 дней — синхронизируйте регулярно чтобы не потерять историю.<br /><br />
          <strong>Анализ РК</strong> — детализация по каждой рекламной кампании с метриками эффективности.<br /><br />
          <strong>Заказы по рекламе</strong> — данные о заказах из рекламного кабинета WB. Могут отличаться от заказов в воронке продаж из-за разной методологии атрибуции.
        </Hint>
      </PageHeader>
      <AdCards data={adData} />

      <AdSyncPanel />

      <div>
        <CampaignsTable />
      </div>
    </div>
  )
}
