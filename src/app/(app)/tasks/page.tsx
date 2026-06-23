'use client'

import { useState, useEffect, useCallback } from 'react'

interface Task {
  id: number
  nm_id: number | null
  title: string
  description: string | null
  status: 'todo' | 'in_progress' | 'done'
  priority: 'low' | 'medium' | 'high'
  due_date: string | null
  created_at: string
}

const STATUS_LABELS: Record<string, string> = { todo: 'К выполнению', in_progress: 'В работе', done: 'Готово' }
const STATUS_COLORS: Record<string, string> = {
  todo: 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400',
  in_progress: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  done: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
}
const PRIORITY_COLORS: Record<string, string> = {
  low: 'text-zinc-400',
  medium: 'text-amber-500',
  high: 'text-red-500',
}
const PRIORITY_LABELS: Record<string, string> = { low: 'Низкий', medium: 'Средний', high: 'Высокий' }

const STATUSES = ['todo', 'in_progress', 'done'] as const

function isOverdue(due: string | null) {
  if (!due) return false
  return new Date(due) < new Date(new Date().toDateString())
}

export default function TasksPage() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [filterStatus, setFilterStatus] = useState<string>('')
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ title: '', description: '', priority: 'medium', due_date: '', nm_id: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const url = filterStatus ? `/api/tasks?status=${filterStatus}` : '/api/tasks'
    const res = await fetch(url)
    setTasks(await res.json())
    setLoading(false)
  }, [filterStatus])

  useEffect(() => { load() }, [load])

  async function updateStatus(id: number, status: string) {
    await fetch(`/api/tasks/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
    setTasks(prev => prev.map(t => t.id === id ? { ...t, status: status as Task['status'] } : t))
  }

  async function deleteTask(id: number) {
    await fetch(`/api/tasks/${id}`, { method: 'DELETE' })
    setTasks(prev => prev.filter(t => t.id !== id))
  }

  async function createTask() {
    if (!form.title.trim()) return
    setSaving(true); setError('')
    try {
      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: form.title,
          description: form.description || null,
          priority: form.priority,
          due_date: form.due_date || null,
          nm_id: form.nm_id ? parseInt(form.nm_id) : null,
        }),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      setShowForm(false)
      setForm({ title: '', description: '', priority: 'medium', due_date: '', nm_id: '' })
      load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка')
    } finally { setSaving(false) }
  }

  // Group by status for kanban-style view
  const grouped = STATUSES.reduce((acc, s) => {
    acc[s] = tasks.filter(t => t.status === s)
    return acc
  }, {} as Record<string, Task[]>)

  return (
    <div className="p-6 space-y-6 max-w-[1200px]">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">Задачи</h1>
          <p className="text-sm text-zinc-400 mt-0.5">{tasks.length} задач</p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="px-4 py-2 text-sm bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors"
        >
          + Новая задача
        </button>
      </div>

      {/* Filter */}
      <div className="flex gap-2">
        <button
          onClick={() => setFilterStatus('')}
          className={`px-3 py-1.5 text-xs rounded-lg border transition-colors ${!filterStatus ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900' : 'border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400'}`}
        >
          Все
        </button>
        {STATUSES.map(s => (
          <button
            key={s}
            onClick={() => setFilterStatus(filterStatus === s ? '' : s)}
            className={`px-3 py-1.5 text-xs rounded-lg border transition-colors ${filterStatus === s ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900' : 'border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400'}`}
          >
            {STATUS_LABELS[s]}
          </button>
        ))}
      </div>

      {/* New task form */}
      {showForm && (
        <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-5 space-y-4">
          <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">Новая задача</h2>
          <input
            value={form.title}
            onChange={e => setForm(p => ({ ...p, title: e.target.value }))}
            placeholder="Название задачи *"
            className="w-full px-3 py-2 text-sm border border-zinc-200 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <textarea
            value={form.description}
            onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
            placeholder="Описание (опционально)"
            rows={2}
            className="w-full px-3 py-2 text-sm border border-zinc-200 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
          />
          <div className="flex gap-3 flex-wrap">
            <select
              value={form.priority}
              onChange={e => setForm(p => ({ ...p, priority: e.target.value }))}
              className="px-3 py-2 text-sm border border-zinc-200 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 focus:outline-none"
            >
              <option value="low">Низкий приоритет</option>
              <option value="medium">Средний приоритет</option>
              <option value="high">Высокий приоритет</option>
            </select>
            <input
              type="date"
              value={form.due_date}
              onChange={e => setForm(p => ({ ...p, due_date: e.target.value }))}
              className="px-3 py-2 text-sm border border-zinc-200 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 focus:outline-none"
            />
            <input
              type="number"
              value={form.nm_id}
              onChange={e => setForm(p => ({ ...p, nm_id: e.target.value }))}
              placeholder="nmId товара (опц.)"
              className="w-44 px-3 py-2 text-sm border border-zinc-200 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 focus:outline-none"
            />
          </div>
          {error && <p className="text-sm text-red-500">{error}</p>}
          <div className="flex gap-2">
            <button onClick={createTask} disabled={saving || !form.title.trim()}
              className="px-4 py-2 text-sm bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-lg transition-colors">
              {saving ? 'Создаём…' : 'Создать'}
            </button>
            <button onClick={() => setShowForm(false)}
              className="px-4 py-2 text-sm border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors">
              Отмена
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16 text-sm text-zinc-400">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
            Загружаем…
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {STATUSES.map(status => (
            <div key={status} className="space-y-2">
              <div className="flex items-center gap-2 px-1">
                <span className={`px-2 py-0.5 text-xs rounded-full font-medium ${STATUS_COLORS[status]}`}>
                  {STATUS_LABELS[status]}
                </span>
                <span className="text-xs text-zinc-400">{grouped[status]?.length ?? 0}</span>
              </div>
              <div className="space-y-2 min-h-[60px]">
                {(grouped[status] ?? []).map(task => (
                  <div key={task.id} className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-4 space-y-2.5">
                    <div className="flex items-start gap-2">
                      <span className={`mt-0.5 text-base leading-none ${PRIORITY_COLORS[task.priority]}`}>●</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200 leading-snug">{task.title}</p>
                        {task.description && (
                          <p className="text-xs text-zinc-400 mt-1 leading-relaxed">{task.description}</p>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 flex-wrap">
                      {task.nm_id && (
                        <a href={`/sku/${task.nm_id}`}
                          className="text-xs text-indigo-500 hover:text-indigo-700 transition-colors">
                          nmId {task.nm_id} →
                        </a>
                      )}
                      {task.due_date && (
                        <span className={`text-xs ${isOverdue(task.due_date) && task.status !== 'done' ? 'text-red-500 font-medium' : 'text-zinc-400'}`}>
                          {isOverdue(task.due_date) && task.status !== 'done' ? '⚠ ' : ''}до {task.due_date}
                        </span>
                      )}
                      <span className="text-xs text-zinc-300 dark:text-zinc-600 ml-auto">
                        {PRIORITY_LABELS[task.priority]}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 pt-1 border-t border-zinc-100 dark:border-zinc-800">
                      {STATUSES.filter(s => s !== status).map(s => (
                        <button key={s}
                          onClick={() => updateStatus(task.id, s)}
                          className="px-2 py-0.5 text-xs rounded border border-zinc-200 dark:border-zinc-700 text-zinc-500 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors">
                          → {STATUS_LABELS[s]}
                        </button>
                      ))}
                      <button
                        onClick={() => deleteTask(task.id)}
                        className="ml-auto text-xs text-zinc-300 dark:text-zinc-600 hover:text-red-400 transition-colors">
                        ✕
                      </button>
                    </div>
                  </div>
                ))}
                {(grouped[status] ?? []).length === 0 && (
                  <div className="border-2 border-dashed border-zinc-100 dark:border-zinc-800 rounded-xl h-16 flex items-center justify-center">
                    <span className="text-xs text-zinc-300 dark:text-zinc-700">Пусто</span>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
