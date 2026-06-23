-- Migration 011: Платное хранение WB — детализация по SKU и дате

CREATE TABLE IF NOT EXISTS wb_storage_daily (
  id              bigserial PRIMARY KEY,
  store_id        uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  date            date NOT NULL,
  nm_id           bigint NOT NULL,
  vendor_code     text,
  barcode         text,
  subject         text,
  brand           text,
  warehouse       text,
  volume          numeric(12,4),      -- объём в литрах
  cost            numeric(12,2),      -- стоимость хранения за день ₽
  calc_type       text,               -- тип расчёта (короб/монопаллет и т.д.)
  created_at      timestamptz DEFAULT now(),
  UNIQUE (store_id, date, nm_id, warehouse, barcode)
);

CREATE INDEX IF NOT EXISTS wb_storage_daily_store_date  ON wb_storage_daily(store_id, date DESC);
CREATE INDEX IF NOT EXISTS wb_storage_daily_nm          ON wb_storage_daily(store_id, nm_id, date DESC);
CREATE INDEX IF NOT EXISTS wb_storage_daily_warehouse   ON wb_storage_daily(store_id, warehouse, date DESC);

ALTER TABLE wb_storage_daily ENABLE ROW LEVEL SECURITY;
CREATE POLICY "wb_storage_daily: own stores" ON wb_storage_daily
  FOR ALL USING (store_id IN (SELECT store_id FROM user_stores WHERE user_id = auth.uid()));
