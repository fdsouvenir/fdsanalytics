-- Get Forecast Stored Procedure
-- Purpose: Retrieve 7-day sales forecast based on day-of-week 4-week averages
-- Security: Uses parameterized queries
-- Version: 1.0

CREATE OR REPLACE PROCEDURE `fdsanalytics.insights.get_forecast`(
  days INT64,                      -- Number of days to forecast (default: 7, max: 14)
  OUT result_table_name STRING
)
BEGIN
  DECLARE forecast_days INT64;

  -- Validate and set default
  IF days IS NULL OR days <= 0 THEN
    SET forecast_days = 7;
  ELSEIF days > 14 THEN
    SET forecast_days = 14;
  ELSE
    SET forecast_days = days;
  END IF;

  -- Create temp table name
  SET result_table_name = FORMAT('`fdsanalytics._temp_forecast_%s`',
    REPLACE(CAST(CURRENT_TIMESTAMP() AS STRING), ' ', '_'));

  -- Generate forecast using existing insights table
  -- If insights.daily_forecast is populated, use it; otherwise compute on-the-fly
  EXECUTE IMMEDIATE FORMAT("""
    CREATE TEMP TABLE %s AS
    WITH forecast_dates AS (
      -- Generate next N days
      SELECT DATE_ADD(CURRENT_DATE('America/Chicago'), INTERVAL day_offset DAY) as target_date
      FROM UNNEST(GENERATE_ARRAY(1, @forecast_days)) as day_offset
    ),
    historical_dow_avg AS (
      -- Calculate 4-week average for each day of week
      SELECT
        EXTRACT(DAYOFWEEK FROM r.report_date) as day_of_week,
        AVG(CAST(REPLACE(REPLACE(m.metric_value, '$', ''), ',', '') AS FLOAT64)) as avg_sales,
        STDDEV(CAST(REPLACE(REPLACE(m.metric_value, '$', ''), ',', '') AS FLOAT64)) as stddev_sales,
        COUNT(*) as sample_count
      FROM `fdsanalytics.restaurant_analytics.metrics` m
      JOIN `fdsanalytics.restaurant_analytics.reports` r
        ON m.report_id = r.report_id
      WHERE m.metric_name = 'net_sales'
        AND r.report_date >= DATE_SUB(CURRENT_DATE('America/Chicago'), INTERVAL 28 DAY)
        AND r.report_date < CURRENT_DATE('America/Chicago')
      GROUP BY day_of_week
    )
    SELECT
      fd.target_date,
      EXTRACT(DAYOFWEEK FROM fd.target_date) as day_of_week,
      FORMAT_DATE('%%A', fd.target_date) as day_name,
      ROUND(ha.avg_sales, 2) as predicted_sales,
      ROUND(ha.avg_sales - (ha.stddev_sales * 1.96), 2) as confidence_low,
      ROUND(ha.avg_sales + (ha.stddev_sales * 1.96), 2) as confidence_high,
      ROUND(
        CASE
          WHEN ha.sample_count >= 4 THEN 0.85
          WHEN ha.sample_count >= 3 THEN 0.70
          WHEN ha.sample_count >= 2 THEN 0.50
          ELSE 0.30
        END,
        2
      ) as confidence_score,
      'dow_avg_4week' as model_version,
      ha.sample_count as historical_samples
    FROM forecast_dates fd
    LEFT JOIN historical_dow_avg ha
      ON EXTRACT(DAYOFWEEK FROM fd.target_date) = ha.day_of_week
    ORDER BY fd.target_date
  """, result_table_name)
  USING forecast_days AS forecast_days;

END;
