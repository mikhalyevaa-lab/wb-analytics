-- Add columns for full order tracking from file import
ALTER TABLE wb_orders
  ADD COLUMN IF NOT EXISTS srid text,
  ADD COLUMN IF NOT EXISTS price_after_discount numeric,  -- totalPrice * (1 - discountPercent/100), до СПП
  ADD COLUMN IF NOT EXISTS price_after_spp numeric,       -- Цена заказа из файла, после СПП (фактическая цена покупателя)
  ADD COLUMN IF NOT EXISTS oblast text;

-- Index for srid lookups
CREATE INDEX IF NOT EXISTS wb_orders_srid_idx ON wb_orders(store_id, srid);
