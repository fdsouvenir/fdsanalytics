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
echo "  2. Response Engine (Tool Server)"
echo "  3. Gmail Ingestion"
echo "  4. Vertex AI Agent (ADK)"
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

# 2. Deploy Response Engine (Tool Server)
deploy_service "Response Engine" "deploy-response-engine.sh" || {
  echo -e "${RED}Critical: Response Engine failed to deploy${NC}"
}

# 3. Deploy Gmail Ingestion (independent)
deploy_service "Gmail Ingestion" "deploy-gmail-ingestion.sh" || {
  echo -e "${YELLOW}Warning: Gmail Ingestion failed to deploy${NC}"
}

# 4. Deploy Vertex AI Agent (requires Response Engine)
if [ ${#FAILED_SERVICES[@]} -eq 0 ] || [[ ! " ${FAILED_SERVICES[@]} " =~ " Response Engine " ]]; then
  deploy_service "Vertex AI Agent" "deploy-agent.sh" || {
    echo -e "${YELLOW}Warning: Vertex AI Agent failed to deploy${NC}"
  }
else
  echo -e "${YELLOW}Skipping Vertex AI Agent deployment (Response Engine failed)${NC}"
  FAILED_SERVICES+=("Vertex AI Agent")
fi

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
echo -e "${GREEN}Response Engine (Tool Server): ${RESPONSE_ENGINE_URL}${NC}"
echo -e "${GREEN}  - Execute Tool Endpoint: ${RESPONSE_ENGINE_URL}/execute-tool${NC}"

# Check if agent was deployed
if [ -f "${SCRIPT_DIR}/../../agent/.agent_resource" ]; then
  AGENT_RESOURCE=$(cat "${SCRIPT_DIR}/../../agent/.agent_resource")
  echo ""
  echo -e "${GREEN}Vertex AI Agent:${NC}"
  echo -e "${GREEN}  - Resource: ${AGENT_RESOURCE}${NC}"
  echo -e "${GREEN}  - Console: https://console.cloud.google.com/vertex-ai/agents?project=${PROJECT_ID}${NC}"
fi

echo ""
echo -e "${BLUE}============================================${NC}"
echo -e "${GREEN}All deployments complete!${NC}"
echo -e "${BLUE}============================================${NC}"
echo ""
echo -e "${YELLOW}Next steps:${NC}"
echo "  1. Test the agent: cd agent && python3 test_agent.py"
echo "  2. Test ingestion: ./scripts/utilities/test-ingestion.sh"
echo "  3. Check health: ./scripts/utilities/health-check-all.sh"
