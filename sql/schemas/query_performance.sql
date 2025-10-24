-- Query Performance Analytics Table
-- Tracks query execution metrics for optimization and monitoring

CREATE TABLE IF NOT EXISTS `fdsanalytics.insights.query_performance` (
  -- Identification
  query_id STRING NOT NULL,
  tenant_id STRING NOT NULL,
  user_id STRING,

  -- Query details
  tool_name STRING NOT NULL,
  metric_name STRING,
  aggregation STRING,

  -- Filters applied
  primary_category STRING,
  subcategory STRING,
  item_name STRING,

  -- Timeframe
  start_date DATE,
  end_date DATE,
  days_in_range INT64,

  -- Grouping and ordering
  group_by_fields STRING,  -- Comma-separated
  order_by_field STRING,
  order_direction STRING,
  limit_rows INT64,

  -- Performance metrics
  execution_time_ms INT64 NOT NULL,
  rows_returned INT64 NOT NULL,
  bytes_scanned INT64,

  -- Results
  result_status STRING NOT NULL,  -- 'success', 'error', 'timeout', 'empty'
  error_message STRING,

  -- Timestamps
  query_timestamp TIMESTAMP NOT NULL,

  -- Partitioning for performance
  _partition_date DATE NOT NULL
)
PARTITION BY _partition_date
CLUSTER BY tenant_id, tool_name, result_status
OPTIONS(
  description="Query performance analytics for MCP tools",
  labels=[("purpose", "analytics"), ("component", "mcp-server")]
);

-- Index for common queries
CREATE INDEX IF NOT EXISTS idx_tenant_tool_date
ON `fdsanalytics.insights.query_performance`(tenant_id, tool_name, query_timestamp DESC);

-- Create view for performance analysis
CREATE OR REPLACE VIEW `fdsanalytics.insights.query_performance_summary` AS
SELECT
  tenant_id,
  tool_name,
  DATE(query_timestamp) as query_date,

  -- Performance metrics
  COUNT(*) as total_queries,
  COUNTIF(result_status = 'success') as successful_queries,
  COUNTIF(result_status = 'error') as failed_queries,
  COUNTIF(result_status = 'timeout') as timeout_queries,
  COUNTIF(result_status = 'empty') as empty_result_queries,

  -- Execution time stats
  AVG(execution_time_ms) as avg_execution_time_ms,
  APPROX_QUANTILES(execution_time_ms, 100)[OFFSET(50)] as p50_execution_time_ms,
  APPROX_QUANTILES(execution_time_ms, 100)[OFFSET(95)] as p95_execution_time_ms,
  APPROX_QUANTILES(execution_time_ms, 100)[OFFSET(99)] as p99_execution_time_ms,
  MAX(execution_time_ms) as max_execution_time_ms,

  -- Result size stats
  AVG(rows_returned) as avg_rows_returned,
  MAX(rows_returned) as max_rows_returned,
  SUM(bytes_scanned) as total_bytes_scanned,

  -- Most common query patterns
  APPROX_TOP_COUNT(metric_name, 5) as top_metrics,
  APPROX_TOP_COUNT(primary_category, 5) as top_categories,
  APPROX_TOP_COUNT(CONCAT(CAST(days_in_range AS STRING), ' days')) as top_date_ranges

FROM `fdsanalytics.insights.query_performance`
WHERE query_timestamp >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 30 DAY)
GROUP BY tenant_id, tool_name, query_date
ORDER BY query_date DESC, total_queries DESC;

-- Create view for slow queries
CREATE OR REPLACE VIEW `fdsanalytics.insights.slow_queries` AS
SELECT
  query_id,
  tenant_id,
  user_id,
  tool_name,
  metric_name,
  primary_category,
  subcategory,
  start_date,
  end_date,
  days_in_range,
  group_by_fields,
  execution_time_ms,
  rows_returned,
  query_timestamp
FROM `fdsanalytics.insights.query_performance`
WHERE
  result_status = 'success'
  AND execution_time_ms > 5000  -- Queries taking more than 5 seconds
  AND query_timestamp >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 7 DAY)
ORDER BY execution_time_ms DESC
LIMIT 100;

-- Grant permissions
GRANT SELECT ON TABLE `fdsanalytics.insights.query_performance` TO 'serviceAccount:mcp-server@fdsanalytics.iam.gserviceaccount.com';
GRANT INSERT ON TABLE `fdsanalytics.insights.query_performance` TO 'serviceAccount:mcp-server@fdsanalytics.iam.gserviceaccount.com';
GRANT SELECT ON VIEW `fdsanalytics.insights.query_performance_summary` TO 'serviceAccount:response-engine@fdsanalytics.iam.gserviceaccount.com';
GRANT SELECT ON VIEW `fdsanalytics.insights.slow_queries` TO 'serviceAccount:response-engine@fdsanalytics.iam.gserviceaccount.com';
