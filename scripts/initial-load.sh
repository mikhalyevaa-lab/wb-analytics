#!/bin/bash
# Начальная загрузка данных из WB API
# Запускать ЛОКАЛЬНО (нет таймаута). Сервер должен работать на порту 3001.
#
# Использование:
#   bash scripts/initial-load.sh              # все методы
#   bash scripts/initial-load.sh stocks       # только остатки
#   bash scripts/initial-load.sh products     # только товары
#   bash scripts/initial-load.sh orders sales # несколько методов
#   bash scripts/initial-load.sh status       # статус загрузки

set -e

BASE_URL="http://localhost:3001"
SECRET=$(grep CRON_SECRET .env.local | cut -d= -f2)

if [ -z "$SECRET" ]; then
  echo "❌ CRON_SECRET не найден в .env.local"
  exit 1
fi

AUTH="Authorization: Bearer $SECRET"

if [ "$1" = "status" ]; then
  echo "📊 Статус загрузки:"
  curl -s -H "$AUTH" "$BASE_URL/api/sync/initial" | python3 -m json.tool 2>/dev/null || \
  curl -s -H "$AUTH" "$BASE_URL/api/sync/initial"
  exit 0
fi

# Формируем список методов
if [ $# -eq 0 ]; then
  METHODS='["all"]'
else
  METHODS=$(printf '"%s",' "$@" | sed 's/,$//')
  METHODS="[$METHODS]"
fi

echo "🚀 Запуск начальной загрузки: $METHODS"
echo "⚠️  Лимит WB Statistics API: 1 запрос / 65 секунд"
echo "⏱  Ожидаемое время: несколько часов для полной истории"
echo ""
echo "Лог будет выводиться в реальном времени..."
echo "Для остановки: Ctrl+C (прогресс сохранён в sync_log, повтор пропустит уже загруженное)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

curl -s -X POST "$BASE_URL/api/sync/initial" \
  -H "$AUTH" \
  -H "Content-Type: application/json" \
  -d "{\"methods\": $METHODS}" \
  --no-buffer | python3 -c "
import sys, json
data = json.load(sys.stdin)
print()
print('━' * 70)
print('✅ Загрузка завершена!')
for line in data.get('log', []):
    print(line)
" 2>/dev/null || echo "⚠️ Ответ получен (или прерван)"
