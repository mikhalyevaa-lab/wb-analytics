-- Migration 005: Блок Логистика — таблица индексов ИРП и локализации

CREATE TABLE IF NOT EXISTS wb_logistics_indexes (
  id          bigserial PRIMARY KEY,
  store_id    uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  week_date   date NOT NULL,  -- понедельник недели
  irp         numeric(6,2),
  localization_index numeric(6,2),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE(store_id, week_date)
);

CREATE INDEX IF NOT EXISTS wb_logistics_indexes_store_week
  ON wb_logistics_indexes(store_id, week_date DESC);

ALTER TABLE wb_logistics_indexes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "wb_logistics_indexes: own stores" ON wb_logistics_indexes;
CREATE POLICY "wb_logistics_indexes: own stores" ON wb_logistics_indexes
  FOR ALL USING (store_id IN (
    SELECT store_id FROM user_stores WHERE user_id = auth.uid()
  ));
