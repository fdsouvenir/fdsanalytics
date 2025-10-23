#!/bin/bash
# Setup Cloud Scheduler jobs

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
TIMEZONE="${TIMEZONE:-America/Chicago}"

echo -e "${BLUE}==========================================${NC}"
echo -e "${BLUE}  Setting up Cloud Scheduler${NC}"
echo -e "${BLUE}==========================================${NC}"
echo ""

# Check prerequisites
if ! command -v gcloud &> /dev/null; then
  echo -e "${RED}Error: gcloud CLI not installed${NC}"
  exit 1
fi

echo -e "${YELLOW}Project ID: ${PROJECT_ID}${NC}"
echo -e "${YELLOW}Region: ${REGION}${NC}"
echo -e "${YELLOW}Timezone: ${TIMEZONE}${NC}"
echo ""

# Create Pub/Sub topic for gmail-ingestion if it doesn't exist
TOPIC_NAME="gmail-ingestion-trigger"
echo -e "${GREEN}Checking Pub/Sub topic: ${TOPIC_NAME}${NC}"
if gcloud pubsub topics describe "${TOPIC_NAME}" --project="${PROJECT_ID}" &>/dev/null; then
  echo -e "${YELLOW}Topic already exists: ${TOPIC_NAME}${NC}"
else
  echo -e "${GREEN}Creating Pub/Sub topic: ${TOPIC_NAME}${NC}"
  gcloud pubsub topics create "${TOPIC_NAME}" --project="${PROJECT_ID}"
fi
echo ""

# Create Cloud Scheduler job for daily ingestion
JOB_NAME="gmail-ingestion-daily"
echo -e "${GREEN}Checking Cloud Scheduler job: ${JOB_NAME}${NC}"
if gcloud scheduler jobs describe "${JOB_NAME}" --location="${REGION}" --project="${PROJECT_ID}" &>/dev/null; then
  echo -e "${YELLOW}Job already exists: ${JOB_NAME}${NC}"
  echo -e "${YELLOW}Do you want to update it? (y/n)${NC}"
  read -r RESPONSE
  if [[ "$RESPONSE" =~ ^[Yy]$ ]]; then
    echo -e "${GREEN}Updating Cloud Scheduler job: ${JOB_NAME}${NC}"
    gcloud scheduler jobs update pubsub "${JOB_NAME}" \
      --location="${REGION}" \
      --schedule="0 3 * * *" \
      --time-zone="${TIMEZONE}" \
      --topic="${TOPIC_NAME}" \
      --message-body='{"action":"ingest_new"}' \
      --project="${PROJECT_ID}"
  fi
else
  echo -e "${GREEN}Creating Cloud Scheduler job: ${JOB_NAME}${NC}"
  gcloud scheduler jobs create pubsub "${JOB_NAME}" \
    --location="${REGION}" \
    --schedule="0 3 * * *" \
    --time-zone="${TIMEZONE}" \
    --topic="${TOPIC_NAME}" \
    --message-body='{"action":"ingest_new"}' \
    --description="Trigger daily Gmail ingestion at 3am CT" \
    --project="${PROJECT_ID}"
fi
echo ""

echo -e "${BLUE}==========================================${NC}"
echo -e "${GREEN}Cloud Scheduler setup complete!${NC}"
echo -e "${BLUE}==========================================${NC}"
echo ""
echo -e "${YELLOW}To manually trigger the job:${NC}"
echo "gcloud scheduler jobs run ${JOB_NAME} --location=${REGION} --project=${PROJECT_ID}"
echo ""
echo -e "${YELLOW}To view job status:${NC}"
echo "gcloud scheduler jobs describe ${JOB_NAME} --location=${REGION} --project=${PROJECT_ID}"
echo ""
echo -e "${GREEN}Setup complete! Ready for deployment.${NC}"
