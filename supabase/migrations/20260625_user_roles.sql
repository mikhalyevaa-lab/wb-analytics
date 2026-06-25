-- Роли пользователей: поле role в user_stores + таблица приглашений

ALTER TABLE user_stores ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'viewer';

-- Существующие записи → owner (первый пользователь магазина)
UPDATE user_stores SET role = 'owner';

-- Проверочный constraint на допустимые роли
ALTER TABLE user_stores DROP CONSTRAINT IF EXISTS user_stores_role_check;
ALTER TABLE user_stores ADD CONSTRAINT user_stores_role_check
  CHECK (role IN ('owner','admin','director','ad_manager','product_manager','finance','viewer'));

-- Таблица приглашений
CREATE TABLE IF NOT EXISTS invitations (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id    uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  email       text NOT NULL,
  role        text NOT NULL CHECK (role IN ('admin','director','ad_manager','product_manager','finance','viewer')),
  token       uuid NOT NULL DEFAULT gen_random_uuid(),
  invited_by  text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  expires_at  timestamptz NOT NULL DEFAULT now() + interval '7 days',
  accepted_at timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS invitations_token_idx ON invitations (token);
CREATE INDEX IF NOT EXISTS invitations_store_idx ON invitations (store_id);
