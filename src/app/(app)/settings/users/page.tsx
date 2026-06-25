'use client'

import { useEffect, useState } from 'react'
import { ROLE_LABELS, CAN_INVITE_ROLES, type Role } from '@/lib/auth-roles-shared'
import { useRole } from '@/contexts/role-context'

interface Member {
  user_id: string
  role: Role
  name: string | null
  email: string
  image: string | null
}

interface Invite {
  id: string
  email: string
  role: Role
  expires_at: string
}

export default function UsersPage() {
  const { can, loading: roleLoading } = useRole()
  const [members, setMembers]   = useState<Member[]>([])
  const [invites, setInvites]   = useState<Invite[]>([])
  const [loading, setLoading]   = useState(true)
  const [email, setEmail]       = useState('')
  const [role, setRole]         = useState<Role>('viewer')
  const [saving, setSaving]     = useState(false)
  const [error, setError]       = useState('')
  const [success, setSuccess]   = useState('')

  async function load() {
    setLoading(true)
    const res = await fetch('/api/settings/users')
    if (res.ok) {
      const d = await res.json()
      setMembers(d.members ?? [])
      setInvites(d.invites ?? [])
    }
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function invite(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true); setError(''); setSuccess('')
    const res = await fetch('/api/settings/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, role }),
    })
    const d = await res.json()
    if (!res.ok) { setError(d.error ?? 'Ошибка') }
    else { setSuccess(`Приглашение отправлено на ${email}`); setEmail(''); load() }
    setSaving(false)
  }

  async function changeRole(userId: string, newRole: Role) {
    await fetch(`/api/settings/users/${userId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: newRole }),
    })
    load()
  }

  async function removeMember(userId: string) {
    if (!confirm('Удалить пользователя из магазина?')) return
    const res = await fetch(`/api/settings/users/${userId}`, { method: 'DELETE' })
    const d = await res.json()
    if (!res.ok) alert(d.error ?? 'Ошибка')
    else load()
  }

  if (!roleLoading && !can.manageUsers) {
    return (
      <div className="p-6">
        <p className="text-zinc-500 text-sm">У вас нет доступа к управлению пользователями.</p>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-2xl space-y-8">
      <div>
        <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">Пользователи</h1>
        <p className="text-sm text-zinc-400 mt-0.5">Управление доступом к магазину</p>
      </div>

      {/* Список участников */}
      <div className="space-y-2">
        <h2 className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Участники</h2>
        {loading ? (
          <p className="text-sm text-zinc-400 animate-pulse">Загружаем...</p>
        ) : (
          <div className="divide-y divide-zinc-100 dark:divide-zinc-800 border border-zinc-200 dark:border-zinc-800 rounded-xl overflow-hidden">
            {members.map(m => (
              <div key={m.user_id} className="flex items-center gap-3 px-4 py-3 bg-white dark:bg-zinc-900">
                {m.image
                  ? <img src={m.image} alt="" className="w-8 h-8 rounded-full shrink-0" />
                  : <div className="w-8 h-8 rounded-full bg-indigo-100 dark:bg-indigo-900 flex items-center justify-center text-xs font-semibold text-indigo-600 dark:text-indigo-400 shrink-0">
                      {(m.name ?? m.email)[0].toUpperCase()}
                    </div>
                }
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100 truncate">{m.name ?? m.email}</p>
                  <p className="text-xs text-zinc-400 truncate">{m.email}</p>
                </div>
                {m.role === 'owner' ? (
                  <span className="text-xs text-zinc-400 shrink-0">Владелец</span>
                ) : (
                  <select
                    value={m.role}
                    onChange={e => changeRole(m.user_id, e.target.value as Role)}
                    className="text-xs border border-zinc-200 dark:border-zinc-700 rounded-lg px-2 py-1.5 bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 shrink-0"
                  >
                    {CAN_INVITE_ROLES.map(r => (
                      <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                    ))}
                  </select>
                )}
                {m.role !== 'owner' && (
                  <button
                    onClick={() => removeMember(m.user_id)}
                    className="text-zinc-300 hover:text-red-500 dark:text-zinc-600 dark:hover:text-red-400 transition-colors text-lg leading-none shrink-0"
                    title="Удалить"
                  >×</button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Ожидающие инвайты */}
      {invites.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Ожидают принятия</h2>
          <div className="divide-y divide-zinc-100 dark:divide-zinc-800 border border-zinc-200 dark:border-zinc-800 rounded-xl overflow-hidden">
            {invites.map(inv => (
              <div key={inv.id} className="flex items-center gap-3 px-4 py-3 bg-white dark:bg-zinc-900">
                <div className="w-8 h-8 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-xs text-zinc-400 shrink-0">✉️</div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100 truncate">{inv.email}</p>
                  <p className="text-xs text-zinc-400">{ROLE_LABELS[inv.role]} · ожидает</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Форма приглашения */}
      <div className="space-y-3">
        <h2 className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Пригласить</h2>
        <form onSubmit={invite} className="flex items-end gap-2 flex-wrap">
          <div className="flex-1 min-w-[200px]">
            <label className="text-xs text-zinc-500 mb-1 block">Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="email@example.com"
              className="w-full text-sm px-3 py-2 border border-zinc-200 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400"
            />
          </div>
          <div>
            <label className="text-xs text-zinc-500 mb-1 block">Роль</label>
            <select
              value={role}
              onChange={e => setRole(e.target.value as Role)}
              className="text-sm px-3 py-2 border border-zinc-200 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100"
            >
              {CAN_INVITE_ROLES.map(r => (
                <option key={r} value={r}>{ROLE_LABELS[r]}</option>
              ))}
            </select>
          </div>
          <button
            type="submit"
            disabled={saving}
            className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
          >
            {saving ? 'Отправляем...' : 'Пригласить'}
          </button>
        </form>
        {error   && <p className="text-sm text-red-500">{error}</p>}
        {success && <p className="text-sm text-emerald-600">{success}</p>}
      </div>
    </div>
  )
}
