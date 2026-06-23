# Спецификация: Редизайн визуализации данных — Overview Dashboard

**Дата**: 2026-06-22  
**Фаза**: 14 — Discovery Interview  
**Статус**: Готово к реализации

---

## Executive Summary

Редизайн страницы `/overview` в wb-analytics: замена плоского Tailwind-дизайна на **Light Neumorphism** с интерактивными KPI-карточками (sparkline), централизованным Plan-Fact Waterfall-чартом и системой алертов. Overview становится «флагманом» — визуальным образцом для всех остальных разделов приложения.

---

## Проблемы текущего состояния

Аудит текущего `/overview/page.tsx` и компонентов:

| Проблема | Текущее состояние | Что нужно |
|----------|-------------------|-----------|
| Цифры есть, но не читаются | KPI в мелких flat-карточках, нет иерархии | Крупные цифры + цветовые акценты |
| Скучно визуально | `border border-border bg-card` — типичный shadcn | Light neumorphism, box-shadow, без border |
| Слишком много данных сразу | 8 KPI-карточек + 5 секций на одном экране | Hero-тройка → expand по клику |
| Не хватает нужных типов чартов | Waterfall — CSS-бары без анимации, нет sparklines | Recharts ComposedChart + sparkline в карточках |
| Период через URL, не запоминается | `?from=&to=` в query params | `localStorage` + UI-пикер |

---

## Целевое ощущение

**Для собственника/директора** (главная страница → РНП):  
> «Открыл — за 30 секунд понял что происходит. Вижу 3 числа, вижу тренд, вижу если что-то сломалось.»

**Для менеджера маркетплейса** (внутренние разделы: P&L, реклама, ABC):  
> «Это профессиональный инструмент. Плотные данные, фильтры, детализация.»

Overview оптимизируется под **директора**. Внутренние разделы — под менеджера (отдельная фаза).

---

## Дизайн-система: Light Neumorphism

### Цветовая палитра

```css
/* Основа */
--neu-bg: #e0e5ec;          /* фон страницы */
--neu-card: #e0e5ec;        /* фон карточки (= фону, тени создают глубину) */
--neu-shadow-light: #ffffff; /* светлая тень (верх-лево) */
--neu-shadow-dark: #a3b1c6;  /* тёмная тень (низ-право) */

/* Акценты */
--neu-accent-green: #10b981;  /* рост, прибыль */
--neu-accent-red: #ef4444;    /* убыток, алерт */
--neu-accent-blue: #3b82f6;   /* нейтральные данные, итог */
--neu-accent-amber: #f59e0b;  /* предупреждение */
--neu-text-primary: #2d3748;
--neu-text-secondary: #718096;
```

### Компоненты neumorphism

```css
/* Выпуклая карточка (convex — "поднятый" элемент) */
.neu-card {
  background: #e0e5ec;
  border-radius: 16px;
  box-shadow: 6px 6px 12px #a3b1c6, -6px -6px 12px #ffffff;
  border: none;
}

/* Вдавленная зона (concave — "нажатая", активный элемент) */
.neu-inset {
  background: #e0e5ec;
  border-radius: 12px;
  box-shadow: inset 4px 4px 8px #a3b1c6, inset -4px -4px 8px #ffffff;
}

/* Кнопка-период (idle → active) */
.neu-btn        { box-shadow: 3px 3px 6px #a3b1c6, -3px -3px 6px #ffffff; }
.neu-btn:active { box-shadow: inset 2px 2px 5px #a3b1c6, inset -2px -2px 5px #ffffff; }
```

### Типографика

```
Заголовок KPI:  font-size 28px, font-weight 700, color #2d3748
Дельта:         font-size 13px, font-weight 600, color #10b981 / #ef4444
Label:          font-size 11px, font-weight 500, uppercase, letter-spacing 0.08em, color #718096
Подзаголовки:   font-size 14px, font-weight 600, color #4a5568
```

---

## Архитектура Overview-страницы

### Структура (сверху вниз)

```
┌─────────────────────────────────────────────────────────┐
│  Header: "Обзор" + Period Picker (localStorage)         │
├─────────────────────────────────────────────────────────┤
│  Alert Strip — если есть критические сигналы            │
├─────────────────────────────────────────────────────────┤
│  Hero KPI Row (3 карточки):                             │
│  [Выручка + sparkline] [Заказы + sparkline] [ДРР + KPI] │
├─────────────────────────────────────────────────────────┤
│  Plan-Fact Waterfall (Recharts ComposedChart)           │
├─────────────────────────────────────────────────────────┤
│  Secondary Row:                                         │
│  [Чистая прибыль] [Маржа %] [% выкупа] [Возвраты]     │
├─────────────────────────────────────────────────────────┤
│  Orders Daily Chart (line)                              │
├─────────────────────────────────────────────────────────┤
│  Top Tasks (без изменений)                              │
└─────────────────────────────────────────────────────────┘
```

