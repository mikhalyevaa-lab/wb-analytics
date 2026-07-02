-- Меняем уникальный ключ wb_supplies с preorder_id на supply_id.
-- У старых FBO-поставок preorder_id=0, поэтому (store_id, preorder_id)
-- не уникально. supply_id всегда уникален.

ALTER TABLE wb_supplies
  DROP CONSTRAINT IF EXISTS wb_supplies_store_id_preorder_id_key;

ALTER TABLE wb_supplies
  ADD CONSTRAINT wb_supplies_store_id_supply_id_key
  UNIQUE (store_id, supply_id);
