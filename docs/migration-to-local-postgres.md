# Миграция с Supabase на локальный PostgreSQL 17 в Docker

> Составлен: 2026-06-23  
> Статус: применено (2026-07-02). БД, auth (better-auth), все API-роуты и скрипты переведены на postgres.js/db-compat. Зависимости `@supabase/supabase-js` и `@supabase/ssr` удалены из package.json. Старые файлы облачной схемы (schema.sql, schema_complete.sql) и разовые SQL (migration_001_gsale_blocks.sql, seed_store.sql) удалены — актуальная схема в schema_local.sql + supabase/migrations/.

---

## Обзор ситуации

### Текущий стек
| Слой | Что используется |
|------|-----------------|
| БД | Supabase (облачный PostgreSQL) |
| Auth | Supabase Auth (`auth.users`, `auth.uid()`) |
| DB-клиент | `@supabase/supabase-js` + `@supabase/ssr` (PostgREST query builder) |
| RLS | Row Level Security на всех таблицах через `auth.uid()` |
| Миграции | SQL-файлы в `supabase/migrations/`, накатываются вручную |

### Целевой стек
| Слой | Что будет |
|------|-----------|
| БД | PostgreSQL 17 в Docker, данные в примонтированной папке `./data/postgres` |
| Auth | `better-auth` (TypeScript, Next.js-ready, хранит сессии в PG) |
| DB-клиент | `postgres` (postgres.js) — лёгкий, SQL-first |
| RLS | Убираем (заменяем application-level проверками — проект однопользовательский/малокомандный) |
| Миграции | Кастомный runner на `postgres.js`, читает SQL-файлы из `supabase/migrations/` по порядку |

---

## Карта изменений (масштаб работы)

| Файл / область | Количество файлов |
|---------------|-------------------|
| API routes с `auth.getUser()` | ~46 файлов |
| `@supabase/supabase-js` импорты | ~50 файлов |
| `supabase/schema_complete.sql` | `auth.users` в 6 местах, RLS на ~15 таблицах |
| Миграции | 16 SQL-файлов |
| `docker-compose.yml` | 1 файл |
| `src/lib/` | 5 файлов (supabase.ts, supabase-server.ts, admin.ts, queries.ts, queries-overview.ts) |

---

## Фазы миграции

---

### Фаза 0 — Подготовка (1 час)

**0.1. Зафиксировать текущее состояние**
```bash
git add -A && git commit -m "snapshot: pre-postgres-migration"
git checkout -b feat/local-postgres
```

**0.2. Создать папку для данных БД**
```bash
mkdir -p data/postgres
echo "data/postgres/" >> .gitignore   # не коммитить данные БД
```

**0.3. Экспортировать данные из Supabase** (если нужен перенос данных)
```bash
# В Supabase Dashboard → Settings → Database → Connection string
pg_dump "postgresql://postgres:[PASSWORD]@[HOST]:5432/postgres" \
  --data-only \
  --exclude-table="schema_migrations" \
  -f supabase/data_export.sql
```

---

### Фаза 1 — Docker инфраструктура (30 минут)

**1.1. Обновить `docker-compose.yml`**

Добавить три сервиса: `db` (PostgreSQL 17), `migrate` (однократный запуск миграций), обновить `app` и `cron`.

