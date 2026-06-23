-- Migration 009: Исправление хранения wb_orders с детализацией по баркоду

-- 1. Уникальный constraint по (store_id, g_number, nm_id, barcode, date)
--    Нужен для корректного upsert с детализацией по баркоду/размеру
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'wb_orders_unique_key'
  ) THEN
    ALTER TABLE wb_orders
      ADD CONSTRAINT wb_orders_unique_key
      UNIQUE (store_id, g_number, nm_id, barcode, date);
  END IF;
END $$;

-- 2. discount_percent: int → numeric(5,2), чтобы хранить дробные проценты (26.77%)
--    Без этого price_after_discount вычисляется с погрешностью
ALTER TABLE wb_orders
  ALTER COLUMN discount_percent TYPE numeric(5,2);

-- 3. Колонки из migration 008 (повторяем IF NOT EXISTS — безопасно)
ALTER TABLE wb_orders
  ADD COLUMN IF NOT EXISTS srid                text,
  ADD COLUMN IF NOT EXISTS price_after_discount numeric,   -- totalPrice × (1 − discountPercent/100), до СПП
  ADD COLUMN IF NOT EXISTS price_after_spp      numeric,   -- Цена заказа из файла, после СПП
  ADD COLUMN IF NOT EXISTS oblast               text;

-- 4. Индексы
CREATE INDEX IF NOT EXISTS wb_orders_srid_idx    ON wb_orders(store_id, srid);
CREATE INDEX IF NOT EXISTS wb_orders_barcode_idx ON wb_orders(store_id, nm_id, barcode);
