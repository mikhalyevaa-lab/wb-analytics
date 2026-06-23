-- store_settings
CREATE TABLE IF NOT EXISTS store_settings (
  id bigserial PRIMARY KEY,
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  supply_days int NOT NULL DEFAULT 14,
  safety_stock_days int NOT NULL DEFAULT 7,
  ad_budget_limit numeric(12,2),
  target_drr_pct numeric(5,2),
  control_window_days int NOT NULL DEFAULT 7,
  plan_orders_per_day numeric(10,2),
  plan_revenue_per_day numeric(12,2),
  min_margin_pct numeric(5,2),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(store_id)
);
ALTER TABLE store_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "store_settings: own stores" ON store_settings;
CREATE POLICY "store_settings: own stores" ON store_settings
  FOR ALL USING (store_id IN (SELECT store_id FROM user_stores WHERE user_id = auth.uid()));

-- tasks
CREATE TABLE IF NOT EXISTS tasks (
  id bigserial PRIMARY KEY,
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  nm_id bigint,
  title text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'todo' CHECK (status IN ('todo','in_progress','done')),
  priority text NOT NULL DEFAULT 'medium' CHECK (priority IN ('low','medium','high')),
  due_date date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tasks: own stores" ON tasks;
CREATE POLICY "tasks: own stores" ON tasks
  FOR ALL USING (store_id IN (SELECT store_id FROM user_stores WHERE user_id = auth.uid()));

CREATE INDEX IF NOT EXISTS tasks_store_id_idx ON tasks(store_id);
CREATE INDEX IF NOT EXISTS tasks_status_idx ON tasks(store_id, status);
