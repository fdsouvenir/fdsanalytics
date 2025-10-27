# Senso Restaurant Analytics - Project Reference

> **Quick Reference Guide for Development**
> Last Updated: October 21, 2025

---

## Google Cloud Platform

- **Project ID:** `fdsanalytics`
- **Region:** `us-central1`
- **Platform:** Google Cloud Platform (GCP)

---

## Cloud Functions (Deployed)

### 1. chatBot (Phase 1 - Google Chat Integration)

- **URL:** `https://us-central1-fdsanalytics.cloudfunctions.net/chatBot`
- **Runtime:** Node.js 20 (Gen1)
- **Entry Point:** `index.js::chatBot`
- **Source:** Root directory (`/home/souvy/chatbot1/`)
- **Deploy Command:** `./scripts/deploy-chatBot.sh`
- **Purpose:** Google Chat bot with Gemini-powered intent classification
- **Environment Variables:**
  - `PROJECT_ID=fdsanalytics`
  - `GEMINI_SECRET_NAME=GEMINI_API_KEY`
  - `BQ_DATASET_HISTORY=chat_history`
  - `DEFAULT_TIMEZONE=America/Chicago`

### 2. insightsEngine (Phase 3 - Nightly Analytics)

- **URL:** `https://us-central1-fdsanalytics.cloudfunctions.net/insightsEngine`
- **Runtime:** Node.js 20 (Gen1)
- **Entry Point:** `insightsEngine/index.js::insightsEngine`
- **Source:** `insightsEngine/` directory
- **Deploy Command:** `./scripts/deploy-insightsEngine.sh`
- **Purpose:** Nightly pre-computed analytics using SQL
- **Schedule:** 2:30 AM CST daily (Cloud Scheduler job: `insights-daily`)
- **Timeout:** 540s (9 minutes)
- **Memory:** 512MB
- **Environment Variables:**
  - `PROJECT_ID=fdsanalytics`

**IMPORTANT:** Deployment script automatically copies `lib/InsightsQueries.js` into function directory before deployment and cleans up afterward.

---

## BigQuery Datasets

### 1. restaurant_analytics (Raw Data)

- **Tables:**
  - `reports` - Daily Product Mix report metadata (213 reports as of Oct 2025)
  - `metrics` - Line-item sales data with two-level category hierarchy

### 2. insights (Pre-computed Analytics)

- **Tables:**
  - `daily_comparisons` - Day-of-week trends with anomaly detection (±40%/±60% thresholds)
  - `category_trends` - Week-over-week performance by category
  - `top_items` - Top 10 performers per category
  - `daily_forecast` - 7-day predictions using 4-week day-of-week averages

- **Update Schedule:** Nightly at 2:30 AM CST via Cloud Scheduler

### 3. config (Customer Metadata)

- **Tables:**
  - `customers` - Customer configuration (timezone, email, etc.)

### 4. chat_history (Conversation History)

- **Tables:**
  - `conversations` - User messages and bot responses

---

## API Keys & Secrets

### Gemini API Key

- **Storage Method:** Google Secret Manager
- **Secret Name:** `GEMINI_API_KEY`
- **Secret Path:** `projects/fdsanalytics/secrets/GEMINI_API_KEY/versions/latest`
- **Access Pattern:**
  ```javascript
  const secretClient = new SecretManagerServiceClient();
  const [version] = await secretClient.accessSecretVersion({
    name: `projects/${PROJECT_ID}/secrets/GEMINI_API_KEY/versions/latest`
  });
  const apiKey = version.payload.data.toString('utf8');
  ```

### Authentication

- **Local Development:** Application Default Credentials (ADC)
  - File: `~/.config/gcloud/application_default_credentials.json`
  - Set via: `gcloud auth application-default login`

- **Cloud Functions:** Automatic service account authentication
  - Service Account: `{PROJECT_NUMBER}-compute@developer.gserviceaccount.com`

---

## Environment Variables

### Standard Environment Variables

```bash
PROJECT_ID=fdsanalytics
GEMINI_SECRET_NAME=GEMINI_API_KEY
DEFAULT_TIMEZONE=America/Chicago
BQ_DATASET_HISTORY=chat_history
BQ_DATASET_ANALYTICS=restaurant_analytics
BQ_DATASET_INSIGHTS=insights
GEMINI_LIGHTWEIGHT_MODEL=gemini-2.5-flash-lite
```

---

## Key Commands

### Deployment

