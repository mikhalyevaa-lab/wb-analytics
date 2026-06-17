-- ============================================================
-- WB Analytics — Schema
-- Создай новый запрос в Supabase SQL Editor и запусти этот файл
-- ============================================================

-- Расширение для генерации UUID (уникальных идентификаторов)
create extension if not exists "uuid-ossp";


-- ============================================================
-- ПРОФИЛИ ПОЛЬЗОВАТЕЛЕЙ
-- Расширяет стандартную таблицу авторизации Supabase (auth.users)
-- ============================================================
create table profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  full_name  text,
  role       text not null default 'manager'
               check (role in ('ceo', 'fin_director', 'manager', 'purchase_manager', 'marketer')),
  created_at timestamptz default now()
);

-- Автоматически создаём профиль при регистрации нового пользователя
create or replace function handle_new_user()
returns trigger as $$
begin
  insert into profiles (id, full_name)
  values (new.id, new.raw_user_meta_data->>'full_name');
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure handle_new_user();


-- ============================================================
-- МАГАЗИНЫ
-- ============================================================
create table stores (
  id         uuid primary key default uuid_generate_v4(),
  name       text not null,
  wb_token   text not null,               -- API-ключ от личного кабинета WB
  owner_id   uuid references auth.users(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);


-- ============================================================
-- СВЯЗЬ ПОЛЬЗОВАТЕЛЬ ↔ МАГАЗИН
-- Определяет кто к какому магазину имеет доступ
-- ============================================================
create table user_stores (
  id       uuid primary key default uuid_generate_v4(),
  user_id  uuid not null references auth.users(id) on delete cascade,
  store_id uuid not null references stores(id) on delete cascade,
  unique (user_id, store_id)
);


-- ============================================================
-- ТОВАРЫ
-- ============================================================
create table products (
  id            uuid primary key default uuid_generate_v4(),
  store_id      uuid not null references stores(id) on delete cascade,
  nm_id         bigint not null,           -- Артикул WB (nmId)
  article       text,                      -- Артикул поставщика
  name          text,
  cost_price    numeric(12,2) default 0,   -- Себестоимость (вводится вручную)
  created_at    timestamptz default now(),
  updated_at    timestamptz default now(),
  unique (store_id, nm_id)
);


-- ============================================================
-- ЗАКАЗЫ (из WB API /api/v1/supplier/orders)
-- ============================================================
create table wb_orders (
  id                  uuid primary key default uuid_generate_v4(),
  store_id            uuid not null references stores(id) on delete cascade,
  g_number            text,               -- Номер группы заказов
  date                timestamptz,        -- Дата заказа
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
  total_price         numeric(12,2),      -- Цена до скидок
  discount_percent    int,
  spp                 int,                -- Скидка СПП
  finished_price      numeric(12,2),      -- Итоговая цена для покупателя
  price_with_disc     numeric(12,2),
  is_cancel           boolean default false,
  cancel_dt           timestamptz,
  order_type          text,
  created_at          timestamptz default now()
);

create index idx_wb_orders_store_date on wb_orders(store_id, date desc);
create index idx_wb_orders_nm_id on wb_orders(nm_id);


-- ============================================================
-- ПРОДАЖИ / ВЫКУПЫ (из WB API /api/v1/supplier/sales)
-- ============================================================
create table wb_sales (
  id                      uuid primary key default uuid_generate_v4(),
  store_id                uuid not null references stores(id) on delete cascade,
  g_number                text,
  date                    timestamptz,
  last_change_date        timestamptz,
  supplier_article        text,
  nm_id                   bigint,
  barcode                 text,
  category                text,
  subject                 text,
  brand                   text,
  techsize                text,
  income_id               bigint,
  is_supply               boolean,
  is_realization          boolean,
  total_price             numeric(12,2),
  discount_percent        int,
  spp                     int,
  payment_sale_amount     numeric(12,2),
  for_pay                 numeric(12,2),  -- К перечислению поставщику
  finished_price          numeric(12,2),
  price_with_disc         numeric(12,2),
  sale_id                 text unique,    -- Уникальный ID продажи от WB
  order_type              text,
  created_at              timestamptz default now()
);

create index idx_wb_sales_store_date on wb_sales(store_id, date desc);
create index idx_wb_sales_nm_id on wb_sales(nm_id);


-- ============================================================
-- ОСТАТКИ НА СКЛАДАХ (из WB API /api/v1/supplier/stocks)
-- ============================================================
create table wb_stocks (
  id                        uuid primary key default uuid_generate_v4(),
  store_id                  uuid not null references stores(id) on delete cascade,
  date                      date not null,
  last_change_date          timestamptz,
  supplier_article          text,
  tech_size                 text,
  barcode                   text,
  quantity                  int default 0,
  is_supply                 boolean,
  is_realization            boolean,
  quantity_full             int default 0,
  quantity_not_in_orders    int default 0,
  warehouse                 text,
  nm_id                     bigint,
  subject                   text,
  category                  text,
  brand                     text,
  price                     numeric(12,2),
  discount                  int,
  created_at                timestamptz default now()
);

create index idx_wb_stocks_store_date on wb_stocks(store_id, date desc);
create index idx_wb_stocks_nm_id on wb_stocks(nm_id);


-- ============================================================
-- ФИНАНСОВЫЙ ОТЧЁТ WB (из /api/v5/supplier/reportDetailByPeriod)
-- Комиссии, логистика, штрафы, выплаты
-- ============================================================
create table wb_finance (
  id                          uuid primary key default uuid_generate_v4(),
  store_id                    uuid not null references stores(id) on delete cascade,
  realizationreport_id        bigint,
  date_from                   date,
  date_to                     date,
  create_dt                   timestamptz,
  rrd_id                      bigint,
  gi_id                       bigint,
  subject_name                text,
  nm_id                       bigint,
  brand_name                  text,
  sa_name                     text,               -- Артикул поставщика
  ts_name                     text,               -- Размер
  barcode                     text,
  doc_type_name               text,               -- Тип документа
  quantity                    int,
  retail_price                numeric(12,2),
  retail_amount               numeric(12,2),
  sale_percent                int,
  commission_percent          numeric(6,2),
  office_name                 text,               -- Склад WB
  supplier_oper_name          text,               -- Обоснование операции
  order_dt                    timestamptz,
  sale_dt                     timestamptz,
  retail_price_withdisc_rub   numeric(12,2),
  delivery_amount             int,
  return_amount               int,
  delivery_rub                numeric(12,2),      -- Стоимость логистики
  ppvz_for_pay                numeric(12,2),      -- К перечислению поставщику
  ppvz_sales_commission       numeric(12,2),      -- Комиссия WB
  penalty                     numeric(12,2),      -- Штрафы
  additional_payment          numeric(12,2),      -- Доплаты
  storage_fee                 numeric(12,2),      -- Хранение
  deduction                   numeric(12,2),      -- Удержания
  acceptance                  numeric(12,2),      -- Приёмка
  created_at                  timestamptz default now()
);

create index idx_wb_finance_store_period on wb_finance(store_id, date_from, date_to);
create index idx_wb_finance_nm_id on wb_finance(nm_id);


-- ============================================================
-- РАСХОДЫ НА РЕКЛАМУ WB (из Advertising API)
-- ============================================================
create table wb_ad_spend (
  id              uuid primary key default uuid_generate_v4(),
  store_id        uuid not null references stores(id) on delete cascade,
  date            date not null,
  campaign_id     bigint,
  campaign_name   text,
  spend           numeric(12,2) default 0,
  views           bigint default 0,
  clicks          bigint default 0,
  orders_count    int default 0,
  orders_sum      numeric(12,2) default 0,
  created_at      timestamptz default now()
);

create index idx_wb_ad_spend_store_date on wb_ad_spend(store_id, date desc);


-- ============================================================
-- РУЧНЫЕ ЗАТРАТЫ (ФОТ, аренда, налоги, кредиты)
-- ============================================================
create table manual_costs (
  id          uuid primary key default uuid_generate_v4(),
  store_id    uuid not null references stores(id) on delete cascade,
  date        date not null,
  category    text not null
                check (category in ('salary', 'rent', 'tax', 'loan', 'other')),
  description text,
  amount      numeric(12,2) not null,
  created_by  uuid references auth.users(id),
  created_at  timestamptz default now()
);

create index idx_manual_costs_store_date on manual_costs(store_id, date desc);


-- ============================================================
-- ГРАФИК ПЛАТЕЖЕЙ ПО КРЕДИТАМ
-- ============================================================
create table credit_schedule (
  id              uuid primary key default uuid_generate_v4(),
  store_id        uuid not null references stores(id) on delete cascade,
  credit_name     text not null,
  payment_date    date not null,
  principal       numeric(12,2) default 0,   -- Тело кредита
  interest        numeric(12,2) default 0,   -- Проценты
  total_payment   numeric(12,2) not null,
  is_paid         boolean default false,
  created_at      timestamptz default now()
);

create index idx_credit_schedule_store_date on credit_schedule(store_id, payment_date);


-- ============================================================
-- ЗАДАЧИ КОМАНДЫ (авто + ручные)
-- ============================================================
create table tasks (
  id            uuid primary key default uuid_generate_v4(),
  store_id      uuid references stores(id) on delete cascade,
  title         text not null,
  description   text,
  status        text not null default 'new'
                  check (status in ('new', 'in_progress', 'done')),
  priority      text default 'medium'
                  check (priority in ('low', 'medium', 'high')),
  assigned_to   uuid references auth.users(id),
  created_by    uuid references auth.users(id),
  due_date      date,
  is_auto       boolean default false,       -- true = создана триггером
  trigger_type  text,                        -- 'low_stock', 'buyout_drop' и т.д.
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

create index idx_tasks_store_status on tasks(store_id, status);
create index idx_tasks_assigned_to on tasks(assigned_to);


-- ============================================================
-- ROW LEVEL SECURITY (RLS)
-- Каждый пользователь видит только свои магазины
-- ============================================================

alter table stores         enable row level security;
alter table user_stores    enable row level security;
alter table products       enable row level security;
alter table wb_orders      enable row level security;
alter table wb_sales       enable row level security;
alter table wb_stocks      enable row level security;
alter table wb_finance     enable row level security;
alter table wb_ad_spend    enable row level security;
alter table manual_costs   enable row level security;
alter table credit_schedule enable row level security;
alter table tasks          enable row level security;
alter table profiles       enable row level security;

-- Вспомогательная функция: список магазинов текущего пользователя
create or replace function my_store_ids()
returns setof uuid as $$
  select store_id from user_stores where user_id = auth.uid()
$$ language sql security definer stable;

-- Profiles: пользователь видит только свой профиль
create policy "profiles: own" on profiles
  for all using (id = auth.uid());

-- Stores: пользователь видит только свои магазины
create policy "stores: own" on stores
  for all using (id in (select my_store_ids()));

-- User_stores: пользователь видит только свои строки
create policy "user_stores: own" on user_stores
  for all using (user_id = auth.uid());

-- Все таблицы с данными: доступ только к своим магазинам
create policy "products: own stores" on products
  for all using (store_id in (select my_store_ids()));

create policy "wb_orders: own stores" on wb_orders
  for all using (store_id in (select my_store_ids()));

create policy "wb_sales: own stores" on wb_sales
  for all using (store_id in (select my_store_ids()));

create policy "wb_stocks: own stores" on wb_stocks
  for all using (store_id in (select my_store_ids()));

create policy "wb_finance: own stores" on wb_finance
  for all using (store_id in (select my_store_ids()));

create policy "wb_ad_spend: own stores" on wb_ad_spend
  for all using (store_id in (select my_store_ids()));

create policy "manual_costs: own stores" on manual_costs
  for all using (store_id in (select my_store_ids()));

create policy "credit_schedule: own stores" on credit_schedule
  for all using (store_id in (select my_store_ids()));

create policy "tasks: own stores" on tasks
  for all using (store_id in (select my_store_ids()));


-- ============================================================
-- ГОТОВО
-- После запуска вы увидите: "Success. No rows returned"
-- Это нормально — таблицы созданы, данных пока нет
-- ============================================================