---

## Функциональные требования

### P0 — Must Have (MVP этой фазы)

#### 1. Neumorphic Design System (`/src/styles/neumorphism.css` или Tailwind plugin)

- Заменить `border border-border bg-card` на neu-card во всех компонентах Overview
- Фон `<body>` / layout → `#e0e5ec` для страницы Overview (или scoped wrapper)
- Радиус 16px на карточках, 12px на вложенных элементах
- Переходы `box-shadow` плавные: `transition: box-shadow 0.2s ease`

#### 2. Hero KPI Cards с sparkline (`/src/components/overview/kpi-cards.tsx`)

**3 главных карточки** (увеличенные, Hero-размер):

| Карточка | Главная цифра | Дельта | Sparkline |
|----------|---------------|--------|-----------|
| Выручка | `finance.revenue` ₽ | vs прошлый период % | 30-дневный daily |
| Заказы | `yesterday.count` шт | vs 7 дней назад | 14-дневный daily |
| ДРР | рассчитывается из ads/revenue | ▲/▼ vs прошлый месяц | 14-дневный тренд |

**Sparkline**: Recharts `<LineChart width={120} height={40}>` без осей, без легенды. Цвет линии: зелёный если тренд вверх, красный если вниз.

**5 вторичных карточек** (меньше, neu-card стандартного размера):  
Чистая прибыль, Маржа %, ROI, % выкупа, Возвраты — остаются, но в новом дизайне.

#### 3. Alert Strip (`/src/components/overview/signal-cards.tsx`)

- Компактная полоса под header (не блок 2×2 как сейчас)
- Каждый алерт — pill: цветной фон, иконка, короткий текст
- Критические: красный фон neu-inset
- Предупреждения: amber
- Хорошее: зелёное (скрывать если нет проблем)
- Клик → переход в соответствующий раздел (drill-down)

#### 4. Plan-Fact Waterfall редизайн (`/src/components/overview/profit-waterfall.tsx`)

**Текущая проблема**: горизонтальные CSS-бары — не читаются как waterfall, нет анимации.

**Решение**: Recharts `ComposedChart` — вертикальный waterfall через Bar + невидимые offset-бары.

```typescript
// Waterfall через Recharts: каждый шаг = {invisible offset bar} + {visible value bar}
// Цвет: positive → #10b981, negative → #ef4444, result → #3b82f6
// Tooltip кастомный: лейбл + значение + % от выручки
// Анимация: isAnimationActive={true} animationDuration={800}
```

Обернуть в `neu-card` с padding 20px.

#### 5. Period Picker с localStorage (`/src/hooks/use-overview-period.ts`)

```typescript
// Хук: 
// - читает из localStorage('wb-overview-period')
// - Пресеты: MTD (текущий месяц), 7д, 30д, 90д, прошлый месяц, custom
// - Сохраняет при изменении
// - Возвращает { from, to, label, setPreset, setCustom }
// Убрать URL-params как основной механизм (оставить для шаринга ссылки)
```

**UI Period Picker**: горизонтальный ряд кнопок-pills в neu-btn стиле. Активная — neu-inset (вдавленная).

#### 6. Навигация: drill-down из карточек

- Карточка Выручка → клик → `/pnl`
- Карточка Заказы → клик → `/rnp`
- Карточка ДРР → клик → `/advertising`
- Алерт "Остатки" → клик → `/supplies`
- Алерт "Задачи" → клик → `/tasks`

Карточки оборачиваются в `<Link>` или `cursor-pointer` + `router.push()`.

### P1 — Should Have

#### 7. Micro-animations (Framer Motion)

```typescript
// KPI числа: при изменении данных animate от старого → новому (CountUp)
// Карточки: при hover - subtle lift (box-shadow увеличивается)
// Waterfall bars: enter animation — бары вырастают снизу вверх
```

`framer-motion` уже в Next.js eco, установить если нет.

#### 8. Прогноз конца месяца (MTD-контекст)

В Hero-карточках — если период MTD: показывать forecast строкой под дельтой:  
`«Прогноз конца месяца: ~X ₽»` (линейная экстраполяция: value / day_of_month * days_in_month)

### P2 — Nice to Have

#### 9. Dark mode toggle

Добавить CSS-переменные для dark neumorphism:
```css
/* Dark neumorphism */
--neu-bg-dark: #1a1a2e;
--neu-shadow-light-dark: #25254a;
--neu-shadow-dark-dark: #0f0f1e;
```

#### 10. Кастомизация Hero KPI

Пользователь выбирает какие 3 показателя видеть в Hero (сохраняется в localStorage).

