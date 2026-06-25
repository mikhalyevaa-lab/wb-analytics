// Только константы — безопасно импортировать в клиентских компонентах
export const ROLES = ['owner','admin','director','ad_manager','product_manager','finance','viewer'] as const
export type Role = typeof ROLES[number]

export const ROLE_LABELS: Record<Role, string> = {
  owner:           'Владелец',
  admin:           'Администратор',
  director:        'Директор',
  ad_manager:      'Менеджер рекламы',
  product_manager: 'Менеджер товаров',
  finance:         'Финансовый директор',
  viewer:          'Аналитик',
}

export const CAN_EDIT_COST_PRICE:  Role[] = ['owner','admin','director','product_manager','finance']
export const CAN_VIEW_PNL:         Role[] = ['owner','admin','director','product_manager','finance','viewer']
export const CAN_EDIT_SETTINGS:    Role[] = ['owner','admin','director','finance']
export const CAN_MANAGE_USERS:     Role[] = ['owner','admin']
export const CAN_RUN_SYNC:         Role[] = ['owner','admin','director']
export const CAN_INVITE_ROLES:     Role[] = ['admin','director','ad_manager','product_manager','finance','viewer']

export function hasPermission(role: Role, allowed: Role[]): boolean {
  return allowed.includes(role)
}
