-- Исторические тарифы WB — загружаются вручную из Excel-файлов WB
-- effective_date берётся из имени файла: "warehouse coefficients 2026-06-30.xlsx"
CREATE TABLE IF NOT EXISTS wb_tariffs_history (
  id              BIGSERIAL PRIMARY KEY,
  effective_date  DATE        NOT NULL,
  warehouse_name  TEXT        NOT NULL,
  tariff_type     TEXT        NOT NULL DEFAULT 'box',
  delivery_coef   NUMERIC(10,2),   -- коэффициент логистики, %
  delivery_base   NUMERIC(10,2),   -- стоимость 1-го литра
  delivery_liter  NUMERIC(10,2),   -- доп. литр
  storage_coef    NUMERIC(10,2),   -- коэффициент хранения, %
  storage_base    NUMERIC(10,4),   -- хранение за 1 л
  storage_liter   NUMERIC(10,4),
  uploaded_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (effective_date, warehouse_name, tariff_type)
);

-- Трекинг загрузок — одна запись на файл
CREATE TABLE IF NOT EXISTS wb_tariffs_uploads (
  id             BIGSERIAL PRIMARY KEY,
  effective_date DATE        NOT NULL UNIQUE,
  filename       TEXT        NOT NULL,
  rows_count     INTEGER     NOT NULL DEFAULT 0,
  uploaded_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wb_tariffs_history_date ON wb_tariffs_history (effective_date);
CREATE INDEX IF NOT EXISTS idx_wb_tariffs_history_wh   ON wb_tariffs_history (warehouse_name);
