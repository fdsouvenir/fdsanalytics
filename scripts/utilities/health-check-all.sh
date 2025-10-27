#!/bin/bash
# Check health of all deployed services

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

echo -e "${BLUE}==========================================${NC}"
echo -e "${BLUE}  Health Check - All Services${NC}"
echo -e "${BLUE}==========================================${NC}"
echo ""

# Check prerequisites
if ! command -v gcloud &> /dev/null; then
  echo -e "${RED}Error: gcloud CLI not installed${NC}"
  exit 1
fi

if ! command -v curl &> /dev/null; then
  echo -e "${RED}Error: curl not installed${NC}"
  exit 1
fi

HEALTHY_COUNT=0
UNHEALTHY_COUNT=0
SERVICES=()

# Function to check Cloud Run service
check_cloudrun_service() {
  local SERVICE_NAME=$1
  local PUBLIC=$2

  echo -e "${BLUE}--- ${SERVICE_NAME} ---${NC}"

  # Get service URL
  SERVICE_URL=$(gcloud run services describe "${SERVICE_NAME}" \
    --region="${REGION}" \
    --project="${PROJECT_ID}" \
    --format='value(status.url)' 2>/dev/null)

  if [ -z "${SERVICE_URL}" ]; then
    echo -e "${RED}Service not deployed${NC}"
    UNHEALTHY_COUNT=$((UNHEALTHY_COUNT + 1))
    SERVICES+=("${SERVICE_NAME}: NOT DEPLOYED")
    return
  fi

  echo -e "${YELLOW}URL: ${SERVICE_URL}${NC}"

  # Check health endpoint
  if [ "${PUBLIC}" = "true" ]; then
    # Public service - direct health check
    HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "${SERVICE_URL}/health" 2>/dev/null)

    if [ "${HTTP_STATUS}" = "200" ]; then
      echo -e "${GREEN}Status: HEALTHY (${HTTP_STATUS})${NC}"
      HEALTHY_COUNT=$((HEALTHY_COUNT + 1))
      SERVICES+=("${SERVICE_NAME}: HEALTHY")
    else
      echo -e "${RED}Status: UNHEALTHY (${HTTP_STATUS})${NC}"
      UNHEALTHY_COUNT=$((UNHEALTHY_COUNT + 1))
      SERVICES+=("${SERVICE_NAME}: UNHEALTHY")
    fi
  else
    # Internal service - just check if deployed
    echo -e "${YELLOW}Status: DEPLOYED (internal service, cannot check health directly)${NC}"
    HEALTHY_COUNT=$((HEALTHY_COUNT + 1))
    SERVICES+=("${SERVICE_NAME}: DEPLOYED")
  fi
  echo ""
}

# Function to check Cloud Function
check_function() {
  local FUNCTION_NAME=$1

  echo -e "${BLUE}--- ${FUNCTION_NAME} ---${NC}"

  # Check if function exists
  FUNCTION_STATUS=$(gcloud functions describe "${FUNCTION_NAME}" \
    --gen2 \
    --region="${REGION}" \
    --project="${PROJECT_ID}" \
    --format='value(state)' 2>/dev/null)

  if [ -z "${FUNCTION_STATUS}" ]; then
    echo -e "${RED}Function not deployed${NC}"
    UNHEALTHY_COUNT=$((UNHEALTHY_COUNT + 1))
    SERVICES+=("${FUNCTION_NAME}: NOT DEPLOYED")
  elif [ "${FUNCTION_STATUS}" = "ACTIVE" ]; then
    echo -e "${GREEN}Status: ACTIVE${NC}"
    HEALTHY_COUNT=$((HEALTHY_COUNT + 1))
    SERVICES+=("${FUNCTION_NAME}: ACTIVE")
  else
    echo -e "${YELLOW}Status: ${FUNCTION_STATUS}${NC}"
    UNHEALTHY_COUNT=$((UNHEALTHY_COUNT + 1))
    SERVICES+=("${FUNCTION_NAME}: ${FUNCTION_STATUS}")
  fi
  echo ""
}

# Check all services
check_cloudrun_service "response-engine" "true"
check_cloudrun_service "response-engine" "false"
check_cloudrun_service "conversation-manager" "false"
check_function "gmail-ingestion"

# Summary
echo -e "${BLUE}==========================================${NC}"
echo -e "${BLUE}  Summary${NC}"
echo -e "${BLUE}==========================================${NC}"
echo ""

for service_status in "${SERVICES[@]}"; do
  if [[ $service_status == *"HEALTHY"* ]] || [[ $service_status == *"ACTIVE"* ]] || [[ $service_status == *"DEPLOYED"* ]]; then
    echo -e "${GREEN}✓ ${service_status}${NC}"
  else
    echo -e "${RED}✗ ${service_status}${NC}"
  fi
done

echo ""
echo -e "${GREEN}Healthy: ${HEALTHY_COUNT}${NC}"
echo -e "${RED}Unhealthy: ${UNHEALTHY_COUNT}${NC}"
echo ""

if [ ${UNHEALTHY_COUNT} -gt 0 ]; then
  echo -e "${YELLOW}Some services are unhealthy. Check logs with:${NC}"
  echo "./scripts/utilities/check-logs.sh <service-name>"
  exit 1
else
  echo -e "${GREEN}All services are healthy!${NC}"
fi
