'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

interface CreditRow {
  id: string
  credit_name: string
  payment_date: string
  principal: number
  interest: number
  total_payment: number
  is_paid: boolean
}

function fmt(n: number) { return Math.round(n).toLocaleString('ru') + ' ₽' }

export function CashflowTable({ items }: { items: CreditRow[] }) {
  const router = useRouter()
  const [loading, setLoading] = useState<string | null>(null)

  async function togglePaid(id: string, is_paid: boolean) {
    setLoading(id)
    try {
      await fetch('/api/cashflow', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, is_paid: !is_paid }),
      })
      router.refresh()
    } finally {
      setLoading(null)
    }
  }

  async function handleDelete(id: string) {
    setLoading(id + '_del')
    try {
      await fetch('/api/cashflow', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })
      router.refresh()
    } finally {
      setLoading(null)
    }
  }

  if (!items.length) {
    return <div className="text-center py-12 text-sm text-zinc-400">Платежи не добавлены</div>
  }

  const now = new Date()

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Дата</TableHead>
          <TableHead>Кредит</TableHead>
          <TableHead className="text-right">Тело</TableHead>
          <TableHead className="text-right">Проценты</TableHead>
          <TableHead className="text-right">Итого</TableHead>
          <TableHead className="text-center">Статус</TableHead>
          <TableHead className="w-8"></TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map(row => {
          const date = new Date(row.payment_date)
          const overdue = !row.is_paid && date < now
          return (
            <TableRow key={row.id} className={row.is_paid ? 'opacity-50' : ''}>
              <TableCell className={`text-sm tabular-nums ${overdue ? 'text-red-500 font-medium' : 'text-zinc-500'}`}>
                {date.toLocaleDateString('ru', { day: 'numeric', month: 'short', year: 'numeric' })}
                {overdue && <span className="ml-1 text-xs">(!)</span>}
              </TableCell>
              <TableCell className="text-sm font-medium">{row.credit_name}</TableCell>
              <TableCell className="text-right text-sm tabular-nums text-zinc-500">{row.principal ? fmt(row.principal) : '—'}</TableCell>
              <TableCell className="text-right text-sm tabular-nums text-zinc-500">{row.interest ? fmt(row.interest) : '—'}</TableCell>
              <TableCell className="text-right text-sm font-semibold tabular-nums">{fmt(row.total_payment)}</TableCell>
              <TableCell className="text-center">
                <button
                  onClick={() => togglePaid(row.id, row.is_paid)}
                  disabled={loading === row.id}
                  className={`text-xs px-2 py-0.5 rounded-full border transition-colors ${
                    row.is_paid
                      ? 'bg-emerald-50 text-emerald-600 border-emerald-200'
                      : 'bg-zinc-50 text-zinc-500 border-zinc-200 hover:border-emerald-300'
                  }`}
                >
                  {loading === row.id ? '...' : row.is_paid ? 'Оплачен' : 'Ожидает'}
                </button>
              </TableCell>
              <TableCell>
                <button
                  onClick={() => handleDelete(row.id)}
                  disabled={loading === row.id + '_del'}
                  className="text-zinc-300 hover:text-red-500 transition-colors text-xs"
                >×</button>
              </TableCell>
            </TableRow>
          )
        })}
      </TableBody>
    </Table>
  )
}
