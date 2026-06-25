CREATE TABLE IF NOT EXISTS unit_economics_overrides (
  id            bigserial PRIMARY KEY,
  store_id      uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  nm_id         bigint NOT NULL,
  price_before_spp numeric(12,2),
  spp_pct       numeric(5,2),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (store_id, nm_id)
);

CREATE INDEX IF NOT EXISTS ueo_store_nm ON unit_economics_overrides (store_id, nm_id);
