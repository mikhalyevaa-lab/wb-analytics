ALTER TABLE wb_storage_daily
  ADD COLUMN IF NOT EXISTS barcodes_count integer,
  ADD COLUMN IF NOT EXISTS cost_per_unit numeric(12,6);

COMMENT ON COLUMN wb_storage_daily.barcodes_count IS 'Количество единиц товара (barcodesCount из WB API)';
COMMENT ON COLUMN wb_storage_daily.cost_per_unit IS 'Стоимость за 1 единицу/день (warehousePrice из WB API)';
COMMENT ON COLUMN wb_storage_daily.cost IS 'Итоговая стоимость хранения = warehousePrice × barcodesCount';
