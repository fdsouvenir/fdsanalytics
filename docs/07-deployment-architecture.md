# Deployment Architecture
## Senso Restaurant Analytics - Version 1.0

**Purpose:** Define GCP services, IAM roles, deployment procedures, and environment management.

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
                    ┌──────────────────┴──────────────────┐
                    │                                     │
            ┌───────▼────────┐                   ┌───────▼────────┐
            │ Conversation    │                   │   Vertex AI    │
            │   Manager       │                   │  Gemini Flash  │
            │ (Cloud Run)     │                   │  (GCP managed) │
            │ 256MB / 0.5 CPU │                   └────────────────┘
            └────────┬────────┘
                     │
                     │
                ┌────▼──────────────────────────────────────────┐
                │           BigQuery                            │
                │  ├── restaurant_analytics (raw data)          │
                │  ├── insights (pre-computed)                  │
                │  ├── chat_history (conversations)             │
                │  └── ingestion (logs)                         │
                └───────────────────────────────────────────────┘

┌──────────────────┐         ┌───────────────────┐
│ Cloud Scheduler  │────────►│ Gmail Ingestion   │
│ Daily 3am CT     │         │ (Cloud Run)       │
└──────────────────┘         │ 512MB / 540s      │
                             └─────────┬─────────┘
                                       │
                             ┌─────────▼─────────┐
                             │    Gmail API      │
                             │  (OAuth scoped)   │
                             └───────────────────┘

┌───────────────────┐         ┌───────────────────┐
│  Secret Manager   │◄────────┤  All Services     │
│ - GMAIL_OAUTH     │         │  (read secrets)   │
│  (NOT API keys)   │         └───────────────────┘
└───────────────────┘         Note: Vertex AI uses
                              Application Default
                              Credentials (no keys)

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

**V1 Services (3 total):**
1. **response-engine** - Main orchestrator, handles Google Chat webhooks
2. **conversation-manager** - Chat history and context (currently disabled for performance)
3. **gmail-ingestion** - PMIX PDF parsing and BigQuery loading

**Note:** No separate MCP server or BQHandler service. Response Engine directly calls BigQuery stored procedures via AnalyticsToolHandler.

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
- `roles/bigquery.jobUser` - Run queries and call stored procedures
- `roles/bigquery.dataViewer` - Read from all datasets
- `roles/logging.logWriter` - Write structured logs
- `roles/aiplatform.user` - Call Vertex AI Gemini (via ADC)
- `roles/run.invoker` on `conversation-manager` - Invoke internal service

**Environment Variables:**
```yaml
PROJECT_ID: fdsanalytics
REGION: us-central1
ENVIRONMENT: production
LOG_LEVEL: info
CONVERSATION_MANAGER_URL: https://conversation-manager-xxxxxxxxxx-uc.a.run.app
BQ_DATASET_ANALYTICS: restaurant_analytics
BQ_DATASET_INSIGHTS: insights
BQ_DATASET_CHAT_HISTORY: chat_history
```

**Note:** No `GEMINI_SECRET_NAME` or `GEMINI_API_KEY` - Vertex AI uses Application Default Credentials automatically.

**Health Check:**
- Path: `/health`
- Initial delay: 10s
- Period: 30s
- Timeout: 5s
- Failure threshold: 3

**Deploy Command:**
```bash
gcloud run deploy response-engine \
  --source ./services/response-engine \
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
  --set-env-vars PROJECT_ID=fdsanalytics,REGION=us-central1,ENVIRONMENT=production
```

**File:** `scripts/deploy/deploy-response-engine.sh`

---

### 2.2 Conversation Manager (Cloud Run)

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
- `roles/bigquery.jobUser` - Query chat history
- `roles/bigquery.dataEditor` - Write to chat_history dataset
- `roles/logging.logWriter` - Write structured logs
- `roles/aiplatform.user` - Call Vertex AI for summarization

**Environment Variables:**
```yaml
PROJECT_ID: fdsanalytics
REGION: us-central1
BQ_DATASET_CHAT_HISTORY: chat_history
```

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
  --set-env-vars PROJECT_ID=fdsanalytics,REGION=us-central1
