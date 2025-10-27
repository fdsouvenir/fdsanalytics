#!/bin/bash
# Verify deployment automation setup

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}==========================================${NC}"
echo -e "${BLUE}  Deployment Automation Verification${NC}"
echo -e "${BLUE}==========================================${NC}"
echo ""

TOTAL_CHECKS=0
PASSED_CHECKS=0

# Function to check file exists
check_file() {
  local FILE=$1
  local DESC=$2
  TOTAL_CHECKS=$((TOTAL_CHECKS + 1))

  if [ -f "${FILE}" ]; then
    echo -e "${GREEN}✓${NC} ${DESC}"
    PASSED_CHECKS=$((PASSED_CHECKS + 1))
  else
    echo -e "${RED}✗${NC} ${DESC} - Missing: ${FILE}"
  fi
}

# Function to check file is executable
check_executable() {
  local FILE=$1
  local DESC=$2
  TOTAL_CHECKS=$((TOTAL_CHECKS + 1))

  if [ -x "${FILE}" ]; then
    echo -e "${GREEN}✓${NC} ${DESC}"
    PASSED_CHECKS=$((PASSED_CHECKS + 1))
  else
    echo -e "${RED}✗${NC} ${DESC} - Not executable: ${FILE}"
  fi
}

# Check Dockerfiles
echo -e "${BLUE}--- Dockerfiles ---${NC}"
check_file "services/response-engine/Dockerfile" "Response Engine Dockerfile"
check_file "services/response-engine/Dockerfile" "Response Engine Dockerfile"
check_file "services/conversation-manager/Dockerfile" "Conversation Manager Dockerfile"
check_file "services/gmail-ingestion/Dockerfile" "Gmail Ingestion Dockerfile"
echo ""

# Check docker-compose
echo -e "${BLUE}--- Docker Compose ---${NC}"
check_file "docker-compose.yml" "docker-compose.yml"
echo ""

# Check environment templates
echo -e "${BLUE}--- Environment Templates ---${NC}"
check_file ".env.development.template" "Development environment template"
check_file ".env.production.template" "Production environment template"
check_file ".gitignore" ".gitignore"
echo ""

# Check setup scripts
echo -e "${BLUE}--- Setup Scripts ---${NC}"
check_executable "scripts/setup/create-service-accounts.sh" "Create service accounts script"
check_executable "scripts/setup/grant-iam-permissions.sh" "Grant IAM permissions script"
check_executable "scripts/setup/create-bigquery-datasets.sh" "Create BigQuery datasets script"
check_executable "scripts/setup/create-secrets.sh" "Create secrets script"
check_executable "scripts/setup/setup-cloud-scheduler.sh" "Setup Cloud Scheduler script"
echo ""

# Check deployment scripts
echo -e "${BLUE}--- Deployment Scripts ---${NC}"
check_executable "scripts/deploy/deploy-all.sh" "Deploy all script"
check_executable "scripts/deploy/deploy-response-engine.sh" "Deploy Response Engine script"
check_executable "scripts/deploy/deploy-response-engine.sh" "Deploy Response Engine script (old)"
check_executable "scripts/deploy/deploy-conversation-manager.sh" "Deploy Conversation Manager script"
check_executable "scripts/deploy/deploy-gmail-ingestion.sh" "Deploy Gmail Ingestion script"
check_executable "scripts/deploy/deploy-stored-procedures.sh" "Deploy stored procedures script"
echo ""

# Check utility scripts
echo -e "${BLUE}--- Utility Scripts ---${NC}"
check_executable "scripts/utilities/test-ingestion.sh" "Test ingestion script"
check_executable "scripts/utilities/check-logs.sh" "Check logs script"
check_executable "scripts/utilities/rollback-service.sh" "Rollback service script"
check_executable "scripts/utilities/export-bigquery-data.sh" "Export BigQuery data script"
check_executable "scripts/utilities/health-check-all.sh" "Health check all script"
echo ""

# Check GitHub workflows
echo -e "${BLUE}--- GitHub Actions Workflows ---${NC}"
check_file ".github/workflows/test.yml" "Test workflow"
check_file ".github/workflows/lint.yml" "Lint workflow"
check_file ".github/workflows/deploy.yml" "Deploy workflow"
echo ""

# Check documentation
echo -e "${BLUE}--- Documentation ---${NC}"
check_file "DEPLOYMENT.md" "Deployment documentation"
check_file "DEVOPS_DELIVERABLE.md" "DevOps deliverable document"
echo ""

# Summary
echo -e "${BLUE}==========================================${NC}"
echo -e "${BLUE}  Summary${NC}"
echo -e "${BLUE}==========================================${NC}"
echo ""
echo -e "Total checks: ${TOTAL_CHECKS}"
echo -e "${GREEN}Passed: ${PASSED_CHECKS}${NC}"
echo -e "${RED}Failed: $((TOTAL_CHECKS - PASSED_CHECKS))${NC}"
echo ""

if [ ${PASSED_CHECKS} -eq ${TOTAL_CHECKS} ]; then
  echo -e "${GREEN}✓ All deployment automation is properly set up!${NC}"
  echo ""
  echo -e "${YELLOW}Next steps:${NC}"
  echo "  1. Run initial setup: ./scripts/setup/create-service-accounts.sh"
  echo "  2. Deploy all services: ./scripts/deploy/deploy-all.sh"
  echo "  3. Check health: ./scripts/utilities/health-check-all.sh"
  exit 0
else
  echo -e "${RED}✗ Some files are missing or not executable${NC}"
  exit 1
fi
