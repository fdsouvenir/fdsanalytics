-- Check Insights Coverage
-- Purpose: Determine if dates with reports have cached insights data
-- Returns: Coverage status (checks only dates that have reports, not all calendar dates)
-- Version: 2.0 - Optimized to avoid expensive STRING_AGG and check only report dates

CREATE OR REPLACE PROCEDURE `fdsanalytics.insights.sp_check_insights_coverage`(
  IN start_date DATE,
  IN end_date DATE,
  IN customer_id STRING,
  OUT result_table STRING
)
BEGIN
  DECLARE temp_table_name STRING;
  SET temp_table_name = CONCAT('temp_coverage_', REPLACE(REPLACE(REPLACE(GENERATE_UUID(), '-', '_'), ':', '_'), ' ', '_'));

  -- Create temporary table with coverage results
  -- Only check dates that have reports (not all calendar dates)
  EXECUTE IMMEDIATE FORMAT("""
    CREATE TEMP TABLE %s AS
    WITH report_dates AS (
      -- Get dates that have actual reports
      SELECT DISTINCT DATE(report_date) as day
      FROM `fdsanalytics.restaurant_analytics.reports`
      WHERE customer_id = %T
        AND DATE(report_date) BETWEEN %T AND %T
    ),
    cached_dates AS (
      -- Get dates that exist in insights cache
      SELECT DISTINCT DATE(report_date) as day
      FROM `fdsanalytics.insights.daily_comparisons`
      WHERE customer_id = %T
        AND DATE(report_date) BETWEEN %T AND %T
    ),
    coverage_check AS (
      SELECT
        rd.day,
        CASE WHEN cd.day IS NOT NULL THEN TRUE ELSE FALSE END as is_cached
      FROM report_dates rd
      LEFT JOIN cached_dates cd ON rd.day = cd.day
    )
    SELECT
      -- Summary metrics
      COUNT(*) as total_dates,
      COUNTIF(is_cached) as covered_dates,
      COUNT(*) - COUNTIF(is_cached) as missing_dates,
      ROUND(SAFE_DIVIDE(COUNTIF(is_cached), COUNT(*)) * 100, 2) as coverage_percent,

      -- Is fully covered? (all report dates are cached)
      CASE
        WHEN COUNT(*) = COUNTIF(is_cached) THEN TRUE
        ELSE FALSE
      END as is_fully_covered
    FROM coverage_check
  """, temp_table_name, customer_id, start_date, end_date, customer_id, start_date, end_date);

  SET result_table = temp_table_name;
END;
