-- Заменяем уникальный ключ: srid не уникален в пределах отчёта
-- (один srid = несколько строк: Продажа + Логистика + Возмещение и т.д.)
-- Правильный ключ: row_number — порядковый номер строки из файла WB

ALTER TABLE wb_weekly_report_rows
  DROP CONSTRAINT IF EXISTS wb_weekly_report_rows_store_id_report_number_srid_key;

ALTER TABLE wb_weekly_report_rows
  ADD CONSTRAINT wb_weekly_report_rows_store_report_rownum_unique
  UNIQUE (store_id, report_number, row_number);
