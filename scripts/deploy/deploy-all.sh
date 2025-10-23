#!/bin/bash
# Deploy all services in the correct order

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
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo -e "${BLUE}============================================${NC}"
echo -e "${BLUE}  Deploying FDS Analytics - All Services${NC}"
echo -e "${BLUE}============================================${NC}"
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
echo ""
echo -e "${YELLOW}This will deploy services in the following order:${NC}"
echo "  1. BigQuery Stored Procedures"
echo "  2. MCP Server"
echo "  3. Conversation Manager"
echo "  4. Response Engine"
echo "  5. Gmail Ingestion"
echo ""
echo -e "${YELLOW}Continue? (y/n)${NC}"
read -r RESPONSE
if [[ ! "$RESPONSE" =~ ^[Yy]$ ]]; then
  echo -e "${YELLOW}Deployment cancelled${NC}"
  exit 0
fi
echo ""

# Track deployment status
FAILED_SERVICES=()
DEPLOYED_SERVICES=()

# Function to deploy a service
deploy_service() {
  local SERVICE_NAME=$1
  local SCRIPT_NAME=$2

  echo -e "${BLUE}==== Deploying ${SERVICE_NAME} ====${NC}"
  if "${SCRIPT_DIR}/${SCRIPT_NAME}"; then
    DEPLOYED_SERVICES+=("${SERVICE_NAME}")
    echo -e "${GREEN}${SERVICE_NAME} deployed successfully${NC}"
  else
    FAILED_SERVICES+=("${SERVICE_NAME}")
    echo -e "${RED}${SERVICE_NAME} deployment failed${NC}"
    return 1
  fi
  echo ""
}

# 1. Deploy BigQuery stored procedures
deploy_service "BigQuery Stored Procedures" "deploy-stored-procedures.sh" || true

# 2. Deploy MCP Server (no dependencies)
deploy_service "MCP Server" "deploy-mcp-server.sh" || {
  echo -e "${RED}Critical: MCP Server failed to deploy${NC}"
  echo -e "${YELLOW}Continuing with other services...${NC}"
}

# 3. Deploy Conversation Manager (no dependencies)
deploy_service "Conversation Manager" "deploy-conversation-manager.sh" || {
  echo -e "${RED}Critical: Conversation Manager failed to deploy${NC}"
  echo -e "${YELLOW}Continuing with other services...${NC}"
}

# Grant service-to-service IAM permissions
echo -e "${BLUE}==== Granting Service-to-Service Permissions ====${NC}"
echo -e "${GREEN}Allowing Response Engine to invoke MCP Server...${NC}"
gcloud run services add-iam-policy-binding mcp-server \
  --region="${REGION}" \
  --member="serviceAccount:response-engine@${PROJECT_ID}.iam.gserviceaccount.com" \
  --role="roles/run.invoker" \
  --project="${PROJECT_ID}" \
  --quiet 2>/dev/null || echo -e "${YELLOW}Warning: Failed to grant MCP Server invoker role${NC}"

echo -e "${GREEN}Allowing Response Engine to invoke Conversation Manager...${NC}"
gcloud run services add-iam-policy-binding conversation-manager \
  --region="${REGION}" \
  --member="serviceAccount:response-engine@${PROJECT_ID}.iam.gserviceaccount.com" \
  --role="roles/run.invoker" \
  --project="${PROJECT_ID}" \
  --quiet 2>/dev/null || echo -e "${YELLOW}Warning: Failed to grant Conversation Manager invoker role${NC}"
echo ""

# 4. Deploy Response Engine (depends on MCP + Conversation Manager)
deploy_service "Response Engine" "deploy-response-engine.sh" || {
  echo -e "${RED}Critical: Response Engine failed to deploy${NC}"
}

# 5. Deploy Gmail Ingestion (independent)
deploy_service "Gmail Ingestion" "deploy-gmail-ingestion.sh" || {
  echo -e "${YELLOW}Warning: Gmail Ingestion failed to deploy${NC}"
}

# Summary
echo ""
echo -e "${BLUE}============================================${NC}"
echo -e "${BLUE}  Deployment Summary${NC}"
echo -e "${BLUE}============================================${NC}"
echo ""

if [ ${#DEPLOYED_SERVICES[@]} -gt 0 ]; then
  echo -e "${GREEN}Successfully deployed (${#DEPLOYED_SERVICES[@]}):${NC}"
  for service in "${DEPLOYED_SERVICES[@]}"; do
    echo -e "${GREEN}  ✓ ${service}${NC}"
  done
  echo ""
fi

if [ ${#FAILED_SERVICES[@]} -gt 0 ]; then
  echo -e "${RED}Failed to deploy (${#FAILED_SERVICES[@]}):${NC}"
  for service in "${FAILED_SERVICES[@]}"; do
    echo -e "${RED}  ✗ ${service}${NC}"
  done
  echo ""
  exit 1
fi

# Print service URLs
echo -e "${BLUE}Service URLs:${NC}"
echo ""

RESPONSE_ENGINE_URL=$(gcloud run services describe response-engine \
  --region="${REGION}" \
  --project="${PROJECT_ID}" \
  --format='value(status.url)' 2>/dev/null || echo "Not deployed")
echo -e "${GREEN}Response Engine: ${RESPONSE_ENGINE_URL}${NC}"

MCP_SERVER_URL=$(gcloud run services describe mcp-server \
  --region="${REGION}" \
  --project="${PROJECT_ID}" \
  --format='value(status.url)' 2>/dev/null || echo "Not deployed")
echo -e "${GREEN}MCP Server (internal): ${MCP_SERVER_URL}${NC}"

CONVERSATION_MANAGER_URL=$(gcloud run services describe conversation-manager \
  --region="${REGION}" \
  --project="${PROJECT_ID}" \
  --format='value(status.url)' 2>/dev/null || echo "Not deployed")
echo -e "${GREEN}Conversation Manager (internal): ${CONVERSATION_MANAGER_URL}${NC}"

echo ""
echo -e "${BLUE}============================================${NC}"
echo -e "${GREEN}All deployments complete!${NC}"
echo -e "${BLUE}============================================${NC}"
echo ""
echo -e "${YELLOW}Next steps:${NC}"
echo "  1. Configure Google Chat webhook: ${RESPONSE_ENGINE_URL}/webhook"
echo "  2. Test ingestion: ./scripts/utilities/test-ingestion.sh"
echo "  3. Check health: ./scripts/utilities/health-check-all.sh"
