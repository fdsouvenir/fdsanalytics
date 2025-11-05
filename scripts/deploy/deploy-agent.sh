#!/bin/bash

##############################################################################
# Deploy FDS Analytics Agent to Vertex AI Agent Engine
#
# Deploys the ADK agent to Vertex AI's fully-managed runtime.
# The agent orchestrates calls to the Node.js Tool Server.
#
# Prerequisites:
#   - Run setup-agent-infrastructure.sh first (one-time)
#   - Python 3.9+ installed
#   - Agent dependencies installed: cd agent && pip install -r requirements.txt
#
# Usage:
#   ./scripts/deploy/deploy-agent.sh
#
# Environment Variables:
#   PROJECT_ID (default: fdsanalytics)
#   REGION (default: us-central1)
##############################################################################

set -e  # Exit on error

# Configuration
PROJECT_ID="${PROJECT_ID:-fdsanalytics}"
REGION="${REGION:-us-central1}"
STAGING_BUCKET="gs://${PROJECT_ID}-agent-staging"
AGENT_DIR="$(cd "$(dirname "$0")/../.." && pwd)/agent"

echo "============================================================"
echo "FDS Analytics - Agent Deployment"
echo "============================================================"
echo "Project ID:      $PROJECT_ID"
echo "Region:          $REGION"
echo "Staging Bucket:  $STAGING_BUCKET"
echo "Agent Directory: $AGENT_DIR"
echo "============================================================"
echo ""

# Verify gcloud authentication
echo "[1/5] Verifying authentication..."
if ! gcloud auth application-default print-access-token &>/dev/null; then
    echo "✗ Error: Application Default Credentials not set"
    echo "  Run: gcloud auth application-default login"
    exit 1
fi
echo "✓ Authentication verified"
echo ""

# Verify agent files exist
echo "[2/5] Verifying agent files..."
if [ ! -f "$AGENT_DIR/agent.py" ]; then
    echo "✗ Error: agent.py not found in $AGENT_DIR"
    exit 1
fi
if [ ! -f "$AGENT_DIR/deploy.py" ]; then
    echo "✗ Error: deploy.py not found in $AGENT_DIR"
    exit 1
fi
if [ ! -f "$AGENT_DIR/../vertex-ai-tools-config.yaml" ]; then
    echo "✗ Error: vertex-ai-tools-config.yaml not found"
    exit 1
fi
echo "✓ Agent files found"
echo ""

# Check Python dependencies
echo "[3/5] Checking Python dependencies..."
if ! python3 -c "import vertexai" 2>/dev/null; then
    echo "⚠ Warning: Vertex AI SDK not installed"
    echo "  Installing dependencies..."
    cd "$AGENT_DIR"
    pip install -r requirements.txt --quiet
    cd - >/dev/null
    echo "✓ Dependencies installed"
else
    echo "✓ Dependencies already installed"
fi
echo ""

# Verify staging bucket exists
echo "[4/5] Verifying staging bucket..."
if ! gsutil ls -b "$STAGING_BUCKET" &>/dev/null; then
    echo "✗ Error: Staging bucket not found: $STAGING_BUCKET"
    echo "  Run: ./scripts/deploy/setup-agent-infrastructure.sh"
    exit 1
fi
echo "✓ Staging bucket exists"
echo ""

# Deploy agent
echo "[5/5] Deploying agent to Vertex AI Agent Engine..."
echo "  (This may take 2-3 minutes...)"
echo ""

cd "$AGENT_DIR"
export PROJECT_ID="$PROJECT_ID"
export REGION="$REGION"
export STAGING_BUCKET="$STAGING_BUCKET"

if python3 deploy.py; then
    echo ""
    echo "============================================================"
    echo "DEPLOYMENT SUCCESSFUL!"
    echo "============================================================"
    echo ""
    echo "The agent is now deployed and ready to use."
    echo ""
    echo "Test the agent:"
    echo "  cd agent && python3 test_agent.py"
    echo ""
    echo "View in Console:"
    echo "  https://console.cloud.google.com/vertex-ai/agents?project=$PROJECT_ID"
    echo ""
    echo "View logs:"
    echo "  gcloud logging read 'resource.type=\"aiplatform.googleapis.com/ReasoningEngine\"' \\"
    echo "    --project=$PROJECT_ID \\"
    echo "    --limit=50 \\"
    echo "    --format=json"
    echo ""
    echo "============================================================"
    exit 0
else
    echo ""
    echo "✗ Deployment failed"
    echo ""
    echo "Troubleshooting:"
    echo "  1. Check that setup-agent-infrastructure.sh was run successfully"
    echo "  2. Verify IAM permissions: https://console.cloud.google.com/iam-admin/iam?project=$PROJECT_ID"
    echo "  3. Check Vertex AI API is enabled: gcloud services list --enabled | grep vertex"
    echo "  4. Review error messages above"
    echo ""
    exit 1
fi
