'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ROLE_LABELS, type Role } from '@/lib/auth-roles-shared'

export default function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const router = useRouter()
  const [token, setToken]     = useState<string | null>(null)
  const [info, setInfo]       = useState<{
    email: string; role: Role; storeName: string; inviterName: string; accepted: boolean; expired: boolean
  } | null>(null)
  const [loading, setLoading] = useState(true)
  const [accepting, setAccepting] = useState(false)
  const [error, setError]     = useState('')

  useEffect(() => {
    params.then(p => {
      setToken(p.token)
      fetch(`/api/invite/${p.token}`)
        .then(r => r.json())
        .then(d => { setInfo(d); setLoading(false) })
        .catch(() => { setError('Не удалось загрузить приглашение'); setLoading(false) })
    })
  }, [params])

  async function accept() {
    if (!token) return
    setAccepting(true); setError('')
    const res = await fetch(`/api/invite/${token}`, { method: 'POST' })
    const data = await res.json()
    if (!res.ok) {
      setError(data.error ?? 'Ошибка')
      setAccepting(false)
      // Если нужно войти — перенаправляем на логин
      if (res.status === 401) router.push(`/login?redirect=/invite/${token}`)
    } else {
      router.push('/dashboard')
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-zinc-400 animate-pulse">Загружаем приглашение...</p>
      </div>
    )
  }

  if (!info || (info as { error?: string }).error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center space-y-2">
          <p className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">Приглашение не найдено</p>
          <p className="text-sm text-zinc-500">Ссылка недействительна или устарела</p>
          <a href="/login" className="inline-block mt-4 text-sm text-indigo-600 hover:underline">Войти в систему</a>
        </div>
      </div>
    )
  }

  if (info.accepted) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center space-y-2">
          <p className="text-xl font-semibold">✅ Приглашение уже принято</p>
          <a href="/dashboard" className="inline-block mt-4 text-sm text-indigo-600 hover:underline">Перейти в аналитику</a>
        </div>
      </div>
    )
  }

  if (info.expired) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center space-y-2">
          <p className="text-xl font-semibold text-red-600">Срок приглашения истёк</p>
          <p className="text-sm text-zinc-500">Попросите владельца отправить новое приглашение</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-50 dark:bg-zinc-950 px-4">
      <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm p-8 max-w-md w-full space-y-6">
        <div className="text-center space-y-1">
          <div className="text-4xl mb-3">📊</div>
          <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">Приглашение в WB Analytics</h1>
          <p className="text-sm text-zinc-500">{info.inviterName} приглашает вас в магазин</p>
        </div>

        <div className="bg-zinc-50 dark:bg-zinc-800 rounded-xl p-4 space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-zinc-500">Магазин</span>
            <span className="font-medium text-zinc-900 dark:text-zinc-100">{info.storeName}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-zinc-500">Ваша роль</span>
            <span className="font-medium text-zinc-900 dark:text-zinc-100">{ROLE_LABELS[info.role] ?? info.role}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-zinc-500">Email</span>
            <span className="font-medium text-zinc-900 dark:text-zinc-100">{info.email}</span>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-lg px-4 py-3 text-sm text-red-700 dark:text-red-400">
            {error}
          </div>
        )}

        <button
          onClick={accept}
          disabled={accepting}
          className="w-full py-2.5 text-sm font-medium bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 disabled:opacity-50 transition-colors"
        >
          {accepting ? 'Принимаем...' : 'Принять приглашение'}
        </button>
        <p className="text-xs text-center text-zinc-400">
          Войдите с адресом {info.email}, если ещё не авторизованы
        </p>
      </div>
    </div>
  )
}
