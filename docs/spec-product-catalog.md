# Справочник товаров — Техническое задание

## Executive Summary
Расширенный справочник товаров с группировкой, фильтрацией, сортировкой и индивидуальными настройками отображения для каждого пользователя. Данные обновляются автоматически раз в сутки (ночью) из WB API.

## Структура данных

### Таблица `product_groups` (новая)
```sql
id           UUID PRIMARY KEY
store_id     UUID REFERENCES stores(id)
name         TEXT NOT NULL
color        TEXT  -- цвет метки группы (#hex)
created_at   TIMESTAMPTZ
```

### Расширение таблицы `products`
```sql
-- Новые колонки:
group_id              UUID REFERENCES product_groups(id)
color                 TEXT          -- из WB Content API
avg_price_before_spp  NUMERIC(12,2) -- расчёт из wb_sales за 7 дней
avg_price_after_spp   NUMERIC(12,2) -- расчёт из wb_sales за 7 дней
avg_orders_per_day    NUMERIC(10,2) -- расчёт из wb_orders за 7 дней
buyout_rate           NUMERIC(5,2)  -- % = sales/orders за 30 дней
current_stock         INT           -- из последней синхронизации wb_stocks
```

### Таблица `user_column_settings` (новая)
```sql
id           UUID PRIMARY KEY
user_id      UUID REFERENCES auth.users(id)
page         TEXT NOT NULL DEFAULT 'products'
columns      JSONB NOT NULL  -- массив видимых колонок в нужном порядке
created_at   TIMESTAMPTZ
updated_at   TIMESTAMPTZ
UNIQUE(user_id, page)
```

## Поля справочника

| Поле | Источник | Сортировка | Фильтр |
|------|----------|------------|--------|
| Изображение | WB Content API (photo_url) | ❌ | ❌ |
| Группа | product_groups.name | ✅ | Выбор из списка |
| Предмет | WB API (subject_name) | ✅ | Текст |
| Артикул WB | nm_id | ✅ | Текст |
| Артикул поставщика | vendor_code | ✅ | Текст |
| % выкупа | Расчёт: sales/orders за 30д | ✅ | Диапазон |
| Цвет | WB Content API | ✅ | Текст |
| Себестоимость | Ручной ввод (cost_price) | ✅ | Диапазон |
| Цена до СПП | Среднее из wb_sales.retail_price за 7д | ✅ | Диапазон |
| Цена после СПП | Среднее из wb_sales.price_with_disc за 7д | ✅ | Диапазон |
| Заказов/день | Среднее из wb_orders за 7д | ✅ | Диапазон |
| Остаток | wb_stocks.quantity на сегодня | ✅ | Диапазон |

## UX Flow

### Основной экран `/catalog`
1. Таблица с виртуализацией (react-virtual или tanstack-virtual)
2. Sticky header с названиями колонок
3. Поиск по всем текстовым полям (одна строка поиска)
4. Кнопка "⚙ Колонки" → модалка настроек
5. Кнопка "Фильтры" → боковая панель с фильтрами

### Фильтры (боковая панель)
- Текстовые: поле ввода с подсказками
- Числовые: два поля "от" и "до"
- Группа: мульти-выбор из списка групп
- Кнопка "Сбросить"
- Фильтры применяются на клиенте (данные уже загружены)

### Модалка настроек колонок
- Список всех колонок с чекбоксами
- Drag & drop для порядка (опционально — P2)
- Кнопка "Сбросить по умолчанию"
- Сохраняется в `user_column_settings`

### Модальная карточка товара
По клику на строку открывается модалка:
- Большое фото
- Все поля справочника
- Ссылка "Открыть на Wildberries" (новая вкладка)
- Поле редактирования себестоимости
- Выбор группы (dropdown)

### Управление группами
Отдельная модалка "Управление группами":
- Список групп с цветными метками
- Добавить новую группу
- Редактировать/удалить существующую
- Переименование не удаляет привязки

## Расчётные поля — формулы

```typescript
// % выкупа за 30 дней
buyout_rate = (COUNT(wb_sales WHERE date >= now-30d) / COUNT(wb_orders WHERE date >= now-30d)) * 100

// Средняя цена до СПП за 7 дней
avg_price_before_spp = AVG(wb_sales.retail_price WHERE date >= now-7d)

// Средняя цена после СПП за 7 дней  
avg_price_after_spp = AVG(wb_sales.price_with_disc WHERE date >= now-7d)

// Заказов в день за 7 дней
avg_orders_per_day = COUNT(wb_orders WHERE date >= now-7d) / 7

// Остаток — последняя запись wb_stocks за сегодня
current_stock = SUM(wb_stocks.quantity WHERE date = today)
```

## Синхронизация (ночной cron)

Добавить в `syncProducts()`:
1. Загрузить карточки через WB Content API
2. Извлечь характеристику "Цвет" из `characteristics`
3. Пересчитать агрегаты (buyout_rate, avg_price_*, avg_orders_per_day, current_stock)
4. Upsert в `products`

Время запуска: `0 3 * * *` (3:00 ночи)

## API Endpoints

- `GET /api/catalog` — список товаров с агрегатами
- `PATCH /api/catalog/[nm_id]` — обновить group_id, cost_price
- `GET /api/groups` — список групп магазина
- `POST /api/groups` — создать группу
- `PATCH /api/groups/[id]` — переименовать/изменить цвет
- `DELETE /api/groups/[id]` — удалить группу
- `GET /api/user/columns?page=products` — настройки колонок
- `PUT /api/user/columns` — сохранить настройки

## Компоненты

```
src/app/(app)/catalog/page.tsx         — серверный компонент, загрузка данных
src/components/catalog/
  ├── catalog-table.tsx                — виртуализированная таблица
  ├── catalog-filters.tsx              — боковая панель фильтров
  ├── catalog-columns-modal.tsx        — модалка настройки колонок
  ├── product-card-modal.tsx           — модальная карточка товара
  ├── groups-manager-modal.tsx         — управление группами
  └── group-badge.tsx                  — цветная метка группы
```

## Порядок реализации

1. **Миграция БД**: product_groups, расширение products, user_column_settings
2. **API groups**: CRUD для групп
3. **Обновление sync**: расчёт агрегатов, извлечение цвета
4. **API catalog**: список товаров с агрегатами
5. **UI таблица**: базовая таблица с данными
6. **UI фильтры**: боковая панель
7. **UI колонки**: модалка настроек + сохранение
8. **UI карточка**: модальная карточка товара
9. **UI группы**: управление группами + badge
10. **Виртуализация**: подключить tanstack-virtual

## Из скоупа исключено (P2+)
- Drag & drop порядка колонок (можно добавить позже)
- Экспорт справочника в Excel
- Массовое редактирование
- История изменений