```

**V1 Status:** Deployed but context extraction **disabled** for performance. Response Engine passes empty context.

**File:** `scripts/deploy/deploy-conversation-manager.sh`

---

### 2.3 Gmail Ingestion (Cloud Run)

**Name:** `gmail-ingestion`
**Image:** `gcr.io/fdsanalytics/gmail-ingestion:latest`
**Runtime:** Node.js 20

**Resources:**
- CPU: 0.5
- Memory: 512Mi
- Timeout: 540s (9 minutes)
- Min instances: 0
- Max instances: 1

**Trigger:** HTTP endpoint invoked by Cloud Scheduler (daily at 3am CT)

**Service Account:** `gmail-ingestion@fdsanalytics.iam.gserviceaccount.com`

**IAM Permissions:**
- `roles/bigquery.jobUser` - Run queries
- `roles/bigquery.dataEditor` - Write to restaurant_analytics and ingestion datasets
- `roles/secretmanager.secretAccessor` - Read Gmail OAuth credentials
- `roles/logging.logWriter` - Write structured logs
- `roles/aiplatform.user` - Call Vertex AI for PDF parsing (Gemini 2.5 Flash Lite)

**Environment Variables:**
```yaml
PROJECT_ID: fdsanalytics
REGION: us-central1
ENVIRONMENT: production
BQ_DATASET_ANALYTICS: restaurant_analytics
BQ_DATASET_INGESTION: ingestion
GMAIL_OAUTH_SECRET_NAME: GMAIL_OAUTH_CREDENTIALS
GMAIL_SEARCH_QUERY: from:spoton subject:pmix
```

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
  --set-secrets GMAIL_OAUTH_CREDENTIALS=GMAIL_OAUTH_CREDENTIALS:latest
```

**File:** `scripts/deploy/deploy-gmail-ingestion.sh`

---

## 3. IAM Configuration

### 3.1 Service Accounts

```bash
# Create service accounts
gcloud iam service-accounts create response-engine \
  --display-name "Response Engine Service Account"

gcloud iam service-accounts create conversation-manager \
  --display-name "Conversation Manager Service Account"

gcloud iam service-accounts create gmail-ingestion \
  --display-name "Gmail Ingestion Service Account"
```

### 3.2 IAM Bindings

```bash
# Response Engine - BigQuery access
gcloud projects add-iam-policy-binding fdsanalytics \
  --member="serviceAccount:response-engine@fdsanalytics.iam.gserviceaccount.com" \
  --role="roles/bigquery.jobUser"

gcloud projects add-iam-policy-binding fdsanalytics \
  --member="serviceAccount:response-engine@fdsanalytics.iam.gserviceaccount.com" \
  --role="roles/bigquery.dataViewer"

# Response Engine - Vertex AI access (for Gemini)
gcloud projects add-iam-policy-binding fdsanalytics \
  --member="serviceAccount:response-engine@fdsanalytics.iam.gserviceaccount.com" \
  --role="roles/aiplatform.user"

# Conversation Manager - BigQuery access
gcloud projects add-iam-policy-binding fdsanalytics \
  --member="serviceAccount:conversation-manager@fdsanalytics.iam.gserviceaccount.com" \
  --role="roles/bigquery.jobUser"

gcloud projects add-iam-policy-binding fdsanalytics \
  --member="serviceAccount:conversation-manager@fdsanalytics.iam.gserviceaccount.com" \
  --role="roles/bigquery.dataEditor"

# Conversation Manager - Vertex AI access (for summarization)
gcloud projects add-iam-policy-binding fdsanalytics \
  --member="serviceAccount:conversation-manager@fdsanalytics.iam.gserviceaccount.com" \
  --role="roles/aiplatform.user"

# Gmail Ingestion - BigQuery write access
gcloud projects add-iam-policy-binding fdsanalytics \
  --member="serviceAccount:gmail-ingestion@fdsanalytics.iam.gserviceaccount.com" \
  --role="roles/bigquery.dataEditor"

# Gmail Ingestion - Vertex AI access (for PDF parsing)
gcloud projects add-iam-policy-binding fdsanalytics \
  --member="serviceAccount:gmail-ingestion@fdsanalytics.iam.gserviceaccount.com" \
  --role="roles/aiplatform.user"

# Gmail Ingestion - Secret Manager access
gcloud secrets add-iam-policy-binding GMAIL_OAUTH_CREDENTIALS \
  --member="serviceAccount:gmail-ingestion@fdsanalytics.iam.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"
```

### 3.3 Service-to-Service Communication

