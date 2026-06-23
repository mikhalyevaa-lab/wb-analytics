-- Migration 006: функция агрегации для ABC-анализа
-- Агрегирует заказы + финансы по nm_id за произвольный период

CREATE OR REPLACE FUNCTION get_abc_analysis(
  p_store_ids uuid[],
  p_date_from date,
  p_date_to   date
)
RETURNS TABLE (
  nm_id               bigint,
  orders_count        bigint,
  revenue             numeric,
  delivery_rub        numeric,
  logistics_per_unit  numeric,
  finance_rows        bigint
)
LANGUAGE sql
STABLE
AS $$
  WITH
  orders_agg AS (
    SELECT
      nm_id,
      COUNT(*)                                                            AS orders_count,
      SUM(total_price * (1 - COALESCE(discount_percent, 0)::numeric / 100)) AS revenue
    FROM wb_orders
    WHERE store_id = ANY(p_store_ids)
      AND is_cancel = false
      AND date::date BETWEEN p_date_from AND p_date_to
    GROUP BY nm_id
  ),
  finance_agg AS (
    SELECT
      nm_id,
      SUM(delivery_rub) AS delivery_rub,
      COUNT(*)           AS finance_rows
    FROM wb_finance
    WHERE store_id = ANY(p_store_ids)
      AND date_from BETWEEN p_date_from AND p_date_to
    GROUP BY nm_id
  )
  SELECT
    o.nm_id,
    o.orders_count,
    ROUND(o.revenue, 2)                                               AS revenue,
    ROUND(COALESCE(f.delivery_rub, 0), 2)                            AS delivery_rub,
    CASE WHEN o.orders_count > 0
      THEN ROUND(COALESCE(f.delivery_rub, 0) / o.orders_count, 2)
      ELSE 0
    END                                                               AS logistics_per_unit,
    COALESCE(f.finance_rows, 0)                                      AS finance_rows
  FROM orders_agg o
  LEFT JOIN finance_agg f USING (nm_id)
  ORDER BY revenue DESC
$$;
