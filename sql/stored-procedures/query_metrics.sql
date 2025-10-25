-- Query Metrics Stored Procedure
-- Purpose: Safely query sales/quantity data with filtering, grouping, and comparison
-- Security: Uses parameterized queries to prevent SQL injection
-- Version: 1.0

CREATE OR REPLACE PROCEDURE `fdsanalytics.restaurant_analytics.query_metrics`(
  -- What to measure
  metric_name STRING,              -- 'net_sales' or 'quantity_sold'

  -- Time range
  start_date DATE,
  end_date DATE,

  -- Filters (all optional - NULL means no filter)
  primary_category STRING,
  subcategory STRING,
  item_name STRING,

  -- Aggregation
  aggregation STRING,              -- 'SUM', 'AVG', 'COUNT', 'MIN', 'MAX'

  -- Grouping (comma-separated: 'date', 'category', 'subcategory', 'item')
  group_by_fields STRING,

  -- Comparison baseline (optional)
  baseline_start_date DATE,
  baseline_end_date DATE,

  -- Output control
  max_rows INT64,
  order_by_field STRING,
  order_direction STRING,          -- 'ASC' or 'DESC'

  -- Output (results written to temp table)
  OUT result_table_name STRING
)
BEGIN
  DECLARE sql_query STRING;
  DECLARE group_by_clause STRING DEFAULT '';
  DECLARE where_clause STRING DEFAULT '';
  DECLARE select_fields STRING DEFAULT '';
  DECLARE has_baseline BOOLEAN;
  DECLARE order_by_clause STRING DEFAULT '';
  DECLARE baseline_table STRING;
  DECLARE baseline_query STRING;
  DECLARE final_table STRING;
  DECLARE join_on_clause STRING DEFAULT '1=1';

  -- Validate inputs
  IF metric_name NOT IN ('net_sales', 'quantity_sold') THEN
    RAISE USING MESSAGE = 'Invalid metric_name. Must be net_sales or quantity_sold';
  END IF;

  IF aggregation NOT IN ('SUM', 'AVG', 'COUNT', 'MIN', 'MAX') THEN
    RAISE USING MESSAGE = 'Invalid aggregation. Must be SUM, AVG, COUNT, MIN, or MAX';
  END IF;

  IF order_direction NOT IN ('ASC', 'DESC') THEN
    RAISE USING MESSAGE = 'Invalid order_direction. Must be ASC or DESC';
  END IF;

  IF start_date > end_date THEN
    RAISE USING MESSAGE = 'start_date must be <= end_date';
  END IF;

  -- Validate category exists (if provided)
  IF primary_category IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM `fdsanalytics.restaurant_analytics.metrics` m
      WHERE m.primary_category = primary_category
      LIMIT 1
    ) THEN
      RAISE USING MESSAGE = FORMAT('Invalid primary_category: %s not found in data', primary_category);
    END IF;
  END IF;

  -- Check if we have baseline comparison
  SET has_baseline = (baseline_start_date IS NOT NULL AND baseline_end_date IS NOT NULL);

  -- Build SELECT fields based on grouping
  IF group_by_fields IS NOT NULL AND group_by_fields != '' THEN
    IF STRPOS(group_by_fields, 'date') > 0 THEN
      SET select_fields = select_fields || 'r.report_date, ';
      SET group_by_clause = group_by_clause || 'r.report_date, ';
    END IF;

    IF STRPOS(group_by_fields, 'category') > 0 THEN
      SET select_fields = select_fields || 'm.primary_category, ';
      SET group_by_clause = group_by_clause || 'm.primary_category, ';
    END IF;

    IF STRPOS(group_by_fields, 'subcategory') > 0 THEN
      SET select_fields = select_fields || 'JSON_EXTRACT_SCALAR(m.dimensions, "$.category") as subcategory, ';
      SET group_by_clause = group_by_clause || 'JSON_EXTRACT_SCALAR(m.dimensions, "$.category"), ';
    END IF;

    IF STRPOS(group_by_fields, 'item') > 0 THEN
      SET select_fields = select_fields || 'JSON_EXTRACT_SCALAR(m.dimensions, "$.item_name") as item_name, ';
      SET group_by_clause = group_by_clause || 'JSON_EXTRACT_SCALAR(m.dimensions, "$.item_name"), ';
    END IF;
  END IF;

  -- Add aggregated metric (metric_value is already FLOAT64 in the table)
  SET select_fields = select_fields || aggregation || '(m.metric_value) as metric_value';

  -- Build WHERE clause for filters
  SET where_clause = 'WHERE r.report_date BETWEEN @start_date AND @end_date AND m.metric_name = @metric_name';

  IF primary_category IS NOT NULL THEN
    SET where_clause = where_clause || ' AND m.primary_category = @primary_category';
  END IF;

  IF subcategory IS NOT NULL THEN
    SET where_clause = where_clause || ' AND JSON_EXTRACT_SCALAR(m.dimensions, "$.category") = @subcategory';
  END IF;

  IF item_name IS NOT NULL THEN
    SET where_clause = where_clause || ' AND JSON_EXTRACT_SCALAR(m.dimensions, "$.item_name") = @item_name';
  END IF;

  -- Build GROUP BY clause (remove trailing comma)
  IF group_by_clause != '' THEN
    SET group_by_clause = 'GROUP BY ' || RTRIM(group_by_clause, ', ');
  END IF;

  -- Build ORDER BY clause
  IF order_by_field IS NOT NULL THEN
    SET order_by_clause = FORMAT('ORDER BY %s %s', order_by_field, order_direction);
  ELSE
    SET order_by_clause = 'ORDER BY metric_value DESC';
  END IF;

  -- Create temp table name (temp tables cannot be qualified with project name)
  SET result_table_name = CONCAT('_temp_query_results_',
    REPLACE(REPLACE(GENERATE_UUID(), '-', '_'), '.', '_')
  );

  -- Debug: Check for NULL variables before FORMAT
  IF result_table_name IS NULL THEN
    RAISE USING MESSAGE = 'result_table_name is NULL';
  END IF;
  IF select_fields IS NULL THEN
    RAISE USING MESSAGE = 'select_fields is NULL';
  END IF;
  IF where_clause IS NULL THEN
    RAISE USING MESSAGE = 'where_clause is NULL';
  END IF;
  IF order_by_clause IS NULL THEN
    RAISE USING MESSAGE = 'order_by_clause is NULL';
  END IF;

  -- Build main query
  SET sql_query = FORMAT("""
    CREATE TEMP TABLE %s AS
    SELECT %s
    FROM `fdsanalytics.restaurant_analytics.metrics` m
    JOIN `fdsanalytics.restaurant_analytics.reports` r
      ON m.report_id = r.report_id
    %s
    %s
    %s
    LIMIT @max_rows
  """,
    result_table_name,
    select_fields,
    where_clause,
    group_by_clause,
    order_by_clause
  );

  -- Execute query with parameters
  EXECUTE IMMEDIATE sql_query
  USING
    start_date AS start_date,
    end_date AS end_date,
    metric_name AS metric_name,
    primary_category AS primary_category,
    subcategory AS subcategory,
    item_name AS item_name,
    max_rows AS max_rows;

  -- If baseline comparison requested, add comparison columns
  IF has_baseline THEN
    -- Create baseline temp table (temp tables cannot be qualified with project name)
    SET baseline_table = CONCAT('_temp_baseline_',
      REPLACE(REPLACE(GENERATE_UUID(), '-', '_'), '.', '_')
    );

    -- Build baseline query (same filters, different date range)
    SET baseline_query = FORMAT("""
      CREATE TEMP TABLE %s AS
      SELECT %s
      FROM `fdsanalytics.restaurant_analytics.metrics` m
      JOIN `fdsanalytics.restaurant_analytics.reports` r
        ON m.report_id = r.report_id
      WHERE r.report_date BETWEEN @baseline_start AND @baseline_end
        AND m.metric_name = @metric_name
        %s
      %s
    """,
      baseline_table,
      REPLACE(select_fields, ' as metric_value', ' as baseline_value'),
      CASE
        WHEN primary_category IS NOT NULL THEN ' AND m.primary_category = @primary_category'
        ELSE ''
      END || CASE
        WHEN subcategory IS NOT NULL THEN ' AND JSON_EXTRACT_SCALAR(m.dimensions, "$.category") = @subcategory'
        ELSE ''
      END || CASE
        WHEN item_name IS NOT NULL THEN ' AND JSON_EXTRACT_SCALAR(m.dimensions, "$.item_name") = @item_name'
        ELSE ''
      END,
      group_by_clause
    );

    -- Execute baseline query
    EXECUTE IMMEDIATE baseline_query
    USING
      baseline_start_date AS baseline_start,
      baseline_end_date AS baseline_end,
      metric_name AS metric_name,
      primary_category AS primary_category,
      subcategory AS subcategory,
      item_name AS item_name;

    -- Join main results with baseline and add comparison metrics
    SET final_table = result_table_name || '_with_comparison';

    -- Build JOIN ON clause based on grouping
    IF STRPOS(group_by_fields, 'date') > 0 THEN
      SET join_on_clause = 'curr.report_date = base.report_date';
    END IF;
    IF STRPOS(group_by_fields, 'category') > 0 THEN
      SET join_on_clause = CASE WHEN join_on_clause = '1=1' THEN '' ELSE join_on_clause || ' AND ' END ||
        'curr.primary_category = base.primary_category';
    END IF;
    -- Add more join conditions as needed

    EXECUTE IMMEDIATE FORMAT("""
      CREATE TEMP TABLE %s AS
      SELECT
        curr.*,
        base.baseline_value,
        (curr.metric_value - COALESCE(base.baseline_value, 0)) as change_amount,
        SAFE_DIVIDE(
          (curr.metric_value - COALESCE(base.baseline_value, 0)),
          COALESCE(base.baseline_value, curr.metric_value)
        ) * 100 as percent_change
      FROM %s curr
      LEFT JOIN %s base ON %s
    """, final_table, result_table_name, baseline_table, join_on_clause);

    -- Update result table name to final table
    SET result_table_name = final_table;
  END IF;

END;
