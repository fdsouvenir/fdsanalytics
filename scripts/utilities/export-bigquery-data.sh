#!/bin/bash
# Export BigQuery data to Cloud Storage for backup

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
PROJECT_ID="${PROJECT_ID:-fdsanalytics}"
BACKUP_BUCKET="${BACKUP_BUCKET:-gs://fdsanalytics-backups}"
DATE=$(date +%Y%m%d-%H%M%S)

# Datasets to backup
DATASETS=("restaurant_analytics" "insights" "chat_history" "ingestion")

echo -e "${BLUE}==========================================${NC}"
echo -e "${BLUE}  BigQuery Data Export${NC}"
echo -e "${BLUE}==========================================${NC}"
echo ""

# Check prerequisites
if ! command -v bq &> /dev/null; then
  echo -e "${RED}Error: bq CLI not installed${NC}"
  exit 1
fi

if ! command -v gsutil &> /dev/null; then
  echo -e "${RED}Error: gsutil CLI not installed${NC}"
  exit 1
fi

echo -e "${YELLOW}Project ID: ${PROJECT_ID}${NC}"
echo -e "${YELLOW}Backup location: ${BACKUP_BUCKET}${NC}"
echo -e "${YELLOW}Timestamp: ${DATE}${NC}"
echo ""

# Check if bucket exists, create if not
if ! gsutil ls "${BACKUP_BUCKET}" &>/dev/null; then
  echo -e "${YELLOW}Backup bucket doesn't exist. Create it? (y/n)${NC}"
  read -r RESPONSE
  if [[ "$RESPONSE" =~ ^[Yy]$ ]]; then
    echo -e "${GREEN}Creating bucket...${NC}"
    gsutil mb -p "${PROJECT_ID}" "${BACKUP_BUCKET}"
  else
    echo -e "${RED}Backup cancelled${NC}"
    exit 1
  fi
fi

# Export each dataset
for DATASET in "${DATASETS[@]}"; do
  echo -e "${BLUE}--- Exporting ${DATASET} ---${NC}"

  # Get list of tables in dataset
  TABLES=$(bq ls --project_id="${PROJECT_ID}" --format=json "${DATASET}" | jq -r '.[].tableReference.tableId')

  if [ -z "${TABLES}" ]; then
    echo -e "${YELLOW}No tables found in ${DATASET}${NC}"
    continue
  fi

  # Export each table
  for TABLE in ${TABLES}; do
    echo -e "${GREEN}Exporting ${DATASET}.${TABLE}${NC}"

    DESTINATION="${BACKUP_BUCKET}/${DATE}/${DATASET}/${TABLE}/*.parquet"

    bq extract \
      --project_id="${PROJECT_ID}" \
      --destination_format=PARQUET \
      "${DATASET}.${TABLE}" \
      "${DESTINATION}" || {
      echo -e "${RED}Failed to export ${DATASET}.${TABLE}${NC}"
    }
  done
  echo ""
done

echo -e "${BLUE}==========================================${NC}"
echo -e "${GREEN}Export complete!${NC}"
echo -e "${BLUE}==========================================${NC}"
echo ""
echo -e "${GREEN}Backup location: ${BACKUP_BUCKET}/${DATE}${NC}"
echo ""
echo -e "${YELLOW}To restore a table:${NC}"
echo "bq load --source_format=PARQUET DATASET.TABLE ${BACKUP_BUCKET}/${DATE}/DATASET/TABLE/*.parquet"
