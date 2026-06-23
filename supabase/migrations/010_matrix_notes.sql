-- Migration 010: Редактируемые поля дк-матрицы

-- Стратегия по артикулу (глобальный текст на nm_id)
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS strategy text;

-- Лог действий и план заказов по дням
CREATE TABLE IF NOT EXISTS sku_matrix_notes (
  id          bigserial PRIMARY KEY,
  store_id    uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  nm_id       bigint NOT NULL,
  date        date NOT NULL,
  action_log  text,            -- Лог действий: текстовые записи за день
  plan_orders int,             -- Плановые заказы в этот день
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now(),
  UNIQUE (store_id, nm_id, date)
);

CREATE INDEX IF NOT EXISTS sku_matrix_notes_nm ON sku_matrix_notes(store_id, nm_id, date DESC);

ALTER TABLE sku_matrix_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sku_matrix_notes: own stores" ON sku_matrix_notes
  FOR ALL USING (store_id IN (SELECT store_id FROM user_stores WHERE user_id = auth.uid()));
