#!/bin/bash
# Create all service accounts for FDS Analytics

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
PROJECT_ID="${PROJECT_ID:-fdsanalytics}"

# Service accounts to create
declare -A SERVICE_ACCOUNTS=(
  ["response-engine"]="Response Engine Service Account"
  ["mcp-server"]="MCP Server Service Account"
  ["conversation-manager"]="Conversation Manager Service Account"
  ["gmail-ingestion"]="Gmail Ingestion Service Account"
)

echo -e "${BLUE}==========================================${NC}"
echo -e "${BLUE}  Creating Service Accounts${NC}"
echo -e "${BLUE}==========================================${NC}"
echo ""

# Check prerequisites
if ! command -v gcloud &> /dev/null; then
  echo -e "${RED}Error: gcloud CLI not installed${NC}"
  exit 1
fi

# Verify project
echo -e "${YELLOW}Project ID: ${PROJECT_ID}${NC}"
echo ""

# Create service accounts
CREATED_COUNT=0
SKIPPED_COUNT=0

for SA_NAME in "${!SERVICE_ACCOUNTS[@]}"; do
  SA_EMAIL="${SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"
  SA_DISPLAY_NAME="${SERVICE_ACCOUNTS[$SA_NAME]}"

  # Check if service account already exists
  if gcloud iam service-accounts describe "${SA_EMAIL}" --project="${PROJECT_ID}" &>/dev/null; then
    echo -e "${YELLOW}Service account already exists: ${SA_NAME}${NC}"
    SKIPPED_COUNT=$((SKIPPED_COUNT + 1))
  else
    echo -e "${GREEN}Creating service account: ${SA_NAME}${NC}"
    gcloud iam service-accounts create "${SA_NAME}" \
      --display-name="${SA_DISPLAY_NAME}" \
      --project="${PROJECT_ID}"
    CREATED_COUNT=$((CREATED_COUNT + 1))
  fi
done

echo ""
echo -e "${BLUE}==========================================${NC}"
echo -e "${GREEN}Summary:${NC}"
echo -e "${GREEN}  Created: ${CREATED_COUNT}${NC}"
echo -e "${YELLOW}  Skipped (already exist): ${SKIPPED_COUNT}${NC}"
echo -e "${BLUE}==========================================${NC}"
echo ""
echo -e "${GREEN}Next step: Run ./scripts/setup/grant-iam-permissions.sh${NC}"
