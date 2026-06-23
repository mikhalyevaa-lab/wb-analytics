-- Migration 004: Инфраструктура v2.0
-- sync_log, wb_tariffs_history, wb_analytics_token в stores

-- ============================================================
-- 1. Расширяем существующую таблицу sync_log (уже существует)
-- Добавляем finished_at и индекс по method
-- ============================================================
ALTER TABLE sync_log ADD COLUMN IF NOT EXISTS finished_at timestamptz;
CREATE INDEX IF NOT EXISTS sync_log_store_method ON sync_log(store_id, method, created_at DESC);

-- ============================================================
-- 2. История тарифов (daily snapshot)
-- ============================================================
CREATE TABLE IF NOT EXISTS wb_tariffs_history (
  id                   bigserial PRIMARY KEY,
  store_id             uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  snapshot_date        date NOT NULL,
  tariff_type          text NOT NULL,   -- 'box' | 'return'
  warehouse_name       text NOT NULL,
  geo_name             text,
  delivery_base        numeric(10,2),
  delivery_liter       numeric(10,2),
  delivery_coef_expr   numeric(10,2),
  storage_base         numeric(10,4),
  storage_liter        numeric(10,4),
  storage_coef_expr    numeric(10,2),
  return_office_base   numeric(10,2),
  return_office_liter  numeric(10,2),
  return_courier_base  numeric(10,2),
  return_courier_liter numeric(10,2),
  dt_next_change       date,
  dt_till_max          date,
  loaded_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE(store_id, tariff_type, warehouse_name, snapshot_date)
);

CREATE INDEX IF NOT EXISTS wb_tariffs_history_store ON wb_tariffs_history(store_id, snapshot_date DESC);
ALTER TABLE wb_tariffs_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "wb_tariffs_history: own stores" ON wb_tariffs_history
  FOR ALL USING (store_id IN (SELECT store_id FROM user_stores WHERE user_id = auth.uid()));

-- ============================================================
-- 3. Аналитический токен для магазина (воронка, ИРП)
-- ============================================================
ALTER TABLE stores ADD COLUMN IF NOT EXISTS wb_analytics_token text;
