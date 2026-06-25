export const dynamic = 'force-dynamic'

import { getServerSession } from '@/lib/auth-server'
import { redirect } from 'next/navigation'
import { ImportWizard } from '@/components/import/import-wizard'
import { WeeklyReportUpload } from '@/components/import/weekly-report-upload'

export default async function ImportPage() {
  const session = await getServerSession()
  if (!session?.user) redirect('/login')
  const user = session.user

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Загрузка архивных данных</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Импорт исторических данных из файлов XLSX/CSV. Дубликаты пропускаются автоматически.
        </p>
      </div>

      {/* Supported formats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {[
          {
            icon: '₽',
            title: 'Финансовый отчёт WB',
            desc: 'Выгрузка из ЛК → Финансы → Детализация. Поля rrd_id, ppvz_for_pay, supplier_oper_name и др.',
            key: 'rrd_id',
          },
          {
            icon: '📦',
            title: 'Заказы WB',
            desc: 'Выгрузка из ЛК → Заказы. Поля date, nm_id, srid, total_price и др.',
            key: 'srid',
          },
          {
            icon: '◈',
            title: 'Рекламная статистика',
            desc: 'Экспорт из рекламного кабинета WB. Поля campaign_id, date, spend, views, clicks.',
            key: 'campaign_id + date',
          },
          {
            icon: '📊',
            title: 'Еженедельные отчёты WB',
            desc: 'Сводный XLSX или детализированный ZIP с отчётом. Поддержка поиска по номеру отчёта.',
            key: 'report_number + srid',
          },
        ].map(f => (
          <div key={f.title} className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xl">{f.icon}</span>
              <span className="text-sm font-semibold">{f.title}</span>
            </div>
            <p className="text-xs text-muted-foreground">{f.desc}</p>
            <p className="text-xs text-muted-foreground mt-2">Дедупликация по: <code className="bg-muted px-1 rounded">{f.key}</code></p>
          </div>
        ))}
      </div>

      <ImportWizard />

      <div className="rounded-xl border border-border bg-card p-5">
        <h2 className="font-semibold mb-1">Еженедельные отчёты</h2>
        <p className="text-sm text-muted-foreground mb-4">
          Загрузка сводного XLSX или детализированного ZIP-архива с отчётом WB
        </p>
        <WeeklyReportUpload />
      </div>
    </div>
  )
}
