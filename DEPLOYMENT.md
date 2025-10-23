# FDS Analytics - Deployment Guide

Complete guide for deploying and managing the FDS Analytics system on Google Cloud Platform.

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Initial Setup](#initial-setup)
3. [Local Development](#local-development)
4. [Production Deployment](#production-deployment)
5. [Utilities](#utilities)
6. [CI/CD with GitHub Actions](#cicd-with-github-actions)
7. [Troubleshooting](#troubleshooting)
8. [Rollback Procedures](#rollback-procedures)

---

## Prerequisites

### Required Tools

```bash
# Google Cloud SDK
gcloud version

# Docker
docker --version

# Node.js 20
node --version  # Should be v20.x.x

# BigQuery CLI
bq version
```

### GCP Authentication

```bash
# Login to GCP
gcloud auth login

# Set project
gcloud config set project fdsanalytics

# Configure Docker for GCR
gcloud auth configure-docker

# Set Application Default Credentials (for local development)
gcloud auth application-default login
```

---

## Initial Setup

Run these scripts **once** to set up your GCP infrastructure.

### 1. Create Service Accounts

```bash
./scripts/setup/create-service-accounts.sh
```

Creates service accounts for:
- response-engine
- mcp-server
- conversation-manager
- gmail-ingestion

### 2. Grant IAM Permissions

```bash
./scripts/setup/grant-iam-permissions.sh
```

Grants necessary BigQuery, Secret Manager, and Logging permissions.

### 3. Create BigQuery Datasets

```bash
./scripts/setup/create-bigquery-datasets.sh
```

Creates datasets:
- restaurant_analytics
- insights
- chat_history
- ingestion

### 4. Create Secrets

```bash
./scripts/setup/create-secrets.sh
```

Stores secrets in Secret Manager:
- GEMINI_API_KEY
- GMAIL_OAUTH_CREDENTIALS

### 5. Setup Cloud Scheduler

```bash
./scripts/setup/setup-cloud-scheduler.sh
```

Creates:
- Pub/Sub topic: `gmail-ingestion-trigger`
- Scheduler job: `gmail-ingestion-daily` (runs at 3am CT)

---

## Local Development

### Setup Environment

```bash
# Copy environment template
cp .env.development.template .env.development

# Edit with your values
nano .env.development
```

### Run with Docker Compose

```bash
# Start all services
docker-compose up

# Start in background
docker-compose up -d

# View logs
docker-compose logs -f

# Stop all services
docker-compose down
```

Services will be available at:
- **Response Engine**: http://localhost:3000
- **MCP Server**: http://localhost:3001
- **Conversation Manager**: http://localhost:3002
- **Gmail Ingestion**: http://localhost:3003

### Test Individual Services

```bash
# Response Engine health check
curl http://localhost:3000/health

# MCP Server health check
curl http://localhost:3001/health
```

---

## Production Deployment

### Deploy All Services (Recommended)

```bash
# One-command deployment
./scripts/deploy/deploy-all.sh
```

This deploys in the correct order:
1. BigQuery Stored Procedures
2. MCP Server
3. Conversation Manager
4. Response Engine
5. Gmail Ingestion

### Deploy Individual Services

```bash
# Deploy MCP Server
./scripts/deploy/deploy-mcp-server.sh

# Deploy Conversation Manager
./scripts/deploy/deploy-conversation-manager.sh

# Deploy Response Engine
./scripts/deploy/deploy-response-engine.sh

# Deploy Gmail Ingestion
./scripts/deploy/deploy-gmail-ingestion.sh

# Deploy Stored Procedures
./scripts/deploy/deploy-stored-procedures.sh
```

### Deployment Order (Important!)

If deploying individually, follow this order:

1. **BigQuery stored procedures** (no dependencies)
2. **MCP Server** (depends on stored procedures)
3. **Conversation Manager** (independent)
4. **Grant service-to-service IAM permissions**
5. **Response Engine** (depends on MCP + Conversation Manager)
6. **Gmail Ingestion** (independent)

### Grant Service-to-Service Permissions

After deploying MCP Server and Conversation Manager:

```bash
# Allow Response Engine to invoke MCP Server
gcloud run services add-iam-policy-binding mcp-server \
  --region=us-central1 \
  --member='serviceAccount:response-engine@fdsanalytics.iam.gserviceaccount.com' \
  --role='roles/run.invoker' \
  --project=fdsanalytics

# Allow Response Engine to invoke Conversation Manager
gcloud run services add-iam-policy-binding conversation-manager \
  --region=us-central1 \
  --member='serviceAccount:response-engine@fdsanalytics.iam.gserviceaccount.com' \
  --role='roles/run.invoker' \
  --project=fdsanalytics
```

---

## Utilities

### Health Check All Services

```bash
./scripts/utilities/health-check-all.sh
```

Checks health of all deployed services and reports status.

### Check Logs

```bash
# Check logs for a service
./scripts/utilities/check-logs.sh response-engine

# Check last 100 logs
./scripts/utilities/check-logs.sh mcp-server 100

# Available services:
# - response-engine
# - mcp-server
# - conversation-manager
# - gmail-ingestion
```

### Manually Trigger Ingestion

```bash
./scripts/utilities/test-ingestion.sh
```

Publishes a message to Pub/Sub to trigger Gmail ingestion immediately.

### Rollback a Service

```bash
./scripts/utilities/rollback-service.sh response-engine
```

Rolls back to the previous revision of a Cloud Run service.

### Export BigQuery Data

```bash
./scripts/utilities/export-bigquery-data.sh
```

Exports all BigQuery datasets to Cloud Storage for backup.

---

## CI/CD with GitHub Actions

### Workflows

Three workflows are configured:

#### 1. Test Workflow (`test.yml`)

Runs on every push and PR:
- Installs dependencies
- Runs ESLint
- Runs unit tests
- Runs integration tests
- Generates coverage report

#### 2. Lint Workflow (`lint.yml`)

Runs on every PR:
- ESLint check
- TypeScript compilation check
- Prettier format check

#### 3. Deploy Workflow (`deploy.yml`)

Runs on push to `main`:
- Runs tests
- Builds Docker images
- Deploys to Cloud Run/Functions
- Runs smoke tests
- Notifies on failure

### Required Secrets

Add these to GitHub repository secrets:

- `GCP_SA_KEY`: Service account JSON key with deployment permissions
- `GCP_SA_KEY_TEST`: Service account JSON key for test environment

### Manual Deployment via GitHub

Go to Actions > Deploy to Production > Run workflow

---

## Troubleshooting

### Docker Build Fails

```bash
# Clean Docker cache
docker system prune -a

# Rebuild without cache
docker-compose build --no-cache
```

### Deployment Fails

```bash
# Check if service account exists
gcloud iam service-accounts list --project=fdsanalytics

# Check if secrets exist
gcloud secrets list --project=fdsanalytics

# Check Cloud Run services
gcloud run services list --region=us-central1 --project=fdsanalytics
```

### Health Check Fails

```bash
# Check service logs
./scripts/utilities/check-logs.sh response-engine 50

# Check service status
gcloud run services describe response-engine \
  --region=us-central1 \
  --project=fdsanalytics
```

### Ingestion Not Working

```bash
# Check Cloud Scheduler job
gcloud scheduler jobs describe gmail-ingestion-daily \
  --location=us-central1 \
  --project=fdsanalytics

# Check Pub/Sub topic
gcloud pubsub topics list --project=fdsanalytics

# Manually trigger ingestion
./scripts/utilities/test-ingestion.sh

# Check function logs
./scripts/utilities/check-logs.sh gmail-ingestion
```

### Permission Denied Errors

```bash
# Re-run IAM permission grants
./scripts/setup/grant-iam-permissions.sh

# Check service account permissions
gcloud projects get-iam-policy fdsanalytics \
  --flatten="bindings[].members" \
  --filter="bindings.members:serviceAccount:response-engine@fdsanalytics.iam.gserviceaccount.com"
```

---

## Rollback Procedures

### Rollback Cloud Run Service

```bash
# Automatic rollback to previous revision
./scripts/utilities/rollback-service.sh response-engine

# Manual rollback to specific revision
gcloud run services update-traffic response-engine \
  --to-revisions=response-engine-00005-abc=100 \
  --region=us-central1 \
  --project=fdsanalytics
```

### Rollback Cloud Function

Cloud Functions Gen2 don't support direct rollback. Redeploy previous version:

```bash
# Deploy specific commit
git checkout <previous-commit-hash>
./scripts/deploy/deploy-gmail-ingestion.sh
git checkout main
```

### Restore BigQuery Data

```bash
# From automatic snapshots (< 7 days)
bq cp -f \
  fdsanalytics:restaurant_analytics@-86400000 \
  fdsanalytics:restaurant_analytics_recovered

# From Cloud Storage backup
bq load --source_format=PARQUET \
  fdsanalytics:restaurant_analytics.reports \
  gs://fdsanalytics-backups/TIMESTAMP/restaurant_analytics/reports/*.parquet
```

---

## Monitoring

### View Logs

```bash
# Cloud Run logs
gcloud logging read "resource.type=cloud_run_revision" \
  --project=fdsanalytics \
  --limit=50

# Cloud Function logs
gcloud functions logs read gmail-ingestion \
  --gen2 \
  --region=us-central1 \
  --project=fdsanalytics \
  --limit=50
```

### View Metrics

```bash
# Response Engine metrics
gcloud monitoring time-series list \
  --filter='resource.type="cloud_run_revision" AND resource.labels.service_name="response-engine"' \
  --project=fdsanalytics
```

### Cloud Scheduler Status

```bash
# Check scheduler job status
gcloud scheduler jobs describe gmail-ingestion-daily \
  --location=us-central1 \
  --project=fdsanalytics
```

---

## Cost Optimization

### Scale to Zero

All Cloud Run services are configured with `--min-instances=0` to scale to zero when idle.

### Monitor Costs

```bash
# View current costs
gcloud billing accounts list

# Check BigQuery query costs
bq show --project_id=fdsanalytics --jobs
```

---

## Support

For issues or questions:
- Check logs: `./scripts/utilities/check-logs.sh <service-name>`
- Run health checks: `./scripts/utilities/health-check-all.sh`
- Review GCP Console: https://console.cloud.google.com/

---

**Last Updated**: October 22, 2025
**Version**: 1.0
