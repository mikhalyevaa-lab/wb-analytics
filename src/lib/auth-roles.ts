// Серверный модуль — не импортировать в 'use client' компоненты
import { db } from './db'
export * from './auth-roles-shared'
import type { Role } from './auth-roles-shared'
import { ROLES } from './auth-roles-shared'

export async function getUserRole(userId: string, storeId: string): Promise<Role | null> {
  const rows = await db<{ role: string }[]>`
    SELECT role FROM user_stores WHERE user_id = ${userId} AND store_id = ${storeId} LIMIT 1
  `
  const role = rows[0]?.role
  if (!role || !ROLES.includes(role as Role)) return null
  return role as Role
}

// Бросает ошибку с status 403 если роль не разрешена
export async function requireRole(
  userId: string,
  storeId: string,
  allowed: Role[]
): Promise<Role> {
  const role = await getUserRole(userId, storeId)
  if (!role || !allowed.includes(role)) {
    throw Object.assign(new Error('Forbidden'), { status: 403 })
  }
  return role
}
