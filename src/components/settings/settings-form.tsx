'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

interface SettingsFormProps {
  storeId: string
  storeName: string
  wbToken: string
  wbAnalyticsToken: string
  telegramChatId: string | null
}

export function SettingsForm({ storeId, storeName, wbToken, wbAnalyticsToken, telegramChatId }: SettingsFormProps) {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [syncResult, setSyncResult] = useState<string | null>(null)

  const [form, setForm] = useState({
    store_name: storeName,
    wb_token: wbToken,
    wb_analytics_token: wbAnalyticsToken,
    telegram_chat_id: telegramChatId || '',
  })

  async function handleSave() {
    setSaving(true)
    try {
      const res = await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ store_id: storeId, ...form }),
      })
      if (res.ok) router.refresh()
    } finally {
      setSaving(false)
    }
  }

  async function handleSync() {
    setSyncing(true)
    setSyncResult(null)
    try {
      const res = await fetch('/api/sync/manual', { method: 'POST' })
      if (res.ok) {
        const data = await res.json()
        const summary = Object.entries(data.results || {}).map(([name, r]) => {
          const result = r as { results?: Record<string, { count: number }> }
          const counts = Object.entries(result.results || {}).map(([k, v]) => `${k}: ${v.count}`).join(', ')
          return `${name}: ${counts}`
        }).join('; ')
        setSyncResult(`Готово! ${summary || 'нет данных'}`)
      } else {
        setSyncResult('Ошибка синхронизации')
      }
    } catch {
      setSyncResult('Ошибка сети')
    } finally {
      setSyncing(false)
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Магазин</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-sm text-zinc-500">Название магазина</label>
            <Input
              value={form.store_name}
              onChange={e => setForm(f => ({ ...f, store_name: e.target.value }))}
              placeholder="Мой магазин"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm text-zinc-500">WB API токен</label>
            <Input
              type="password"
              value={form.wb_token}
              onChange={e => setForm(f => ({ ...f, wb_token: e.target.value }))}
              placeholder="eyJ..."
              className="font-mono text-sm"
            />
            <p className="text-xs text-zinc-400">
              Получить: WB → Настройки → Доступ к API → Создать токен (Statistics)
            </p>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm text-zinc-500">WB Analytics токен</label>
            <Input
              type="password"
              value={form.wb_analytics_token}
              onChange={e => setForm(f => ({ ...f, wb_analytics_token: e.target.value }))}
              placeholder="eyJ..."
              className="font-mono text-sm"
            />
            <p className="text-xs text-zinc-400">
              Нужен для воронки продаж. WB → Настройки → Доступ к API → Аналитика
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Telegram уведомления</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-sm text-zinc-500">Chat ID</label>
            <Input
              type="number"
              value={form.telegram_chat_id}
              onChange={e => setForm(f => ({ ...f, telegram_chat_id: e.target.value }))}
              placeholder="123456789"
            />
            <p className="text-xs text-zinc-400">
              Узнать: напишите боту @userinfobot в Telegram
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center gap-3">
        <Button onClick={handleSave} disabled={saving}>
          {saving ? 'Сохранение...' : 'Сохранить настройки'}
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Синхронизация данных</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-zinc-500">
            Данные синхронизируются автоматически каждые 120 минут. Можно запустить вручную.
          </p>
          <Button variant="outline" onClick={handleSync} disabled={syncing}>
            {syncing ? 'Синхронизация...' : 'Запустить синхронизацию'}
          </Button>
          {syncResult && (
            <p className="text-sm text-zinc-600 dark:text-zinc-400 bg-zinc-50 dark:bg-zinc-800 p-3 rounded-lg">
              {syncResult}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
