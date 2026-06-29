-- Добавляем источник детализации: 'weekly' (еженедельный) или 'daily' (ежедневный)
ALTER TABLE wb_weekly_report_rows
  ADD COLUMN IF NOT EXISTS report_source VARCHAR(10) NOT NULL DEFAULT 'weekly';

-- Индекс для быстрой фильтрации по источнику + периоду
CREATE INDEX IF NOT EXISTS idx_wb_weekly_report_rows_source
  ON wb_weekly_report_rows (store_id, report_source, report_number);