```yaml
# docker-compose.yml (целевой вид)
services:

  db:
    image: postgres:17-alpine
    restart: unless-stopped
    environment:
      POSTGRES_DB: ${POSTGRES_DB:-wbanalytics}
      POSTGRES_USER: ${POSTGRES_USER:-wbuser}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
    ports:
      - "5432:5432"           # для локального доступа через psql/DBeaver
    volumes:
      - ./data/postgres:/var/lib/postgresql/data   # данные на диске, не в Docker
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER:-wbuser} -d ${POSTGRES_DB:-wbanalytics}"]
      interval: 5s
      timeout: 5s
      retries: 10

  migrate:
    image: node:22-alpine
    working_dir: /app
    volumes:
      - .:/app
    environment:
      DATABASE_URL: postgresql://${POSTGRES_USER:-wbuser}:${POSTGRES_PASSWORD}@db:5432/${POSTGRES_DB:-wbanalytics}
    command: ["node", "scripts/migrate.js"]
    depends_on:
      db:
        condition: service_healthy

  app:
    build:
      context: .
      dockerfile: Dockerfile
    ports:
      - "3000:3000"
    env_file:
      - .env.local
    depends_on:
      migrate:
        condition: service_completed_successfully
    restart: unless-stopped

  cron:
    build:
      context: ./docker/cron
      dockerfile: Dockerfile
    env_file:
      - .env.local
    environment:
      APP_URL: http://app:3000
    depends_on:
      - app
    restart: unless-stopped
```

**1.2. Добавить переменные в `.env.local`**
```bash
# Убрать (больше не нужны):
# NEXT_PUBLIC_SUPABASE_URL=
# NEXT_PUBLIC_SUPABASE_ANON_KEY=
# SUPABASE_SERVICE_ROLE_KEY=

# Добавить:
POSTGRES_DB=wbanalytics
POSTGRES_USER=wbuser
POSTGRES_PASSWORD=your_secure_password_here
DATABASE_URL=postgresql://wbuser:your_secure_password_here@db:5432/wbanalytics
DATABASE_URL_LOCAL=postgresql://wbuser:your_secure_password_here@localhost:5432/wbanalytics

# Auth (better-auth)
BETTER_AUTH_SECRET=generate_with_openssl_rand_-hex_32
BETTER_AUTH_URL=http://localhost:3000
```

---

### Фаза 2 — Схема БД: убрать зависимость от `auth.users` (2 часа)

Это самая важная фаза. Supabase Auth хранит пользователей в схеме `auth`, которой нет в чистом PostgreSQL.

**2.1. Создать новый файл схемы `supabase/schema_local.sql`**

Скопировать `schema_complete.sql` и внести правки:

```sql
-- Убрать:
-- CREATE EXTENSION IF NOT EXISTS "uuid-ossp";  -- в PG17 uuid_generate_v4() доступен через gen_random_uuid()

-- Добавить свою таблицу пользователей (вместо auth.users):
CREATE TABLE IF NOT EXISTS users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email         text NOT NULL UNIQUE,
  name          text,
  password_hash text,                           -- для email/password auth
  role          text NOT NULL DEFAULT 'manager',
  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now()
);

-- Таблица сессий (better-auth требует):
CREATE TABLE IF NOT EXISTS sessions (
  id         text PRIMARY KEY,
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Таблица аккаунтов (better-auth для OAuth если понадобится):
CREATE TABLE IF NOT EXISTS accounts (
  id                    text PRIMARY KEY,
  user_id               uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider_id           text NOT NULL,
  account_id            text NOT NULL,
  access_token          text,
  refresh_token         text,
  access_token_expires_at timestamptz,
  created_at            timestamptz DEFAULT now(),
  updated_at            timestamptz DEFAULT now()
);
```

**Глобальная замена во всём `schema_local.sql`:**
```
auth.users(id)     →  users(id)
auth.users         →  users
```

**Убрать из схемы:**
```sql
-- Удалить триггер на auth.users:
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
-- (вся секция CREATE TRIGGER ... AFTER INSERT ON auth.users)

-- Удалить таблицу profiles (её функцию теперь выполняет users):
-- ИЛИ оставить как расширение, убрав FK на auth.users и заменив на users(id)
```

**Убрать весь блок RLS** (секция 14 в schema_complete.sql):
```sql
-- Убираем: ALTER TABLE ... ENABLE ROW LEVEL SECURITY;
-- Убираем: CREATE POLICY ...
-- Убираем: auth.uid() везде
```
> **Почему**: RLS в Supabase работал через JWT-токен в заголовке запроса, который Supabase Auth подставлял автоматически. Без Supabase этого механизма нет. Для однокомандного проекта достаточно application-level проверки `user.id` в API routes.

