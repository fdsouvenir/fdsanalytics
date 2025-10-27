#!/bin/bash
# Tail logs for a service

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
LIMIT="${LIMIT:-50}"

# Usage
if [ $# -lt 1 ]; then
  echo -e "${YELLOW}Usage: $0 <service-name> [limit]${NC}"
  echo ""
  echo "Available services:"
  echo "  - response-engine"
  echo "  - response-engine"
  echo "  - conversation-manager"
  echo "  - gmail-ingestion"
  echo ""
  echo "Example: $0 response-engine 100"
  exit 1
fi

SERVICE_NAME=$1
LIMIT=${2:-50}

echo -e "${BLUE}==========================================${NC}"
echo -e "${BLUE}  Checking logs for ${SERVICE_NAME}${NC}"
echo -e "${BLUE}==========================================${NC}"
echo ""

# Check if it's a Cloud Function or Cloud Run
case "${SERVICE_NAME}" in
  gmail-ingestion)
    echo -e "${GREEN}Fetching Cloud Function logs...${NC}"
    gcloud functions logs read "${SERVICE_NAME}" \
      --gen2 \
      --region="${REGION}" \
      --project="${PROJECT_ID}" \
      --limit="${LIMIT}"
    ;;
  response-engine|response-engine|conversation-manager)
    echo -e "${GREEN}Fetching Cloud Run logs...${NC}"
    gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=${SERVICE_NAME}" \
      --project="${PROJECT_ID}" \
      --limit="${LIMIT}" \
      --format=json | jq -r '.[] | "\(.timestamp) [\(.severity)] \(.jsonPayload.message // .textPayload // "")"'
    ;;
  *)
    echo -e "${RED}Unknown service: ${SERVICE_NAME}${NC}"
    exit 1
    ;;
esac
