// Скрипт для ручного запуска полной синхронизации с WB API
import { db } from './src/lib/db'
import { syncStore } from './src/lib/sync'

async function main() {
  const rows = await db<{ id: string; name: string; wb_token: string; wb_analytics_token: string | null }[]>`
    SELECT id, name, wb_token, wb_analytics_token FROM stores LIMIT 1
  `
  if (!rows[0]) { console.error('Магазин не найден'); process.exit(1) }

  const store = rows[0]
  console.log(`\n🔄 Старт синхронизации: ${store.name}`)
  console.log(`📅 ${new Date().toLocaleString('ru')}\n`)

  const result = await syncStore(store)

  console.log('\n✅ Синхронизация завершена:\n')
  for (const [key, val] of Object.entries(result)) {
    const v = val as { inserted?: number; updated?: number; error?: string; skipped?: string }
    if (v.error) {
      console.log(`  ❌ ${key}: ${v.error}`)
    } else {
      const parts = []
      if (v.inserted != null) parts.push(`добавлено ${v.inserted}`)
      if (v.updated  != null) parts.push(`обновлено ${v.updated}`)
      if (v.skipped  != null) parts.push(v.skipped)
      console.log(`  ✅ ${key}: ${parts.join(', ') || 'ок'}`)
    }
  }

  await db.end()
}

main().catch(async e => { console.error('Ошибка:', e.message); await db.end(); process.exit(1) })
