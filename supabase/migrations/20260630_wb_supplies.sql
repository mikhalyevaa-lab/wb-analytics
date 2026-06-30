-- Поставки FBW (supplies-api.wildberries.ru)
-- Замена устаревшей wb_incomes: WB удалил /api/v1/supplier/incomes
-- Новый API: POST /api/v1/supplies + GET /api/v1/supplies/{id}/goods

CREATE TABLE IF NOT EXISTS wb_supplies (
  id          BIGSERIAL PRIMARY KEY,
  store_id    TEXT      NOT NULL,
  preorder_id BIGINT    NOT NULL,   -- всегда присутствует
  supply_id   BIGINT,               -- null пока статус = 1 (не запланировано)
  status_id   INT       NOT NULL,   -- 1=не запланировано 2=запланировано 3=отгрузка разрешена 4=идёт приёмка 5=принято 6=отгружено
  create_date TIMESTAMPTZ,
  supply_date TIMESTAMPTZ,
  fact_date   TIMESTAMPTZ,
  updated_date TIMESTAMPTZ,
  box_type_id  INT,
  is_box_on_pallet BOOLEAN,
  synced_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(store_id, preorder_id)
);

CREATE INDEX IF NOT EXISTS wb_supplies_store_status  ON wb_supplies(store_id, status_id);
CREATE INDEX IF NOT EXISTS wb_supplies_supply_id_idx ON wb_supplies(supply_id) WHERE supply_id IS NOT NULL;

-- Товары внутри поставок — для расчёта "в пути" по SKU
CREATE TABLE IF NOT EXISTS wb_supply_goods (
  id           BIGSERIAL PRIMARY KEY,
  store_id     TEXT   NOT NULL,
  supply_id    BIGINT NOT NULL,
  nm_id        BIGINT NOT NULL,
  vendor_code  TEXT,
  barcode      TEXT,
  tech_size    TEXT   NOT NULL DEFAULT '',
  quantity     INT    NOT NULL DEFAULT 0,
  accepted_qty INT    NOT NULL DEFAULT 0,
  synced_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(store_id, supply_id, nm_id, tech_size)
);

CREATE INDEX IF NOT EXISTS wb_supply_goods_store_nm ON wb_supply_goods(store_id, nm_id);
CREATE INDEX IF NOT EXISTS wb_supply_goods_supply   ON wb_supply_goods(supply_id);
