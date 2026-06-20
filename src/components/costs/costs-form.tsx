'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

const CATEGORIES = [
  { value: 'salary', label: 'ФОТ' },
  { value: 'rent', label: 'Аренда' },
  { value: 'tax', label: 'Налоги' },
  { value: 'loan', label: 'Кредит' },
  { value: 'other', label: 'Прочее' },
]

export function CostsForm({ storeId, today }: { storeId: string; today: string }) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({
    date: today,
    category: 'salary',
    description: '',
    amount: '',
  })

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.amount || Number(form.amount) <= 0) return
    setLoading(true)
    try {
      const res = await fetch('/api/costs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ store_id: storeId, ...form, amount: Number(form.amount) }),
      })
      if (!res.ok) throw new Error()
      setForm(f => ({ ...f, description: '', amount: '' }))
      router.refresh()
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-wrap gap-3 items-end">
      <div className="flex flex-col gap-1">
        <label className="text-xs text-zinc-500">Дата</label>
        <Input
          type="date"
          value={form.date}
          onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
          className="w-36"
          required
        />
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs text-zinc-500">Категория</label>
        <select
          value={form.category}
          onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
        >
          {CATEGORIES.map(c => (
            <option key={c.value} value={c.value}>{c.label}</option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1 flex-1 min-w-40">
        <label className="text-xs text-zinc-500">Описание</label>
        <Input
          placeholder="Зарплата менеджера..."
          value={form.description}
          onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
        />
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs text-zinc-500">Сумма, ₽</label>
        <Input
          type="number"
          min={1}
          step={1}
          placeholder="50000"
          value={form.amount}
          onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
          className="w-32"
          required
        />
      </div>

      <Button type="submit" disabled={loading} className="h-9">
        {loading ? '...' : '+ Добавить'}
      </Button>
    </form>
  )
}
