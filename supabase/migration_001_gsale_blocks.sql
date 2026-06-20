-- Migration 001: gsale blocks — directory + wb_incomes

-- ============================================================
-- 1. directory — маппинг doc_type_name → multiplier для P&L
-- ============================================================

create table if not exists directory (
  id             bigserial primary key,
  doc_type_name  text not null unique,
  multiplier     smallint not null check (multiplier in (-1, 0, 1)),
  description    text
);

-- Заполняем справочник типов операций WB
insert into directory (doc_type_name, multiplier, description) values
  ('Продажа',                        1,  'Выкуп — плюс к выручке'),
  ('Возврат',                       -1,  'Возврат — минус к выручке'),
  ('Корректная продажа',             1,  'Корректировка продажи'),
  ('Корректный возврат',            -1,  'Корректировка возврата'),
  ('Доплата за возврат брака',       0,  'Нейтрально'),
  ('Штраф',                         -1,  'Штрафы WB'),
  ('Возмещение ущерба',              1,  'Компенсация от WB'),
  ('Компенсация подмены товара',     1,  'Компенсация'),
  ('Доплата за доставку',           -1,  'Логистика'),
  ('Удержание за доставку',         -1,  'Логистика'),
  ('Оплата брака',                   0,  'Брак'),
  ('Прочее',                         0,  'Прочие операции')
on conflict (doc_type_name) do nothing;

-- RLS
alter table directory enable row level security;
create policy "authenticated read directory"
  on directory for select to authenticated using (true);

-- ============================================================
-- 2. wb_incomes — поставки на склады WB
-- ============================================================

create table if not exists wb_incomes (
  id                bigserial primary key,
  store_id          uuid not null references stores(id) on delete cascade,
  income_id         bigint not null,
  date              timestamptz,
  last_change_date  timestamptz,
  supplier_article  text,
  tech_size         text,
  barcode           text,
  quantity          int,
  total_price       numeric(12,2),
  date_close        timestamptz,
  warehouse_name    text,
  nm_id             bigint,
  status            text,
  created_at        timestamptz default now()
);

create unique index if not exists wb_incomes_store_income_idx
  on wb_incomes (store_id, income_id);

create index if not exists wb_incomes_store_date_idx
  on wb_incomes (store_id, date);

-- RLS
alter table wb_incomes enable row level security;
create policy "users see own store incomes"
  on wb_incomes for select to authenticated
  using (store_id in (select store_id from user_stores where user_id = auth.uid()));
