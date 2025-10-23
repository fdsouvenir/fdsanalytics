#!/bin/bash
# Cleanup Test Data
# Removes all test data from BigQuery datasets

set -e

PROJECT_ID="${PROJECT_ID:-fdsanalytics-test}"

echo "Cleaning up test data for project: $PROJECT_ID"
echo "WARNING: This will delete all data in the test datasets!"
read -p "Are you sure? (yes/no): " confirm

if [ "$confirm" != "yes" ]; then
  echo "Cleanup cancelled."
  exit 0
fi

# Delete data from all test tables
echo "Deleting data from restaurant_analytics.reports..."
bq query --use_legacy_sql=false --project_id=$PROJECT_ID "DELETE FROM \`${PROJECT_ID}.restaurant_analytics.reports\` WHERE TRUE"

echo "Deleting data from restaurant_analytics.metrics..."
bq query --use_legacy_sql=false --project_id=$PROJECT_ID "DELETE FROM \`${PROJECT_ID}.restaurant_analytics.metrics\` WHERE TRUE"

echo "Deleting data from chat_history.conversations..."
bq query --use_legacy_sql=false --project_id=$PROJECT_ID "DELETE FROM \`${PROJECT_ID}.chat_history.conversations\` WHERE TRUE"

echo "Deleting data from insights.daily_comparisons..."
bq query --use_legacy_sql=false --project_id=$PROJECT_ID "DELETE FROM \`${PROJECT_ID}.insights.daily_comparisons\` WHERE TRUE"

echo "Deleting data from insights.category_trends..."
bq query --use_legacy_sql=false --project_id=$PROJECT_ID "DELETE FROM \`${PROJECT_ID}.insights.category_trends\` WHERE TRUE"

echo "Deleting data from insights.top_items..."
bq query --use_legacy_sql=false --project_id=$PROJECT_ID "DELETE FROM \`${PROJECT_ID}.insights.top_items\` WHERE TRUE"

echo "Deleting data from insights.daily_forecast..."
bq query --use_legacy_sql=false --project_id=$PROJECT_ID "DELETE FROM \`${PROJECT_ID}.insights.daily_forecast\` WHERE TRUE"

echo "Deleting data from ingestion.ingestion_log..."
bq query --use_legacy_sql=false --project_id=$PROJECT_ID "DELETE FROM \`${PROJECT_ID}.ingestion.ingestion_log\` WHERE TRUE" || echo "Ingestion log table might not exist"

echo ""
echo "Test data cleanup complete!"
echo "Run './seed-test-data.sh' to re-populate test data."
