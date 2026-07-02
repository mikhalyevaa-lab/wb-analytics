export const dynamic = 'force-dynamic'

import { getServerSession } from '@/lib/auth-server'
import { redirect } from 'next/navigation'
import { ImportWizard } from '@/components/import/import-wizard'
import { WeeklyReportUpload } from '@/components/import/weekly-report-upload'
import { TariffUpload } from '@/components/logistics/tariff-upload'
import { PageHeader } from '@/components/ui/page-header'

export default async function ImportPage() {
  const session = await getServerSession()
  if (!session?.user) redirect('/login')

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <PageHeader
        picto="import"
        title="Импорт данных"
        subtitle="Загрузка отчётов из файлов WB. Дубликаты пропускаются автоматически."
      />

      {/* ── Раздел 1: Список отчётов ── */}
      <Section
        badge="1"
        title="Список отчётов WB"
        description="Файл «Еженедельный отчет ГГГГ-ММ-ДД - ГГГГ-ММ-ДД_…xlsx» из ЛК → Финансы → Отчёты о реализации. Содержит сводные суммы за каждую неделю."
        hint="Загружайте после получения нового отчёта от WB. Данные появятся в разделе Отчёты."
      >
        <WeeklyReportUpload mode="summary" />
      </Section>

      {/* ── Раздел 2: Детализированные отчёты ── */}
      <Section
        badge="2"
        title="Детализированные отчёты"
        description={
          <span>
            ZIP-архивы из ЛК → Финансы → Отчёты о реализации:<br />
            <span className="text-green-500 dark:text-green-400 font-medium">Еженедельный детализированный</span> — финальные данные за неделю (наивысший приоритет).<br />
            <span className="text-amber-500 dark:text-amber-400 font-medium">Ежедневный детализированный</span> — оперативные данные, замещаются при появлении еженедельного.
          </span>
        }
        hint="Тип определяется автоматически по имени файла. Можно загружать несколько файлов подряд."
      >
        <WeeklyReportUpload mode="detail" />
      </Section>

      {/* ── Раздел 3: Архивные данные ── */}
      <Section
        badge="3"
        title="Архивные данные"
        description="Исторические данные из ЛК WB: заказы, финансы API (старый формат), рекламная статистика."
        hint="Разовая загрузка для заполнения истории. Текущие данные синхронизируются автоматически."
      >
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
          {[
            { icon: '₽', title: 'Финансовый отчёт WB', desc: 'Детализация из ЛК → Финансы', key: 'rrd_id' },
            { icon: '📦', title: 'Заказы WB', desc: 'Выгрузка заказов из ЛК', key: 'srid' },
            { icon: '◈', title: 'Рекламная статистика', desc: 'Экспорт из рекламного кабинета', key: 'campaign_id + date' },
          ].map(f => (
            <div key={f.title} className="rounded-xl border border-border bg-card/50 p-4">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xl">{f.icon}</span>
                <span className="text-sm font-semibold">{f.title}</span>
              </div>
              <p className="text-xs text-muted-foreground">{f.desc}</p>
              <p className="text-xs text-muted-foreground mt-1">Дедупликация: <code className="bg-muted px-1 rounded">{f.key}</code></p>
            </div>
          ))}
        </div>
        <ImportWizard />
      </Section>

      {/* ── Раздел 4: Тарифы складов ── */}
      <Section
        badge="4"
        title="Тарифы складов WB"
        description="Файл «warehouse coefficients YYYY-MM-DD.xlsx» из ЛК WB. Дата тарифов определяется автоматически из имени файла."
        hint="Загружайте при каждом изменении тарифов. Нужны для корректного расчёта фиксированной логистики по правилу 90 дней."
      >
        <TariffUpload />
      </Section>
    </div>
  )
}

function Section({
  badge,
  title,
  description,
  hint,
  children,
}: {
  badge: string
  title: string
  description: React.ReactNode
  hint: string
  children: React.ReactNode
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-5 space-y-4">
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 w-7 h-7 rounded-full bg-indigo-600 text-white text-sm font-bold flex items-center justify-center mt-0.5">
          {badge}
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="font-semibold text-base">{title}</h2>
          <div className="text-sm text-muted-foreground mt-1 leading-relaxed">{description}</div>
        </div>
      </div>
      <div className="border-t border-border pt-4">
        {children}
      </div>
      <p className="text-xs text-muted-foreground/70 flex items-center gap-1">
        <span>💡</span>
        <span>{hint}</span>
      </p>
    </div>
  )
}

// Нужен React для JSX в server component
import React from 'react'
