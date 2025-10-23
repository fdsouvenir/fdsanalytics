#!/bin/bash
# Deploy BigQuery Stored Procedures

set -e

PROJECT_ID="fdsanalytics"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SQL_DIR="${SCRIPT_DIR}/../../sql/stored-procedures"

echo "🗄️  Deploying BigQuery Stored Procedures..."

# Deploy query_metrics
echo "📝 Deploying query_metrics..."
bq query \
  --project_id="${PROJECT_ID}" \
  --use_legacy_sql=false \
  < "${SQL_DIR}/query_metrics.sql"

# Deploy get_forecast
echo "📝 Deploying get_forecast..."
bq query \
  --project_id="${PROJECT_ID}" \
  --use_legacy_sql=false \
  < "${SQL_DIR}/get_forecast.sql"

# Deploy get_anomalies
echo "📝 Deploying get_anomalies..."
bq query \
  --project_id="${PROJECT_ID}" \
  --use_legacy_sql=false \
  < "${SQL_DIR}/get_anomalies.sql"

# Verify procedures
echo ""
echo "✅ Procedures deployed successfully!"
echo ""
echo "Verifying..."
echo "restaurant_analytics procedures:"
bq ls --project_id="${PROJECT_ID}" --routines restaurant_analytics

echo ""
echo "insights procedures:"
bq ls --project_id="${PROJECT_ID}" --routines insights
