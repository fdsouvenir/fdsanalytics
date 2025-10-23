# Gmail Ingestion Service

Automated PMIX report ingestion from Gmail to BigQuery with idempotency and progress tracking.

## Features

- **Gmail API Integration**: OAuth 2.0 authentication with token refresh
- **PMIX PDF Parsing**: Gemini-powered PDF extraction
- **Idempotent Processing**: MERGE upsert pattern prevents duplicates
- **Comprehensive Logging**: All ingestion attempts logged to `ingestion.ingestion_log`
- **Backfill Support**: Historical data import with progress tracking
- **Error Handling**: Automatic retry with exponential backoff
- **Type Safety**: Full TypeScript with strict mode

## Architecture

```
Cloud Scheduler (daily 3am CT)
    ↓ (Pub/Sub)
Cloud Function: ingestReports
    ↓
IngestionService
    ├─→ GmailClient (search & download PDFs)
    ├─→ ReportProcessor (orchestrate parsing & loading)
    │    ├─→ PmixParser (Gemini PDF extraction)
    │    ├─→ BigQueryClient (MERGE upsert)
    │    └─→ IngestionLogger (idempotency tracking)
    └─→ BigQuery
         ├─→ restaurant_analytics.reports
         ├─→ restaurant_analytics.metrics
         └─→ ingestion.ingestion_log
```

## Prerequisites

- Node.js 20+
- Google Cloud Project: `fdsanalytics`
- Secrets in Secret Manager:
  - `GEMINI_API_KEY`: Gemini API key
  - `GMAIL_OAUTH_CREDENTIALS`: OAuth client credentials
- BigQuery datasets:
  - `restaurant_analytics` (existing)
  - `ingestion` (new - created by SQL script)

## Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Create BigQuery Tables

```bash
bq query --use_legacy_sql=false < sql/create_ingestion_dataset.sql
```

### 3. Configure Environment

Create `.env` file:

```bash
PROJECT_ID=fdsanalytics
REGION=us-central1

BQ_DATASET_ANALYTICS=restaurant_analytics
BQ_DATASET_INGESTION=ingestion

GMAIL_SEARCH_QUERY="from:spoton subject:pmix has:attachment"
GMAIL_OAUTH_SECRET_NAME=GMAIL_OAUTH_CREDENTIALS

GEMINI_SECRET_NAME=GEMINI_API_KEY
GEMINI_MODEL=gemini-2.5-flash-lite

BACKFILL_BATCH_SIZE=10
MAX_RETRIES=3

# OAuth tokens (V1 - hardcoded single tenant)
GMAIL_ACCESS_TOKEN=your_access_token
GMAIL_REFRESH_TOKEN=your_refresh_token
```

## Build

```bash
npm run build
```

## Test

```bash
# Run all tests
npm test

# Run with coverage
npm run test:coverage

# Watch mode
npm run test:watch
```

## Deploy

### Deploy Cloud Function

```bash
gcloud functions deploy ingestReports \
  --gen2 \
  --runtime=nodejs20 \
  --region=us-central1 \
  --source=. \
  --entry-point=ingestReports \
  --trigger-topic=gmail-ingestion-daily \
  --timeout=540s \
  --memory=512MB \
  --set-env-vars=PROJECT_ID=fdsanalytics \
  --set-secrets=GEMINI_API_KEY=GEMINI_API_KEY:latest,GMAIL_OAUTH_CREDENTIALS=GMAIL_OAUTH_CREDENTIALS:latest
```

### Create Cloud Scheduler Job

```bash
gcloud scheduler jobs create pubsub gmail-ingestion-daily \
  --location=us-central1 \
  --schedule="0 3 * * *" \
  --time-zone="America/Chicago" \
  --topic=gmail-ingestion-daily \
  --message-body="{}"
```

### Deploy Backfill Function (HTTP trigger)

```bash
gcloud functions deploy backfillReports \
  --gen2 \
  --runtime=nodejs20 \
  --region=us-central1 \
  --source=. \
  --entry-point=backfillReports \
  --trigger-http \
  --allow-unauthenticated \
  --timeout=3600s \
  --memory=1GB \
  --set-env-vars=PROJECT_ID=fdsanalytics \
  --set-secrets=GEMINI_API_KEY=GEMINI_API_KEY:latest,GMAIL_OAUTH_CREDENTIALS=GMAIL_OAUTH_CREDENTIALS:latest
```

## Usage

