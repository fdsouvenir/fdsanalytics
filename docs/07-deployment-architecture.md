# Deployment Architecture
## Senso Restaurant Analytics - Version 1.0

**Purpose:** Define GCP services, IAM roles, CI/CD pipeline, and environment management.

---

## 1. GCP Services Architecture

### 1.1 Service Map

```
┌─────────────────────────────────────────────────────────────┐
│                      Google Cloud Platform                   │
│                      Project: fdsanalytics                   │
│                      Region: us-central1                     │
└─────────────────────────────────────────────────────────────┘

┌───────────────────┐         ┌───────────────────┐
│  Google Chat API  │◄────────┤  Response Engine  │
│                   │         │  (Cloud Run)      │
└───────────────────┘         │  512MB / 1 CPU    │
                              │  0-10 instances   │
                              └────────┬──────────┘
                                       │
                    ┌──────────────────┼──────────────────┐
                    │                  │                  │
            ┌───────▼────────┐  ┌──────▼──────┐  ┌──────▼──────┐
            │ Conversation    │  │    MCP      │  │   Chart     │
            │   Manager       │  │   Server    │  │  Builder    │
            │ (Cloud Run)     │  │ (Cloud Run) │  │  (Library)  │
            │ 256MB / 0.5 CPU │  │ 256MB / 0.5 │  └─────────────┘
            └────────┬────────┘  └──────┬──────┘         │
                     │                  │                │
                     │                  │                │
                ┌────▼──────────────────▼────────────────▼────┐
                │           BigQuery                           │
                │  ├── restaurant_analytics (raw data)         │
                │  ├── insights (pre-computed)                 │
                │  ├── chat_history (conversations)            │
                │  └── ingestion (logs)                        │
                └──────────────────────────────────────────────┘
                
┌──────────────────┐         ┌───────────────────┐
│ Cloud Scheduler  │────────►│ Gmail Ingestion   │
│ Daily 3am CT     │         │ (Cloud Function)  │
└──────────────────┘         │ 512MB / 540s      │
                             └─────────┬─────────┘
                                       │
                             ┌─────────▼─────────┐
                             │    Gmail API      │
                             │  (OAuth scoped)   │
                             └───────────────────┘

┌───────────────────┐         ┌───────────────────┐
│  Secret Manager   │◄────────┤  All Services     │
│  - GEMINI_API_KEY │         │  (read secrets)   │
│  - GMAIL_OAUTH    │         └───────────────────┘
└───────────────────┘

┌───────────────────┐         ┌───────────────────┐
│  Cloud Logging    │◄────────┤  All Services     │
│  (structured JSON)│         │  (write logs)     │
└───────────────────┘         └───────────────────┘

┌───────────────────┐
│  Cloud Monitoring │
│  - Alerts         │
│  - Dashboards     │
│  - Uptime Checks  │
└───────────────────┘
```

**Note on Legacy Services:**
Two legacy services from earlier implementation phases remain deployed but are not part of the V1.0 architecture:
- `chatbot` - Original Phase 1 Google Chat integration (superseded by response-engine)
- `insightsengine` - Phase 3 nightly analytics (still in use for pre-computed insights)

These services can coexist with the new architecture during migration. Plan to deprecate `chatbot` once `response-engine` is fully validated.

---

## 2. Service Specifications

### 2.1 Response Engine (Cloud Run)

**Name:** `response-engine`  
**Image:** `gcr.io/fdsanalytics/response-engine:latest`  
**Runtime:** Node.js 20  

**Resources:**
- CPU: 1
- Memory: 512Mi
- Timeout: 60s
- Min instances: 0
- Max instances: 10

**Scaling:**
- Concurrency: 10 requests per container
- Scale to zero: Yes (cost optimization)
- CPU throttling: No
- Startup CPU boost: Yes

**Service Account:** `response-engine@fdsanalytics.iam.gserviceaccount.com`

