# Детализация затрат на рекламу по артикулу (nmId)

## Executive Summary

Расширение блока «Анализ РК» в разделе Реклама: каждая строка кампании раскрывается во вложенную таблицу с разбивкой затрат по артикулам (nmId). Данные используются в ABC-анализе — ранжирование артикулов по сумме затрат на рекламу. Источник — уже вызываемый `/adv/v3/fullstats`, nmId-данные в нём есть, дополнительных API-запросов не требуется.

---

## Problem Statement

Текущий блок «Анализ РК» показывает итоги по кампании целиком. Одна РК включает несколько артикулов, и невозможно понять:
- какой конкретный артикул потребляет бюджет внутри РК
- рассчитать ДДР и ABC-категорию на уровне артикула

---

## Success Criteria

- [ ] При раскрытии любой строки РК видна разбивка по артикулам за тот же период
- [ ] Сумма затрат по всем nmId ≈ итоговой сумме РК (допуск: округление WB API)
- [ ] Данные за период совпадают с периодом в пресете (Сегодня / 7 дн / 30 дн / свой диапазон)
- [ ] Синк nm-данных происходит вместе с основным синком рекламы, без дополнительных API-вызовов

---

## User Journey

1. Пользователь открывает `/advertising`
2. Видит таблицу «Анализ РК» с пресетами периода
3. Нажимает `▶` слева от строки нужной РК
4. Строка раскрывается — под ней появляется вложенная таблица артикулов
5. Видит: Артикул (nmId + название), Показы, Клики, Заказы шт, Заказы ₽, Затраты ₽
6. Нажимает `▼` ещё раз — вкладка сворачивается

---

## Functional Requirements

### P0 — MVP

**Таблица wb_ad_spend_nm (новая):**
- Хранит данные уровня `(store_id, campaign_id, nm_id, date)`
- Заполняется при каждом синке рекламы из уже полученного ответа fullstats
- UNIQUE(store_id, campaign_id, nm_id, date) — upsert без дублей

**Кнопка раскрытия в строке РК:**
- Иконка `▶ / ▼` в первой колонке перед названием
- Клик раскрывает/сворачивает вложенную таблицу
- Данные загружаются при первом раскрытии (lazy), кешируются для повторного открытия

**Вложенная таблица колонки:**
| Колонка | Источник | Примечание |
|---------|----------|------------|
| Артикул | nm_id | + название из API (`name` поле) |
| Затраты ₽ | spend | Сумма всех appType |
| Показы | views | Сумма всех appType |
| Клики | clicks | Сумма всех appType |
| Заказы шт | orders_count | — |
| Заказы ₽ | orders_sum | — |

**Период:** совпадает с текущим периодом родительской таблицы (передаётся как `from`/`to`)

**Сортировка по умолчанию:** по Затратам ₽ убыванию

### P1 — Следующая итерация

- ДДР % на уровне артикула (spend / orders_sum × 100)
- ABC-метка (A / B / C) по доле затрат артикула в общем бюджете периода
- Название артикула из таблицы `products` (join по nm_id)

### P2 — Будущее

- Фильтрация по артикулу в главной таблице
- Экспорт nm-детализации в CSV

---

## Technical Architecture

### Новая таблица БД

```sql
CREATE TABLE wb_ad_spend_nm (
  id           bigserial PRIMARY KEY,
  store_id     uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  campaign_id  bigint NOT NULL,
  nm_id        bigint NOT NULL,
  nm_name      text,
  date         date NOT NULL,
  spend        numeric(12,2) DEFAULT 0,
  views        int DEFAULT 0,
  clicks       int DEFAULT 0,
  orders_count int DEFAULT 0,
  orders_sum   numeric(12,2) DEFAULT 0,
  atbs         int DEFAULT 0,
  canceled     int DEFAULT 0,
  UNIQUE(store_id, campaign_id, nm_id, date)
);

CREATE INDEX idx_wb_ad_spend_nm_store_date
  ON wb_ad_spend_nm(store_id, date);
CREATE INDEX idx_wb_ad_spend_nm_nm_id
  ON wb_ad_spend_nm(store_id, nm_id);
```

### Изменение синка рекламы

В существующем коде синка `/adv/v3/fullstats`, при обработке ответа добавить внутренний цикл:

