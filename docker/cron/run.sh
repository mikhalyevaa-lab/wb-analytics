#!/bin/sh
# Синхронизация WB Analytics — вызываем каждые 2 часа
# Дроссель-логика (shouldSync) уже в приложении, здесь просто триггерим

while true; do
  echo "[cron] $(date -u +%Y-%m-%dT%H:%M:%SZ) — запуск синка"
  curl -sf -X GET "$APP_URL/api/sync" \
    -H "Authorization: Bearer $CRON_SECRET" \
    -o /dev/null && echo "[cron] sync ok" || echo "[cron] sync error"
  sleep 7200
done
