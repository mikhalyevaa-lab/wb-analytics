-- Аналитический токен WB (seller-analytics-api) — может совпадать с wb_token
ALTER TABLE stores ADD COLUMN IF NOT EXISTS wb_analytics_token text;

-- Воронка продаж
CREATE TABLE IF NOT EXISTS wb_funnel (
  id              bigserial PRIMARY KEY,
  store_id        uuid          NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  date            date          NOT NULL,
  nm_id           bigint        NOT NULL,
  supplier_article text,
  open_count               int          NOT NULL DEFAULT 0,
  cart_count               int          NOT NULL DEFAULT 0,
  order_count              int          NOT NULL DEFAULT 0,
  order_sum                numeric(14,2) NOT NULL DEFAULT 0,
  buyout_count             int          NOT NULL DEFAULT 0,
  buyout_sum               numeric(14,2) NOT NULL DEFAULT 0,
  buyout_percent           numeric(6,2) NOT NULL DEFAULT 0,
  add_to_cart_conversion   numeric(6,2) NOT NULL DEFAULT 0,
  cart_to_order_conversion numeric(6,2) NOT NULL DEFAULT 0,
  add_to_wishlist_count    int          NOT NULL DEFAULT 0,
  updated_at      timestamptz   NOT NULL DEFAULT now(),
  UNIQUE(store_id, date, nm_id)
);

CREATE INDEX IF NOT EXISTS wb_funnel_store_date ON wb_funnel(store_id, date DESC);
CREATE INDEX IF NOT EXISTS wb_funnel_nm_id      ON wb_funnel(store_id, nm_id);

ALTER TABLE wb_funnel ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own stores funnel" ON wb_funnel
  FOR SELECT USING (
    store_id IN (SELECT store_id FROM user_stores WHERE user_id = auth.uid())
  );
