#!/bin/bash

# Deploy Conversation Manager Service to Cloud Run
# Usage: ./deploy.sh [environment]
# Example: ./deploy.sh production

set -e

# Configuration
PROJECT_ID="fdsanalytics"
REGION="us-central1"
SERVICE_NAME="conversation-manager"
ENVIRONMENT="${1:-development}"

echo "======================================"
echo "Deploying Conversation Manager Service"
echo "======================================"
echo "Project: $PROJECT_ID"
echo "Region: $REGION"
echo "Service: $SERVICE_NAME"
echo "Environment: $ENVIRONMENT"
echo "======================================"

# Set project
gcloud config set project $PROJECT_ID

# Build and deploy to Cloud Run
echo ""
echo "Building and deploying to Cloud Run..."
gcloud run deploy $SERVICE_NAME \
  --source . \
  --region $REGION \
  --platform managed \
  --allow-unauthenticated \
  --memory 512Mi \
  --cpu 1 \
  --timeout 60s \
  --max-instances 10 \
  --min-instances 0 \
  --set-env-vars "PROJECT_ID=$PROJECT_ID" \
  --set-env-vars "BQ_DATASET_CHAT_HISTORY=chat_history" \
  --set-env-vars "GEMINI_MODEL_FLASH=gemini-2.5-flash" \
  --set-env-vars "GEMINI_SECRET_NAME=GEMINI_API_KEY" \
  --set-env-vars "DEFAULT_TENANT_ID=senso-sushi" \
  --set-env-vars "MAX_CONVERSATION_HISTORY=10" \
  --set-env-vars "NODE_ENV=$ENVIRONMENT"

# Get service URL
SERVICE_URL=$(gcloud run services describe $SERVICE_NAME --region $REGION --format 'value(status.url)')

echo ""
echo "======================================"
echo "Deployment Complete!"
echo "======================================"
echo "Service URL: $SERVICE_URL"
echo ""
echo "Test endpoints:"
echo "  Health: curl $SERVICE_URL/health"
echo "  Get Context: curl -X POST $SERVICE_URL/get-context -H 'Content-Type: application/json' -d '{...}'"
echo "  Store Message: curl -X POST $SERVICE_URL/store-message -H 'Content-Type: application/json' -d '{...}'"
echo "======================================"
