#!/bin/bash
# Create BigQuery datasets

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
PROJECT_ID="${PROJECT_ID:-fdsanalytics}"
REGION="${REGION:-us-central1}"

# Datasets to create
declare -A DATASETS=(
  ["restaurant_analytics"]="Raw restaurant data from PMIX reports"
  ["insights"]="Pre-computed analytics and insights"
  ["chat_history"]="Conversation history and context"
  ["ingestion"]="Ingestion logs and metadata"
)

echo -e "${BLUE}==========================================${NC}"
echo -e "${BLUE}  Creating BigQuery Datasets${NC}"
echo -e "${BLUE}==========================================${NC}"
echo ""

# Check prerequisites
if ! command -v bq &> /dev/null; then
  echo -e "${RED}Error: bq CLI not installed${NC}"
  exit 1
fi

echo -e "${YELLOW}Project ID: ${PROJECT_ID}${NC}"
echo -e "${YELLOW}Region: ${REGION}${NC}"
echo ""

CREATED_COUNT=0
SKIPPED_COUNT=0

for DATASET in "${!DATASETS[@]}"; do
  DESCRIPTION="${DATASETS[$DATASET]}"

  # Check if dataset exists
  if bq ls --project_id="${PROJECT_ID}" | grep -q "${DATASET}"; then
    echo -e "${YELLOW}Dataset already exists: ${DATASET}${NC}"
    SKIPPED_COUNT=$((SKIPPED_COUNT + 1))
  else
    echo -e "${GREEN}Creating dataset: ${DATASET}${NC}"
    bq mk \
      --project_id="${PROJECT_ID}" \
      --location="${REGION}" \
      --description="${DESCRIPTION}" \
      "${DATASET}"
    CREATED_COUNT=$((CREATED_COUNT + 1))
  fi
done

echo ""
echo -e "${BLUE}==========================================${NC}"
echo -e "${GREEN}Summary:${NC}"
echo -e "${GREEN}  Created: ${CREATED_COUNT}${NC}"
echo -e "${YELLOW}  Skipped (already exist): ${SKIPPED_COUNT}${NC}"
echo -e "${BLUE}==========================================${NC}"
echo ""
echo -e "${GREEN}Next step: Run ./scripts/deploy/deploy-stored-procedures.sh${NC}"
