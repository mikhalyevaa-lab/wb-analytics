-- Расширяем wb_finance полями из нового WB API POST /v1/sales/reports/list

ALTER TABLE wb_finance
  ADD COLUMN IF NOT EXISTS srid               text,
  ADD COLUMN IF NOT EXISTS ppvz_office_id     bigint,
  ADD COLUMN IF NOT EXISTS ppvz_office_name   text,
  ADD COLUMN IF NOT EXISTS ppvz_supplier_id   bigint,
  ADD COLUMN IF NOT EXISTS ppvz_supplier_name text,
  ADD COLUMN IF NOT EXISTS ppvz_inn           text,
  ADD COLUMN IF NOT EXISTS declaration_number text,
  ADD COLUMN IF NOT EXISTS sticker_id         text,
  ADD COLUMN IF NOT EXISTS site_country       text,
  ADD COLUMN IF NOT EXISTS kiz                text;

-- Индексы для фильтрации по фронту
CREATE INDEX IF NOT EXISTS wb_finance_srid    ON wb_finance (store_id, srid);
CREATE INDEX IF NOT EXISTS wb_finance_barcode ON wb_finance (store_id, barcode);
CREATE INDEX IF NOT EXISTS wb_finance_report  ON wb_finance (store_id, realizationreport_id);