**IAM Permissions:**
- `roles/bigquery.jobUser`
- `roles/bigquery.dataViewer`
- `roles/secretmanager.secretAccessor`
- `roles/logging.logWriter`

**Environment Variables:**
```yaml
PROJECT_ID: fdsanalytics
REGION: us-central1
ENVIRONMENT: production
LOG_LEVEL: info
GEMINI_SECRET_NAME: GEMINI_API_KEY
MCP_SERVER_URL: https://mcp-server-xxxxxxxxxx-uc.a.run.app
CONVERSATION_MANAGER_URL: https://conversation-manager-xxxxxxxxxx-uc.a.run.app
```

**Health Check:**
- Path: `/health`
- Initial delay: 10s
- Period: 30s
- Timeout: 5s
- Failure threshold: 3

**Deploy Command:**
```bash
gcloud run deploy response-engine \
  --source . \
  --region us-central1 \
  --platform managed \
  --service-account response-engine@fdsanalytics.iam.gserviceaccount.com \
  --memory 512Mi \
  --cpu 1 \
  --timeout 60s \
  --min-instances 0 \
  --max-instances 10 \
  --concurrency 10 \
  --ingress all \
  --allow-unauthenticated \
  --set-env-vars PROJECT_ID=fdsanalytics,ENVIRONMENT=production \
  --set-secrets GEMINI_API_KEY=GEMINI_API_KEY:latest
```

### 2.2 MCP Server (Cloud Run)

**Name:** `mcp-server`  
**Image:** `gcr.io/fdsanalytics/mcp-server:latest`  
**Runtime:** Node.js 20  

**Resources:**
- CPU: 0.5
- Memory: 256Mi
- Timeout: 30s
- Min instances: 0
- Max instances: 20

**Service Account:** `mcp-server@fdsanalytics.iam.gserviceaccount.com`

**IAM Permissions:**
- `roles/bigquery.jobUser`
- `roles/bigquery.dataViewer`
- `roles/logging.logWriter`

**Deploy Command:**
```bash
gcloud run deploy mcp-server \
  --source ./services/mcp-server \
  --region us-central1 \
  --service-account mcp-server@fdsanalytics.iam.gserviceaccount.com \
  --memory 256Mi \
  --cpu 0.5 \
  --timeout 30s \
  --min-instances 0 \
  --max-instances 20 \
  --ingress internal \
  --no-allow-unauthenticated \
  --set-env-vars PROJECT_ID=fdsanalytics
```

### 2.3 Conversation Manager (Cloud Run)

**Name:** `conversation-manager`  
**Image:** `gcr.io/fdsanalytics/conversation-manager:latest`  
**Runtime:** Node.js 20  

**Resources:**
- CPU: 0.5
- Memory: 256Mi
- Timeout: 30s
- Min instances: 0
- Max instances: 10

**Service Account:** `conversation-manager@fdsanalytics.iam.gserviceaccount.com`

**IAM Permissions:**
- `roles/bigquery.jobUser`
- `roles/bigquery.dataEditor` (write to chat_history)
- `roles/secretmanager.secretAccessor`
- `roles/logging.logWriter`

**Deploy Command:**
```bash
gcloud run deploy conversation-manager \
  --source ./services/conversation-manager \
  --region us-central1 \
  --service-account conversation-manager@fdsanalytics.iam.gserviceaccount.com \
  --memory 256Mi \
  --cpu 0.5 \
  --timeout 30s \
  --ingress internal \
  --no-allow-unauthenticated \
  --set-env-vars PROJECT_ID=fdsanalytics \
  --set-secrets GEMINI_API_KEY=GEMINI_API_KEY:latest
```

### 2.4 Gmail Ingestion (Cloud Run)

**Name:** `gmail-ingestion`
**Image:** `gcr.io/fdsanalytics/gmail-ingestion:latest`
**Runtime:** Node.js 20

