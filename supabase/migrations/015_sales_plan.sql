create table wb_sales_plan (
  id              uuid primary key default uuid_generate_v4(),
  store_id        uuid not null references stores(id) on delete cascade,
  week_label      text not null,
  week_number     int  not null,
  year            int  not null,
  supplier_article text,
  nm_id           bigint,
  orders_per_week int  not null default 0,
  orders_per_day  int  not null default 0,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now(),
  unique (store_id, week_label, nm_id)
);

create index idx_wb_sales_plan_store_week on wb_sales_plan(store_id, year, week_number);
