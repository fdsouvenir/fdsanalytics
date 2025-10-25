-- Populate Daily Insights
-- Purpose: Generate all insights tables for a single target date
-- Tables populated: daily_comparisons, category_trends, top_items, daily_forecast
-- Pattern: Uses MERGE for idempotency (safe to re-run)
-- Version: 1.0

CREATE OR REPLACE PROCEDURE `fdsanalytics.insights.populate_daily_insights`(
  target_date DATE
)
BEGIN
  DECLARE customer_id_val STRING DEFAULT 'senso-sushi';

  -- ============================================================================
  -- 1. POPULATE daily_comparisons
  -- Logic: Compare target_date metrics to 4-week average for same day-of-week
  -- ============================================================================

  MERGE `fdsanalytics.insights.daily_comparisons` T
  USING (
    WITH current_metrics AS (
      -- Get metrics for target date
      SELECT
        m.metric_name,
        SUM(CAST(m.metric_value AS FLOAT64)) as current_value,
        EXTRACT(DAYOFWEEK FROM r.report_date) as day_of_week
      FROM `fdsanalytics.restaurant_analytics.metrics` m
      JOIN `fdsanalytics.restaurant_analytics.reports` r ON m.report_id = r.report_id
      WHERE DATE(r.report_date) = target_date
        AND m.metric_name IN ('net_sales', 'quantity_sold')
      GROUP BY m.metric_name, day_of_week
    ),
    comparison_metrics AS (
      -- Get 4-week avg for same day-of-week
      SELECT
        m.metric_name,
        EXTRACT(DAYOFWEEK FROM r.report_date) as day_of_week,
        AVG(CAST(m.metric_value AS FLOAT64)) as comparison_value
      FROM `fdsanalytics.restaurant_analytics.metrics` m
      JOIN `fdsanalytics.restaurant_analytics.reports` r ON m.report_id = r.report_id
      WHERE DATE(r.report_date) BETWEEN DATE_SUB(target_date, INTERVAL 28 DAY)
                                     AND DATE_SUB(target_date, INTERVAL 1 DAY)
        AND EXTRACT(DAYOFWEEK FROM r.report_date) = EXTRACT(DAYOFWEEK FROM target_date)
        AND m.metric_name IN ('net_sales', 'quantity_sold')
      GROUP BY m.metric_name, day_of_week
    )
    SELECT
      customer_id_val as customer_id,
      target_date as report_date,
      c.metric_name,
      c.current_value,
      COALESCE(comp.comparison_value, c.current_value) as comparison_value,
      '4_week_dow_avg' as comparison_type,
      SAFE_DIVIDE(
        c.current_value - COALESCE(comp.comparison_value, c.current_value),
        COALESCE(comp.comparison_value, c.current_value)
      ) as percent_change,
      -- Anomaly detection
      CASE
        WHEN SAFE_DIVIDE(c.current_value - COALESCE(comp.comparison_value, c.current_value),
                         COALESCE(comp.comparison_value, c.current_value)) > 0.4 THEN TRUE
        WHEN SAFE_DIVIDE(c.current_value - COALESCE(comp.comparison_value, c.current_value),
                         COALESCE(comp.comparison_value, c.current_value)) < -0.4 THEN TRUE
        ELSE FALSE
      END as is_anomaly,
      -- Anomaly type
      CASE
        WHEN SAFE_DIVIDE(c.current_value - COALESCE(comp.comparison_value, c.current_value),
                         COALESCE(comp.comparison_value, c.current_value)) > 0.6 THEN 'spike_major'
        WHEN SAFE_DIVIDE(c.current_value - COALESCE(comp.comparison_value, c.current_value),
                         COALESCE(comp.comparison_value, c.current_value)) > 0.4 THEN 'spike_minor'
        WHEN SAFE_DIVIDE(c.current_value - COALESCE(comp.comparison_value, c.current_value),
                         COALESCE(comp.comparison_value, c.current_value)) < -0.4 THEN 'drop_major'
        WHEN SAFE_DIVIDE(c.current_value - COALESCE(comp.comparison_value, c.current_value),
                         COALESCE(comp.comparison_value, c.current_value)) < -0.2 THEN 'drop_minor'
        ELSE NULL
      END as anomaly_type
    FROM current_metrics c
    LEFT JOIN comparison_metrics comp
      ON c.metric_name = comp.metric_name
      AND c.day_of_week = comp.day_of_week
  ) S
  ON T.customer_id = S.customer_id
    AND T.report_date = S.report_date
    AND T.metric_name = S.metric_name
  WHEN MATCHED THEN
    UPDATE SET
      current_value = S.current_value,
      comparison_value = S.comparison_value,
      comparison_type = S.comparison_type,
      percent_change = S.percent_change,
      is_anomaly = S.is_anomaly,
      anomaly_type = S.anomaly_type,
      created_at = CURRENT_TIMESTAMP()
  WHEN NOT MATCHED THEN
    INSERT (customer_id, report_date, metric_name, current_value, comparison_value,
            comparison_type, percent_change, is_anomaly, anomaly_type, created_at)
    VALUES (S.customer_id, S.report_date, S.metric_name, S.current_value, S.comparison_value,
            S.comparison_type, S.percent_change, S.is_anomaly, S.anomaly_type, CURRENT_TIMESTAMP());

  -- ============================================================================
  -- 2. POPULATE category_trends
  -- Logic: Week-over-week comparison by category
  -- ============================================================================

  MERGE `fdsanalytics.insights.category_trends` T
  USING (
    WITH current_week AS (
      -- Get week totals for target_date's week
      SELECT
        JSON_EXTRACT_SCALAR(m.dimensions, '$.category') as category,
        m.primary_category,
        SUM(CASE WHEN m.metric_name = 'net_sales' THEN CAST(m.metric_value AS FLOAT64) ELSE 0 END) as sales_total,
        SUM(CASE WHEN m.metric_name = 'quantity_sold' THEN CAST(m.metric_value AS INT64) ELSE 0 END) as quantity_total
      FROM `fdsanalytics.restaurant_analytics.metrics` m
      JOIN `fdsanalytics.restaurant_analytics.reports` r ON m.report_id = r.report_id
      WHERE DATE(r.report_date) BETWEEN DATE_TRUNC(target_date, WEEK)
                                    AND DATE_ADD(DATE_TRUNC(target_date, WEEK), INTERVAL 6 DAY)
        AND JSON_EXTRACT_SCALAR(m.dimensions, '$.category') IS NOT NULL
      GROUP BY category, primary_category
    ),
    previous_week AS (
      -- Get previous week totals
      SELECT
        JSON_EXTRACT_SCALAR(m.dimensions, '$.category') as category,
        SUM(CASE WHEN m.metric_name = 'net_sales' THEN CAST(m.metric_value AS FLOAT64) ELSE 0 END) as prev_sales_total
      FROM `fdsanalytics.restaurant_analytics.metrics` m
      JOIN `fdsanalytics.restaurant_analytics.reports` r ON m.report_id = r.report_id
      WHERE DATE(r.report_date) BETWEEN DATE_SUB(DATE_TRUNC(target_date, WEEK), INTERVAL 7 DAY)
                                    AND DATE_SUB(DATE_TRUNC(target_date, WEEK), INTERVAL 1 DAY)
        AND JSON_EXTRACT_SCALAR(m.dimensions, '$.category') IS NOT NULL
      GROUP BY category
    )
    SELECT
      customer_id_val as customer_id,
      target_date as report_date,
      cw.primary_category,
      cw.category,
      cw.sales_total,
      cw.quantity_total,
      SAFE_DIVIDE(cw.sales_total - COALESCE(pw.prev_sales_total, 0),
                  COALESCE(pw.prev_sales_total, cw.sales_total)) as week_over_week_change,
      CASE
        WHEN SAFE_DIVIDE(cw.sales_total - COALESCE(pw.prev_sales_total, 0),
                         COALESCE(pw.prev_sales_total, cw.sales_total)) > 0.1 THEN 'growing'
        WHEN SAFE_DIVIDE(cw.sales_total - COALESCE(pw.prev_sales_total, 0),
                         COALESCE(pw.prev_sales_total, cw.sales_total)) < -0.1 THEN 'declining'
        ELSE 'stable'
      END as trend_direction
    FROM current_week cw
    LEFT JOIN previous_week pw ON cw.category = pw.category
  ) S
  ON T.customer_id = S.customer_id
    AND T.report_date = S.report_date
    AND T.category = S.category
  WHEN MATCHED THEN
    UPDATE SET
      primary_category = S.primary_category,
      sales_total = S.sales_total,
      quantity_total = S.quantity_total,
      week_over_week_change = S.week_over_week_change,
      trend_direction = S.trend_direction,
      created_at = CURRENT_TIMESTAMP()
  WHEN NOT MATCHED THEN
    INSERT (customer_id, report_date, primary_category, category, sales_total, quantity_total,
            week_over_week_change, trend_direction, created_at)
    VALUES (S.customer_id, S.report_date, S.primary_category, S.category, S.sales_total, S.quantity_total,
            S.week_over_week_change, S.trend_direction, CURRENT_TIMESTAMP());

  -- ============================================================================
  -- 3. POPULATE top_items
  -- Logic: Top 10 items per category for target_date
  -- ============================================================================

  MERGE `fdsanalytics.insights.top_items` T
  USING (
    WITH item_totals AS (
      SELECT
        m.primary_category,
        JSON_EXTRACT_SCALAR(m.dimensions, '$.category') as category,
        JSON_EXTRACT_SCALAR(m.dimensions, '$.item_name') as item_name,
        SUM(CASE WHEN m.metric_name = 'net_sales' THEN CAST(m.metric_value AS FLOAT64) ELSE 0 END) as net_sales,
        SUM(CASE WHEN m.metric_name = 'quantity_sold' THEN CAST(m.metric_value AS INT64) ELSE 0 END) as quantity_sold
      FROM `fdsanalytics.restaurant_analytics.metrics` m
      JOIN `fdsanalytics.restaurant_analytics.reports` r ON m.report_id = r.report_id
      WHERE DATE(r.report_date) = target_date
        AND JSON_EXTRACT_SCALAR(m.dimensions, '$.item_name') IS NOT NULL
        AND JSON_EXTRACT_SCALAR(m.dimensions, '$.category') IS NOT NULL
      GROUP BY primary_category, category, item_name
    ),
    ranked_items AS (
      SELECT
        *,
        ROW_NUMBER() OVER (
          PARTITION BY category
          ORDER BY net_sales DESC
        ) as rank
      FROM item_totals
    )
    SELECT
      customer_id_val as customer_id,
      target_date as report_date,
      primary_category,
      category,
      item_name,
      rank,
      quantity_sold,
      net_sales
    FROM ranked_items
    WHERE rank <= 10
  ) S
  ON T.customer_id = S.customer_id
    AND T.report_date = S.report_date
    AND T.category = S.category
    AND T.item_name = S.item_name
  WHEN MATCHED THEN
    UPDATE SET
      primary_category = S.primary_category,
      rank = S.rank,
      quantity_sold = S.quantity_sold,
      net_sales = S.net_sales,
      created_at = CURRENT_TIMESTAMP()
  WHEN NOT MATCHED THEN
    INSERT (customer_id, report_date, primary_category, category, item_name, rank,
            quantity_sold, net_sales, created_at)
    VALUES (S.customer_id, S.report_date, S.primary_category, S.category, S.item_name, S.rank,
            S.quantity_sold, S.net_sales, CURRENT_TIMESTAMP());

  -- ============================================================================
  -- 4. POPULATE daily_forecast
  -- Logic: 7-day forecast using 4-week day-of-week average
  -- ============================================================================

  MERGE `fdsanalytics.insights.daily_forecast` T
  USING (
    WITH forecast_days AS (
      -- Generate next 7 days
      SELECT day
      FROM UNNEST(GENERATE_DATE_ARRAY(DATE_ADD(target_date, INTERVAL 1 DAY),
                                       DATE_ADD(target_date, INTERVAL 7 DAY))) as day
    ),
    historical_averages AS (
      -- Get 4-week average for each day of week
      SELECT
        EXTRACT(DAYOFWEEK FROM r.report_date) as day_of_week,
        AVG(CAST(m.metric_value AS FLOAT64)) as avg_sales,
        STDDEV(CAST(m.metric_value AS FLOAT64)) as stddev_sales
      FROM `fdsanalytics.restaurant_analytics.metrics` m
      JOIN `fdsanalytics.restaurant_analytics.reports` r ON m.report_id = r.report_id
      WHERE DATE(r.report_date) BETWEEN DATE_SUB(target_date, INTERVAL 28 DAY)
                                    AND target_date
        AND m.metric_name = 'net_sales'
      GROUP BY day_of_week
    )
    SELECT
      customer_id_val as customer_id,
      target_date as prediction_date,
      fd.day as target_date,
      ha.avg_sales as predicted_sales,
      ha.avg_sales - (1.96 * COALESCE(ha.stddev_sales, 0)) as confidence_interval_low,
      ha.avg_sales + (1.96 * COALESCE(ha.stddev_sales, 0)) as confidence_interval_high,
      '4_week_dow_avg' as model_type,
      CASE
        WHEN ha.stddev_sales IS NULL OR ha.stddev_sales = 0 THEN 1.0
        WHEN ha.stddev_sales / ha.avg_sales < 0.15 THEN 0.9
        WHEN ha.stddev_sales / ha.avg_sales < 0.30 THEN 0.7
        ELSE 0.5
      END as confidence_score
    FROM forecast_days fd
    JOIN historical_averages ha ON EXTRACT(DAYOFWEEK FROM fd.day) = ha.day_of_week
  ) S
  ON T.customer_id = S.customer_id
    AND T.prediction_date = S.prediction_date
    AND T.target_date = S.target_date
  WHEN MATCHED THEN
    UPDATE SET
      predicted_sales = S.predicted_sales,
      confidence_interval_low = S.confidence_interval_low,
      confidence_interval_high = S.confidence_interval_high,
      model_type = S.model_type,
      confidence_score = S.confidence_score,
      created_at = CURRENT_TIMESTAMP()
  WHEN NOT MATCHED THEN
    INSERT (customer_id, prediction_date, target_date, predicted_sales, confidence_interval_low,
            confidence_interval_high, model_type, confidence_score, created_at)
    VALUES (S.customer_id, S.prediction_date, S.target_date, S.predicted_sales, S.confidence_interval_low,
            S.confidence_interval_high, S.model_type, S.confidence_score, CURRENT_TIMESTAMP());

END;