```bash
# Allow Response Engine to invoke Conversation Manager
gcloud run services add-iam-policy-binding conversation-manager \
  --region us-central1 \
  --member="serviceAccount:response-engine@fdsanalytics.iam.gserviceaccount.com" \
  --role="roles/run.invoker"

# Allow Cloud Scheduler to invoke Gmail Ingestion
gcloud run services add-iam-policy-binding gmail-ingestion \
  --region us-central1 \
  --member="serviceAccount:cloud-scheduler@fdsanalytics.iam.gserviceaccount.com" \
  --role="roles/run.invoker"
```

---

## 4. Deployment Order

**CRITICAL:** Services must be deployed in this order to resolve dependencies:

```bash
# 1. Deploy Conversation Manager first (no dependencies)
./scripts/deploy/deploy-conversation-manager.sh

# 2. Deploy Response Engine (depends on Conversation Manager URL)
./scripts/deploy/deploy-response-engine.sh

# 3. Deploy Gmail Ingestion (independent)
./scripts/deploy/deploy-gmail-ingestion.sh

# 4. Deploy BigQuery stored procedures (data layer)
./scripts/deploy/deploy-stored-procedures.sh

# 5. Verify all services
./scripts/utilities/health-check-all.sh
```

**All-in-one script:**
```bash
./scripts/deploy/deploy-all.sh
```

**File:** `scripts/deploy/deploy-all.sh`

---

## 5. Environment Management

### 5.1 Development Environment

**Purpose:** Local development and testing
**Resources:** Local Docker containers
**Data:** Connects to test BigQuery dataset or local emulator

**Setup:**
```bash
# Authenticate with GCP (for local BigQuery access)
gcloud auth application-default login

# Start local services
docker-compose up -d

# Services available at:
# - Response Engine: http://localhost:3000
# - Conversation Manager: http://localhost:3002
# - Gmail Ingestion: http://localhost:3003
```

**Environment Variables (.env.development):**
```bash
PROJECT_ID=fdsanalytics
REGION=us-central1
ENVIRONMENT=development
LOG_LEVEL=debug
BQ_DATASET_ANALYTICS=restaurant_analytics
BQ_DATASET_INSIGHTS=insights
BQ_DATASET_CHAT_HISTORY=chat_history
```

### 5.2 Production Environment

**Purpose:** Live user traffic
**Resources:** GCP Cloud Run services
**Data:** Production BigQuery dataset (`fdsanalytics`)

**Characteristics:**
- Auto-scaling (0-10+ instances per service)
- Monitoring & alerting enabled
- Log retention: 30 days
- Backup strategy: Daily BQ snapshots
- Regional: us-central1 (co-located with Vertex AI and BigQuery)

---

## 6. Networking

### 6.1 Service Communication

```
[External] Google Chat ──HTTPS──> Response Engine (public, unauthenticated)
                                      │
                            ┌─────────┴─────────┐
                            │                   │
                    HTTPS (internal)    HTTPS (regional API)
                    + IAM auth                  │
                            │                   │
                            ▼                   ▼
                    Conversation Manager    Vertex AI
                    (internal, auth)        Gemini 2.5 Flash
                            │                   │
                            └─────────┬─────────┘
                                      │
                                BigQuery API
                                  (regional)
                                      │
                                  BigQuery
```

**Security:**
- **Response Engine:** Public (Google Chat verifies requests via bearer token)
- **Conversation Manager:** Internal only (requires `roles/run.invoker`)
- **Gmail Ingestion:** Internal + Cloud Load Balancing (for Cloud Scheduler)
- **Vertex AI:** Regional endpoint (us-central1), ADC authentication
- **BigQuery:** Regional API (us-central1), service account authentication

### 6.2 VPC Configuration

**Current:** Default VPC (sufficient for V1)
**Rationale:** All services in same region (us-central1), low latency (<50ms)

**Future (Multi-tenant V2):**
- VPC Service Controls for data isolation
- Private Service Connect for Vertex AI
- Cloud NAT for egress traffic control

---

## 7. Monitoring & Observability

### 7.1 Cloud Logging

**Log Export Sink:**
```bash
gcloud logging sinks create bigquery-export \
  bigquery.googleapis.com/projects/fdsanalytics/datasets/logs \
  --log-filter='resource.type="cloud_run_revision"'
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

-- Function call analysis
SELECT
  jsonPayload.metadata.function as intent_function,
  COUNT(*) as call_count,
  AVG(jsonPayload.durationMs) as avg_duration
FROM `fdsanalytics.logs.cloudrun_logs`
WHERE timestamp > TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 1 DAY)
  AND jsonPayload.message = 'Intent function executed successfully'
GROUP BY intent_function
ORDER BY call_count DESC;
```

