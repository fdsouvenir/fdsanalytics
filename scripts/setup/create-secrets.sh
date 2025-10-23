#!/bin/bash
# Create secrets in Google Secret Manager

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
PROJECT_ID="${PROJECT_ID:-fdsanalytics}"

echo -e "${BLUE}==========================================${NC}"
echo -e "${BLUE}  Creating Secrets${NC}"
echo -e "${BLUE}==========================================${NC}"
echo ""

# Check prerequisites
if ! command -v gcloud &> /dev/null; then
  echo -e "${RED}Error: gcloud CLI not installed${NC}"
  exit 1
fi

echo -e "${YELLOW}Project ID: ${PROJECT_ID}${NC}"
echo ""

# Function to create or update secret
create_secret() {
  local SECRET_NAME=$1
  local SECRET_VALUE=$2

  # Check if secret exists
  if gcloud secrets describe "${SECRET_NAME}" --project="${PROJECT_ID}" &>/dev/null; then
    echo -e "${YELLOW}Secret already exists: ${SECRET_NAME}${NC}"
    echo -e "${YELLOW}Do you want to add a new version? (y/n)${NC}"
    read -r RESPONSE
    if [[ "$RESPONSE" =~ ^[Yy]$ ]]; then
      echo -n "${SECRET_VALUE}" | gcloud secrets versions add "${SECRET_NAME}" \
        --project="${PROJECT_ID}" \
        --data-file=-
      echo -e "${GREEN}New version added for ${SECRET_NAME}${NC}"
    fi
  else
    echo -e "${GREEN}Creating secret: ${SECRET_NAME}${NC}"
    echo -n "${SECRET_VALUE}" | gcloud secrets create "${SECRET_NAME}" \
      --project="${PROJECT_ID}" \
      --replication-policy="automatic" \
      --data-file=-
    echo -e "${GREEN}Secret created: ${SECRET_NAME}${NC}"
  fi
}

# GEMINI_API_KEY
echo -e "${BLUE}--- GEMINI_API_KEY ---${NC}"
if gcloud secrets describe "GEMINI_API_KEY" --project="${PROJECT_ID}" &>/dev/null; then
  echo -e "${GREEN}GEMINI_API_KEY already exists${NC}"
else
  echo -e "${YELLOW}Enter your Gemini API key:${NC}"
  echo -e "${YELLOW}(Get one from: https://aistudio.google.com/app/apikey)${NC}"
  read -rs GEMINI_API_KEY
  create_secret "GEMINI_API_KEY" "${GEMINI_API_KEY}"
fi
echo ""

# GMAIL_OAUTH_CREDENTIALS
echo -e "${BLUE}--- GMAIL_OAUTH_CREDENTIALS ---${NC}"
if gcloud secrets describe "GMAIL_OAUTH_CREDENTIALS" --project="${PROJECT_ID}" &>/dev/null; then
  echo -e "${GREEN}GMAIL_OAUTH_CREDENTIALS already exists${NC}"
else
  echo -e "${YELLOW}Create GMAIL_OAUTH_CREDENTIALS secret?${NC}"
  echo -e "${YELLOW}This will be populated during the /setup command${NC}"
  echo -e "${YELLOW}Create empty placeholder now? (y/n)${NC}"
  read -r RESPONSE
  if [[ "$RESPONSE" =~ ^[Yy]$ ]]; then
    create_secret "GMAIL_OAUTH_CREDENTIALS" "{}"
  else
    echo -e "${YELLOW}Skipping GMAIL_OAUTH_CREDENTIALS${NC}"
  fi
fi
echo ""

echo -e "${BLUE}==========================================${NC}"
echo -e "${GREEN}Secrets setup complete!${NC}"
echo -e "${BLUE}==========================================${NC}"
echo ""
echo -e "${YELLOW}To view secrets:${NC}"
echo "gcloud secrets list --project=${PROJECT_ID}"
echo ""
echo -e "${YELLOW}To view secret versions:${NC}"
echo "gcloud secrets versions list GEMINI_API_KEY --project=${PROJECT_ID}"
echo ""
echo -e "${GREEN}Next step: Run ./scripts/setup/setup-cloud-scheduler.sh${NC}"