**2.2. Создать первую новую миграцию `supabase/migrations/017_local_auth.sql`**
```sql
-- Миграция: замена auth.users на public.users
-- Применяется поверх существующих 016 миграций при первой установке
-- (для чистой установки используется schema_local.sql)

-- Если переносим существующую БД из Supabase:
-- INSERT INTO public.users (id, email, ...) SELECT id, email, ... FROM auth.users;
```

---

### Фаза 3 — Migration runner (1 час)

**3.1. Установить зависимость**
```bash
npm install postgres
```

**3.2. Создать `scripts/migrate.js`**
```javascript
// scripts/migrate.js
import postgres from 'postgres'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const sql = postgres(process.env.DATABASE_URL, { max: 1 })

async function migrate() {
  // Создаём таблицу для трекинга миграций
  await sql`
    CREATE TABLE IF NOT EXISTS _migrations (
      id        serial PRIMARY KEY,
      filename  text NOT NULL UNIQUE,
      applied_at timestamptz DEFAULT now()
    )
  `

  const migrationsDir = path.join(__dirname, '../supabase/migrations')
  const files = fs.readdirSync(migrationsDir)
    .filter(f => f.endsWith('.sql'))
    .sort()  // порядок по имени файла (001_, 002_, ...)

  // Получаем уже применённые
  const applied = await sql`SELECT filename FROM _migrations`
  const appliedSet = new Set(applied.map(r => r.filename))

  for (const file of files) {
    if (appliedSet.has(file)) {
      console.log(`⏭  Пропускаем (уже применена): ${file}`)
      continue
    }

    console.log(`▶  Применяем: ${file}`)
    const sqlContent = fs.readFileSync(path.join(migrationsDir, file), 'utf-8')

    await sql.begin(async (tx) => {
      await tx.unsafe(sqlContent)
      await tx`INSERT INTO _migrations (filename) VALUES (${file})`
    })

    console.log(`✅ Готово: ${file}`)
  }

  await sql.end()
  console.log('🎉 Все миграции применены')
}

migrate().catch(err => {
  console.error('❌ Ошибка миграции:', err)
  process.exit(1)
})
```

**3.3. Добавить скрипт в `package.json`**
```json
"scripts": {
  "migrate": "node scripts/migrate.js",
  "migrate:new": "node scripts/new-migration.js"
}
```

**3.4. Создать `scripts/new-migration.js`** — хелпер для создания новых миграций
```javascript
// scripts/new-migration.js
// Использование: node scripts/new-migration.js add_column_to_products
import fs from 'fs'
import path from 'path'

const name = process.argv[2]
if (!name) { console.error('Укажи имя: node scripts/new-migration.js <name>'); process.exit(1) }

const migrationsDir = path.join('supabase/migrations')
const files = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort()
const lastNum = files.length > 0
  ? parseInt(files[files.length - 1].split('_')[0]) || 0
  : 0
const num = String(lastNum + 1).padStart(3, '0')
const date = new Date().toISOString().slice(0, 10).replace(/-/g, '')
const filename = `${num}_${name}.sql`

fs.writeFileSync(path.join(migrationsDir, filename),
  `-- Migration: ${name}\n-- Created: ${date}\n\n`)
console.log(`✅ Создана: supabase/migrations/${filename}`)
```

---

### Фаза 4 — Замена Auth: better-auth (3–4 часа)

**4.1. Установить**
```bash
npm install better-auth
```

**4.2. Создать `src/lib/auth.ts`**
```typescript
import { betterAuth } from 'better-auth'
import { Pool } from 'pg'

export const auth = betterAuth({
  database: {
    provider: 'pg',
    url: process.env.DATABASE_URL!,
  },
  emailAndPassword: {
    enabled: true,
  },
  secret: process.env.BETTER_AUTH_SECRET!,
  baseURL: process.env.BETTER_AUTH_URL!,
})

export type Session = typeof auth.$Infer.Session
```

