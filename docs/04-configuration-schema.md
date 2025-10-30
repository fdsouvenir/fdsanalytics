# Configuration Schema
## Senso Restaurant Analytics - Version 1.0

**Purpose:** Define all configuration, secrets, and environment management.

---

## 1. Environment Variables

### 1.1 Development Environment (.env.development)

```bash
# ============================================================================
# GCP Configuration
# ============================================================================
PROJECT_ID=fdsanalytics
REGION=us-central1
ENVIRONMENT=development

# ============================================================================
# BigQuery Datasets
# ============================================================================
BQ_DATASET_ANALYTICS=restaurant_analytics
BQ_DATASET_INSIGHTS=insights
BQ_DATASET_CHAT_HISTORY=chat_history
BQ_DATASET_INGESTION=ingestion

# ============================================================================
# Secret Manager References (LEGACY)
# ============================================================================
GEMINI_SECRET_NAME=GEMINI_API_KEY  # LEGACY: Not used with Vertex AI (uses ADC)
GMAIL_OAUTH_SECRET_NAME=GMAIL_OAUTH_CREDENTIALS

# ============================================================================
# Gemini Models
# ============================================================================
GEMINI_MODEL_FLASH=gemini-2.5-flash
GEMINI_MODEL_PRO=gemini-2.5-pro

# ============================================================================
# Application Settings
# ============================================================================
DEFAULT_TIMEZONE=America/Chicago
DEFAULT_CURRENCY=USD
LOG_LEVEL=debug

# ============================================================================
# Feature Flags
# ============================================================================
ENABLE_CHARTS=true
ENABLE_FORECASTS=true
ENABLE_ANOMALY_DETECTION=true
ENABLE_CONVERSATION_HISTORY=false  # Disabled for performance in V1

# ============================================================================
# Rate Limits & Constraints
# ============================================================================
MAX_CHART_DATAPOINTS=20
MAX_CONVERSATION_HISTORY=10
MAX_QUERY_RESULTS=100
QUERY_TIMEOUT_SECONDS=30

# ============================================================================
# Ingestion Configuration
# ============================================================================
INGESTION_SCHEDULE=0 3 * * *              # 3am daily (cron format)
GMAIL_SEARCH_QUERY=from:spoton subject:pmix has:attachment
BACKFILL_BATCH_SIZE=10
BACKFILL_PROGRESS_NOTIFICATION_INTERVAL=20  # Notify every N reports

# ============================================================================
# Service URLs (for local testing)
# ============================================================================
CONVERSATION_MANAGER_URL=http://localhost:3001
CHART_BUILDER_URL=https://quickchart.io

# ============================================================================
# Local Development Only
# ============================================================================
USE_ADC_AUTH=true                         # Application Default Credentials
SKIP_GMAIL_AUTH=false                     # For testing without Gmail
```

### 1.2 Production Environment (.env.production)

```bash
# ============================================================================
# GCP Configuration
# ============================================================================
PROJECT_ID=fdsanalytics
REGION=us-central1
ENVIRONMENT=production

# ============================================================================
# BigQuery Datasets (same as dev)
# ============================================================================
BQ_DATASET_ANALYTICS=restaurant_analytics
BQ_DATASET_INSIGHTS=insights
BQ_DATASET_CHAT_HISTORY=chat_history
BQ_DATASET_INGESTION=ingestion

# ============================================================================
# Secret Manager References (LEGACY)
# ============================================================================
GEMINI_SECRET_NAME=GEMINI_API_KEY  # LEGACY: Not used with Vertex AI (uses ADC)
GMAIL_OAUTH_SECRET_NAME=GMAIL_OAUTH_CREDENTIALS

# ============================================================================
# Gemini Models
# ============================================================================
GEMINI_MODEL_FLASH=gemini-2.5-flash
GEMINI_MODEL_PRO=gemini-2.5-pro

# ============================================================================
# Application Settings
# ============================================================================
DEFAULT_TIMEZONE=America/Chicago
DEFAULT_CURRENCY=USD
LOG_LEVEL=info                            # Less verbose in prod

# ============================================================================
# Feature Flags
# ============================================================================
ENABLE_CHARTS=true
ENABLE_FORECASTS=true
ENABLE_ANOMALY_DETECTION=true
ENABLE_CONVERSATION_HISTORY=false  # Disabled for performance in V1

# ============================================================================
# Rate Limits & Constraints
# ============================================================================
MAX_CHART_DATAPOINTS=20
MAX_CONVERSATION_HISTORY=10
MAX_QUERY_RESULTS=100
QUERY_TIMEOUT_SECONDS=30

# ============================================================================
# Ingestion Configuration
# ============================================================================
INGESTION_SCHEDULE=0 3 * * *
GMAIL_SEARCH_QUERY=from:spoton subject:pmix has:attachment
BACKFILL_BATCH_SIZE=10
BACKFILL_PROGRESS_NOTIFICATION_INTERVAL=20

# ============================================================================
# Service URLs
# ============================================================================
CONVERSATION_MANAGER_URL=https://response-engine-xxxxxxxxxx-uc.a.run.app
CHART_BUILDER_URL=https://quickchart.io

# ============================================================================
# Production Settings
# ============================================================================
USE_ADC_AUTH=true                         # Vertex AI uses ADC automatically
SKIP_GMAIL_AUTH=false
```

