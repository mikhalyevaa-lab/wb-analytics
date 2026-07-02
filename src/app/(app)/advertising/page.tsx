import { getServerSession } from '@/lib/auth-server'
import { getUserStoreIds, getAdPageData } from '@/lib/queries'
import { AdCards } from '@/components/advertising/ad-cards'
import { CampaignsTable } from '@/components/advertising/campaigns-table'
import { AdSyncPanel } from '@/components/advertising/ad-sync-panel'
import { redirect } from 'next/navigation'
import { Hint } from '@/components/ui/hint'
import { SectionShell } from '@/components/layout/section-shell'

export const dynamic = 'force-dynamic'

export default async function AdvertisingPage() {
  const session = await getServerSession()
  if (!session?.user) redirect('/login')
  const user = session.user

  const storeIds = await getUserStoreIds(user.id)
  const adData   = await getAdPageData(storeIds)

  return (
    <SectionShell>
      <div className="flex items-start gap-2">
        <div>
          <p className="text-[13px] font-semibold uppercase tracking-wider" style={{ color: 'var(--app-graphite)' }}>Реклама</p>
          <h1 style={{ fontFamily: 'var(--app-font-serif)', fontSize: 32, color: 'var(--app-text)', marginTop: 4 }}>Кампании WB</h1>
          <p className="text-[14px] mt-1" style={{ color: 'var(--app-graphite)' }}>ДРР · данные за последние 90 дней</p>
        </div>
        <Hint width={340}>
          <strong>Блок Реклама</strong><br /><br />
          <strong>Источник данных:</strong> WB API рекламы (wb_ad_spend). WB хранит данные только за последние 90 дней — синхронизируйте регулярно чтобы не потерять историю.<br /><br />
          <strong>Анализ РК</strong> — детализация по каждой рекламной кампании с метриками эффективности.<br /><br />
          <strong>Заказы по рекламе</strong> — данные о заказах из рекламного кабинета WB. Могут отличаться от заказов в воронке продаж из-за разной методологии атрибуции.
        </Hint>
      </div>
      <AdCards data={adData} />

      <AdSyncPanel />

      <div>
        <CampaignsTable />
      </div>
    </SectionShell>
  )
}