**4.3. Создать API route `src/app/api/auth/[...all]/route.ts`**
```typescript
import { auth } from '@/lib/auth'
import { toNextJsHandler } from 'better-auth/next-js'

export const { POST, GET } = toNextJsHandler(auth)
```

**4.4. Создать `src/lib/auth-client.ts`** (для клиентских компонентов)
```typescript
import { createAuthClient } from 'better-auth/react'

export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000',
})

export const { signIn, signOut, useSession } = authClient
```

**4.5. Создать `src/lib/auth-server.ts`** (замена supabase-server.ts)
```typescript
import { auth } from './auth'
import { headers } from 'next/headers'

// Замена: createClient() + db.auth.getUser()
export async function getServerSession() {
  const session = await auth.api.getSession({
    headers: await headers(),
  })
  return session
}

export async function requireAuth() {
  const session = await getServerSession()
  if (!session?.user) {
    throw new Error('Unauthorized')
  }
  return session.user
}
```

**4.6. Обновить middleware `src/middleware.ts`** (если есть, иначе создать)
```typescript
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from '@/lib/auth-server'

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl
  if (pathname.startsWith('/login') || pathname.startsWith('/api/auth')) {
    return NextResponse.next()
  }
  // Остальные роуты под /(app)/ — проверяем сессию
  // better-auth сам управляет куками, middleware только редиректит
  return NextResponse.next()
}
```

**4.7. Обновить `src/app/login/page.tsx`**

```typescript
// Было:
const { error } = await supabase.auth.signInWithPassword({ email, password })

// Стало:
import { authClient } from '@/lib/auth-client'
const { error } = await authClient.signIn.email({ email, password })
```

**4.8. Обновить `src/app/(app)/layout.tsx`**
```typescript
// Было:
const db = await createClient()
const { data: { user } } = await db.auth.getUser()
if (!user) redirect('/login')

// Стало:
import { getServerSession } from '@/lib/auth-server'
const session = await getServerSession()
if (!session?.user) redirect('/login')
const user = session.user
```

---

### Фаза 5 — Замена DB клиента: postgres.js (4–6 часов)

Это самая трудоёмкая фаза — замена `@supabase/supabase-js` query builder на SQL-запросы.

**5.1. Создать `src/lib/db.ts`** — единственный клиент для всех server-side запросов
```typescript
import postgres from 'postgres'

const globalForDb = global as unknown as { db: ReturnType<typeof postgres> }

export const db = globalForDb.db ?? postgres(process.env.DATABASE_URL!, {
  max: 10,
  idle_timeout: 30,
  connect_timeout: 10,
})

if (process.env.NODE_ENV !== 'production') globalForDb.db = db
```

**5.2. Паттерн замены запросов**

```typescript
// БЫЛО (Supabase query builder):
const db = await createServerClient()
const { data, error } = await db
  .from('products')
  .select('nm_id, name, cost_price')
  .in('store_id', storeIds)
  .order('name')

// СТАЛО (postgres.js):
import { db } from '@/lib/db'
const data = await db`
  SELECT nm_id, name, cost_price
  FROM products
  WHERE store_id = ANY(${storeIds})
  ORDER BY name
`
```

**5.3. Замена паттернов аутентификации в API routes**

```typescript
// БЫЛО (~46 файлов):
import { createClient as createServerClient } from '@/lib/supabase-server'
const db = await createServerClient()
const { data: { user } } = await db.auth.getUser()
if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

// СТАЛО:
import { requireAuth } from '@/lib/auth-server'
const user = await requireAuth().catch(() => null)
if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
```

**5.4. Удалить `src/lib/admin.ts`** — `adminDb()` больше не нужен, `db` из `src/lib/db.ts` уже имеет полный доступ.

