-- Добавить первый магазин в базу данных
-- Запусти этот запрос в Supabase → SQL Editor → New query

INSERT INTO stores (name, wb_token)
VALUES (
  'Мой магазин WB',   -- ← замени на реальное название магазина
  'eyJhbGciOiJFUzI1NiIsImtpZCI6IjIwMjYwMzAydjEiLCJ0eXAiOiJKV1QifQ.eyJhY2MiOjMsImVudCI6MSwiZXhwIjoxNzkzNTg1MzM1LCJmb3IiOiJzZWxmIiwiaWQiOiIwMTlkZWUyYi1iODc5LTdiZjctOTJkYy02ODFiNWE0ZDc3ZGIiLCJpaWQiOjE0ODUxMTU0LCJvaWQiOjMxNTA0OCwicyI6MTA3MzgyMzQ4Niwic2lkIjoiMGIzODI1M2UtMWVkOC00YTBhLWJjMjktYjQzYTkyZDY5NTI3IiwidCI6ZmFsc2UsInVpZCI6MTQ4NTExNTR9.tm2GEoXHnaCYuusknZfeCO43vrzJSqeCT8VnUwf_YnylR8inpmBnPhNmh-28Nqf9PGlgrZ-KiEIXPQeShPSf6g'
)
RETURNING id, name;

-- После выполнения увидишь id магазина — он понадобится для следующих шагов
