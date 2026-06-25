-- ============================================================
-- WB Analytics — Схема для локального PostgreSQL (без Supabase)
-- Использует better-auth вместо Supabase Auth
-- RLS убран — используем application-level проверки
--
-- Применить:
--   psql $DATABASE_URL -f supabase/schema_local.sql
-- ============================================================

-- Расширения
CREATE EXTENSION IF NOT EXISTS "pgcrypto";


-- ============================================================
-- 0. ПОЛЬЗОВАТЕЛИ И СЕССИИ (better-auth)
-- ============================================================
CREATE TABLE IF NOT EXISTS "user" (
  id            text PRIMARY KEY,
  name          text NOT NULL,
  email         text NOT NULL UNIQUE,
  "emailVerified" boolean NOT NULL DEFAULT false,
  image         text,
  "createdAt"   timestamptz NOT NULL DEFAULT now(),
  "updatedAt"   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "session" (
  id          text PRIMARY KEY,
  "expiresAt" timestamptz NOT NULL,
  token       text NOT NULL UNIQUE,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  "ipAddress" text,
  "userAgent" text,
  "userId"    text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS "account" (
  id                    text PRIMARY KEY,
  "accountId"           text NOT NULL,
  "providerId"          text NOT NULL,
  "userId"              text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  "accessToken"         text,
  "refreshToken"        text,
  "idToken"             text,
  "accessTokenExpiresAt" timestamptz,
  "refreshTokenExpiresAt" timestamptz,
  scope                 text,
  password              text,
  "createdAt"           timestamptz NOT NULL DEFAULT now(),
  "updatedAt"           timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "verification" (
  id         text PRIMARY KEY,
  identifier text NOT NULL,
  value      text NOT NULL,
  "expiresAt" timestamptz NOT NULL,
  "createdAt" timestamptz DEFAULT now(),
  "updatedAt" timestamptz DEFAULT now()
);


-- ============================================================
-- 1. ПРОФИЛИ ПОЛЬЗОВАТЕЛЕЙ
-- ============================================================
CREATE TABLE IF NOT EXISTS profiles (
  id         text PRIMARY KEY REFERENCES "user"(id) ON DELETE CASCADE,
  full_name  text,
  role       text NOT NULL DEFAULT 'manager'
               CHECK (role IN ('ceo', 'fin_director', 'manager', 'purchase_manager', 'marketer')),
  created_at timestamptz DEFAULT now(),
  telegram_chat_id bigint
);


-- ============================================================
-- 2. МАГАЗИНЫ
-- ============================================================
CREATE TABLE IF NOT EXISTS stores (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                text NOT NULL,
  wb_token            text,
  wb_analytics_token  text,
  owner_id            text REFERENCES "user"(id) ON DELETE CASCADE,
  created_at          timestamptz DEFAULT now(),
  updated_at          timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS user_stores (
  id       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id  text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  UNIQUE (user_id, store_id)
);

CREATE TABLE IF NOT EXISTS store_settings (
  id                  bigserial PRIMARY KEY,
  store_id            uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  supply_days         int NOT NULL DEFAULT 14,
  safety_stock_days   int NOT NULL DEFAULT 7,
  ad_budget_limit     numeric(12,2),
  target_drr_pct      numeric(5,2),
  control_window_days int NOT NULL DEFAULT 7,
  plan_orders_per_day  numeric(10,2),
  plan_revenue_per_day numeric(12,2),
  min_margin_pct      numeric(5,2),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE(store_id)
);


-- ============================================================
-- 3. ТОВАРЫ
-- ============================================================
CREATE TABLE IF NOT EXISTS product_groups (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id   uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  name       text NOT NULL,
  color      text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS products (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id     uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  nm_id        bigint NOT NULL,
  article      text,
  vendor_code  text,
  name         text,
  brand        text,
  title        text,
  subject_id   int,
  subject_name text,
  photo_url    text,
  color        text,
  imt_id       bigint,
  group_id     uuid REFERENCES product_groups(id) ON DELETE SET NULL,
  cost_price   numeric(12,2),
  strategy     text,
  avg_price_before_spp numeric(12,2),
  avg_price_after_spp  numeric(12,2),
  avg_orders_per_day   numeric(8,4),
  buyout_rate          numeric(6,2),
  current_stock        int NOT NULL DEFAULT 0,
  length_mm  int,
  width_mm   int,
  height_mm  int,
  weight_g   numeric(10,2),
  volume_liters numeric(10,6) GENERATED ALWAYS AS (
    CASE
      WHEN length_mm IS NOT NULL AND width_mm IS NOT NULL AND height_mm IS NOT NULL
      THEN ROUND((length_mm::numeric * width_mm::numeric * height_mm::numeric) / 1000000.0, 6)
      ELSE NULL
    END
  ) STORED,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (store_id, nm_id)
);

CREATE INDEX IF NOT EXISTS products_store_nm ON products(store_id, nm_id);


-- ============================================================
-- 4. ДАННЫЕ WB
-- ============================================================
CREATE TABLE IF NOT EXISTS wb_orders (
  id                  text PRIMARY KEY,
  store_id            uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  g_number            text,
  date                timestamptz,
  last_change_date    timestamptz,
  supplier_article    text,
  nm_id               bigint,
  barcode             text,
  category            text,
  subject             text,
  brand               text,
  techsize            text,
  income_id           bigint,
  is_supply           boolean,
  is_realization      boolean,
  total_price         numeric(12,2),
  discount_percent    numeric(5,2),
  spp                 int,
  finished_price      numeric(12,2),
  price_with_disc     numeric(12,2),
  is_cancel           boolean DEFAULT false,
  cancel_dt           timestamptz,
  order_type          text,
  srid                text,
  price_after_discount numeric(12,2),
  price_after_spp     numeric(12,2),
  oblast              text,
  created_at          timestamptz DEFAULT now(),
  UNIQUE (store_id, g_number, nm_id, barcode, date)
);

CREATE INDEX IF NOT EXISTS wb_orders_store_date   ON wb_orders(store_id, date DESC);
CREATE INDEX IF NOT EXISTS wb_orders_store_nm     ON wb_orders(store_id, nm_id);
CREATE INDEX IF NOT EXISTS wb_orders_store_cancel ON wb_orders(store_id, is_cancel);

CREATE TABLE IF NOT EXISTS wb_sales (
  id                  text PRIMARY KEY,
  store_id            uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  g_number            text,
  date                timestamptz,
  last_change_date    timestamptz,
  supplier_article    text,
  nm_id               bigint,
  barcode             text,
  category            text,
  subject             text,
  brand               text,
  techsize            text,
  income_id           bigint,
  is_supply           boolean,
  is_realization      boolean,
  total_price         numeric(12,2),
  discount_percent    int,
  spp                 int,
  payment_sale_amount numeric(12,2),
  for_pay             numeric(12,2),
  finished_price      numeric(12,2),
  price_with_disc     numeric(12,2),
  sale_id             text,
  order_type          text,
  created_at          timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS wb_sales_store_date ON wb_sales(store_id, date DESC);
CREATE INDEX IF NOT EXISTS wb_sales_store_nm   ON wb_sales(store_id, nm_id);

CREATE TABLE IF NOT EXISTS wb_stocks (
  id                       text PRIMARY KEY,
  store_id                 uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  date                     timestamptz,
  last_change_date         timestamptz,
  supplier_article         text,
  tech_size                text,
  barcode                  text,
  quantity                 int,
  is_supply                boolean,
  is_realization           boolean,
  quantity_full            int,
  quantity_not_in_orders   int,
  warehouse                text,
  nm_id                    bigint,
  subject                  text,
  category                 text,
  brand                    text,
  price                    numeric(12,2),
  discount                 int,
  created_at               timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS wb_stocks_store_nm ON wb_stocks(store_id, nm_id);

CREATE TABLE IF NOT EXISTS wb_incomes (
  id               bigserial PRIMARY KEY,
  store_id         uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  income_id        bigint,
  date             date,
  last_change_date timestamptz,
  supplier_article text,
  tech_size        text,
  barcode          text,
  quantity         int,
  total_price      numeric(12,2),
  date_close       date,
  warehouse_name   text,
  nm_id            bigint,
  status           text,
  created_at       timestamptz DEFAULT now()
);


-- ============================================================
-- 5. ФИНАНСОВЫЕ ОТЧЁТЫ WB
-- ============================================================
CREATE TABLE IF NOT EXISTS directory (
  id            bigserial PRIMARY KEY,
  doc_type_name text UNIQUE NOT NULL,
  multiplier    int NOT NULL CHECK (multiplier IN (-1, 0, 1)),
  description   text
);

INSERT INTO directory (doc_type_name, multiplier, description) VALUES
  ('Продажа',   1, 'Выручка от продажи товара'),
  ('Возврат',  -1, 'Возврат покупателем'),
  ('Сторно продаж',  -1, 'Сторно продажи'),
  ('Сторно возврата', 1, 'Сторно возврата'),
  ('Корректировка', 0, 'Прочие корректировки')
ON CONFLICT (doc_type_name) DO NOTHING;

CREATE TABLE IF NOT EXISTS wb_finance (
  id                      text PRIMARY KEY,
  store_id                uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  realizationreport_id    bigint,
  date_from               date,
  date_to                 date,
  create_dt               timestamptz,
  rrd_id                  bigint,
  gi_id                   bigint,
  subject_name            text,
  nm_id                   bigint,
  brand_name              text,
  sa_name                 text,
  ts_name                 text,
  barcode                 text,
  doc_type_name           text,
  quantity                int,
  retail_price            numeric(12,2),
  retail_amount           numeric(14,2),
  sale_percent            int,
  commission_percent      numeric(6,2),
  office_name             text,
  supplier_oper_name      text,
  order_dt                timestamptz,
  sale_dt                 timestamptz,
  retail_price_withdisc_rub numeric(12,2),
  delivery_amount         int,
  return_amount           int,
  delivery_rub            numeric(12,2),
  ppvz_for_pay            numeric(12,2),
  ppvz_sales_commission   numeric(12,2),
  penalty                 numeric(12,2),
  additional_payment      numeric(12,2),
  storage_fee             numeric(12,2),
  deduction               numeric(12,2),
  acceptance              numeric(12,2),
  created_at              timestamptz DEFAULT now(),
  UNIQUE (store_id, rrd_id)
);

CREATE INDEX IF NOT EXISTS wb_finance_store_dates ON wb_finance(store_id, date_from, date_to);
CREATE INDEX IF NOT EXISTS wb_finance_store_nm    ON wb_finance(store_id, nm_id);


-- ============================================================
-- 6. ЕЖЕНЕДЕЛЬНЫЕ ФИНАНСОВЫЕ ОТЧЁТЫ WB
-- ============================================================
CREATE TABLE IF NOT EXISTS wb_weekly_reports (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id         uuid NOT NULL REFERENCES stores(id),
  report_number    bigint NOT NULL,
  legal_entity     text,
  date_from        date,
  date_to          date,
  date_created     date,
  report_type      text,
  sale             numeric(15,2),
  loyalty_compensation numeric(15,2),
  for_pay          numeric(15,2),
  agreed_discount_pct numeric(8,4),
  logistics_cost   numeric(15,2),
  storage_cost     numeric(15,2),
  acceptance_cost  numeric(15,2),
  other_deductions numeric(15,2),
  total_fines      numeric(15,2),
  wb_commission_correction numeric(15,2),
  loyalty_program_cost     numeric(15,2),
  loyalty_points_deducted  numeric(15,2),
  one_time_payment_change  numeric(15,2),
  total_to_pay     numeric(15,2),
  currency         text,
  has_detail_rows  boolean DEFAULT false,
  reconciled       boolean DEFAULT false,
  reconciled_at    timestamptz,
  reconcile_result jsonb,
  created_at       timestamptz DEFAULT now(),
  UNIQUE (store_id, report_number)
);

CREATE TABLE IF NOT EXISTS wb_weekly_report_rows (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id        uuid NOT NULL REFERENCES stores(id),
  report_number   bigint NOT NULL,
  row_number      int,
  supply_number   text,
  subject         text,
  nm_id           bigint,
  brand           text,
  supplier_article text,
  title           text,
  techsize        text,
  barcode         text,
  doc_type        text,
  payment_reason  text,
  order_date      date,
  sale_date       date,
  quantity        int,
  retail_price    numeric(15,2),
  wb_sale_amount  numeric(15,2),
  agreed_product_discount_pct     numeric(8,4),
  promo_code_pct                  numeric(8,4),
  total_agreed_discount_pct       numeric(8,4),
  retail_price_with_discount      numeric(15,2),
  kvv_rating_reduction_pct        numeric(8,4),
  kvv_promo_change_pct            numeric(8,4),
  platform_discounts_pct          numeric(8,4),
  kvv_pct                         numeric(8,4),
  kvv_base_excl_vat_pct           numeric(8,4),
  kvv_final_excl_vat_pct          numeric(8,4),
  commission_before_agent_excl_vat numeric(15,6),
  pvz_compensation                numeric(15,6),
  payment_service_compensation    numeric(15,6),
  payment_service_compensation_pct numeric(8,4),
  payment_service_type            text,
  wb_commission_excl_vat          numeric(15,6),
  wb_commission_vat               numeric(15,6),
  for_pay_seller                  numeric(15,6),
  deliveries_count    int,
  returns_count       int,
  delivery_service_cost numeric(15,6),
  fix_start_date      date,
  fix_end_date        date,
  paid_delivery_flag  text,
  total_fines         numeric(15,6),
  wb_commission_correction numeric(15,6),
  logistics_fines_types   text,
  sticker             text,
  acquirer_bank       text,
  office_number       text,
  office_name         text,
  partner_inn         text,
  partner             text,
  warehouse           text,
  country             text,
  box_type            text,
  customs_declaration_number text,
  assembly_task_number       text,
  marking_code        text,
  barcode_sticker     text,
  srid                text,
  transport_compensation  numeric(15,6),
  transport_organizer     text,
  row_storage_cost        numeric(15,6),
  deductions              numeric(15,6),
  acceptance_operations   numeric(15,6),
  chrt_id                 bigint,
  fixed_warehouse_coef    numeric(15,6),
  legal_entity_sale_flag  text,
  tmc                     text,
  box_number              text,
  cofinancing_discount    numeric(15,6),
  wibes_discount_pct      numeric(8,4),
  loyalty_discount_compensation numeric(15,6),
  loyalty_program_cost    numeric(15,6),
  loyalty_points_deducted numeric(15,6),
  basket_id               text,
  one_time_payment_change numeric(15,6),
  sale_method_type        text,
  seller_promo_id         text,
  seller_promo_discount_pct numeric(8,4),
  seller_loyalty_discount_id text,
  seller_loyalty_discount_pct numeric(8,4),
  promo_code_id           text,
  promo_code_discount_pct numeric(8,4),
  substitution_article_id text,
  substitution_article_discount_pct numeric(8,4),
  wholesale_discount_pct  numeric(8,4),
  created_at              timestamptz DEFAULT now(),
  UNIQUE (store_id, report_number, row_number)
);

CREATE INDEX IF NOT EXISTS wb_weekly_report_rows_store ON wb_weekly_report_rows(store_id, report_number);
CREATE INDEX IF NOT EXISTS wb_weekly_report_rows_nm    ON wb_weekly_report_rows(store_id, nm_id);


-- ============================================================
-- 7. РЕКЛАМА
-- ============================================================
CREATE TABLE IF NOT EXISTS wb_ad_spend (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id      uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  date          date NOT NULL,
  campaign_id   bigint,
  campaign_name text,
  spend         numeric(12,2),
  views         int,
  clicks        int,
  orders_count  int,
  orders_sum    numeric(14,2),
  created_at    timestamptz DEFAULT now(),
  UNIQUE (store_id, date, campaign_id)
);

CREATE INDEX IF NOT EXISTS wb_ad_spend_store_date ON wb_ad_spend(store_id, date DESC);


-- ============================================================
-- 8. ВОРОНКА ПРОДАЖ
-- ============================================================
CREATE TABLE IF NOT EXISTS wb_funnel (
  id                      bigserial PRIMARY KEY,
  store_id                uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  nm_id                   bigint NOT NULL,
  date                    date NOT NULL,
  open_count              int,
  cart_count              int,
  order_count             int,
  order_sum               numeric(14,2),
  buyout_count            int,
  buyout_sum              numeric(14,2),
  buyout_percent          numeric(6,2),
  add_to_cart_conversion  numeric(6,2),
  cart_to_order_conversion numeric(6,2),
  add_to_wishlist_count   int,
  created_at              timestamptz DEFAULT now(),
  UNIQUE (store_id, nm_id, date)
);

CREATE INDEX IF NOT EXISTS wb_funnel_store_date ON wb_funnel(store_id, date DESC);
CREATE INDEX IF NOT EXISTS wb_funnel_store_nm   ON wb_funnel(store_id, nm_id);


-- ============================================================
-- 9. ХРАНЕНИЕ
-- ============================================================
CREATE TABLE IF NOT EXISTS wb_storage_daily (
  id           bigserial PRIMARY KEY,
  store_id     uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  date         date NOT NULL,
  nm_id        bigint NOT NULL,
  vendor_code  text,
  barcode      text,
  subject      text,
  brand        text,
  warehouse    text,
  volume       numeric(12,4),
  cost         numeric(12,2),
  calc_type    text,
  barcodes_count int,
  cost_per_unit  numeric(12,6),
  created_at   timestamptz DEFAULT now(),
  UNIQUE (store_id, date, nm_id, warehouse, barcode)
);

CREATE INDEX IF NOT EXISTS wb_storage_daily_store_date ON wb_storage_daily(store_id, date DESC);
CREATE INDEX IF NOT EXISTS wb_storage_daily_nm         ON wb_storage_daily(store_id, nm_id, date DESC);


-- ============================================================
-- 10. ТАРИФЫ И КОМИССИИ WB
-- ============================================================
CREATE TABLE IF NOT EXISTS wb_commissions (
  id               bigserial PRIMARY KEY,
  store_id         uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  subject_id       int NOT NULL,
  subject_name     text,
  parent_id        int,
  parent_name      text,
  kgvp_supplier    numeric(6,2),
  kgvp_marketplace numeric(6,2),
  kgvp_pickup      numeric(6,2),
  kgvp_booking     numeric(6,2),
  paid_storage_kgvp numeric(6,2),
  loaded_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE(store_id, subject_id)
);

CREATE TABLE IF NOT EXISTS wb_tariffs (
  id                  bigserial PRIMARY KEY,
  store_id            uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  tariff_type         text NOT NULL,
  warehouse_name      text NOT NULL,
  geo_name            text,
  delivery_base       numeric(10,2),
  delivery_liter      numeric(10,2),
  delivery_coef_expr  numeric(10,2),
  storage_base        numeric(10,4),
  storage_liter       numeric(10,4),
  storage_coef_expr   numeric(10,2),
  return_office_base  numeric(10,2),
  return_office_liter numeric(10,2),
  return_courier_base numeric(10,2),
  return_courier_liter numeric(10,2),
  dt_next_change      date,
  dt_till_max         date,
  loaded_at           timestamptz NOT NULL DEFAULT now(),
  UNIQUE(store_id, tariff_type, warehouse_name)
);

CREATE TABLE IF NOT EXISTS wb_tariffs_history (
  id                  bigserial PRIMARY KEY,
  store_id            uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  snapshot_date       date NOT NULL,
  tariff_type         text NOT NULL,
  warehouse_name      text NOT NULL,
  geo_name            text,
  delivery_base       numeric(10,2),
  delivery_liter      numeric(10,2),
  delivery_coef_expr  numeric(10,2),
  storage_base        numeric(10,4),
  storage_liter       numeric(10,4),
  storage_coef_expr   numeric(10,2),
  return_office_base  numeric(10,2),
  return_office_liter numeric(10,2),
  return_courier_base numeric(10,2),
  return_courier_liter numeric(10,2),
  dt_next_change      date,
  dt_till_max         date,
  loaded_at           timestamptz NOT NULL DEFAULT now(),
  UNIQUE(store_id, snapshot_date, tariff_type, warehouse_name)
);

CREATE TABLE IF NOT EXISTS wb_logistics_indexes (
  id                bigserial PRIMARY KEY,
  store_id          uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  week_date         date NOT NULL,
  irp               numeric(8,4),
  localization_index numeric(8,4),
  created_at        timestamptz DEFAULT now(),
  updated_at        timestamptz DEFAULT now(),
  UNIQUE (store_id, week_date)
);

-- Детализация расходов по рекламе
CREATE TABLE IF NOT EXISTS wb_ad_spend_nm (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id      uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  date          date NOT NULL,
  campaign_id   bigint,
  nm_id         bigint,
  spend         numeric(12,2),
  views         int,
  clicks        int,
  orders_count  int,
  orders_sum    numeric(14,2),
  created_at    timestamptz DEFAULT now(),
  UNIQUE (store_id, date, campaign_id, nm_id)
);

CREATE INDEX IF NOT EXISTS wb_ad_spend_nm_store_date ON wb_ad_spend_nm(store_id, date DESC);
CREATE INDEX IF NOT EXISTS wb_ad_spend_nm_store_nm   ON wb_ad_spend_nm(store_id, nm_id, date DESC);


-- ============================================================
-- 11. РУЧНЫЕ ДАННЫЕ
-- ============================================================
CREATE TABLE IF NOT EXISTS manual_costs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id    uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  date        date NOT NULL,
  category    text NOT NULL CHECK (category IN ('salary','rent','tax','loan','other')),
  description text,
  amount      numeric(12,2) NOT NULL,
  created_by  text REFERENCES "user"(id),
  created_at  timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS manual_costs_store_date ON manual_costs(store_id, date DESC);

CREATE TABLE IF NOT EXISTS credit_schedule (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id      uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  credit_name   text NOT NULL,
  payment_date  date NOT NULL,
  principal     numeric(14,2),
  interest      numeric(14,2),
  total_payment numeric(14,2),
  is_paid       boolean DEFAULT false,
  created_at    timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS wb_sales_plan (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id        uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  week_label      text NOT NULL,
  week_number     int NOT NULL,
  year            int NOT NULL,
  supplier_article text,
  nm_id           bigint,
  orders_per_week int NOT NULL DEFAULT 0,
  orders_per_day  int NOT NULL DEFAULT 0,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now(),
  UNIQUE (store_id, week_label, nm_id)
);

CREATE INDEX IF NOT EXISTS idx_wb_sales_plan_store_week ON wb_sales_plan(store_id, year, week_number);

CREATE TABLE IF NOT EXISTS sku_matrix_notes (
  id          bigserial PRIMARY KEY,
  store_id    uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  nm_id       bigint NOT NULL,
  date        date NOT NULL,
  action_log  text,
  plan_orders int,
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now(),
  UNIQUE (store_id, nm_id, date)
);

CREATE INDEX IF NOT EXISTS sku_matrix_notes_nm ON sku_matrix_notes(store_id, nm_id, date DESC);


-- ============================================================
-- 12. ЗАДАЧИ И НАСТРОЙКИ ПОЛЬЗОВАТЕЛЯ
-- ============================================================
CREATE TABLE IF NOT EXISTS tasks (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id     uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  nm_id        bigint,
  title        text NOT NULL,
  description  text,
  status       text NOT NULL DEFAULT 'todo' CHECK (status IN ('todo','in_progress','done')),
  priority     text NOT NULL DEFAULT 'medium' CHECK (priority IN ('low','medium','high')),
  assigned_to  text REFERENCES "user"(id),
  created_by   text REFERENCES "user"(id),
  due_date     date,
  is_auto      boolean DEFAULT false,
  trigger_type text,
  created_at   timestamptz DEFAULT now(),
  updated_at   timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS tasks_store_status ON tasks(store_id, status);

CREATE TABLE IF NOT EXISTS user_column_settings (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  page       text NOT NULL,
  columns    jsonb NOT NULL DEFAULT '[]',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (user_id, page)
);


-- ============================================================
-- 13. СЛУЖЕБНЫЕ ТАБЛИЦЫ
-- ============================================================
CREATE TABLE IF NOT EXISTS sync_log (
  id          bigserial PRIMARY KEY,
  store_id    uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  method      text NOT NULL,
  date_from   date,
  date_to     date,
  rows_count  int,
  status      text NOT NULL CHECK (status IN ('ok','error','running')),
  error       text,
  duration_ms int,
  created_at  timestamptz DEFAULT now(),
  finished_at timestamptz
);

CREATE INDEX IF NOT EXISTS sync_log_store_created ON sync_log(store_id, created_at DESC);
