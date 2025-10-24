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

# Get MCP Server and Conversation Manager URLs
echo -e "${GREEN}Getting service URLs...${NC}"
MCP_SERVER_URL=$(gcloud run services describe mcp-server \
  --region="${REGION}" \
  --project="${PROJECT_ID}" \
  --format='value(status.url)' 2>/dev/null || echo "")

CONVERSATION_MANAGER_URL=$(gcloud run services describe conversation-manager \
  --region="${REGION}" \
  --project="${PROJECT_ID}" \
  --format='value(status.url)' 2>/dev/null || echo "")

if [ -z "${MCP_SERVER_URL}" ] || [ -z "${CONVERSATION_MANAGER_URL}" ]; then
  echo -e "${YELLOW}Warning: Dependency services not found. Make sure to deploy them first.${NC}"
  echo -e "${YELLOW}Using placeholder URLs for now.${NC}"
  MCP_SERVER_URL="https://mcp-server-placeholder"
  CONVERSATION_MANAGER_URL="https://conversation-manager-placeholder"
fi

# Deploy to Cloud Run
echo -e "${GREEN}Deploying to Cloud Run...${NC}"
gcloud run deploy "${SERVICE_NAME}" \
  --image="${IMAGE}" \
  --region="${REGION}" \
  --platform=managed \
  --service-account="${SERVICE_ACCOUNT}" \
  --memory=512Mi \
  --cpu=1 \
  --timeout=60s \
  --min-instances=0 \
  --max-instances=10 \
  --concurrency=10 \
  --ingress=all \
  --allow-unauthenticated \
  --set-env-vars="PROJECT_ID=${PROJECT_ID},REGION=${REGION},ENVIRONMENT=production,LOG_LEVEL=info,MCP_SERVER_URL=${MCP_SERVER_URL},CONVERSATION_MANAGER_URL=${CONVERSATION_MANAGER_URL},ENABLE_CHARTS=true,MAX_CHART_DATAPOINTS=100" \
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
echo ""
echo -e "${YELLOW}Configure this URL in Google Chat API settings:${NC}"
echo "${SERVICE_URL}/webhook"