---

## 2. Secrets (Google Secret Manager)

### 2.1 GEMINI_API_KEY (LEGACY - NOT USED)

**Secret Name:** `GEMINI_API_KEY`
**Status:** ⚠️ LEGACY - No longer used with Vertex AI
**Type:** API Key (string)
**Rotation:** N/A (deprecated)

**Why deprecated:**
- Vertex AI uses Application Default Credentials (ADC) instead of API keys
- Service accounts automatically have access via IAM role `roles/aiplatform.user`
- No secret management required for Vertex AI authentication

**Current Authentication (Vertex AI):**
```typescript
import { VertexAI } from '@google-cloud/vertexai';

// No API key needed - uses ADC automatically
const vertexAI = new VertexAI({
  project: process.env.PROJECT_ID,
  location: 'us-central1'
});
```

**Note:** The `GEMINI_SECRET_NAME` environment variable is kept for backwards compatibility but is unused.

### 2.2 GMAIL_OAUTH_CREDENTIALS

**Secret Name:** `GMAIL_OAUTH_CREDENTIALS`  
**Type:** OAuth 2.0 credentials (JSON)  
**Rotation:** Per tenant (during /setup)  
**Access:** Gmail Ingestion Service only

**Structure:**
```json
{
  "senso-sushi": {
    "access_token": "ya29.a0...",
    "refresh_token": "1//0g...",
    "expiry_date": 1729584000000,
    "token_type": "Bearer"
  }
}
```

**Multi-tenant Structure (Future):**
```json
{
  "tenant_abc123": { ... },
  "tenant_xyz789": { ... }
}
```

**Update Pattern (Add New Tenant):**
```typescript
// 1. Read current secret
const current = await getSecret('GMAIL_OAUTH_CREDENTIALS');
const credentials = JSON.parse(current);

// 2. Add new tenant
credentials[tenantId] = {
  access_token: oauth.access_token,
  refresh_token: oauth.refresh_token,
  expiry_date: Date.now() + 3600000
};

// 3. Write back to Secret Manager (new version)
await secretClient.addSecretVersion({
  parent: `projects/${PROJECT_ID}/secrets/GMAIL_OAUTH_CREDENTIALS`,
  payload: {
    data: Buffer.from(JSON.stringify(credentials))
  }
});
```

---

## 3. Runtime Configuration

### 3.1 Tenant Configuration Object

**In-memory config passed through the system:**

```typescript
interface TenantConfig {
  // Identity
  tenantId: string;
  businessName: string;
  
  // GCP Resources
  bqProject: string;
  bqDataset: string;
  
  // Localization
  timezone: string;              // IANA timezone
  currency: string;              // ISO 4217 code
  
  // Features (can override environment defaults)
  enableCharts: boolean;
  enableForecasts: boolean;
  enableAnomalyDetection: boolean;
  enableConversationHistory: boolean;  // Currently false for V1
  
  // Metadata
  createdAt: Date;
  status: 'active' | 'suspended' | 'trial';
}
```

**V1 Hardcoded Config:**
```typescript
const SENSO_CONFIG: TenantConfig = {
  tenantId: 'senso-sushi',
  businessName: 'Senso Sushi',
  bqProject: 'fdsanalytics',
  bqDataset: 'restaurant_analytics',
  timezone: 'America/Chicago',
  currency: 'USD',
  enableCharts: true,
  enableForecasts: true,
  enableAnomalyDetection: true,
  enableConversationHistory: false,  // Disabled for performance
  createdAt: new Date('2025-01-01'),
  status: 'active'
};
```

