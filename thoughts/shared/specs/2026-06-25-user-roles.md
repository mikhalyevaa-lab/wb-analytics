# Роли пользователей — Спецификация

**Дата:** 2026-06-25  
**Статус:** Готово к реализации

---

## Executive Summary

Система ролей для WB Analytics позволяет владельцу магазина добавлять сотрудников (менеджеров, аналитиков, бухгалтеров) и ограничивать им доступ к чувствительным данным — себестоимости, P&L, налоговым настройкам и WB-токену. Один магазин, один набор данных, 6 ролей с разными правами.

---

## Матрица доступа

| Раздел / действие | Владелец | Администратор | Директор | Менедж. рекламы | Менедж. товаров | Финдир / Бухгалтер | Аналитик |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| Дашборд, обзор | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Заказы, продажи | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| ABC-анализ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Воронка, остатки | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Реклама (просмотр) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Справочник товаров (просмотр) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Себестоимость (редактировать)** | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ | ❌ |
| **P&L / Юнит-экономика** | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ | ✅ |
| **Настройки магазина (УСН, НДС, токен WB)** | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ | ❌ |
| **Управление пользователями** | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Все остальные настройки (просмотр/редактирование) | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ | ❌ |
| Синхронизация данных (ручной запуск) | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |

> **Аналитик** — полный read-only по всем разделам кроме настроек.  
> **Менеджер рекламы** — видит рекламу, заказы, ABC, каталог. Не видит P&L, юнитку, настройки.  
> **Менеджер товаров** — видит и редактирует каталог включая себестоимость, видит P&L. Не видит настройки магазина.

---

## Функциональные требования

### P0 — Must Have

**FR-1: Модель данных**
- Добавить поле `role` в таблицу `user_stores` (тип `text`, NOT NULL, default `'viewer'`)
- Значения: `owner`, `admin`, `director`, `ad_manager`, `product_manager`, `finance`, `viewer`
- Миграция: существующие записи получают роль `owner` (у текущего пользователя)

**FR-2: Страница управления пользователями**
- Путь: `/settings/users`
- Элементы:
  - Список текущих пользователей: аватар, имя, email, роль (выпадающий список), кнопка удалить
  - Форма приглашения: поле email + выбор роли + кнопка «Пригласить»
  - Статус приглашения: «Ожидает принятия» / «Активен»
- Видят только владелец и администратор

**FR-3: Система приглашений**
- Владелец/admin вводит email + выбирает роль → отправляется письмо со ссылкой
- Ссылка ведёт на страницу регистрации/входа, после которой пользователь автоматически привязывается к магазину с назначенной ролью
- Таблица `invitations`: `id`, `store_id`, `email`, `role`, `token` (uuid), `expires_at` (7 дней), `accepted_at`

**FR-4: Проверка прав на API-уровне**
- Каждый API-роут проверяет роль пользователя перед выполнением операции
- Функция `requireRole(userId, storeId, allowedRoles[])` — бросает 403 если роль не разрешена
- Список защищённых роутов (см. раздел «Защита API»)

**FR-5: Скрытие элементов UI**
- Поля себестоимости (cost_price) — скрыты для `ad_manager`, `viewer`
- Раздел Юнитка и P&L — недоступен для `ad_manager`
- Раздел Настройки → поля УСН/НДС/токен — недоступны для `ad_manager`, `product_manager`, `viewer`
- Кнопки редактирования скрыты, данные тоже (не просто disabled)

### P1 — Should Have

**FR-6: Смена роли**
- Владелец/admin может менять роль любого пользователя через выпадающий список на странице Users
- Нельзя понизить/удалить последнего владельца

**FR-7: Удаление пользователя**
- Удаление убирает запись из `user_stores` (не удаляет аккаунт)
- Кнопка «Удалить» только у владельца/admin, подтверждение через диалог

**FR-8: Бейдж роли в навигации**
- В шапке приложения рядом с аватаром — название текущей роли (маленький бейдж)

### P2 — Nice to Have

**FR-9: Журнал действий**
- Логировать: кто когда был приглашён, кто принял, кто и чью роль менял

---

## Защита API