### Daily Ingestion

Triggered automatically by Cloud Scheduler at 3am CT:

```bash
# Manual trigger
gcloud scheduler jobs run gmail-ingestion-daily --location=us-central1
```

### Historical Backfill

```bash
# Invoke backfill function
gcloud functions call backfillReports \
  --region=us-central1 \
  --gen2 \
  --data='{
    "startDate": "2023-01-01",
    "endDate": "2025-10-22"
  }'
```

Or via HTTP:

```bash
curl -X POST https://us-central1-fdsanalytics.cloudfunctions.net/backfillReports \
  -H "Content-Type: application/json" \
  -d '{
    "startDate": "2023-01-01",
    "endDate": "2025-10-22"
  }'
```

## Monitoring

### View Logs

```bash
# Ingestion function logs
gcloud functions logs read ingestReports --region=us-central1 --limit=50

# Backfill function logs
gcloud functions logs read backfillReports --region=us-central1 --limit=50
```

### Query Ingestion Statistics

```sql
-- Ingestion success rate (last 7 days)
SELECT
  DATE(processed_at) as date,
  status,
  COUNT(*) as count,
  AVG(duration_ms) as avg_duration_ms
FROM `fdsanalytics.ingestion.ingestion_log`
WHERE processed_at >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 7 DAY)
GROUP BY date, status
ORDER BY date DESC, status
```

### Check Backfill Progress

```sql
SELECT
  job_id,
  status,
  processed_emails,
  total_emails,
  percent_complete,
  successful_emails,
  failed_emails
FROM `fdsanalytics.ingestion.backfill_jobs`
ORDER BY started_at DESC
LIMIT 10
```

## Key Design Patterns

### 1. Idempotency

Every ingestion attempt is logged in `ingestion_log` by `source_id` (Gmail message ID). Before processing:

1. Check if `source_id` already processed
2. If `status='success'`, skip
3. If `status='failed'` and `retry_count < 3`, retry
4. Otherwise, process normally

### 2. MERGE Upsert

Reports and metrics use MERGE to prevent duplicates during retries:

```sql
MERGE `restaurant_analytics.reports` T
USING (SELECT ...) S
ON T.report_id = S.report_id
WHEN MATCHED THEN UPDATE SET ...
WHEN NOT MATCHED THEN INSERT ...
```

### 3. Error Handling

- **Transient errors**: Retry with exponential backoff (max 3 attempts)
- **Parse errors**: Log and continue with other reports
- **BigQuery errors**: Logged with full context for debugging

### 4. Progress Tracking

Backfill jobs update `backfill_jobs` table every 20 reports with:
- `percent_complete`
- `estimated_completion_time`
- `processed_emails` / `total_emails`

## Category Hierarchy

**IMPORTANT**: PMIX reports use a two-level category structure:

- **Primary categories** (always have parentheses): `(Beer)`, `(Sushi)`, `(Food)`, etc.
- **Subcategories** (no parentheses): `Bottle Beer`, `Signature Rolls`, etc.

The parser validates this format and logs warnings if incorrect.

## Troubleshooting

### Parsing Failures

Check `ingestion_log` for error messages:

```sql
SELECT *
FROM `fdsanalytics.ingestion.ingestion_log`
WHERE status = 'failed'
  AND error_code = 'PARSE_FAILED'
ORDER BY processed_at DESC
LIMIT 10
```

### OAuth Token Expired

If you see "OAuth token expired" errors:

1. Refresh tokens using Gmail OAuth flow
2. Update environment variables or Secret Manager
3. Redeploy functions

### Duplicate Reports

MERGE pattern should prevent duplicates. If duplicates occur:

1. Check `report_id` generation logic
2. Verify MERGE query syntax
3. Check BigQuery logs for MERGE failures

## Performance

- **Parse time**: ~5-10 seconds per PDF (Gemini)
- **Upsert time**: ~2-3 seconds per report (BigQuery)
- **Total per report**: ~7-13 seconds
- **50 PDFs**: ~6-10 minutes

## Test Coverage

Current coverage (target: >90%):

- `PmixParser`: 85%
- `GmailClient`: 90%
- `IngestionService`: 88%
- `BigQueryClient`: 82%
- `IngestionLogger`: 85%

Run `npm run test:coverage` for full report.

## Version

- **Version**: 1.0.0
- **Node.js**: 20
- **TypeScript**: 5.0
- **Last Updated**: October 22, 2025
