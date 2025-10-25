-- Get Daily Summary (Fast Path)
-- Purpose: Read daily sales data directly from insights.daily_comparisons
-- Replaces: show_daily_sales intent function slow path
-- Version: 1.0

CREATE OR REPLACE PROCEDURE `fdsanalytics.insights.sp_get_daily_summary`(
  IN start_date DATE,
  IN end_date DATE,
  IN customer_id STRING,
  IN primary_category STRING,
  IN subcategory STRING,
  OUT result_table STRING
)
BEGIN
  DECLARE temp_table_name STRING;
  SET temp_table_name = CONCAT('temp_daily_summary_', REPLACE(REPLACE(GENERATE_UUID(), '-', '_'), ':', '_'));

  -- Fast read from daily_comparisons (pre-aggregated)
  EXECUTE IMMEDIATE FORMAT("""
    CREATE TEMP TABLE %s AS
    SELECT
      report_date as date,
      current_value as net_sales,
      comparison_value as comparison_avg,
      percent_change,
      is_anomaly,
      anomaly_type
    FROM `fdsanalytics.insights.daily_comparisons`
    WHERE customer_id = %T
      AND DATE(report_date) BETWEEN %T AND %T
      AND metric_name = 'net_sales'
    ORDER BY report_date ASC
  """, temp_table_name, customer_id, start_date, end_date);

  SET result_table = temp_table_name;
END;
