#!/bin/bash
# Deploy Conversation Manager to Cloud Run

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
SERVICE_NAME="conversation-manager"
SERVICE_ACCOUNT="${SERVICE_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"
IMAGE="gcr.io/${PROJECT_ID}/${SERVICE_NAME}:latest"

echo -e "${BLUE}==========================================${NC}"
echo -e "${BLUE}  Deploying Conversation Manager${NC}"
echo -e "${BLUE}==========================================${NC}"
echo ""

# Check prerequisites
if ! command -v gcloud &> /dev/null; then
  echo -e "${RED}Error: gcloud CLI not installed${NC}"
  exit 1
fi

if ! command -v docker &> /dev/null; then
  echo -e "${RED}Error: Docker not installed${NC}"
  exit 1
fi

echo -e "${YELLOW}Project ID: ${PROJECT_ID}${NC}"
echo -e "${YELLOW}Region: ${REGION}${NC}"
echo -e "${YELLOW}Service: ${SERVICE_NAME}${NC}"
echo ""

# Navigate to service directory
SERVICE_DIR="$(cd "$(dirname "$0")/../../services/${SERVICE_NAME}" && pwd)"
cd "${SERVICE_DIR}"

# Build Docker image for AMD64 (Cloud Run architecture)
echo -e "${GREEN}Building Docker image for AMD64...${NC}"
docker buildx build --platform linux/amd64 -t "${IMAGE}" --push . || {
  echo -e "${RED}Docker build failed${NC}"
  exit 1
}

echo -e "${GREEN}Image built and pushed successfully${NC}"

# Deploy to Cloud Run
echo -e "${GREEN}Deploying to Cloud Run...${NC}"
gcloud run deploy "${SERVICE_NAME}" \
  --image="${IMAGE}" \
  --region="${REGION}" \
  --platform=managed \
  --service-account="${SERVICE_ACCOUNT}" \
  --memory=256Mi \
  --cpu=1 \
  --timeout=30s \
  --min-instances=0 \
  --max-instances=10 \
  --concurrency=10 \
  --ingress=all \
  --no-allow-unauthenticated \
  --set-env-vars="PROJECT_ID=${PROJECT_ID},REGION=${REGION},ENVIRONMENT=production,LOG_LEVEL=info" \
  --set-secrets="GEMINI_API_KEY=GEMINI_API_KEY:latest" \
  --project="${PROJECT_ID}" || {
  echo -e "${RED}Deployment failed${NC}"
  exit 1
}

# Get service URL
SERVICE_URL=$(gcloud run services describe "${SERVICE_NAME}" \
  --region="${REGION}" \
  --project="${PROJECT_ID}" \
  --format='value(status.url)')

echo ""
echo -e "${BLUE}==========================================${NC}"
echo -e "${GREEN}Deployment complete!${NC}"
echo -e "${BLUE}==========================================${NC}"
echo ""
echo -e "${GREEN}Service URL (internal only): ${SERVICE_URL}${NC}"
echo ""
echo -e "${YELLOW}Note: This service is internal-only and requires IAM authentication.${NC}"