| API-роут | Запрещено для |
|---|---|
| `PATCH /api/catalog/[nm_id]` (cost_price) | `ad_manager`, `viewer` |
| `GET/POST /api/unit-economics` | `ad_manager` |
| `PATCH /api/settings/store` (usn, vat, token) | `ad_manager`, `product_manager`, `viewer` |
| `GET/POST /api/settings/users` | `director`, `ad_manager`, `product_manager`, `finance`, `viewer` |
| `POST /api/sync/*` (ручной запуск) | `ad_manager`, `product_manager`, `finance`, `viewer` |

---

## Техническая архитектура

### Миграция БД

```sql
-- Добавить поле role в user_stores
ALTER TABLE user_stores ADD COLUMN role text NOT NULL DEFAULT 'viewer';

-- Текущий пользователь получает owner
UPDATE user_stores SET role = 'owner' WHERE user_id = '<current_user_id>';

-- Таблица инвайтов
CREATE TABLE invitations (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id    uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  email       text NOT NULL,
  role        text NOT NULL,
  token       uuid NOT NULL DEFAULT gen_random_uuid(),
  invited_by  text NOT NULL REFERENCES "user"(id),
  expires_at  timestamptz NOT NULL DEFAULT now() + interval '7 days',
  accepted_at timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (store_id, email, accepted_at) -- разрешает повторный инвайт после принятия
);
```

### Вспомогательная функция

```typescript
// src/lib/auth-roles.ts
export const ROLES = ['owner', 'admin', 'director', 'ad_manager', 'product_manager', 'finance', 'viewer'] as const
export type Role = typeof ROLES[number]

// Иерархия: какие роли имеют доступ к чему
export const CAN_EDIT_COST_PRICE: Role[]   = ['owner', 'admin', 'director', 'product_manager', 'finance']
export const CAN_VIEW_PNL: Role[]          = ['owner', 'admin', 'director', 'product_manager', 'finance', 'viewer']
export const CAN_EDIT_SETTINGS: Role[]     = ['owner', 'admin', 'director', 'finance']
export const CAN_MANAGE_USERS: Role[]      = ['owner', 'admin']
export const CAN_RUN_SYNC: Role[]          = ['owner', 'admin', 'director']

export async function getUserRole(userId: string, storeId: string): Promise<Role | null>
export async function requireRole(userId: string, storeId: string, allowed: Role[]): Promise<void> // throws 403
```

### React-контекст

```typescript
// src/contexts/role-context.tsx
// Загружает роль текущего пользователя при входе
// Предоставляет хук useRole() → { role, can: { editCostPrice, viewPnl, editSettings, manageUsers } }
```

### Отправка инвайтов

- Использовать существующий механизм email (better-auth или nodemailer)
- Письмо: тема «Вас пригласили в WB Analytics», ссылка `/invite/[token]`
- Страница `/invite/[token]`: если не авторизован → регистрация/вход, затем принятие инвайта

---

## UX — Страница пользователей `/settings/users`

```
┌─────────────────────────────────────────────────────┐
│  Пользователи магазина                              │
├─────────────────────────────────────────────────────┤
│  👤 Анна Михалёва (вы)         Владелец             │
│  👤 Иван Петров                [Менедж. рекламы ▼] [×]│
│  ✉️  manager@email.com          Ожидает принятия    │
├─────────────────────────────────────────────────────┤
│  Пригласить:  [email__________] [Роль ▼] [Пригласить]│
└─────────────────────────────────────────────────────┘
```

---

## Критерии готовности

- [ ] Поле `role` в `user_stores`, миграция применена
- [ ] Таблица `invitations` создана
- [ ] Страница `/settings/users` — список + форма приглашения
- [ ] Email отправляется при приглашении
- [ ] Ссылка `/invite/[token]` работает: принятие через регистрацию/вход
- [ ] `requireRole()` проверяет доступ на всех защищённых API-роутах
- [ ] Поля себестоимости скрыты для менеджера рекламы и аналитика
- [ ] Раздел Юнитка скрыт для менеджера рекламы
- [ ] Настройки магазина (токен, налоги) скрыты для всех кроме разрешённых ролей
- [ ] Нельзя удалить последнего владельца

---

## Out of Scope

- Доступ по магазинам (у тебя один магазин)
- Кастомные роли (фиксированный набор из 7)
- Двухфакторная аутентификация
- Журнал аудита действий (P2, после MVP)
- Права на уровне отдельных артикулов или кампаний
