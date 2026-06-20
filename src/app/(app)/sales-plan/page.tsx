'use client'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export default function SalesPlanPage() {
  const downloadTemplate = () => {
    window.location.href = '/api/sales-plan/template'
  }

  return (
    <div className="p-6 max-w-[900px] space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">План продаж</h1>
        <p className="text-sm text-zinc-400 mt-0.5">Загрузка плана по артикулам и неделям</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Шаблон для загрузки</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="text-sm text-zinc-600 dark:text-zinc-400 space-y-1">
            <p>Шаблон содержит все ваши артикулы. Заполните колонку <strong>«Заказы в неделю»</strong> и укажите номер недели.</p>
            <p className="text-xs text-zinc-400">Формат номера недели: <code className="bg-zinc-100 dark:bg-zinc-800 px-1 rounded">18 (26)</code> — где 18 номер недели, 26 — год. Доступные недели перечислены на листе «Недели».</p>
          </div>
          <div className="flex gap-3">
            <Button onClick={downloadTemplate} variant="outline">
              ↓ Скачать шаблон плана
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
