-- Migration: Create All Stored Procedures
-- Version: 1.0
-- Purpose: Deploy all stored procedures for MCP server
-- Run: bq query --project_id=fdsanalytics --use_legacy_sql=false < 001_create_procedures.sql

-- Procedure 1: query_metrics
-- (Include the full procedure from query_metrics.sql)
SOURCE query_metrics.sql;

-- Procedure 2: get_forecast
-- (Include the full procedure from get_forecast.sql)
SOURCE get_forecast.sql;

-- Procedure 3: get_anomalies
-- (Include the full procedure from get_anomalies.sql)
SOURCE get_anomalies.sql;

-- Verify procedures were created
SELECT
  routine_name,
  routine_type,
  created
FROM `fdsanalytics.restaurant_analytics.INFORMATION_SCHEMA.ROUTINES`
WHERE routine_name IN ('query_metrics')
UNION ALL
SELECT
  routine_name,
  routine_type,
  created
FROM `fdsanalytics.insights.INFORMATION_SCHEMA.ROUTINES`
WHERE routine_name IN ('get_forecast', 'get_anomalies');