```bash
# Deploy insightsEngine (with lib/ bundling)
./scripts/deploy-insightsEngine.sh

# Deploy chatBot (Phase 1)
./scripts/deploy-chatBot.sh

# Make scripts executable (if needed)
chmod +x scripts/deploy-*.sh
```

### Testing Cloud Functions

```bash
# Test insightsEngine
gcloud functions call insightsEngine --region us-central1 --data '{}'

# View function logs
gcloud functions logs read insightsEngine --region us-central1 --limit 50
gcloud functions logs read chatBot --region us-central1 --limit 50

# List all deployed functions
gcloud functions list --region us-central1
```

### Cloud Scheduler

```bash
# List scheduler jobs
gcloud scheduler jobs list --location us-central1

# Manually trigger insights job
gcloud scheduler jobs run insights-daily --location us-central1

# Check job status
gcloud scheduler jobs describe insights-daily --location us-central1
```

### BigQuery

```bash
# Query insights data
bq query --use_legacy_sql=false "
SELECT * FROM fdsanalytics.insights.daily_comparisons
ORDER BY report_date DESC LIMIT 10
"

# Count total reports
bq query --use_legacy_sql=false "
SELECT COUNT(*) as total_reports,
       MIN(report_date) as earliest,
       MAX(report_date) as latest
FROM fdsanalytics.restaurant_analytics.reports
"

# Check insights freshness
bq query --use_legacy_sql=false "
SELECT MAX(created_at) as last_update
FROM fdsanalytics.insights.daily_comparisons
"

# List all tables in dataset
bq ls fdsanalytics:restaurant_analytics
bq ls fdsanalytics:insights
```

### Authentication

```bash
# Login to gcloud CLI
gcloud auth login

# Set Application Default Credentials (for local scripts)
gcloud auth application-default login

# Set active project
gcloud config set project fdsanalytics
```

---

## Data Status

### Historical Data

- **Total Reports:** 213 (historical Pmix PDFs)
- **Date Range:** January 2023 - September 2025
- **Latest Report:** 2025-09-28
- **Total Metrics:** ~52,000 line items
- **Customer:** Senso Sushi (Frankfort)

### Category Hierarchy

**Two-level structure:**
- **Primary Categories:** `(Beer)`, `(Food)`, `(Sushi)`, `(Liquor)`, `(Wine)`, `(N/A Beverages)`
  - IMPORTANT: Primary categories ALWAYS include parentheses in the data
- **Subcategories:** `Bottle Beer`, `Starters`, `Signature Rolls`, `Classic Rolls`, etc.
  - No parentheses, stored in JSON dimensions field as `$.category`

---

## Critical Design Patterns

### 1. Production-Safe MERGE Upserts

**ALWAYS use MERGE for reports and insights** - prevents duplicates during retries/concurrent execution.

```javascript
MERGE `project.dataset.reports` T
USING (SELECT ...) S
ON T.report_id = S.report_id
WHEN MATCHED THEN UPDATE SET ...
WHEN NOT MATCHED THEN INSERT ...
```

### 2. Cartesian Product Avoidance

**ALWAYS aggregate metrics separately before joining:**

```sql
WITH sales_by_category AS (
  SELECT category, SUM(metric_value) as sales
  FROM metrics WHERE metric_name = 'net_sales'
  GROUP BY category
),
quantity_by_category AS (
  SELECT category, SUM(metric_value) as qty
  FROM metrics WHERE metric_name = 'quantity_sold'
  GROUP BY category
)
SELECT s.category, s.sales, q.qty
FROM sales_by_category s
LEFT JOIN quantity_by_category q ON s.category = q.category;
```

### 3. Date Handling in SQL

**ALWAYS cast dates properly:**

```sql
-- CORRECT:
WHERE DATE(report_date) = DATE('2025-10-20')

-- WRONG (type mismatch error):
WHERE report_date = '2025-10-20'
```

### 4. Gemini Model Selection

**Available models (as of Jan 2025):**
- `gemini-2.5-flash-lite` - Fast, cheap, for PDF extraction and intent classification
- `gemini-2.5-pro` - Expensive, powerful, for complex analysis
- `gemini-2.0-flash` - For function calling (Phase 4)

**NEVER use:**
- Models with date suffixes (e.g., `gemini-2.5-flash-lite-20250122`)
- Any 1.X models (deprecated)

---





## Support Resources

- **Google Chat API:** https://developers.google.com/workspace/add-ons/chat
- **Gemini API Reference:** https://ai.google.dev/api
- **Gemini Models:** https://ai.google.dev/gemini-api/docs/models#model-versions
- **BigQuery Documentation:** https://cloud.google.com/bigquery/docs

