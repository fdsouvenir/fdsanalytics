#!/bin/bash
# Create Vertex AI Agent Service Account
# This service account will be used by Vertex AI Agent Builder to call the Tool Server

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
SA_NAME="vtx-agent-fds-tool-invoker"
SA_EMAIL="${SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"

echo -e "${BLUE}============================================${NC}"
echo -e "${BLUE}  Create Vertex AI Agent Service Account${NC}"
echo -e "${BLUE}============================================${NC}"
echo ""

# Check prerequisites
if ! command -v gcloud &> /dev/null; then
  echo -e "${RED}Error: gcloud CLI not installed${NC}"
  exit 1
fi

echo -e "${YELLOW}Project ID: ${PROJECT_ID}${NC}"
echo -e "${YELLOW}Service Account: ${SA_EMAIL}${NC}"
echo ""

# Check if service account already exists
if gcloud iam service-accounts describe "${SA_EMAIL}" --project="${PROJECT_ID}" &>/dev/null; then
  echo -e "${YELLOW}Service account already exists: ${SA_EMAIL}${NC}"
  echo -e "${GREEN}Skipping creation.${NC}"
else
  # Create service account
  echo -e "${GREEN}Creating service account...${NC}"
  gcloud iam service-accounts create "${SA_NAME}" \
    --display-name="Vertex AI Agent Tool Invoker" \
    --description="Service account used by Vertex AI Agent Builder to invoke the FDS Analytics Tool Server" \
    --project="${PROJECT_ID}" || {
    echo -e "${RED}Failed to create service account${NC}"
    exit 1
  }
  echo -e "${GREEN}Service account created successfully!${NC}"
fi

echo ""
echo -e "${BLUE}============================================${NC}"
echo -e "${GREEN}Grant Required Permissions${NC}"
echo -e "${BLUE}============================================${NC}"
echo ""

# Grant BigQuery Data Viewer role (needed to read analytics data)
echo -e "${GREEN}Granting BigQuery Data Viewer role...${NC}"
gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
  --member="serviceAccount:${SA_EMAIL}" \
  --role="roles/bigquery.dataViewer" \
  --condition=None \
  --quiet || echo -e "${YELLOW}Warning: Failed to grant BigQuery Data Viewer role${NC}"

# Grant BigQuery Job User role (needed to run queries)
echo -e "${GREEN}Granting BigQuery Job User role...${NC}"
gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
  --member="serviceAccount:${SA_EMAIL}" \
  --role="roles/bigquery.jobUser" \
  --condition=None \
  --quiet || echo -e "${YELLOW}Warning: Failed to grant BigQuery Job User role${NC}"

# Grant Cloud Run Invoker role (to call the Tool Server)
# Note: This is handled by deploy-response-engine.sh, but we can also set it here
echo -e "${GREEN}Granting Cloud Run Invoker role for response-engine...${NC}"
gcloud run services add-iam-policy-binding response-engine \
  --region="${REGION}" \
  --member="serviceAccount:${SA_EMAIL}" \
  --role="roles/run.invoker" \
  --project="${PROJECT_ID}" \
  --quiet 2>/dev/null || echo -e "${YELLOW}Note: response-engine service may not be deployed yet. Run deploy-response-engine.sh to grant this permission.${NC}"

echo ""
echo -e "${BLUE}============================================${NC}"
echo -e "${GREEN}Setup Complete!${NC}"
echo -e "${BLUE}============================================${NC}"
echo ""
echo -e "${GREEN}Service Account: ${SA_EMAIL}${NC}"
echo ""
echo -e "${YELLOW}Next steps:${NC}"
echo "  1. Configure Vertex AI Agent Builder to use this service account"
echo "  2. In Vertex AI Agent settings, set the service account to: ${SA_EMAIL}"
echo "  3. Deploy the Tool Server: ./scripts/deploy/deploy-response-engine.sh"
echo "  4. Test the integration: ./scripts/testing/test-all-intent-functions.sh"
echo ""
echo -e "${YELLOW}Important:${NC}"
echo "  - This service account has read-only access to BigQuery"
echo "  - It can invoke the response-engine Cloud Run service"
echo "  - All requests from Vertex AI Agent will be authenticated using this identity"
echo ""