### 7.2 Cloud Monitoring Dashboards

**Response Engine Dashboard:**
- Request rate (requests/sec)
- Error rate (%) - Target: <1%
- P50/P95/P99 latency - Target: P95 <10s
- Instance count
- CPU utilization - Target: <70%
- Memory utilization - Target: <80%
- Vertex AI API latency
- BigQuery query duration

**Gmail Ingestion Dashboard:**
- PDFs processed per run
- Success rate (%) - Target: >95%
- Average processing time per PDF
- Failed ingestions (by error type)
- Gemini API calls for PDF parsing

**BigQuery Dashboard:**
- Query count (by stored procedure)
- Bytes scanned per query
- Slot utilization
- Query errors
- Cache hit rate (insights fast path vs slow path)

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
  --condition-display-name="P95 latency > 15s" \
  --condition-threshold-value=15000 \
  --condition-threshold-duration=300s \
  --condition-filter='resource.type="cloud_run_revision"
                      resource.labels.service_name="response-engine"
                      metric.type="run.googleapis.com/request_latencies"'

# Gmail Ingestion failures
gcloud alpha monitoring policies create \
  --notification-channels=CHANNEL_ID \
  --display-name="Gmail Ingestion Failures" \
  --condition-display-name="Failed PDF processing > 3 in 1 hour" \
  --condition-threshold-value=3 \
  --condition-threshold-duration=3600s \
  --condition-filter='resource.type="cloud_run_revision"
                      resource.labels.service_name="gmail-ingestion"
                      jsonPayload.message="PDF processing failed"'
```

---

## 8. Secrets Management

### 8.1 Secret Creation

**Gmail OAuth Credentials:**
```bash
# Create Gmail OAuth secret (per-tenant JSON)
echo '{"senso-sushi":{"access_token":"...","refresh_token":"...","token_expiry":"..."}}' | \
  gcloud secrets create GMAIL_OAUTH_CREDENTIALS \
  --project=fdsanalytics \
  --replication-policy="automatic" \
  --data-file=-
```

**Note:** No Gemini API key secret needed. Vertex AI uses Application Default Credentials automatically.

### 8.2 Secret Rotation

```bash
# Add new version of Gmail OAuth (when tokens refreshed)
echo '{"senso-sushi":{"access_token":"NEW_...","refresh_token":"NEW_..."}}' | \
  gcloud secrets versions add GMAIL_OAUTH_CREDENTIALS \
  --data-file=-

# Services automatically pick up latest version on restart

# Disable old version after validation
gcloud secrets versions disable 1 --secret=GMAIL_OAUTH_CREDENTIALS
```

---

## 9. Disaster Recovery

### 9.1 Backup Strategy

**BigQuery:**
- Automatic 7-day time-travel (built-in)
- Manual exports to GCS monthly:
  ```bash
  bq extract --destination_format=PARQUET \
    fdsanalytics:restaurant_analytics.reports \
    gs://fdsanalytics-backups/$(date +%Y%m)/reports/*.parquet
  ```
- Cross-region replication: Disabled (cost optimization for V1)

**Secrets:**
- Export Gmail OAuth tokens to encrypted file monthly
- Store in separate GCS bucket with versioning enabled

**Code:**
- GitHub repository (primary) - commit history preserved
- Docker images in GCR tagged with git SHA

### 9.2 Recovery Procedures

**Service Failure:**
```bash
# Rollback to previous revision
PREVIOUS_REVISION=$(gcloud run revisions list \
  --service response-engine \
  --region us-central1 \
  --limit 2 \
  --format="value(metadata.name)" | tail -1)

gcloud run services update-traffic response-engine \
  --region us-central1 \
  --to-revisions=$PREVIOUS_REVISION=100
```

**Data Loss:**
```bash
# Restore from time-travel (< 7 days ago)
bq cp -f \
  'fdsanalytics:restaurant_analytics.reports@-86400000' \
  fdsanalytics:restaurant_analytics.reports_recovered

# Restore from GCS export (> 7 days ago)
bq load --source_format=PARQUET --replace \
  fdsanalytics:restaurant_analytics.reports \
  gs://fdsanalytics-backups/202510/reports/*.parquet
