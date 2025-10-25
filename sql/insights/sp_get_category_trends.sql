-- Get Category Trends (Fast Path)
-- Purpose: Read category breakdown directly from insights.category_trends
-- Replaces: show_category_breakdown intent function slow path
-- Version: 1.0

CREATE OR REPLACE PROCEDURE `fdsanalytics.insights.sp_get_category_trends`(
  IN start_date DATE,
  IN end_date DATE,
  IN customer_id STRING,
  OUT result_table STRING
)
BEGIN
  DECLARE temp_table_name STRING;
  SET temp_table_name = CONCAT('temp_category_trends_', REPLACE(REPLACE(GENERATE_UUID(), '-', '_'), ':', '_'));

  -- For single date queries, read directly
  -- For date ranges, aggregate across dates
  IF start_date = end_date THEN
    -- Single date: direct read (fastest)
    EXECUTE IMMEDIATE FORMAT("""
      CREATE TEMP TABLE %s AS
      SELECT
        primary_category,
        category as subcategory,
        sales_total,
        quantity_total,
        week_over_week_change,
        trend_direction
      FROM `fdsanalytics.insights.category_trends`
      WHERE customer_id = %T
        AND DATE(report_date) = %T
      ORDER BY sales_total DESC
    """, temp_table_name, customer_id, start_date);
  ELSE
    -- Date range: aggregate across dates
    EXECUTE IMMEDIATE FORMAT("""
      CREATE TEMP TABLE %s AS
      WITH aggregated_categories AS (
        SELECT
          primary_category,
          category as subcategory,
          SUM(sales_total) as sales_total,
          SUM(quantity_total) as quantity_total,
          AVG(week_over_week_change) as avg_week_over_week_change
        FROM `fdsanalytics.insights.category_trends`
        WHERE customer_id = %T
          AND DATE(report_date) BETWEEN %T AND %T
        GROUP BY primary_category, subcategory
      )
      SELECT
        primary_category,
        subcategory,
        sales_total,
        quantity_total,
        avg_week_over_week_change as week_over_week_change,
        CASE
          WHEN avg_week_over_week_change > 0.1 THEN 'growing'
          WHEN avg_week_over_week_change < -0.1 THEN 'declining'
          ELSE 'stable'
        END as trend_direction
      FROM aggregated_categories
      ORDER BY sales_total DESC
    """, temp_table_name, customer_id, start_date, end_date);
  END IF;

  SET result_table = temp_table_name;
END;
