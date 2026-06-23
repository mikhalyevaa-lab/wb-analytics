-- Детализация затрат на рекламу по артикулу (nmId)
-- Запустить в Supabase Dashboard → SQL Editor

CREATE TABLE IF NOT EXISTS wb_ad_spend_nm (
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

CREATE INDEX IF NOT EXISTS idx_wb_ad_spend_nm_store_date
  ON wb_ad_spend_nm(store_id, date);

CREATE INDEX IF NOT EXISTS idx_wb_ad_spend_nm_nm_id
  ON wb_ad_spend_nm(store_id, nm_id);