**Resources:**
- CPU: 0.5
- Memory: 512Mi
- Timeout: 540s (9 minutes)
- Min instances: 0
- Max instances: 1

**Trigger:** HTTP endpoint (invoked by Cloud Scheduler via Pub/Sub or direct HTTP)

**Service Account:** `gmail-ingestion@fdsanalytics.iam.gserviceaccount.com`

**IAM Permissions:**
- `roles/bigquery.jobUser`
- `roles/bigquery.dataEditor`
- `roles/secretmanager.secretAccessor`
- `roles/logging.logWriter`

**Deploy Command:**
```bash
gcloud run deploy gmail-ingestion \
  --source ./services/gmail-ingestion \
  --region us-central1 \
  --service-account gmail-ingestion@fdsanalytics.iam.gserviceaccount.com \
  --memory 512Mi \
  --cpu 0.5 \
  --timeout 540s \
  --min-instances 0 \
  --max-instances 1 \
  --ingress internal-and-cloud-load-balancing \
  --no-allow-unauthenticated \
  --set-env-vars PROJECT_ID=fdsanalytics,ENVIRONMENT=production \
  --set-secrets GEMINI_API_KEY=GEMINI_API_KEY:latest,GMAIL_OAUTH_CREDENTIALS=GMAIL_OAUTH_CREDENTIALS:latest
```

---

## 3. IAM Configuration

### 3.1 Service Accounts

```bash
# Create service accounts
gcloud iam service-accounts create response-engine \
  --display-name "Response Engine Service Account"

gcloud iam service-accounts create mcp-server \
  --display-name "MCP Server Service Account"

gcloud iam service-accounts create conversation-manager \
  --display-name "Conversation Manager Service Account"

gcloud iam service-accounts create gmail-ingestion \
  --display-name "Gmail Ingestion Service Account"
```

### 3.2 IAM Bindings

```bash
# Response Engine
gcloud projects add-iam-policy-binding fdsanalytics \
  --member="serviceAccount:response-engine@fdsanalytics.iam.gserviceaccount.com" \
  --role="roles/bigquery.jobUser"

gcloud projects add-iam-policy-binding fdsanalytics \
  --member="serviceAccount:response-engine@fdsanalytics.iam.gserviceaccount.com" \
  --role="roles/bigquery.dataViewer"

gcloud secrets add-iam-policy-binding GEMINI_API_KEY \
  --member="serviceAccount:response-engine@fdsanalytics.iam.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"

# MCP Server (similar bindings)

# Gmail Ingestion (needs dataEditor for writes)
gcloud projects add-iam-policy-binding fdsanalytics \
  --member="serviceAccount:gmail-ingestion@fdsanalytics.iam.gserviceaccount.com" \
  --role="roles/bigquery.dataEditor"
```

### 3.3 Service-to-Service Communication

```bash
# Allow Response Engine to invoke MCP Server
gcloud run services add-iam-policy-binding mcp-server \
  --region us-central1 \
  --member="serviceAccount:response-engine@fdsanalytics.iam.gserviceaccount.com" \
  --role="roles/run.invoker"

# Allow Response Engine to invoke Conversation Manager
gcloud run services add-iam-policy-binding conversation-manager \
  --region us-central1 \
  --member="serviceAccount:response-engine@fdsanalytics.iam.gserviceaccount.com" \
  --role="roles/run.invoker"
```

---

## 4. CI/CD Pipeline

### 4.1 GitHub Actions Workflow

