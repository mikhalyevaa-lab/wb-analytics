import { schedule } from 'node-cron'
import { syncAllStores, recalcAllStoresAggregates } from '@/lib/sync'

function log(msg: string) {
  console.log(`[cron] ${new Date().toISOString()} ${msg}`)
}

// Каждые 2 часа — основная синхронизация: заказы, продажи, финансы, воронка,
// остатки/товары/хранение/тарифы (throttle внутри syncAllStores через shouldSync)
schedule('0 */2 * * *', async () => {
  log('syncAllStores — старт')
  try {
    await syncAllStores()
    log('syncAllStores — завершён')
  } catch (err) {
    console.error('[cron] syncAllStores — ошибка:', err)
  }
})

// Ежедневно в 3:00 МСК — ночной синк + пересчёт агрегатов товаров
schedule('0 3 * * *', async () => {
  log('ночной синк — старт')
  try {
    await syncAllStores()
    await recalcAllStoresAggregates()
    log('ночной синк — завершён')
  } catch (err) {
    console.error('[cron] ночной синк — ошибка:', err)
  }
}, { timezone: 'Europe/Moscow' })

log('планировщик запущен: каждые 2ч + 3:00 МСК ежедневно')
