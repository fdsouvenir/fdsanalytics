#!/bin/bash
# Deploy Gmail Ingestion to Cloud Functions Gen2

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
FUNCTION_NAME="gmail-ingestion"
SERVICE_ACCOUNT="${FUNCTION_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"
TRIGGER_TOPIC="gmail-ingestion-trigger"

echo -e "${BLUE}==========================================${NC}"
echo -e "${BLUE}  Deploying Gmail Ingestion${NC}"
echo -e "${BLUE}==========================================${NC}"
echo ""

# Check prerequisites
if ! command -v gcloud &> /dev/null; then
  echo -e "${RED}Error: gcloud CLI not installed${NC}"
  exit 1
fi

echo -e "${YELLOW}Project ID: ${PROJECT_ID}${NC}"
echo -e "${YELLOW}Region: ${REGION}${NC}"
echo -e "${YELLOW}Function: ${FUNCTION_NAME}${NC}"
echo ""

# Navigate to service directory
SERVICE_DIR="$(cd "$(dirname "$0")/../../services/${FUNCTION_NAME}" && pwd)"
cd "${SERVICE_DIR}"

# Verify Pub/Sub topic exists
echo -e "${GREEN}Verifying Pub/Sub topic...${NC}"
if ! gcloud pubsub topics describe "${TRIGGER_TOPIC}" --project="${PROJECT_ID}" &>/dev/null; then
  echo -e "${YELLOW}Creating Pub/Sub topic: ${TRIGGER_TOPIC}${NC}"
  gcloud pubsub topics create "${TRIGGER_TOPIC}" --project="${PROJECT_ID}"
fi

# Deploy to Cloud Functions Gen2
echo -e "${GREEN}Deploying to Cloud Functions Gen2...${NC}"
gcloud functions deploy "${FUNCTION_NAME}" \
  --gen2 \
  --runtime=nodejs20 \
  --region="${REGION}" \
  --source=. \
  --entry-point=ingestReports \
  --trigger-topic="${TRIGGER_TOPIC}" \
  --service-account="${SERVICE_ACCOUNT}" \
  --memory=512MB \
  --timeout=540s \
  --min-instances=0 \
  --max-instances=1 \
  --set-env-vars="PROJECT_ID=${PROJECT_ID},REGION=${REGION},ENVIRONMENT=production,LOG_LEVEL=info" \
  --set-secrets="GEMINI_API_KEY=GEMINI_API_KEY:latest,GMAIL_OAUTH_CREDENTIALS=GMAIL_OAUTH_CREDENTIALS:latest" \
  --project="${PROJECT_ID}" || {
  echo -e "${RED}Deployment failed${NC}"
  exit 1
}

# Get function details
FUNCTION_URL=$(gcloud functions describe "${FUNCTION_NAME}" \
  --gen2 \
  --region="${REGION}" \
  --project="${PROJECT_ID}" \
  --format='value(serviceConfig.uri)' 2>/dev/null || echo "N/A")

echo ""
echo -e "${BLUE}==========================================${NC}"
echo -e "${GREEN}Deployment complete!${NC}"
echo -e "${BLUE}==========================================${NC}"
echo ""
echo -e "${GREEN}Function: ${FUNCTION_NAME}${NC}"
echo -e "${GREEN}Trigger: Pub/Sub topic '${TRIGGER_TOPIC}'${NC}"
echo ""
echo -e "${YELLOW}To manually trigger ingestion:${NC}"
echo "gcloud pubsub topics publish ${TRIGGER_TOPIC} --message='{\"action\":\"ingest_new\"}' --project=${PROJECT_ID}"
echo ""
echo -e "${YELLOW}To view logs:${NC}"
echo "gcloud functions logs read ${FUNCTION_NAME} --gen2 --region=${REGION} --project=${PROJECT_ID} --limit=50"
