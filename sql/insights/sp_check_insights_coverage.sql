-- Check Insights Coverage
-- Purpose: Determine if a date range has cached insights data
-- Returns: Coverage percentage and missing dates
-- Version: 1.0

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
  EXECUTE IMMEDIATE FORMAT("""
    CREATE TEMP TABLE %s AS
    WITH date_range AS (
      -- Generate all dates in the requested range
      SELECT day
      FROM UNNEST(GENERATE_DATE_ARRAY(%T, %T)) as day
    ),
    covered_dates AS (
      -- Get dates that exist in daily_comparisons
      SELECT DISTINCT report_date as day
      FROM `fdsanalytics.insights.daily_comparisons`
      WHERE customer_id = %T
        AND DATE(report_date) BETWEEN %T AND %T
    ),
    coverage_check AS (
      SELECT
        dr.day,
        CASE WHEN cd.day IS NOT NULL THEN TRUE ELSE FALSE END as is_covered
      FROM date_range dr
      LEFT JOIN covered_dates cd ON dr.day = cd.day
    )
    SELECT
      -- Summary metrics
      COUNT(*) as total_dates,
      COUNTIF(is_covered) as covered_dates,
      COUNT(*) - COUNTIF(is_covered) as missing_dates,
      ROUND(SAFE_DIVIDE(COUNTIF(is_covered), COUNT(*)) * 100, 2) as coverage_percent,

      -- Missing date ranges (for debugging)
      STRING_AGG(
        CASE WHEN NOT is_covered THEN CAST(day AS STRING) END,
        ', '
        ORDER BY day
      ) as missing_date_list,

      -- Is fully covered? (100%% coverage)
      CASE
        WHEN COUNT(*) = COUNTIF(is_covered) THEN TRUE
        ELSE FALSE
      END as is_fully_covered
    FROM coverage_check
  """, temp_table_name, start_date, end_date, customer_id, start_date, end_date);

  SET result_table = temp_table_name;
END;
