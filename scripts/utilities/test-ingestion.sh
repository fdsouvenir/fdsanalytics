#!/bin/bash
# Manually trigger Gmail ingestion

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
TOPIC="gmail-ingestion-trigger"

echo -e "${BLUE}==========================================${NC}"
echo -e "${BLUE}  Manual Ingestion Trigger${NC}"
echo -e "${BLUE}==========================================${NC}"
echo ""

# Check prerequisites
if ! command -v gcloud &> /dev/null; then
  echo -e "${RED}Error: gcloud CLI not installed${NC}"
  exit 1
fi

echo -e "${YELLOW}Project ID: ${PROJECT_ID}${NC}"
echo -e "${YELLOW}Topic: ${TOPIC}${NC}"
echo ""

# Trigger ingestion
echo -e "${GREEN}Publishing message to Pub/Sub topic...${NC}"
gcloud pubsub topics publish "${TOPIC}" \
  --message='{"action":"ingest_new"}' \
  --project="${PROJECT_ID}" || {
  echo -e "${RED}Failed to publish message${NC}"
  exit 1
}

echo ""
echo -e "${GREEN}Ingestion triggered successfully!${NC}"
echo ""
echo -e "${YELLOW}To view logs:${NC}"
echo "gcloud functions logs read gmail-ingestion --gen2 --region=${REGION} --project=${PROJECT_ID} --limit=50"
echo ""
echo -e "${YELLOW}Or use the check-logs utility:${NC}"
echo "./scripts/utilities/check-logs.sh gmail-ingestion"
