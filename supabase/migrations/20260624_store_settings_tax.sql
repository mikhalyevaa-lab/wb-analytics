-- Налог УСН и НДС для параметров магазина
ALTER TABLE store_settings
  ADD COLUMN IF NOT EXISTS usn_tax_pct  numeric(5,2),
  ADD COLUMN IF NOT EXISTS vat_pct      numeric(5,2);