---

## Технические решения

### Chart library

**Оставить Recharts** (уже в package.json, хорошая TypeScript-интеграция с Next.js).

| Нужный тип | Решение в Recharts |
|------------|-------------------|
| Sparkline | `<LineChart>` без осей, 120×40px |
| Waterfall | `<ComposedChart>` с Bar + offset invisible bars |
| Line daily | `<LineChart>` с `<Area>` fill — уже есть в `orders-chart.tsx` |

**Не добавлять** ApexCharts или ECharts — лишний bundle size, waterfall через Recharts реализуем.

### Стили

Подход: CSS-переменные в `globals.css` + кастомный Tailwind plugin или utility-классы.

```css
/* globals.css — добавить neumorphism utilities */
.neu-card { ... }
.neu-inset { ... }
.neu-btn { ... }
```

Не использовать `@apply` в компонентах — держать стили в CSS.

### Файловая структура изменений

```
src/
  styles/
    neumorphism.css          # NEW: CSS-переменные и утилиты
  hooks/
    use-overview-period.ts   # NEW: localStorage period hook
  components/
    overview/
      kpi-cards.tsx          # EDIT: Hero × 3 + sparkline + secondary × 5
      signal-cards.tsx       # EDIT: alert pills strip
      profit-waterfall.tsx   # EDIT: Recharts ComposedChart waterfall
      orders-chart.tsx       # EDIT: neu-card wrapper
      period-picker.tsx      # NEW: neu-btn период UI
  app/(app)/overview/
    page.tsx                 # EDIT: layout, period hook, drill-down links
```

---

## Данные: что нужно из Supabase

### Новые данные для sparklines

Функция `getOverviewDailySales()` уже возвращает daily data — использовать для sparklines в карточке Заказы.

Нужно добавить: 
- `getRevenueDailySeries(storeIds, from, to)` — daily выручка для sparkline Выручки
- `getAdsMetrics(storeIds, from, to)` → ДРР = расходы_на_рекламу / выручка × 100

Если `getAdsMetrics` уже есть в другом разделе — переиспользовать.

### ДРР расчёт

```typescript
const drr = finance.adsCost > 0 
  ? ((finance.adsCost / finance.revenue) * 100).toFixed(1) 
  : null
// Показывать "н/д" если adsCost === 0
```

---

## Out of Scope (эта фаза)

- Редизайн других страниц (P&L, РНП, Реклама) — следующие фазы
- Mobile-оптимизация — P1 после desktop MVP
- Dark mode — P2
- ABC/XYZ пузырьковая диаграмма на Overview — в раздел /abc
- Кастомные виджеты пользователя — позже

---

## Acceptance Criteria

- [ ] Страница `/overview` использует light neumorphism (#e0e5ec фон, box-shadow карточки)
- [ ] 3 Hero KPI-карточки: Выручка, Заказы, ДРР — с sparkline
- [ ] Алерты — pill-полоса, кликабельные с drill-down
- [ ] Waterfall — Recharts ComposedChart, вертикальный, с анимацией
- [ ] Period picker — localStorage, пресеты MTD/7д/30д/90д/прошлый месяц
- [ ] Клик по Hero-карточке → переход в соответствующий раздел
- [ ] Нет `border border-border` на главных блоках — только box-shadow
- [ ] TypeScript без ошибок (`npm run build` проходит)

---

## Приложение: Исследование (Phase 14 URLs)

### Тренды дашбордов e-commerce (qlever.ru, hightime.media)

ТОП-5 дашбордов для e-commerce директора утром:
1. **Plan-Fact** — текущий темп vs план (наш waterfall)
2. **P&L** — маржинальность по неделям/месяцам
3. **ABC/XYZ** — по SKU (выручка × стабильность)
4. **Остатки и запасы** — оборачиваемость, дни до OOS
5. **Рекламная воронка** — показы → корзина → заказы

### Дашборды категорийного менеджера (pricer24.com)

- Анализ цен конкурентов (мониторинг РРЦ)
- Анализ ассортимента конкурентов
- Анализ рынка (тренды категории)

→ Эти 3 дашборда — кандидаты для фаз 15-17.

### Neumorphism reference (claudekit.github.io/02-neumorphism.html)

- Ключевые параметры: `box-shadow: 6px 6px 12px #a3b1c6, -6px -6px 12px #ffffff`
- Фон должен совпадать с фоном карточки (`#e0e5ec`)
- Работает только на светлом нейтральном фоне (не белый, не серый — именно warm gray)
- Цветные акценты добавлять точечно (иконки, значения, дельты) — не фон карточек

---

*Спецификация создана по результатам Discovery Interview, Фаза 14.*  
*Следующий шаг: реализация P0 компонентов, начиная с design system + KPI cards.*
