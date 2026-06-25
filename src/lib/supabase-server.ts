// Legacy shim: createClient() возвращает совместимый адаптер (без auth)
export { adminDb as createClient } from './db-compat'