```
для каждой кампании camp:
  для каждого дня day:
    aggregated = Map<nmId, {spend, views, clicks, orders, sum_price, atbs, canceled, name}>
    для каждого app в day.apps:
      для каждого nm в app.nms:
        aggregated[nm.nmId].spend += nm.sum
        aggregated[nm.nmId].views += nm.views
        ... (суммировать все appType)
    upsert все nm строки в wb_ad_spend_nm
    (фильтр: только даты в пределах beginDate–endDate)
```

**Важно:** агрегировать все `appType` (1, 32, 64) в одну строку на (campaign_id, nm_id, date).

### Новый API endpoint

`GET /api/advertising/campaigns/[id]/nms?from=YYYY-MM-DD&to=YYYY-MM-DD`

Возвращает:
```json
{
  "nms": [
    {
      "nm_id": 832033981,
      "nm_name": "Комбинезон летний...",
      "spend": 1240.50,
      "views": 8432,
      "clicks": 142,
      "orders_count": 12,
      "orders_sum": 43200.00
    }
  ],
  "total": { "spend": 3891.00, ... }
}
```

Пагинация не нужна — максимум ~50 nmId на РК.

### Изменения в UI (campaigns-table.tsx)

1. Добавить колонку `▶` в начало таблицы (width: 32px)
2. State: `expandedCampaigns: Set<number>` + `nmCache: Map<number, NmRow[]>`
3. При клике `▶`:
   - Если не в кеше → fetch `/api/advertising/campaigns/${id}/nms?from=...&to=...`
   - Установить в кеш, добавить id в `expandedCampaigns`
4. При рендере строк: если campaign_id в expandedCampaigns → рендерить `<tr className="bg-muted/10">` с sub-таблицей

### Размер данных

| Параметр | Оценка |
|----------|--------|
| Кампаний | 123 |
| Средн. nmId на РК | ~5–10 |
| Дней данных | 83 (Apr–Jun) |
| Итого строк в wb_ad_spend_nm | ~50,000–100,000 |
| Размер таблицы | ~15–25 MB |

---

## Security Model

- Та же аутентификация что и у `wb_ad_spend`: service role + getUserStoreIds
- Row-level security через `store_id` фильтр
- Новый endpoint защищён сессионным auth (createClient)

---

## Non-Functional Requirements

- **Первая загрузка вложенной таблицы:** < 300ms (данные уже в БД, простой SELECT)
- **Синк nm-данных:** не добавляет дополнительных API-запросов к WB — использует уже полученный ответ
- **Совместимость:** не ломает существующую таблицу `wb_ad_spend` и её синк

---

## Out of Scope

- Детализация по `appType` (приложение / сайт / поиск) — только суммарно
- Экспорт в CSV — в первой версии
- Real-time обновление — данные за вчера, обновляются при синке
- Интерфейс ручного запуска синка nm-данных отдельно от рекламы

---

## Implementation Plan (5 шагов)

### Шаг 1 — БД
- SQL: создать таблицу `wb_ad_spend_nm` + индексы
- Проверить UNIQUE constraint

### Шаг 2 — Синк
- Изменить скрипт синка рекламы: извлекать nm из `days → apps → nms`, агрегировать по appType, upsert в `wb_ad_spend_nm`
- Исторический запуск: синкнуть Apr 1 – Jun 22 (все данные, которые есть в wb_ad_spend)

### Шаг 3 — API endpoint
- `src/app/api/advertising/campaigns/[id]/nms/route.ts`
- GET с параметрами from/to, pagination не нужна

### Шаг 4 — UI expand в campaigns-table.tsx
- Колонка `▶ / ▼`
- Lazy-load + кеш
- Sub-таблица с 6 колонками

### Шаг 5 — Верификация
- Проверить: sum(spend по nm) ≈ spend РК из wb_ad_spend
- Убедиться что период из пресета передаётся корректно в nm-запрос

---

## Open Questions for Implementation

1. WB API `nm.name` — это маркетинговое название товара или артикул поставщика? (Проверить на реальных данных)
2. Есть ли кампании где `apps` пустой или `nms` пустой? Нужен ли graceful fallback?
3. Таблица `products` содержит `nm_id`? Нужен ли JOIN для получения более полного названия?
