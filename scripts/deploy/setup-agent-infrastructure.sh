#!/bin/bash

##############################################################################
# Setup Agent Infrastructure
#
# One-time setup for Vertex AI Agent Engine deployment:
# - Enable required APIs
# - Create GCS staging bucket
# - Configure IAM permissions for Extension Service Agent
# - Grant Tool Server invocation permissions
#
# Usage:
#   ./scripts/deploy/setup-agent-infrastructure.sh
#
# Environment Variables:
#   PROJECT_ID (default: fdsanalytics)
#   REGION (default: us-central1)
##############################################################################

set -e  # Exit on error

# Configuration
PROJECT_ID="${PROJECT_ID:-fdsanalytics}"
REGION="${REGION:-us-central1}"
STAGING_BUCKET="${PROJECT_ID}-agent-staging"
TOOL_SERVER_SERVICE="response-engine"
TOOL_SERVER_SA="vtx-agent-fds-tool-invoker@${PROJECT_ID}.iam.gserviceaccount.com"

echo "============================================================"
echo "FDS Analytics - Agent Infrastructure Setup"
echo "============================================================"
echo "Project ID:      $PROJECT_ID"
echo "Region:          $REGION"
echo "Staging Bucket:  gs://$STAGING_BUCKET"
echo "============================================================"
echo ""

# Verify gcloud is authenticated
echo "[1/6] Verifying gcloud authentication..."
if ! gcloud auth list --filter=status:ACTIVE --format="value(account)" &>/dev/null; then
    echo "✗ Error: Not authenticated with gcloud"
    echo "  Run: gcloud auth login"
    exit 1
fi
ACTIVE_ACCOUNT=$(gcloud auth list --filter=status:ACTIVE --format="value(account)")
echo "✓ Authenticated as: $ACTIVE_ACCOUNT"
echo ""

# Set active project
echo "[2/6] Setting active project..."
gcloud config set project "$PROJECT_ID" >/dev/null 2>&1
echo "✓ Active project: $PROJECT_ID"
echo ""

# Enable required APIs
echo "[3/6] Enabling required Google Cloud APIs..."
echo "  - aiplatform.googleapis.com (Vertex AI)"
echo "  - vertexai.googleapis.com (Vertex AI Agent Engine)"
echo "  - storage.googleapis.com (Cloud Storage)"

gcloud services enable \
    aiplatform.googleapis.com \
    vertexai.googleapis.com \
    storage.googleapis.com \
    --project="$PROJECT_ID" \
    --quiet

echo "✓ APIs enabled"
echo ""

# Create GCS staging bucket
echo "[4/6] Creating GCS staging bucket..."
if gsutil ls -b "gs://$STAGING_BUCKET" &>/dev/null; then
    echo "✓ Bucket already exists: gs://$STAGING_BUCKET"
else
    echo "  Creating: gs://$STAGING_BUCKET"
    gsutil mb -l "$REGION" "gs://$STAGING_BUCKET"
    echo "✓ Bucket created successfully"
fi
echo ""

# Get project number for service agent
echo "[5/6] Configuring Extension Service Agent IAM..."
PROJECT_NUMBER=$(gcloud projects describe "$PROJECT_ID" --format="value(projectNumber)")
EXTENSION_SA="service-${PROJECT_NUMBER}@gcp-sa-vertex-ex.iam.gserviceaccount.com"

echo "  Extension Service Agent: $EXTENSION_SA"
echo ""

# Grant Extension Service Agent access to Cloud Storage
echo "  [5a] Granting Storage Object Viewer role..."
if gsutil iam ch "serviceAccount:${EXTENSION_SA}:roles/storage.objectViewer" "gs://$STAGING_BUCKET" 2>/dev/null; then
    echo "  ✓ Storage permissions granted"
else
    echo "  ⚠ Warning: Could not grant storage permissions (may already exist)"
fi

# Grant Extension Service Agent permission to invoke Tool Server
echo "  [5b] Granting Cloud Run Invoker role for Tool Server..."
if gcloud run services add-iam-policy-binding "$TOOL_SERVER_SERVICE" \
    --region="$REGION" \
    --member="serviceAccount:${EXTENSION_SA}" \
    --role="roles/run.invoker" \
    --project="$PROJECT_ID" \
    >/dev/null 2>&1; then
    echo "  ✓ Tool Server invocation permissions granted"
else
    echo "  ⚠ Warning: Could not grant Tool Server permissions (may already exist)"
fi

# Grant Extension Service Agent permission to impersonate Tool Server SA
echo "  [5c] Granting Service Account Token Creator role..."
if gcloud iam service-accounts add-iam-policy-binding "$TOOL_SERVER_SA" \
    --member="serviceAccount:${EXTENSION_SA}" \
    --role="roles/iam.serviceAccountTokenCreator" \
    --project="$PROJECT_ID" \
    >/dev/null 2>&1; then
    echo "  ✓ Token creator permissions granted"
else
    echo "  ⚠ Warning: Could not grant token creator permissions (may already exist)"
fi

echo "✓ IAM configuration complete"
echo ""

# Verify Tool Server is deployed
echo "[6/6] Verifying Tool Server deployment..."
if gcloud run services describe "$TOOL_SERVER_SERVICE" \
    --region="$REGION" \
    --project="$PROJECT_ID" \
    --format="value(status.url)" &>/dev/null; then
    TOOL_SERVER_URL=$(gcloud run services describe "$TOOL_SERVER_SERVICE" \
        --region="$REGION" \
        --project="$PROJECT_ID" \
        --format="value(status.url)")
    echo "✓ Tool Server is deployed: $TOOL_SERVER_URL"
else
    echo "⚠ Warning: Tool Server not found"
    echo "  Deploy it first: ./scripts/deploy/deploy-response-engine.sh"
fi
echo ""

# Summary
echo "============================================================"
echo "SETUP COMPLETE!"
echo "============================================================"
echo ""
echo "Infrastructure is ready for agent deployment."
echo ""
echo "Next steps:"
echo "  1. Install Python dependencies: cd agent && pip install -r requirements.txt"
echo "  2. Deploy the agent: ./scripts/deploy/deploy-agent.sh"
echo "  3. Test the agent: python agent/test_agent.py"
echo ""
echo "Configuration:"
echo "  Project:         $PROJECT_ID"
echo "  Region:          $REGION"
echo "  Staging Bucket:  gs://$STAGING_BUCKET"
echo "  Extension SA:    $EXTENSION_SA"
echo "  Tool Server SA:  $TOOL_SERVER_SA"
echo ""
echo "============================================================"
