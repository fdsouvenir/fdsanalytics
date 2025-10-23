#!/bin/bash
# Rollback a Cloud Run service to previous revision

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

# Usage
if [ $# -lt 1 ]; then
  echo -e "${YELLOW}Usage: $0 <service-name>${NC}"
  echo ""
  echo "Available services:"
  echo "  - response-engine"
  echo "  - mcp-server"
  echo "  - conversation-manager"
  echo ""
  echo "Example: $0 response-engine"
  exit 1
fi

SERVICE_NAME=$1

echo -e "${BLUE}==========================================${NC}"
echo -e "${BLUE}  Rolling back ${SERVICE_NAME}${NC}"
echo -e "${BLUE}==========================================${NC}"
echo ""

# Check prerequisites
if ! command -v gcloud &> /dev/null; then
  echo -e "${RED}Error: gcloud CLI not installed${NC}"
  exit 1
fi

# List revisions
echo -e "${GREEN}Current revisions:${NC}"
gcloud run revisions list \
  --service="${SERVICE_NAME}" \
  --region="${REGION}" \
  --project="${PROJECT_ID}" \
  --limit=5 \
  --format="table(name,status,traffic)"
echo ""

# Get current revision
CURRENT_REVISION=$(gcloud run services describe "${SERVICE_NAME}" \
  --region="${REGION}" \
  --project="${PROJECT_ID}" \
  --format='value(status.latestReadyRevisionName)')

echo -e "${YELLOW}Current revision: ${CURRENT_REVISION}${NC}"

# Get previous revision
PREVIOUS_REVISION=$(gcloud run revisions list \
  --service="${SERVICE_NAME}" \
  --region="${REGION}" \
  --project="${PROJECT_ID}" \
  --limit=2 \
  --format='value(name)' | tail -1)

if [ -z "${PREVIOUS_REVISION}" ] || [ "${PREVIOUS_REVISION}" == "${CURRENT_REVISION}" ]; then
  echo -e "${RED}No previous revision found${NC}"
  exit 1
fi

echo -e "${YELLOW}Previous revision: ${PREVIOUS_REVISION}${NC}"
echo ""
echo -e "${RED}Are you sure you want to rollback? (yes/no)${NC}"
read -r RESPONSE

if [ "${RESPONSE}" != "yes" ]; then
  echo -e "${YELLOW}Rollback cancelled${NC}"
  exit 0
fi

# Rollback to previous revision
echo -e "${GREEN}Rolling back to ${PREVIOUS_REVISION}...${NC}"
gcloud run services update-traffic "${SERVICE_NAME}" \
  --to-revisions="${PREVIOUS_REVISION}=100" \
  --region="${REGION}" \
  --project="${PROJECT_ID}"

echo ""
echo -e "${GREEN}Rollback complete!${NC}"
echo ""
echo -e "${YELLOW}New traffic distribution:${NC}"
gcloud run revisions list \
  --service="${SERVICE_NAME}" \
  --region="${REGION}" \
  --project="${PROJECT_ID}" \
  --limit=5 \
  --format="table(name,status,traffic)"
