'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export function CashflowForm({ storeId }: { storeId: string }) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({
    credit_name: '',
    payment_date: '',
    principal: '',
    interest: '',
    total_payment: '',
  })

  function set(key: string, val: string) {
    setForm(f => {
      const next = { ...f, [key]: val }
      if (key === 'principal' || key === 'interest') {
        const p = Number(next.principal) || 0
        const i = Number(next.interest) || 0
        next.total_payment = p + i > 0 ? String(p + i) : next.total_payment
      }
      return next
    })
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    try {
      await fetch('/api/cashflow', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          store_id: storeId,
          credit_name: form.credit_name,
          payment_date: form.payment_date,
          principal: Number(form.principal) || 0,
          interest: Number(form.interest) || 0,
          total_payment: Number(form.total_payment),
        }),
      })
      setForm({ credit_name: '', payment_date: '', principal: '', interest: '', total_payment: '' })
      router.refresh()
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-wrap gap-3 items-end">
      <div className="flex flex-col gap-1 flex-1 min-w-36">
        <label className="text-xs text-zinc-500">Название кредита</label>
        <Input placeholder="Кредит ВТБ" value={form.credit_name} onChange={e => set('credit_name', e.target.value)} required />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs text-zinc-500">Дата платежа</label>
        <Input type="date" value={form.payment_date} onChange={e => set('payment_date', e.target.value)} className="w-36" required />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs text-zinc-500">Тело, ₽</label>
        <Input type="number" min={0} placeholder="50000" value={form.principal} onChange={e => set('principal', e.target.value)} className="w-28" />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs text-zinc-500">Проценты, ₽</label>
        <Input type="number" min={0} placeholder="5000" value={form.interest} onChange={e => set('interest', e.target.value)} className="w-28" />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs text-zinc-500">Итого, ₽</label>
        <Input type="number" min={1} placeholder="55000" value={form.total_payment} onChange={e => set('total_payment', e.target.value)} className="w-28" required />
      </div>
      <Button type="submit" disabled={loading} className="h-9">
        {loading ? '...' : '+ Добавить'}
      </Button>
    </form>
  )
}
