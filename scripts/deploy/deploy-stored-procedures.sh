#!/bin/bash
# Deploy BigQuery Stored Procedures

set -e

PROJECT_ID="fdsanalytics"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SQL_DIR="${SCRIPT_DIR}/../../sql/stored-procedures"
INSIGHTS_SQL_DIR="${SCRIPT_DIR}/../../sql/insights"

echo "🗄️  Deploying BigQuery Stored Procedures..."
echo ""

# Deploy restaurant_analytics procedures
echo "📦 Deploying restaurant_analytics procedures..."

echo "  📝 Deploying query_metrics..."
bq query \
  --project_id="${PROJECT_ID}" \
  --use_legacy_sql=false \
  < "${SQL_DIR}/query_metrics.sql"

echo "  📝 Deploying get_forecast..."
bq query \
  --project_id="${PROJECT_ID}" \
  --use_legacy_sql=false \
  < "${SQL_DIR}/get_forecast.sql"

echo "  📝 Deploying get_anomalies..."
bq query \
  --project_id="${PROJECT_ID}" \
  --use_legacy_sql=false \
  < "${SQL_DIR}/get_anomalies.sql"

echo ""
echo "📦 Deploying insights procedures..."

echo "  📝 Deploying sp_check_insights_coverage..."
bq query \
  --project_id="${PROJECT_ID}" \
  --use_legacy_sql=false \
  < "${INSIGHTS_SQL_DIR}/sp_check_insights_coverage.sql"

echo "  📝 Deploying sp_get_daily_summary..."
bq query \
  --project_id="${PROJECT_ID}" \
  --use_legacy_sql=false \
  < "${INSIGHTS_SQL_DIR}/sp_get_daily_summary.sql"

echo "  📝 Deploying sp_get_category_trends..."
bq query \
  --project_id="${PROJECT_ID}" \
  --use_legacy_sql=false \
  < "${INSIGHTS_SQL_DIR}/sp_get_category_trends.sql"

echo "  📝 Deploying sp_get_top_items_from_insights..."
bq query \
  --project_id="${PROJECT_ID}" \
  --use_legacy_sql=false \
  < "${INSIGHTS_SQL_DIR}/sp_get_top_items_from_insights.sql"

# Verify procedures
echo ""
echo "✅ All procedures deployed successfully!"
echo ""
echo "Verifying..."
echo "restaurant_analytics procedures:"
bq ls --project_id="${PROJECT_ID}" --routines restaurant_analytics

echo ""
echo "insights procedures:"
bq ls --project_id="${PROJECT_ID}" --routines insights