```yaml
# .github/workflows/deploy.yml

name: Deploy to Production

on:
  push:
    branches: [main]
  workflow_dispatch:

env:
  PROJECT_ID: fdsanalytics
  REGION: us-central1

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - uses: actions/setup-node@v3
        with:
          node-version: '20'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Run unit tests
        run: npm run test:unit
      
      - name: Run integration tests
        run: npm run test:integration
        env:
          GOOGLE_APPLICATION_CREDENTIALS: ${{ secrets.GCP_SA_KEY_TEST }}
      
      - name: Check coverage
        run: npm run test:coverage

  build:
    needs: test
    runs-on: ubuntu-latest
    strategy:
      matrix:
        service: [response-engine, mcp-server, conversation-manager, gmail-ingestion]
    steps:
      - uses: actions/checkout@v3
      
      - uses: google-github-actions/auth@v1
        with:
          credentials_json: ${{ secrets.GCP_SA_KEY }}
      
      - uses: google-github-actions/setup-gcloud@v1
      
      - name: Build and push Docker image
        run: |
          gcloud builds submit \
            --tag gcr.io/$PROJECT_ID/${{ matrix.service }}:${{ github.sha }} \
            --tag gcr.io/$PROJECT_ID/${{ matrix.service }}:latest \
            ./services/${{ matrix.service }}

  deploy:
    needs: build
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - uses: google-github-actions/auth@v1
        with:
          credentials_json: ${{ secrets.GCP_SA_KEY }}
      
      - uses: google-github-actions/setup-gcloud@v1
      
      - name: Deploy Response Engine
        run: ./scripts/deploy-response-engine.sh
      
      - name: Deploy MCP Server
        run: ./scripts/deploy-mcp-server.sh
      
      - name: Deploy Conversation Manager
        run: ./scripts/deploy-conversation-manager.sh
      
      - name: Deploy Gmail Ingestion
        run: ./scripts/deploy-gmail-ingestion.sh
      
      - name: Run smoke tests
        run: npm run test:smoke

  notify:
    needs: deploy
    runs-on: ubuntu-latest
    if: always()
    steps:
      - name: Notify on success
        if: success()
        run: |
          curl -X POST ${{ secrets.SLACK_WEBHOOK }} \
            -H 'Content-Type: application/json' \
            -d '{"text":"✅ Deployment successful"}'
      
      - name: Notify on failure
        if: failure()
        run: |
          curl -X POST ${{ secrets.SLACK_WEBHOOK }} \
            -H 'Content-Type: application/json' \
            -d '{"text":"❌ Deployment failed"}'
```

### 4.2 Deployment Scripts

```bash
#!/bin/bash
# scripts/deploy-response-engine.sh

set -e

PROJECT_ID="fdsanalytics"
REGION="us-central1"
SERVICE_NAME="response-engine"
IMAGE="gcr.io/${PROJECT_ID}/${SERVICE_NAME}:latest"

echo "Deploying ${SERVICE_NAME}..."

gcloud run deploy ${SERVICE_NAME} \
  --image ${IMAGE} \
  --region ${REGION} \
  --platform managed \
  --service-account ${SERVICE_NAME}@${PROJECT_ID}.iam.gserviceaccount.com \
  --memory 512Mi \
  --cpu 1 \
  --timeout 60s \
  --min-instances 0 \
  --max-instances 10 \
  --concurrency 10 \
  --ingress all \
  --allow-unauthenticated \
  --set-env-vars PROJECT_ID=${PROJECT_ID},ENVIRONMENT=production \
  --set-secrets GEMINI_API_KEY=GEMINI_API_KEY:latest

echo "✅ Deployment complete"

# Get service URL
URL=$(gcloud run services describe ${SERVICE_NAME} \
  --region ${REGION} \
  --format 'value(status.url)')

echo "Service URL: ${URL}"
```

---

## 5. Environment Management

### 5.1 Development Environment

**Purpose:** Local development and testing  
**Resources:** Local Docker containers  
**Data:** Test BigQuery dataset (`fdsanalytics-test`)  

**Setup:**
```bash
# Start local services
docker-compose up -d

# Services available at:
# - Response Engine: http://localhost:3000
# - MCP Server: http://localhost:3001
# - Conversation Manager: http://localhost:3002
```