**5.5. Приоритизация файлов для замены**
Начать с критического пути (логин → дашборд → данные):
1. `src/lib/supabase.ts` → удалить (заменён `auth-client.ts`)
2. `src/lib/supabase-server.ts` → удалить (заменён `auth-server.ts`)
3. `src/lib/admin.ts` → удалить (заменён `db.ts`)
4. `src/lib/queries.ts` → переписать на SQL
5. `src/lib/queries-overview.ts` → переписать на SQL
6. `src/app/(app)/layout.tsx`
7. `src/app/login/page.tsx`
8. Все `src/app/api/**/*.ts` — заменить `getUser` + query builder

---

### Фаза 6 — Обновить Dockerfile (30 минут)

```dockerfile
# Убрать из build args (больше не нужны):
# ARG NEXT_PUBLIC_SUPABASE_URL
# ARG NEXT_PUBLIC_SUPABASE_ANON_KEY

# Добавить (если нужен DATABASE_URL при сборке):
ARG NEXT_PUBLIC_APP_URL
ENV NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL
```

---

### Фаза 7 — Тестирование и запуск (1 час)

**7.1. Локальный запуск (без Docker)**
```bash
# Поднять только БД:
docker compose up db -d

# Накатить миграции:
DATABASE_URL="postgresql://wbuser:password@localhost:5432/wbanalytics" npm run migrate

# Запустить приложение:
npm run dev
```

**7.2. Полный запуск через Docker**
```bash
docker compose up --build
```

**7.3. Проверочный список**
- [ ] БД стартует, данные сохраняются в `./data/postgres/`
- [ ] `docker compose down && docker compose up` — данные не теряются
- [ ] Миграции пропускают уже применённые файлы
- [ ] Новая миграция: `npm run migrate:new test_migration` → появляется файл, накатывается
- [ ] Логин работает (`/login`)
- [ ] Защищённые роуты редиректят без сессии
- [ ] Дашборд загружает данные
- [ ] Cron-синхронизация работает

---

### Фаза 8 — Перенос данных из Supabase (опционально, 1–2 часа)

Если нужно перенести накопленные данные:

```bash
# 1. Экспорт из Supabase (только данные, без схемы)
pg_dump "postgresql://postgres:[KEY]@[HOST]:5432/postgres" \
  --data-only \
  --no-owner \
  --schema=public \
  --exclude-table="_migrations" \
  --exclude-table="schema_migrations" \
  -f supabase/data_export.sql

# 2. Правка: заменить auth.users → users в FK references данных
# (если есть INSERT в profiles/stores с user_id)

# 3. Импорт
psql "postgresql://wbuser:password@localhost:5432/wbanalytics" \
  -f supabase/data_export.sql
```

---

## Зависимости и порядок фаз

```
Фаза 0 (подготовка)
    ↓
Фаза 1 (Docker) + Фаза 2 (схема) ← можно параллельно
    ↓
Фаза 3 (migration runner) ← зависит от Фаза 1
    ↓
Фаза 4 (better-auth) + Фаза 5 (db клиент) ← можно параллельно
    ↓
Фаза 6 (Dockerfile)
    ↓
Фаза 7 (тестирование)
    ↓
Фаза 8 (перенос данных, если нужно)
```

---

## Итоговые изменения npm пакетов

```bash
# Установить:
npm install postgres better-auth

# Удалить (после полной замены):
npm uninstall @supabase/supabase-js @supabase/ssr
```

---

## Оценка трудозатрат

| Фаза | Трудоёмкость | Сложность |
|------|-------------|-----------|
| 0. Подготовка | 1 ч | низкая |
| 1. Docker инфраструктура | 30 мин | низкая |
| 2. Схема БД (убрать auth.users) | 2 ч | средняя |
| 3. Migration runner | 1 ч | низкая |
| 4. Замена Auth | 3–4 ч | высокая |
| 5. Замена DB клиента (70 файлов) | 4–6 ч | высокая |
| 6. Dockerfile | 30 мин | низкая |
| 7. Тестирование | 1 ч | средняя |
| **Итого** | **~13–16 ч** | |

> Фазы 4 и 5 можно разбить на подзадачи и делать итеративно (файл за файлом), не ломая приложение целиком.
