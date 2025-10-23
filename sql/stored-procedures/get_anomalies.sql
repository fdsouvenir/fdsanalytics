-- Get Anomalies Stored Procedure
-- Purpose: Detect anomalies in sales data using ±40%/±60% thresholds
-- Security: Uses parameterized queries
-- Version: 1.0

CREATE OR REPLACE PROCEDURE `fdsanalytics.insights.get_anomalies`(
  days_back INT64,                 -- How many days to check (default: 7)
  OUT result_table_name STRING
)
BEGIN
  DECLARE lookback_days INT64;
  DECLARE has_insights BOOLEAN;

  -- Validate and set default
  IF days_back IS NULL OR days_back <= 0 THEN
    SET lookback_days = 7;
  ELSEIF days_back > 90 THEN
    SET lookback_days = 90;
  ELSE
    SET lookback_days = days_back;
  END IF;

  -- Create temp table name
  SET result_table_name = FORMAT('`fdsanalytics._temp_anomalies_%s`',
    REPLACE(CAST(CURRENT_TIMESTAMP() AS STRING), ' ', '_'));

  -- Check if insights.daily_comparisons table exists and has recent data
  SET has_insights = (
    SELECT COUNT(*) > 0
    FROM `fdsanalytics.insights.daily_comparisons`
    WHERE report_date >= DATE_SUB(CURRENT_DATE('America/Chicago'), INTERVAL lookback_days DAY)
      AND is_anomaly = TRUE
  );

  IF has_insights THEN
    -- Use pre-computed anomalies from insights table
    EXECUTE IMMEDIATE FORMAT("""
      CREATE TEMP TABLE %s AS
      SELECT
        report_date as date,
        metric_name as metric,
        current_value,
        comparison_value as expected_value,
        change_amount,
        percent_change,
        anomaly_type,
        anomaly_severity as severity,
        'precomputed_insights' as detection_method
      FROM `fdsanalytics.insights.daily_comparisons`
      WHERE report_date >= DATE_SUB(CURRENT_DATE('America/Chicago'), INTERVAL @lookback_days DAY)
        AND is_anomaly = TRUE
      ORDER BY report_date DESC, ABS(percent_change) DESC
    """, result_table_name)
    USING lookback_days AS lookback_days;
  ELSE
    -- Compute anomalies on-the-fly
    EXECUTE IMMEDIATE FORMAT("""
      CREATE TEMP TABLE %s AS
      WITH daily_metrics AS (
        SELECT
          r.report_date,
          m.metric_name,
          SUM(CAST(REPLACE(REPLACE(m.metric_value, '$', ''), ',', '') AS FLOAT64)) as daily_value,
          EXTRACT(DAYOFWEEK FROM r.report_date) as day_of_week
        FROM `fdsanalytics.restaurant_analytics.metrics` m
        JOIN `fdsanalytics.restaurant_analytics.reports` r
          ON m.report_id = r.report_id
        WHERE r.report_date >= DATE_SUB(CURRENT_DATE('America/Chicago'), INTERVAL (@lookback_days + 28) DAY)
          AND m.metric_name IN ('net_sales', 'quantity_sold')
        GROUP BY r.report_date, m.metric_name
      ),
      historical_avg AS (
        SELECT
          day_of_week,
          metric_name,
          AVG(daily_value) as avg_value,
          STDDEV(daily_value) as stddev_value
        FROM daily_metrics
        WHERE report_date < DATE_SUB(CURRENT_DATE('America/Chicago'), INTERVAL @lookback_days DAY)
        GROUP BY day_of_week, metric_name
      )
      SELECT
        dm.report_date as date,
        dm.metric_name as metric,
        ROUND(dm.daily_value, 2) as current_value,
        ROUND(ha.avg_value, 2) as expected_value,
        ROUND(dm.daily_value - ha.avg_value, 2) as change_amount,
        ROUND(
          SAFE_DIVIDE(dm.daily_value - ha.avg_value, ha.avg_value) * 100,
          2
        ) as percent_change,
        CASE
          WHEN dm.daily_value > ha.avg_value THEN 'spike'
          ELSE 'drop'
        END as anomaly_type,
        CASE
          WHEN ABS(SAFE_DIVIDE(dm.daily_value - ha.avg_value, ha.avg_value)) >= 0.60 THEN 'major'
          WHEN ABS(SAFE_DIVIDE(dm.daily_value - ha.avg_value, ha.avg_value)) >= 0.40 THEN 'minor'
          ELSE 'none'
        END as severity,
        'realtime_calculation' as detection_method
      FROM daily_metrics dm
      LEFT JOIN historical_avg ha
        ON dm.day_of_week = ha.day_of_week
        AND dm.metric_name = ha.metric_name
      WHERE dm.report_date >= DATE_SUB(CURRENT_DATE('America/Chicago'), INTERVAL @lookback_days DAY)
        -- Only return actual anomalies (±40% threshold)
        AND ABS(SAFE_DIVIDE(dm.daily_value - ha.avg_value, ha.avg_value)) >= 0.40
        AND ha.avg_value IS NOT NULL
      ORDER BY dm.report_date DESC, ABS(SAFE_DIVIDE(dm.daily_value - ha.avg_value, ha.avg_value)) DESC
    """, result_table_name)
    USING lookback_days AS lookback_days;
  END IF;

END;
