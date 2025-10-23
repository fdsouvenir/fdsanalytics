#!/bin/bash
# Setup Test BigQuery Dataset
# Creates test datasets and tables for integration testing

set -e

PROJECT_ID="${PROJECT_ID:-fdsanalytics-test}"
REGION="us-central1"

echo "Setting up test BigQuery dataset for project: $PROJECT_ID"

# Create test datasets
echo "Creating test datasets..."
bq mk --location=$REGION --dataset ${PROJECT_ID}:restaurant_analytics || echo "Dataset restaurant_analytics already exists"
bq mk --location=$REGION --dataset ${PROJECT_ID}:insights || echo "Dataset insights already exists"
bq mk --location=$REGION --dataset ${PROJECT_ID}:ingestion || echo "Dataset ingestion already exists"
bq mk --location=$REGION --dataset ${PROJECT_ID}:chat_history || echo "Dataset chat_history already exists"

# Create reports table
echo "Creating reports table..."
bq query --use_legacy_sql=false --project_id=$PROJECT_ID <<EOF
CREATE TABLE IF NOT EXISTS \`${PROJECT_ID}.restaurant_analytics.reports\` (
  report_id STRING NOT NULL,
  report_date DATE NOT NULL,
  business_date DATE NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP(),
  pdf_filename STRING,
  report_type STRING,
  location_name STRING,
  location_id STRING,
  start_time TIMESTAMP,
  end_time TIMESTAMP,
  source STRING DEFAULT 'test',
  schema_version STRING DEFAULT '1.0'
)
PARTITION BY report_date
OPTIONS(
  description="Test PMIX reports metadata"
);
EOF

# Create metrics table
echo "Creating metrics table..."
bq query --use_legacy_sql=false --project_id=$PROJECT_ID <<EOF
CREATE TABLE IF NOT EXISTS \`${PROJECT_ID}.restaurant_analytics.metrics\` (
  metric_id STRING NOT NULL,
  report_id STRING NOT NULL,
  metric_name STRING NOT NULL,
  metric_value STRING NOT NULL,
  primary_category STRING,
  dimensions JSON,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP()
)
PARTITION BY DATE(created_at)
OPTIONS(
  description="Test line-item metrics from reports"
);
EOF

# Create conversations table
echo "Creating conversations table..."
bq query --use_legacy_sql=false --project_id=$PROJECT_ID <<EOF
CREATE TABLE IF NOT EXISTS \`${PROJECT_ID}.chat_history.conversations\` (
  message_id STRING NOT NULL,
  workspace_id STRING NOT NULL,
  thread_id STRING,
  user_id STRING NOT NULL,
  message_text STRING NOT NULL,
  message_type STRING NOT NULL,
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP()
)
PARTITION BY DATE(timestamp)
OPTIONS(
  description="Test conversation history"
);
EOF

# Create insights tables
echo "Creating daily_comparisons table..."
bq query --use_legacy_sql=false --project_id=$PROJECT_ID <<EOF
CREATE TABLE IF NOT EXISTS \`${PROJECT_ID}.insights.daily_comparisons\` (
  report_date DATE NOT NULL,
  day_of_week STRING NOT NULL,
  total_sales FLOAT64,
  avg_for_day_of_week FLOAT64,
  deviation_percent FLOAT64,
  is_anomaly BOOL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP()
)
PARTITION BY report_date
OPTIONS(
  description="Test day-of-week comparisons with anomaly detection"
);
EOF

echo "Creating category_trends table..."
bq query --use_legacy_sql=false --project_id=$PROJECT_ID <<EOF
CREATE TABLE IF NOT EXISTS \`${PROJECT_ID}.insights.category_trends\` (
  primary_category STRING NOT NULL,
  current_week_sales FLOAT64,
  last_week_sales FLOAT64,
  percent_change FLOAT64,
  trend_direction STRING,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP()
)
OPTIONS(
  description="Test week-over-week category trends"
);
EOF

echo "Creating top_items table..."
bq query --use_legacy_sql=false --project_id=$PROJECT_ID <<EOF
CREATE TABLE IF NOT EXISTS \`${PROJECT_ID}.insights.top_items\` (
  primary_category STRING NOT NULL,
  item_name STRING NOT NULL,
  total_sales FLOAT64,
  total_quantity INT64,
  rank INT64,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP()
)
OPTIONS(
  description="Test top 10 items per category"
);
EOF

echo "Creating daily_forecast table..."
bq query --use_legacy_sql=false --project_id=$PROJECT_ID <<EOF
CREATE TABLE IF NOT EXISTS \`${PROJECT_ID}.insights.daily_forecast\` (
  forecast_date DATE NOT NULL,
  predicted_sales FLOAT64,
  lower_bound FLOAT64,
  upper_bound FLOAT64,
  confidence_level STRING,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP()
)
PARTITION BY forecast_date
OPTIONS(
  description="Test 7-day sales forecasts"
);
EOF

# Create ingestion log table
echo "Creating ingestion_log table..."
bq query --use_legacy_sql=false --project_id=$PROJECT_ID <<EOF
CREATE TABLE IF NOT EXISTS \`${PROJECT_ID}.ingestion.ingestion_log\` (
  ingestion_id STRING NOT NULL,
  message_id STRING NOT NULL,
  status STRING NOT NULL,
  report_date DATE,
  filename STRING,
  error_message STRING,
  retry_count INT64 DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP(),
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP()
)
PARTITION BY DATE(created_at)
OPTIONS(
  description="Test ingestion processing log"
);
EOF

echo ""
echo "Test BigQuery dataset setup complete!"
echo "Project: $PROJECT_ID"
echo "Datasets: restaurant_analytics, insights, ingestion, chat_history"
echo ""
echo "Run './seed-test-data.sh' to populate with test data."
