-- Migration 001: добавить уникальный индекс для wb_finance
-- Нужен для корректной работы upsert в sync.ts
-- Запусти в Supabase → SQL Editor, если schema.sql уже был применён ранее

alter table wb_finance
  add constraint wb_finance_store_rrd_unique unique (store_id, rrd_id);
