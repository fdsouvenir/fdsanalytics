#!/bin/bash
# Grant IAM permissions to service accounts

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
echo -e "${BLUE}  Granting IAM Permissions${NC}"
echo -e "${BLUE}==========================================${NC}"
echo ""

# Check prerequisites
if ! command -v gcloud &> /dev/null; then
  echo -e "${RED}Error: gcloud CLI not installed${NC}"
  exit 1
fi

echo -e "${YELLOW}Project ID: ${PROJECT_ID}${NC}"
echo ""

# Function to grant project-level IAM binding
grant_project_role() {
  local SA_NAME=$1
  local ROLE=$2
  local SA_EMAIL="${SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"

  echo -e "${GREEN}Granting ${ROLE} to ${SA_NAME}${NC}"
  gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
    --member="serviceAccount:${SA_EMAIL}" \
    --role="${ROLE}" \
    --condition=None \
    --quiet || echo -e "${YELLOW}  (Already granted or error)${NC}"
}

# Function to grant secret access
grant_secret_access() {
  local SA_NAME=$1
  local SECRET_NAME=$2
  local SA_EMAIL="${SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"

  echo -e "${GREEN}Granting secret access to ${SA_NAME} for ${SECRET_NAME}${NC}"
  gcloud secrets add-iam-policy-binding "${SECRET_NAME}" \
    --member="serviceAccount:${SA_EMAIL}" \
    --role="roles/secretmanager.secretAccessor" \
    --project="${PROJECT_ID}" \
    --quiet || echo -e "${YELLOW}  (Already granted or secret doesn't exist)${NC}"
}

# Response Engine Permissions
echo -e "${BLUE}--- Response Engine ---${NC}"
grant_project_role "response-engine" "roles/bigquery.jobUser"
grant_project_role "response-engine" "roles/bigquery.dataViewer"
grant_project_role "response-engine" "roles/logging.logWriter"
grant_secret_access "response-engine" "GEMINI_API_KEY"
echo ""

# Response Engine Permissions
echo -e "${BLUE}--- Response Engine ---${NC}"
grant_project_role "response-engine" "roles/bigquery.jobUser"
grant_project_role "response-engine" "roles/bigquery.dataViewer"
grant_project_role "response-engine" "roles/logging.logWriter"
echo ""

# Conversation Manager Permissions
echo -e "${BLUE}--- Conversation Manager ---${NC}"
grant_project_role "conversation-manager" "roles/bigquery.jobUser"
grant_project_role "conversation-manager" "roles/bigquery.dataEditor"
grant_project_role "conversation-manager" "roles/logging.logWriter"
grant_secret_access "conversation-manager" "GEMINI_API_KEY"
echo ""

# Gmail Ingestion Permissions
echo -e "${BLUE}--- Gmail Ingestion ---${NC}"
grant_project_role "gmail-ingestion" "roles/bigquery.jobUser"
grant_project_role "gmail-ingestion" "roles/bigquery.dataEditor"
grant_project_role "gmail-ingestion" "roles/logging.logWriter"
grant_secret_access "gmail-ingestion" "GEMINI_API_KEY"
grant_secret_access "gmail-ingestion" "GMAIL_OAUTH_CREDENTIALS"
echo ""

# Service-to-Service Communication
echo -e "${BLUE}--- Service-to-Service Communication ---${NC}"
echo -e "${YELLOW}Note: Run this after Cloud Run services are deployed${NC}"
echo ""

echo -e "${GREEN}To grant service-to-service invoker permissions, run:${NC}"
echo ""
echo "# Allow Response Engine to invoke Response Engine"
echo "gcloud run services add-iam-policy-binding response-engine \\"
echo "  --region ${REGION} \\"
echo "  --member='serviceAccount:response-engine@${PROJECT_ID}.iam.gserviceaccount.com' \\"
echo "  --role='roles/run.invoker' \\"
echo "  --project ${PROJECT_ID}"
echo ""
echo "# Allow Response Engine to invoke Conversation Manager"
echo "gcloud run services add-iam-policy-binding conversation-manager \\"
echo "  --region ${REGION} \\"
echo "  --member='serviceAccount:response-engine@${PROJECT_ID}.iam.gserviceaccount.com' \\"
echo "  --role='roles/run.invoker' \\"
echo "  --project ${PROJECT_ID}"
echo ""

echo -e "${BLUE}==========================================${NC}"
echo -e "${GREEN}IAM permissions granted successfully!${NC}"
echo -e "${BLUE}==========================================${NC}"
echo ""
echo -e "${GREEN}Next step: Run ./scripts/setup/create-secrets.sh${NC}"
