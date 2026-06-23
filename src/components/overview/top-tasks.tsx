import Link from 'next/link'

interface Task {
  id: string
  title: string
  priority: 'low' | 'medium' | 'high' | 'critical'
  status: 'todo' | 'in_progress' | 'done'
  due_date: string | null
  nm_id: number | null
}

const priorityLabel: Record<string, string> = {
  critical: '🔴',
  high: '🟠',
  medium: '🟡',
  low: '⚪',
}

const statusLabel: Record<string, string> = {
  todo: 'К выполнению',
  in_progress: 'В работе',
  done: 'Готово',
}

export function TopTasks({ tasks }: { tasks: Task[] }) {
  const topTasks = tasks
    .filter(t => t.status !== 'done')
    .sort((a, b) => {
      const prio = { critical: 0, high: 1, medium: 2, low: 3 }
      return (prio[a.priority] ?? 4) - (prio[b.priority] ?? 4)
    })
    .slice(0, 5)

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Топ задач</h2>
        <Link href="/tasks" className="text-xs text-primary hover:underline">Все задачи →</Link>
      </div>
      <div className="rounded-xl border border-border bg-card divide-y divide-border">
        {topTasks.length === 0 ? (
          <div className="px-4 py-6 text-center text-sm text-muted-foreground">Нет активных задач</div>
        ) : (
          topTasks.map(task => (
            <div key={task.id} className="flex items-center gap-3 px-4 py-3">
              <span className="text-base shrink-0">{priorityLabel[task.priority] ?? '⚪'}</span>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{task.title}</div>
                <div className="text-xs text-muted-foreground flex gap-2 mt-0.5">
                  <span>{statusLabel[task.status]}</span>
                  {task.due_date && (
                    <span className={new Date(task.due_date) < new Date() ? 'text-red-500' : ''}>
                      до {new Date(task.due_date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}
                    </span>
                  )}
                </div>
              </div>
              {task.nm_id && (
                <Link
                  href={`/catalog/${task.nm_id}`}
                  className="text-xs text-primary hover:underline shrink-0"
                >
                  SKU
                </Link>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  )
}
