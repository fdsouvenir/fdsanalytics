-- Get Top Items (Fast Path)
-- Purpose: Read top items directly from insights.top_items
-- Replaces: show_top_items intent function slow path
-- Version: 1.1

CREATE OR REPLACE PROCEDURE `fdsanalytics.insights.sp_get_top_items_from_insights`(
  IN start_date DATE,
  IN end_date DATE,
  IN customer_id STRING,
  IN primary_category STRING,
  IN subcategory STRING,
  IN item_limit INT64,
  OUT result_table STRING
)
BEGIN
  DECLARE temp_table_name STRING;
  DECLARE category_filter STRING DEFAULT '';

  SET temp_table_name = CONCAT('temp_top_items_', REPLACE(REPLACE(GENERATE_UUID(), '-', '_'), ':', '_'));

  -- Build category filter dynamically
  IF primary_category IS NOT NULL THEN
    SET category_filter = FORMAT(' AND primary_category = %T', primary_category);
  ELSEIF subcategory IS NOT NULL THEN
    SET category_filter = FORMAT(' AND category = %T', subcategory);
  END IF;

  -- For single date queries, read directly from top_items
  -- For date ranges, aggregate across dates
  IF start_date = end_date THEN
    -- Single date: direct read (fastest)
    EXECUTE IMMEDIATE FORMAT("""
      CREATE TEMP TABLE %s AS
      SELECT
        item_name,
        category as subcategory,
        primary_category,
        net_sales,
        quantity_sold,
        rank
      FROM `fdsanalytics.insights.top_items`
      WHERE customer_id = %T
        AND DATE(report_date) = %T
        %s
      ORDER BY rank ASC
      LIMIT %d
    """, temp_table_name, customer_id, start_date, category_filter, item_limit);
  ELSE
    -- Date range: aggregate top items across dates
    EXECUTE IMMEDIATE FORMAT("""
      CREATE TEMP TABLE %s AS
      WITH aggregated_items AS (
        SELECT
          item_name,
          category as subcategory,
          primary_category,
          SUM(net_sales) as net_sales,
          SUM(quantity_sold) as quantity_sold
        FROM `fdsanalytics.insights.top_items`
        WHERE customer_id = %T
          AND DATE(report_date) BETWEEN %T AND %T
          %s
        GROUP BY item_name, subcategory, primary_category
      )
      SELECT
        item_name,
        subcategory,
        primary_category,
        net_sales,
        quantity_sold,
        ROW_NUMBER() OVER (ORDER BY net_sales DESC) as rank
      FROM aggregated_items
      ORDER BY net_sales DESC
      LIMIT %d
    """, temp_table_name, customer_id, start_date, end_date, category_filter, item_limit);
  END IF;

  SET result_table = temp_table_name;
END;