### 3.2 Feature Flags

```typescript
interface FeatureFlags {
  // Core features
  charts: boolean;
  forecasts: boolean;
  anomalyDetection: boolean;
  conversationHistory: boolean;
  
  // Future features (all false for v1)
  multiTenant: boolean;
  laborReports: boolean;
  spotonApiSync: boolean;
  customReports: boolean;
  scheduledReports: boolean;
}

const FEATURE_FLAGS: FeatureFlags = {
  charts: true,
  forecasts: true,
  anomalyDetection: true,
  conversationHistory: true,
  multiTenant: false,
  laborReports: false,
  spotonApiSync: false,
  customReports: false,
  scheduledReports: false
};
```

**Usage:**
```typescript
if (FEATURE_FLAGS.charts) {
  const chartUrl = await chartBuilder.generate(spec);
}
```

---

## 4. Service Account Permissions

### 4.1 Response Engine Service Account

**Name:** `response-engine@fdsanalytics.iam.gserviceaccount.com`

**Permissions:**
- `roles/bigquery.jobUser` - Run queries
- `roles/bigquery.dataViewer` - Read from all datasets
- `roles/aiplatform.user` - Access Vertex AI Gemini API
- `roles/logging.logWriter` - Write logs

**IAM Bindings:**
```bash
gcloud projects add-iam-policy-binding fdsanalytics \
  --member="serviceAccount:response-engine@fdsanalytics.iam.gserviceaccount.com" \
  --role="roles/bigquery.jobUser"

gcloud projects add-iam-policy-binding fdsanalytics \
  --member="serviceAccount:response-engine@fdsanalytics.iam.gserviceaccount.com" \
  --role="roles/bigquery.dataViewer"
```

### 4.2 Gmail Ingestion Service Account

**Name:** `gmail-ingestion@fdsanalytics.iam.gserviceaccount.com`

**Permissions:**
- `roles/bigquery.jobUser` - Run MERGE queries
- `roles/bigquery.dataEditor` - Write to ingestion, restaurant_analytics datasets
- `roles/secretmanager.secretAccessor` - Read GMAIL_OAUTH_CREDENTIALS
- `roles/aiplatform.user` - Access Vertex AI for PDF parsing
- `roles/logging.logWriter` - Write logs

**Additional:** Gmail API OAuth scopes (user-granted, not service account)

### 4.3 Conversation Manager Service Account

**Name:** `conversation-manager@fdsanalytics.iam.gserviceaccount.com`

**Permissions:**
- `roles/bigquery.jobUser` - Query chat history
- `roles/bigquery.dataEditor` - Write chat history
- `roles/aiplatform.user` - Access Vertex AI for summarization
- `roles/logging.logWriter` - Write logs

---

## 5. Cloud Function / Cloud Run Configuration

### 5.1 Response Engine (Cloud Run)

```yaml
# service.yaml
apiVersion: serving.knative.dev/v1
kind: Service
metadata:
  name: response-engine
  namespace: fdsanalytics
spec:
  template:
    metadata:
      annotations:
        autoscaling.knative.dev/minScale: '0'
        autoscaling.knative.dev/maxScale: '10'
    spec:
      serviceAccountName: response-engine@fdsanalytics.iam.gserviceaccount.com
      containers:
      - image: gcr.io/fdsanalytics/response-engine:latest
        resources:
          limits:
            memory: 512Mi
            cpu: '1'
        env:
        - name: PROJECT_ID
          value: fdsanalytics
        - name: REGION
          value: us-central1
        - name: ENVIRONMENT
          value: production
        - name: LOG_LEVEL
          value: info
        - name: GEMINI_SECRET_NAME
          value: GEMINI_API_KEY
        - name: CONVERSATION_MANAGER_URL
          value: https://response-engine-xxxxxxxxxx-uc.a.run.app
```

**Deploy Command:**
```bash
gcloud run deploy response-engine \
  --source . \
  --region us-central1 \
  --service-account response-engine@fdsanalytics.iam.gserviceaccount.com \
  --set-env-vars PROJECT_ID=fdsanalytics,ENVIRONMENT=production \
  --memory 512Mi \
  --timeout 60s \
  --min-instances 0 \
  --max-instances 10
```