### 5.2 Production Environment

**Purpose:** Live user traffic  
**Resources:** GCP Cloud Run services  
**Data:** Production BigQuery dataset (`fdsanalytics`)  

**Characteristics:**
- Auto-scaling (0-10+ instances)
- Monitoring & alerting enabled
- Log retention: 30 days
- Backup strategy: Daily BQ snapshots

---

## 6. Networking

### 6.1 Service Communication

```
[External] Google Chat ──HTTPS──> Response Engine (public)
                                      │
                            ┌─────────┴─────────┐
                            │                   │
                    HTTPS (internal)    HTTPS (internal)
                            │                   │
                            ▼                   ▼
                    MCP Server          Conversation Manager
                    (internal)              (internal)
                            │                   │
                            └─────────┬─────────┘
                                      │
                                BigQuery API
                                      │
                                  BigQuery
```

**Security:**
- Response Engine: Public (authenticated via Google Chat)
- MCP Server: Internal only (requires IAM invoker role)
- Conversation Manager: Internal only (requires IAM invoker role)
- Gmail Ingestion: Pub/Sub trigger only

### 6.2 VPC Configuration

**Current:** Default VPC (sufficient for v1)  
**Future (Multi-tenant):** VPC Service Controls for data isolation

---

## 7. Monitoring & Observability

### 7.1 Cloud Logging

**Log Export Sink:**
```bash
gcloud logging sinks create bigquery-export \
  bigquery.googleapis.com/projects/fdsanalytics/datasets/logs \
  --log-filter='resource.type="cloud_run_revision" OR resource.type="cloud_function"'
```

**Log Queries:**
```sql
-- Find errors in last hour
SELECT timestamp, jsonPayload.message, jsonPayload.error
FROM `fdsanalytics.logs.cloudrun_logs`
WHERE timestamp > TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 1 HOUR)
  AND severity = 'ERROR'
ORDER BY timestamp DESC;

-- Response time analysis
SELECT 
  AVG(jsonPayload.durationMs) as avg_duration,
  APPROX_QUANTILES(jsonPayload.durationMs, 100)[OFFSET(95)] as p95_duration
FROM `fdsanalytics.logs.cloudrun_logs`
WHERE timestamp > TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 1 DAY)
  AND jsonPayload.component = 'response-engine';
```

### 7.2 Cloud Monitoring Dashboards

**Response Engine Dashboard:**
- Request rate (requests/sec)
- Error rate (%)
- P50/P95/P99 latency
- Instance count
- CPU utilization
- Memory utilization

**Gmail Ingestion Dashboard:**
- PDFs processed per hour
- Success rate (%)
- Average processing time
- Failed ingestions

**BigQuery Dashboard:**
- Query count
- Bytes scanned
- Slot utilization
- Query errors

### 7.3 Alerting Policies

```bash
# High error rate alert
gcloud alpha monitoring policies create \
  --notification-channels=CHANNEL_ID \
  --display-name="Response Engine High Error Rate" \
  --condition-display-name="Error rate > 5%" \
  --condition-threshold-value=5 \
  --condition-threshold-duration=300s \
  --condition-filter='resource.type="cloud_run_revision" 
                      resource.labels.service_name="response-engine"
                      severity="ERROR"'

# High latency alert
gcloud alpha monitoring policies create \
  --notification-channels=CHANNEL_ID \
  --display-name="Response Engine High Latency" \
  --condition-display-name="P95 latency > 10s" \
  --condition-threshold-value=10000 \
  --condition-threshold-duration=300s \
  --condition-filter='resource.type="cloud_run_revision"
                      metric.type="run.googleapis.com/request_latencies"'
```

---

## 8. Secrets Management

### 8.1 Secret Creation