```

---

## 10. Cost Optimization

### 10.1 Cost Breakdown (Estimated Monthly)

| Service | Monthly Cost | Notes |
|---------|--------------|-------|
| Cloud Run (Response Engine) | $5-10 | Scale to zero, ~500 requests/day |
| Cloud Run (Conversation Manager) | $1-2 | Minimal traffic (context disabled) |
| Cloud Run (Gmail Ingestion) | $2-3 | Daily runs (540s timeout) |
| BigQuery Storage | $0.50 | <1GB data (200+ reports) |
| BigQuery Queries | $5-10 | <100GB scanned/month |
| BigQuery Insights Cache | $1 | Pre-computed daily summaries |
| Vertex AI Gemini Flash | $15-25 | ~500 calls/day, thinking mode |
| Vertex AI Flash Lite | $2-5 | PDF parsing (daily) |
| Secret Manager | $0.10 | 1 secret (Gmail OAuth) |
| Cloud Logging | $2-5 | 30-day retention |
| Cloud Monitoring | $1-2 | Dashboards + alerts |
| **Total** | **$35-65/month** | Single tenant |

### 10.2 Cost Optimization Strategies

**Implemented:**
- ✅ Scale to zero (Cloud Run min instances = 0)
- ✅ Use Gemini 2.5 Flash (not Pro) - 10x cheaper
- ✅ Use Gemini 2.5 Flash Lite for PDF parsing - 20x cheaper
- ✅ Insights cache system (fast path saves 5-7s per query)
- ✅ Regional co-location (us-central1) - no egress fees
- ✅ Query timeouts (30s max) - prevent runaway costs
- ✅ Conversation context disabled - saves 4-6s per query
- ✅ Charts deferred - saves 2-3s per query

**Future Optimizations:**
- Consider committed use discounts for BigQuery (if usage grows)
- Implement query result caching (reduce redundant queries)
- Add CDN for chart images (when charts re-enabled)

---

## 11. Deployment Checklist

### 11.1 Initial Setup (One-time)

- [ ] Create GCP project
- [ ] Enable APIs:
  - [ ] Cloud Run API
  - [ ] BigQuery API
  - [ ] Secret Manager API
  - [ ] Cloud Logging API
  - [ ] Cloud Monitoring API
  - [ ] Vertex AI API (for Gemini)
  - [ ] Cloud Scheduler API
  - [ ] Cloud Build API
- [ ] Create service accounts (3 total)
- [ ] Grant IAM permissions (BigQuery, Vertex AI, Cloud Run)
- [ ] Create BigQuery datasets (4 total)
- [ ] Deploy BigQuery stored procedures (insights + restaurant_analytics)
- [ ] Create Gmail OAuth secret
- [ ] Deploy services in order (conversation-manager → response-engine → gmail-ingestion)
- [ ] Configure Cloud Scheduler job (daily 3am CT)
- [ ] Set up monitoring dashboards
- [ ] Configure alert policies
- [ ] Test end-to-end flow (Google Chat → analytics query → response)

### 11.2 Per Deployment

**Automated (via scripts):**
- [ ] Run `./scripts/deploy/deploy-all.sh`
- [ ] Script validates service account permissions
- [ ] Script deploys services in correct order
- [ ] Script verifies health checks pass
- [ ] Script outputs service URLs

**Manual Verification:**
- [ ] Check deployment logs for errors
- [ ] Test Google Chat integration (send test query)
- [ ] Review Cloud Monitoring dashboards (first 30 minutes)
- [ ] Check error logs in Cloud Logging
- [ ] Verify BigQuery query costs (check bytes scanned)

---

## 12. Regional Architecture

**All services co-located in `us-central1` for optimal performance:**

```
┌─────────────────────────────────────────┐
│         us-central1 Region              │
├─────────────────────────────────────────┤
│  Cloud Run Services                     │
│  ├── response-engine                    │
│  ├── conversation-manager               │
│  └── gmail-ingestion                    │
│                                         │
│  Vertex AI                              │
│  └── Gemini 2.5 Flash endpoint          │
│                                         │
│  BigQuery                               │
│  ├── restaurant_analytics dataset       │
│  ├── insights dataset                   │
│  ├── chat_history dataset               │
│  └── ingestion dataset                  │
└─────────────────────────────────────────┘
```

**Benefits:**
- <50ms latency between services
- No cross-region egress fees
- Single region simplifies compliance

**Trade-offs:**
- No multi-region redundancy (acceptable for V1)
- Single point of failure (us-central1 outage affects all services)

---

**Document Version:** 1.0
**Last Updated:** October 30, 2025
**Dependencies:**
- 02-api-contracts.md (service interfaces)
- 09-gemini-integration.md (Vertex AI details)