### 5.2 Gmail Ingestion (Cloud Function Gen2)

```yaml
# function-config.yaml
name: gmail-ingestion
runtime: nodejs20
entry_point: ingestReports
service_account: gmail-ingestion@fdsanalytics.iam.gserviceaccount.com

environment_variables:
  PROJECT_ID: fdsanalytics
  ENVIRONMENT: production
  LOG_LEVEL: info

secret_environment_variables:
- key: GEMINI_API_KEY
  secret: GEMINI_API_KEY
  version: latest
- key: GMAIL_OAUTH_CREDENTIALS
  secret: GMAIL_OAUTH_CREDENTIALS
  version: latest

timeout: 540s
memory: 512MB
```

**Deploy Command:**
```bash
gcloud functions deploy gmail-ingestion \
  --gen2 \
  --runtime nodejs20 \
  --region us-central1 \
  --source ./services/gmail-ingestion \
  --entry-point ingestReports \
  --service-account gmail-ingestion@fdsanalytics.iam.gserviceaccount.com \
  --set-env-vars PROJECT_ID=fdsanalytics \
  --set-secrets GEMINI_API_KEY=GEMINI_API_KEY:latest,GMAIL_OAUTH_CREDENTIALS=GMAIL_OAUTH_CREDENTIALS:latest \
  --timeout 540s \
  --memory 512MB \
  --trigger-topic gmail-ingestion-trigger
```


```yaml
# response-engine.yaml
apiVersion: serving.knative.dev/v1
kind: Service
metadata:
  name: response-engine
spec:
  template:
    spec:
      serviceAccountName: response-engine@fdsanalytics.iam.gserviceaccount.com
      containers:
      - image: gcr.io/fdsanalytics/response-engine:latest
        resources:
          limits:
            memory: 256Mi
            cpu: '0.5'
        env:
        - name: PROJECT_ID
          value: fdsanalytics
        - name: LOG_LEVEL
          value: info
```

---

## 6. Cloud Scheduler Configuration

### 6.1 Daily Ingestion Job

```bash
gcloud scheduler jobs create pubsub gmail-ingestion-daily \
  --location us-central1 \
  --schedule "0 3 * * *" \
  --time-zone "America/Chicago" \
  --topic gmail-ingestion-trigger \
  --message-body '{"action":"ingest_new"}' \
  --description "Trigger daily Gmail ingestion at 3am CT"
```

**Cron Expression:** `0 3 * * *` (3:00 AM daily)  
**Timezone:** America/Chicago  
**Trigger:** Pub/Sub topic → Cloud Function

---

## 7. Monitoring & Alerting Configuration

### 7.1 Alert Policies

```yaml
# error-rate-alert.yaml
displayName: "Response Engine Error Rate"
conditions:
- displayName: "Error rate > 5%"
  conditionThreshold:
    filter: |
      resource.type="cloud_run_revision"
      resource.labels.service_name="response-engine"
      severity="ERROR"
    comparison: COMPARISON_GT
    thresholdValue: 5
    duration: 300s
    aggregations:
    - alignmentPeriod: 60s
      perSeriesAligner: ALIGN_RATE

notificationChannels:
- projects/fdsanalytics/notificationChannels/email-alerts
```

```yaml
# latency-alert.yaml
displayName: "Response Engine High Latency"
conditions:
- displayName: "P95 latency > 10s"
  conditionThreshold:
    filter: |
      resource.type="cloud_run_revision"
      resource.labels.service_name="response-engine"
      metric.type="run.googleapis.com/request_latencies"
    comparison: COMPARISON_GT
    thresholdValue: 10000
    duration: 300s
    aggregations:
    - alignmentPeriod: 60s
      perSeriesAligner: ALIGN_PERCENTILE_95
```

### 7.2 Log-Based Metrics

```bash
# Ingestion failures
gcloud logging metrics create ingestion_failures \
  --description "Count of failed report ingestions" \
  --log-filter 'resource.type="cloud_function"
                resource.labels.function_name="gmail-ingestion"
                jsonPayload.status="failed"'
```

---

## 8. Local Development Configuration

### 8.1 Development Setup

