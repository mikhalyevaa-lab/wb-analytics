-- Migration 003: таблицы для блока РНП
-- Комиссии, тарифы логистики/хранения/возврата, габариты товаров
-- Запустить в Supabase → SQL Editor

-- ============================================================
-- 1. Габариты товаров (расширяем таблицу products)
-- ============================================================
ALTER TABLE products ADD COLUMN IF NOT EXISTS vendor_code   text;
ALTER TABLE products ADD COLUMN IF NOT EXISTS brand         text;
ALTER TABLE products ADD COLUMN IF NOT EXISTS title         text;
ALTER TABLE products ADD COLUMN IF NOT EXISTS subject_id    int;
ALTER TABLE products ADD COLUMN IF NOT EXISTS subject_name  text;
ALTER TABLE products ADD COLUMN IF NOT EXISTS photo_url     text;
ALTER TABLE products ADD COLUMN IF NOT EXISTS color         text;
ALTER TABLE products ADD COLUMN IF NOT EXISTS imt_id        bigint;
ALTER TABLE products ADD COLUMN IF NOT EXISTS group_id      uuid REFERENCES product_groups(id) ON DELETE SET NULL;
ALTER TABLE products ADD COLUMN IF NOT EXISTS current_stock int NOT NULL DEFAULT 0;
ALTER TABLE products ADD COLUMN IF NOT EXISTS avg_price_before_spp numeric(12,2);
ALTER TABLE products ADD COLUMN IF NOT EXISTS avg_price_after_spp  numeric(12,2);
ALTER TABLE products ADD COLUMN IF NOT EXISTS avg_orders_per_day   numeric(8,4);
ALTER TABLE products ADD COLUMN IF NOT EXISTS buyout_rate          numeric(6,2);

-- Физические габариты (из WB Content API, в миллиметрах)
ALTER TABLE products ADD COLUMN IF NOT EXISTS length_mm int;
ALTER TABLE products ADD COLUMN IF NOT EXISTS width_mm  int;
ALTER TABLE products ADD COLUMN IF NOT EXISTS height_mm int;
ALTER TABLE products ADD COLUMN IF NOT EXISTS weight_g  numeric(10,2);

-- Объём в литрах — вычисляемое поле (л = мм³ / 1_000_000)
-- WB использует объём для расчёта логистики
ALTER TABLE products ADD COLUMN IF NOT EXISTS volume_liters numeric(10,6)
  GENERATED ALWAYS AS (
    CASE
      WHEN length_mm IS NOT NULL AND width_mm IS NOT NULL AND height_mm IS NOT NULL
      THEN ROUND((length_mm::numeric * width_mm::numeric * height_mm::numeric) / 1000000.0, 6)
      ELSE NULL
    END
  ) STORED;

-- ============================================================
-- 2. Комиссии WB по предметам
-- Источник: GET /api/v1/tariffs/commission (common-api.wildberries.ru)
-- Обновляется: раз в сутки
-- ============================================================
CREATE TABLE IF NOT EXISTS wb_commissions (
  id              bigserial PRIMARY KEY,
  store_id        uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  subject_id      int  NOT NULL,
  subject_name    text,
  parent_id       int,
  parent_name     text,
  -- Основная комиссия для FBO (поставщик хранит на складе WB)
  kgvp_supplier   numeric(6,2),
  -- Комиссия для маркетплейс-схемы (поставщик хранит у себя)
  kgvp_marketplace numeric(6,2),
  kgvp_pickup     numeric(6,2),  -- самовывоз
  kgvp_booking    numeric(6,2),  -- бронирование
  paid_storage_kgvp numeric(6,2), -- платное хранение
  loaded_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE(store_id, subject_id)
);

CREATE INDEX IF NOT EXISTS wb_commissions_store ON wb_commissions(store_id);
ALTER TABLE wb_commissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "wb_commissions: own stores" ON wb_commissions
  FOR ALL USING (store_id IN (SELECT store_id FROM user_stores WHERE user_id = auth.uid()));

-- ============================================================
-- 3. Тарифы логистики, хранения и возврата
-- Источник: GET /api/v1/tariffs/box, /return, /pallet
-- Обновляется: раз в сутки (WB меняет тарифы периодически)
-- ============================================================
CREATE TABLE IF NOT EXISTS wb_tariffs (
  id              bigserial PRIMARY KEY,
  store_id        uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  tariff_type     text NOT NULL,  -- 'box' | 'pallet' | 'return'
  warehouse_name  text NOT NULL,
  geo_name        text,

  -- Логистика (доставка к покупателю) — ₽ за литр
  delivery_base        numeric(10,2),  -- базовая стоимость (первый литр)
  delivery_liter       numeric(10,2),  -- каждый дополнительный литр
  delivery_coef_expr   numeric(10,2),  -- коэффициент экспресс-доставки (%)

  -- Хранение — ₽/литр/день
  storage_base         numeric(10,4),
  storage_liter        numeric(10,4),
  storage_coef_expr    numeric(10,2),

  -- Возврат — ₽ (для type='return')
  return_office_base   numeric(10,2),  -- возврат в ПВЗ, базовый
  return_office_liter  numeric(10,2),  -- возврат в ПВЗ, доп. литр
  return_courier_base  numeric(10,2),  -- курьерский возврат
  return_courier_liter numeric(10,2),

  dt_next_change  date,   -- дата следующего изменения тарифа
  dt_till_max     date,   -- дата окончания действия
  loaded_at       timestamptz NOT NULL DEFAULT now(),

  UNIQUE(store_id, tariff_type, warehouse_name)
);

CREATE INDEX IF NOT EXISTS wb_tariffs_store ON wb_tariffs(store_id, tariff_type);
ALTER TABLE wb_tariffs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "wb_tariffs: own stores" ON wb_tariffs
  FOR ALL USING (store_id IN (SELECT store_id FROM user_stores WHERE user_id = auth.uid()));
