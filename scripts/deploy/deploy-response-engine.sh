#!/bin/bash
# Deploy Response Engine to Cloud Run

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
SERVICE_NAME="response-engine"
SERVICE_ACCOUNT="${SERVICE_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"
IMAGE="gcr.io/${PROJECT_ID}/${SERVICE_NAME}:latest"

echo -e "${BLUE}==========================================${NC}"
echo -e "${BLUE}  Deploying Response Engine${NC}"
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

# Navigate to repository root (for monorepo build context)
REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "${REPO_ROOT}"

# Build Docker image for AMD64 (Cloud Run architecture)
echo -e "${GREEN}Building Docker image for AMD64 (from repo root)...${NC}"
docker buildx build --platform linux/amd64 -t "${IMAGE}" --push -f services/${SERVICE_NAME}/Dockerfile . || {
  echo -e "${RED}Docker build failed${NC}"
  exit 1
}

echo -e "${GREEN}Image built and pushed successfully${NC}"

# Tool Server Architecture - No dependencies on other services
echo -e "${GREEN}Preparing Tool Server deployment...${NC}"

# Deploy to Cloud Run
echo -e "${GREEN}Deploying to Cloud Run (Tool Server)...${NC}"
gcloud run deploy "${SERVICE_NAME}" \
  --image="${IMAGE}" \
  --region="${REGION}" \
  --platform=managed \
  --service-account="${SERVICE_ACCOUNT}" \
  --memory=512Mi \
  --cpu=1 \
  --timeout=60s \
  --min-instances=1 \
  --max-instances=10 \
  --concurrency=10 \
  --ingress=internal-and-cloud-load-balancing \
  --no-allow-unauthenticated \
  --set-env-vars="PROJECT_ID=${PROJECT_ID},REGION=${REGION},ENVIRONMENT=production,LOG_LEVEL=info,DEFAULT_TIMEZONE=America/Chicago,BQ_DATASET_ANALYTICS=restaurant_analytics,BQ_DATASET_INSIGHTS=insights,ENABLE_CHARTS=true,MAX_CHART_DATAPOINTS=100" \
  --project="${PROJECT_ID}" || {
  echo -e "${RED}Deployment failed${NC}"
  exit 1
}

# Grant Vertex AI Agent service account permission to invoke this service
echo -e "${GREEN}Granting Vertex AI Agent invoker permission...${NC}"
VERTEX_AI_SA="vtx-agent-fds-tool-invoker@${PROJECT_ID}.iam.gserviceaccount.com"

gcloud run services add-iam-policy-binding "${SERVICE_NAME}" \
  --region="${REGION}" \
  --member="serviceAccount:${VERTEX_AI_SA}" \
  --role="roles/run.invoker" \
  --project="${PROJECT_ID}" \
  --quiet 2>/dev/null || echo -e "${YELLOW}Warning: Failed to grant invoker role to ${VERTEX_AI_SA}${NC}"

echo -e "${GREEN}IAM permissions configured${NC}"

# Get service URL
SERVICE_URL=$(gcloud run services describe "${SERVICE_NAME}" \
  --region="${REGION}" \
  --project="${PROJECT_ID}" \
  --format='value(status.url)')

# Health check
echo -e "${GREEN}Running health check...${NC}"
sleep 5
if curl -f -s "${SERVICE_URL}/health" > /dev/null 2>&1; then
  echo -e "${GREEN}Health check passed!${NC}"
else
  echo -e "${YELLOW}Warning: Health check failed. Service may not be ready yet.${NC}"
fi

echo ""
echo -e "${BLUE}==========================================${NC}"
echo -e "${GREEN}Deployment complete!${NC}"
echo -e "${BLUE}==========================================${NC}"
echo ""
echo -e "${GREEN}Service URL: ${SERVICE_URL}${NC}"
echo -e "${GREEN}Health check: ${SERVICE_URL}/health${NC}"
echo -e "${GREEN}Tool endpoint: ${SERVICE_URL}/execute-tool${NC}"
echo ""
echo -e "${YELLOW}Next steps:${NC}"
echo "  1. Configure Vertex AI Agent Builder to call: ${SERVICE_URL}/execute-tool"
echo "  2. Ensure Vertex AI Agent uses service account: ${VERTEX_AI_SA}"
echo "  3. Test with: ./scripts/testing/test-all-intent-functions.sh"
echo ""
echo -e "${YELLOW}Note: This is an IAM-protected endpoint (no public access)${NC}"