```bash
# 1. Authenticate with GCP
gcloud auth login
gcloud auth application-default login
gcloud config set project fdsanalytics

# 2. Copy environment template
cp .env.development.template .env.development

# 3. Install dependencies
npm install

# 4. Run local services
npm run dev:response-engine    # Port 3000
npm run dev:response-engine         # Port 3001
npm run dev:gmail-ingestion    # Port 3002
```

### 8.2 Local Testing with ngrok

```bash
# Expose local Response Engine to Google Chat
ngrok http 3000

# Update Google Chat addon webhook URL to ngrok URL
# (in Google Cloud Console > Chat API configuration)
```

---

## 9. Configuration Validation

### 9.1 Startup Checks

All services should validate configuration on startup:

```typescript
function validateConfig() {
  const required = [
    'PROJECT_ID',
    'REGION',
    'BQ_DATASET_ANALYTICS',
    'GEMINI_SECRET_NAME'
  ];
  
  for (const key of required) {
    if (!process.env[key]) {
      throw new Error(`Missing required config: ${key}`);
    }
  }
  
  // Validate Gemini API key is accessible
  await getSecret(process.env.GEMINI_SECRET_NAME);
  
  // Validate BQ datasets exist
  await bigquery.dataset(process.env.BQ_DATASET_ANALYTICS).get();
  
  console.log('✓ Configuration validated');
}
```

### 9.2 Health Check Endpoint

```typescript
app.get('/health', async (req, res) => {
  const health = {
    status: 'healthy',
    checks: {
      bq: await checkBigQuery(),
      gemini: await checkGeminiApi(),
      secrets: await checkSecrets()
    }
  };
  
  if (Object.values(health.checks).some(c => !c.ok)) {
    health.status = 'unhealthy';
    return res.status(503).json(health);
  }
  
  res.json(health);
});
```

---

## 10. Configuration Migration (Future Multi-tenant)

### 10.1 From Hardcoded to Database

**Current (V1):**
```typescript
const config = SENSO_CONFIG;  // Hardcoded
```

**Future (Multi-tenant):**
```typescript
const config = await db.tenants.findById(tenantId);  // From database
```

**Migration Steps:**
1. Create `tenants` table in BQ or Cloud SQL
2. Insert Senso config as first row
3. Update `resolveTenant()` to query database
4. Remove hardcoded config

### 10.2 Environment Variable Strategy

**Keep environment-specific:**
- Project ID, region
- Log level
- Feature flags (global defaults)
- Service URLs

**Move to database (per-tenant):**
- Business name, timezone, currency
- BQ dataset name
- Gmail credentials
- Feature overrides

---

## 11. Security Best Practices

### 11.1 Secret Rotation

```bash
# Rotate Gemini API key
1. Generate new key in AI Studio
2. Create new version in Secret Manager
   echo -n "NEW_KEY" | gcloud secrets versions add GEMINI_API_KEY --data-file=-
3. Test with new version
4. Update "latest" alias
5. Delete old version after 7 days
```

### 11.2 Least Privilege

- Each service has its own service account
- Grant minimum permissions required
- Never use default compute service account
- Audit IAM bindings quarterly

### 11.3 Secret Access Logging

```bash
# Enable Data Access audit logs for Secret Manager
gcloud logging read 'protoPayload.serviceName="secretmanager.googleapis.com"' \
  --limit 50 \
  --format json
```

---

## 12. Configuration Checklist

### 12.1 Initial Setup

- [ ] Create GCP project (fdsanalytics)
- [ ] Enable required APIs (BigQuery, Secret Manager, Cloud Run, etc.)
- [ ] Create BigQuery datasets
- [ ] Create service accounts
- [ ] Grant IAM permissions
- [ ] Store secrets in Secret Manager
- [ ] Configure Cloud Scheduler
- [ ] Deploy Cloud Run services
- [ ] Set up monitoring & alerting
- [ ] Configure Google Chat addon webhook

### 12.2 Per Deployment

- [ ] Validate environment variables
- [ ] Check secret accessibility
- [ ] Verify BQ datasets exist
- [ ] Test service account permissions
- [ ] Run health checks
- [ ] Check monitoring dashboards
- [ ] Review recent logs

---

**Document Version:** 1.0  
**Last Updated:** October 22, 2025  
**Dependencies:** 01-system-requirements.md, 02-api-contracts.md