```bash
# Create Gemini API key secret
echo -n "YOUR_API_KEY" | gcloud secrets create GEMINI_API_KEY \
  --project=fdsanalytics \
  --replication-policy="automatic" \
  --data-file=-

# Create Gmail OAuth secret
echo '{"senso-sushi":{"access_token":"...","refresh_token":"..."}}' | \
  gcloud secrets create GMAIL_OAUTH_CREDENTIALS \
  --project=fdsanalytics \
  --replication-policy="automatic" \
  --data-file=-
```

### 8.2 Secret Rotation

```bash
# Add new version
echo -n "NEW_API_KEY" | gcloud secrets versions add GEMINI_API_KEY \
  --data-file=-

# Services automatically pick up latest version on restart

# Disable old version after validation
gcloud secrets versions disable 1 --secret=GEMINI_API_KEY
```

---

## 9. Disaster Recovery

### 9.1 Backup Strategy

**BigQuery:**
- Automatic 7-day snapshots (built-in)
- Manual exports to GCS monthly
- Cross-region replication: Disabled (cost optimization)

**Secrets:**
- Export to encrypted file monthly
- Store in separate GCS bucket

**Code:**
- GitHub repository (primary)
- Mirror to GCS bucket weekly

### 9.2 Recovery Procedures

**Service Failure:**
```bash
# Rollback to previous version
gcloud run services update-traffic response-engine \
  --to-revisions=PREVIOUS_REVISION=100
```

**Data Loss:**
```bash
# Restore from snapshot (< 7 days)
bq cp -f \
  fdsanalytics:restaurant_analytics@-86400000 \
  fdsanalytics:restaurant_analytics_recovered

# Restore from GCS export (> 7 days)
bq load --source_format=PARQUET \
  fdsanalytics:restaurant_analytics.reports \
  gs://fdsanalytics-backups/reports/*.parquet
```

---

## 10. Cost Optimization

### 10.1 Cost Breakdown (Estimated)

| Service | Monthly Cost | Notes |
|---------|--------------|-------|
| Cloud Run (Response Engine) | $5-10 | Scale to zero |
| Cloud Run (MCP Server) | $3-5 | Minimal traffic |
| Cloud Run (Conversation Manager) | $2-4 | Lightweight |
| Cloud Function (Ingestion) | $2-3 | Daily runs |
| BigQuery Storage | $0.50 | <1GB data |
| BigQuery Queries | $5-10 | <100GB scanned/month |
| Gemini API | $20-40 | Flash + Pro usage |
| Secret Manager | $0.10 | 2 secrets |
| Cloud Logging | $2-5 | 30-day retention |
| **Total** | **$40-80/month** | Single tenant |

### 10.2 Cost Optimization Strategies

- ✅ Scale to zero (Cloud Run min instances = 0)
- ✅ Use Gemini Flash for lightweight tasks
- ✅ Partition BQ tables by date (reduce scan size)
- ✅ Cache frequently accessed data
- ✅ Set query timeouts (prevent runaway costs)
- ✅ Use materialized views for insights

---

## 11. Deployment Checklist

### 11.1 Initial Setup

- [ ] Create GCP project
- [ ] Enable APIs (Cloud Run, BigQuery, Secret Manager, etc.)
- [ ] Create service accounts
- [ ] Grant IAM permissions
- [ ] Create BigQuery datasets
- [ ] Create secrets
- [ ] Deploy services
- [ ] Configure Cloud Scheduler
- [ ] Set up monitoring dashboards
- [ ] Configure alert policies
- [ ] Test end-to-end flow

### 11.2 Per Deployment

- [ ] Run tests locally
- [ ] Commit and push to main branch
- [ ] CI/CD pipeline runs automatically
- [ ] Monitor deployment logs
- [ ] Verify health checks pass
- [ ] Run smoke tests
- [ ] Check monitoring dashboards
- [ ] Review error logs (first 30 minutes)

---

**Document Version:** 1.0  
**Last Updated:** October 22, 2025  
**Dependencies:** All previous documents
