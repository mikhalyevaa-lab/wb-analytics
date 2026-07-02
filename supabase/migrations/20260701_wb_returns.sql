-- Таблица «Согласованные заявки возвратов» из ЛК WB
-- Источник: GET /api/v1/supplier/returns (statistics-api.wildberries.ru)
-- Покупатель инициировал возврат → WB согласовал → запись появляется здесь.
-- Сравниваем с wb_sales (for_pay < 0) — «финансовые возвраты».

CREATE TABLE IF NOT EXISTS wb_lk_returns (
  id               bigserial PRIMARY KEY,
  store_id         uuid    NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  date             timestamptz,
  last_change_date timestamptz,
  supplier_article text,
  nm_id            bigint,
  barcode          text,
  category         text,
  subject          text,
  techsize         text,
  total_price      numeric(12,2),
  return_status    text,           -- статус заявки: waiting_for_client, received_from_client, …
  warehouse_name   text,
  g_number         text,
  srid             text,           -- уникальный ID из WB API (совпадает с sale srid)
  created_at       timestamptz DEFAULT now(),
  UNIQUE (store_id, srid)
);

CREATE INDEX IF NOT EXISTS wb_lk_returns_store_date  ON wb_lk_returns (store_id, date DESC);
CREATE INDEX IF NOT EXISTS wb_lk_returns_store_nm    ON wb_lk_returns (store_id, nm_id);
