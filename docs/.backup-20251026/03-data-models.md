# Data Models & BigQuery Schemas
## Senso Restaurant Analytics - Version 1.0

**Project:** fdsanalytics  
**Region:** us-central1  

---

## 1. Dataset Overview

```
fdsanalytics/
├── restaurant_analytics/     # Raw sales data (existing)
│   ├── reports
│   ├── metrics
│   └── valid_categories      # NEW - materialized view
│
├── insights/                 # Pre-computed analytics (existing)
│   ├── daily_comparisons
│   ├── category_trends
│   ├── top_items
│   └── daily_forecast
│
├── chat_history/             # Conversation data (existing, expand)
│   └── conversations
│
└── ingestion/                # NEW - Ingestion tracking
    ├── ingestion_log
    └── backfill_jobs
```

---

## 2. restaurant_analytics Dataset (Raw Data)

### 2.1 reports (Existing - No Changes)

**Purpose:** Daily PMIX report metadata

```sql
CREATE TABLE `fdsanalytics.restaurant_analytics.reports` (
  report_id STRING NOT NULL,              -- PK: {date}-pmix-{filename}
  report_date DATE NOT NULL,
  business_date DATE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  pdf_filename STRING,
  report_type STRING DEFAULT 'pmix',      -- Future: 'labor', 'inventory'
  
  -- Metadata from PDF
  location_name STRING,
  location_id STRING,
  report_period_start TIMESTAMP,
  report_period_end TIMESTAMP,
  
  -- Processing info
  parsed_by STRING DEFAULT 'gemini-2.5-flash-lite',
  parsing_version STRING DEFAULT '1.0',
  
  PRIMARY KEY (report_id) NOT ENFORCED
)
PARTITION BY report_date
CLUSTER BY location_id, report_type;
```

**Indexes:**
- Primary: report_id
- Partitioned by: report_date (daily)
- Clustered by: location_id, report_type

**Sample Row:**
```json
{
  "report_id": "2025-10-22-pmix-senso-2025-10-22",
  "report_date": "2025-10-22",
  "business_date": "2025-10-22",
  "created_at": "2025-10-22T08:30:00Z",
  "pdf_filename": "pmix-senso-2025-10-22.pdf",
  "report_type": "pmix",
  "location_name": "Senso Sushi",
  "location_id": "senso-frankfort",
  "parsed_by": "gemini-2.5-flash-lite",
  "parsing_version": "1.0"
}
```

### 2.2 metrics (Existing - No Changes)

**Purpose:** Line-item sales data with category hierarchy

```sql
CREATE TABLE `fdsanalytics.restaurant_analytics.metrics` (
  metric_id STRING NOT NULL,              -- PK: {report_id}-{row_num}
  report_id STRING NOT NULL,              -- FK to reports
  
  -- Metric identification
  metric_name STRING NOT NULL,            -- 'net_sales' or 'quantity_sold'
  metric_value STRING NOT NULL,           -- Stored as STRING (contains $, commas)
  
  -- Category hierarchy
  primary_category STRING,                -- Always has parentheses: "(Beer)"
  
  -- Dimensions (JSON)
  dimensions JSON,                        -- Contains $.category (subcategory)
                                         -- Contains $.item_name
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  PRIMARY KEY (metric_id) NOT ENFORCED,
  FOREIGN KEY (report_id) REFERENCES reports(report_id) NOT ENFORCED
)
PARTITION BY DATE(created_at)
CLUSTER BY report_id, metric_name, primary_category;
```

**Dimensions JSON Structure:**
```json
{
  "category": "Signature Rolls",    // Subcategory (no parentheses)
  "item_name": "Rainbow Roll",
  "price": "12.99",
  "modifiers": []
}
```

**Important Notes:**
- `metric_value` is STRING containing "$" and commas → Cast to FLOAT64 in queries
- `primary_category` ALWAYS has parentheses: "(Beer)", "(Sushi)", "(Food)"
- Subcategory extracted via `JSON_EXTRACT_SCALAR(dimensions, '$.category')`
- Subcategories NEVER have parentheses

**Sample Row:**
```json
{
  "metric_id": "2025-10-22-pmix-senso-001",
  "report_id": "2025-10-22-pmix-senso-2025-10-22",
  "metric_name": "net_sales",
  "metric_value": "$234.50",
  "primary_category": "(Sushi)",
  "dimensions": {
    "category": "Signature Rolls",
    "item_name": "Rainbow Roll"
  },
  "created_at": "2025-10-22T08:30:00Z"
}
```

### 2.3 valid_categories (NEW - Materialized View)

**Purpose:** Cache of valid categories for validation

```sql
CREATE MATERIALIZED VIEW `fdsanalytics.restaurant_analytics.valid_categories`
AS
SELECT DISTINCT
  primary_category,
  JSON_EXTRACT_SCALAR(dimensions, '$.category') as subcategory,
  COUNT(*) as usage_count,
  MAX(created_at) as last_seen
FROM `fdsanalytics.restaurant_analytics.metrics`
WHERE primary_category IS NOT NULL
GROUP BY primary_category, subcategory
ORDER BY primary_category, subcategory;
```

**Refresh:** Automatic (materialized view updates incrementally)

**Sample Rows:**
```
primary_category | subcategory         | usage_count | last_seen
(Beer)          | Bottle Beer         | 1250        | 2025-10-22
(Beer)          | Draft Beer          | 890         | 2025-10-22
(Sushi)         | Signature Rolls     | 3400        | 2025-10-22
(Sushi)         | Classic Rolls       | 2100        | 2025-10-22
```

---

## 3. insights Dataset (Pre-computed Analytics)

### 3.1 daily_comparisons (Existing - No Changes)

**Purpose:** Day-of-week comparisons with anomaly detection

```sql
CREATE TABLE `fdsanalytics.insights.daily_comparisons` (
  comparison_id STRING NOT NULL,
  report_date DATE NOT NULL,
  metric_name STRING NOT NULL,
  
  -- Current values
  current_value FLOAT64,
  current_day_of_week STRING,
  
  -- Comparison (4-week avg for same day)
  comparison_value FLOAT64,
  comparison_period STRING,
  
  -- Change metrics
  change_amount FLOAT64,
  percent_change FLOAT64,
  
  -- Anomaly detection
  is_anomaly BOOLEAN,
  anomaly_type STRING,              -- 'spike', 'drop', NULL
  anomaly_severity STRING,          -- 'minor', 'major', NULL
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  PRIMARY KEY (comparison_id) NOT ENFORCED
)
PARTITION BY report_date
CLUSTER BY metric_name, is_anomaly;
```

**Anomaly Thresholds:**
- Drop: < -40% (major), < -20% (minor)
- Spike: > +60% (major), > +40% (minor)

### 3.2 category_trends (Existing - No Changes)

**Purpose:** Week-over-week category performance

```sql
CREATE TABLE `fdsanalytics.insights.category_trends` (
  trend_id STRING NOT NULL,
  report_date DATE NOT NULL,
  
  -- Category
  primary_category STRING NOT NULL,
  category STRING,                  -- Subcategory
  
  -- Metrics
  sales_total FLOAT64,
  quantity_total FLOAT64,
  
  -- Trend
  week_over_week_change FLOAT64,
  trend_direction STRING,           -- 'up', 'down', 'stable'
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  PRIMARY KEY (trend_id) NOT ENFORCED
)
PARTITION BY report_date
CLUSTER BY primary_category, trend_direction;
```

### 3.3 top_items (Existing - No Changes)

**Purpose:** Top N performers per category

```sql
CREATE TABLE `fdsanalytics.insights.top_items` (
  item_id STRING NOT NULL,
  report_date DATE NOT NULL,
  
  -- Category
  primary_category STRING NOT NULL,
  category STRING,
  
  -- Item
  item_name STRING NOT NULL,
  
  -- Metrics
  net_sales FLOAT64,
  quantity_sold FLOAT64,
  rank INT64,                       -- 1-10
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  PRIMARY KEY (item_id) NOT ENFORCED
)
PARTITION BY report_date
CLUSTER BY primary_category, rank;
```

### 3.4 daily_forecast (Existing - No Changes)

**Purpose:** 7-day sales predictions

```sql
CREATE TABLE `fdsanalytics.insights.daily_forecast` (
  forecast_id STRING NOT NULL,
  prediction_date DATE NOT NULL,      -- When prediction was made
  target_date DATE NOT NULL,          -- Date being predicted
  
  -- Prediction
  predicted_sales FLOAT64,
  confidence_interval_low FLOAT64,
  confidence_interval_high FLOAT64,
  confidence_score FLOAT64,           -- 0.0 - 1.0
  
  -- Model info
  model_version STRING DEFAULT 'dow_avg_4week',
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  PRIMARY KEY (forecast_id) NOT ENFORCED
)
PARTITION BY prediction_date
CLUSTER BY target_date;
```

---

## 4. chat_history Dataset

### 4.1 conversations (Expand Existing)

**Purpose:** Store user-assistant conversation history

```sql
CREATE TABLE `fdsanalytics.chat_history.conversations` (
  conversation_id STRING NOT NULL,      -- PK: {tenant_id}-{thread_id}-{timestamp}
  
  -- Identity
  tenant_id STRING NOT NULL,
  user_id STRING NOT NULL,
  thread_id STRING NOT NULL,
  workspace_id STRING,
  
  -- Message
  role STRING NOT NULL,                 -- 'user' or 'assistant'
  content STRING NOT NULL,
  
  -- Metadata
  timestamp TIMESTAMP NOT NULL,
  message_id STRING,                    -- From Google Chat
  
  -- Context (optional)
  context_summary STRING,               -- Summarized context used
  tool_calls JSON,                      -- Tools called for this response
  
  -- TTL (auto-delete after 90 days)
  expiration_timestamp TIMESTAMP,
  
  PRIMARY KEY (conversation_id) NOT ENFORCED
)
PARTITION BY DATE(timestamp)
CLUSTER BY tenant_id, thread_id;
```

**TTL Policy:**
```sql
ALTER TABLE `fdsanalytics.chat_history.conversations`
SET OPTIONS (
  partition_expiration_days = 90
);
```

**Sample Row:**
```json
{
  "conversation_id": "senso-sushi-thread123-1729584000",
  "tenant_id": "senso-sushi",
  "user_id": "user@sensosushi.com",
  "thread_id": "thread123",
  "workspace_id": "workspace456",
  "role": "user",
  "content": "How are beer sales this week?",
  "timestamp": "2025-10-22T14:30:00Z",
  "message_id": "msg_abc123",
  "expiration_timestamp": "2026-01-20T14:30:00Z"
}
```

---

## 5. ingestion Dataset (NEW)

### 5.1 ingestion_log

**Purpose:** Track all report processing (idempotency + audit)

```sql
CREATE TABLE `fdsanalytics.ingestion.ingestion_log` (
  ingestion_id STRING NOT NULL,         -- PK: {tenant_id}-{message_id}
  
  -- Source identification
  tenant_id STRING NOT NULL,
  source_type STRING NOT NULL,          -- 'gmail_pmix', 'gmail_labor', 'spoton_api'
  source_id STRING NOT NULL,            -- Gmail message_id or API call ID
  
  -- Report metadata
  report_type STRING NOT NULL,          -- 'pmix', 'labor', 'inventory'
  report_date DATE,
  filename STRING,
  
  -- Email metadata (for Gmail sources)
  email_subject STRING,
  email_date TIMESTAMP,
  
  -- Processing
  processed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  status STRING NOT NULL,               -- 'success', 'failed', 'skipped'
  
  -- Results
  report_id STRING,                     -- FK to reports table (if successful)
  rows_inserted INT64,
  duration_ms INT64,
  
  -- Error handling
  error_code STRING,
  error_message STRING,
  retry_count INT64 DEFAULT 0,
  
  PRIMARY KEY (ingestion_id) NOT ENFORCED
)
PARTITION BY processed_at
CLUSTER BY tenant_id, status, report_type;
```

**Indexes for Idempotency:**
- Check if processed: `WHERE source_id = ? AND tenant_id = ?`
- Find failures: `WHERE status = 'failed' AND retry_count < 3`

**Sample Row:**
```json
{
  "ingestion_id": "senso-sushi-msg_abc123",
  "tenant_id": "senso-sushi",
  "source_type": "gmail_pmix",
  "source_id": "msg_abc123",
  "report_type": "pmix",
  "report_date": "2025-10-22",
  "filename": "pmix-senso-2025-10-22.pdf",
  "email_subject": "Daily Product Mix Report",
  "email_date": "2025-10-23T02:00:00Z",
  "processed_at": "2025-10-23T03:15:00Z",
  "status": "success",
  "report_id": "2025-10-22-pmix-senso-2025-10-22",
  "rows_inserted": 234,
  "duration_ms": 4500
}
```

### 5.2 backfill_jobs

**Purpose:** Track long-running historical imports

```sql
CREATE TABLE `fdsanalytics.ingestion.backfill_jobs` (
  job_id STRING NOT NULL,               -- PK: {tenant_id}-{start_timestamp}
  tenant_id STRING NOT NULL,
  
  -- Job metadata
  started_at TIMESTAMP NOT NULL,
  completed_at TIMESTAMP,
  status STRING NOT NULL,               -- 'running', 'completed', 'failed', 'cancelled'
  
  -- Scope
  start_date DATE,                      -- Requested date range
  end_date DATE,
  report_types ARRAY<STRING>,           -- ['pmix', 'labor']
  
  -- Progress
  total_emails INT64,
  processed_emails INT64,
  successful_emails INT64,
  failed_emails INT64,
  skipped_emails INT64,
  
  -- Current state
  current_date DATE,                    -- Which date is being processed
  percent_complete FLOAT64,
  estimated_completion_time TIMESTAMP,
  
  -- Error tracking
  error_message STRING,
  failed_message_ids ARRAY<STRING>,
  
  -- Notification
  user_id STRING,                       -- Who initiated
  notification_thread_id STRING,        -- Where to send updates
  last_notification_at TIMESTAMP,
  
  PRIMARY KEY (job_id) NOT ENFORCED
)
CLUSTER BY tenant_id, status;
```

**Sample Row:**
```json
{
  "job_id": "senso-sushi-1729584000",
  "tenant_id": "senso-sushi",
  "started_at": "2025-10-22T10:00:00Z",
  "completed_at": null,
  "status": "running",
  "start_date": "2023-01-01",
  "end_date": "2025-10-22",
  "report_types": ["pmix"],
  "total_emails": 213,
  "processed_emails": 47,
  "successful_emails": 45,
  "failed_emails": 2,
  "skipped_emails": 0,
  "current_date": "2023-03-15",
  "percent_complete": 22.07,
  "estimated_completion_time": "2025-10-22T10:25:00Z",
  "user_id": "user@sensosushi.com",
  "notification_thread_id": "thread123",
  "last_notification_at": "2025-10-22T10:05:00Z"
}
```

---

## 6. Future Datasets (Design, Don't Implement)

### 6.1 labor Dataset (Future)

```sql
-- Future: Labor report data
CREATE TABLE `fdsanalytics.labor.shifts` (
  shift_id STRING NOT NULL,
  report_date DATE NOT NULL,
  employee_id STRING,
  employee_name STRING,
  clock_in TIMESTAMP,
  clock_out TIMESTAMP,
  hours_worked FLOAT64,
  hourly_rate FLOAT64,
  labor_cost FLOAT64,
  position STRING,
  PRIMARY KEY (shift_id) NOT ENFORCED
);
```

### 6.2 spoton_api Dataset (Future)

```sql
-- Future: SpotOn API sync
CREATE TABLE `fdsanalytics.spoton_api.locations` (
  location_id STRING NOT NULL,
  location_name STRING,
  address JSON,
  sync_timestamp TIMESTAMP,
  PRIMARY KEY (location_id) NOT ENFORCED
);

CREATE TABLE `fdsanalytics.spoton_api.menu_items` (
  item_id STRING NOT NULL,
  item_name STRING,
  category STRING,
  price FLOAT64,
  active BOOLEAN,
  sync_timestamp TIMESTAMP,
  PRIMARY KEY (item_id) NOT ENFORCED
);
```

### 6.3 unified Dataset (Future)

```sql
-- Future: Cross-source analytics
CREATE TABLE `fdsanalytics.unified.daily_summary` (
  summary_id STRING NOT NULL,
  report_date DATE NOT NULL,
  
  -- Sales (from PMIX)
  total_sales FLOAT64,
  total_quantity FLOAT64,
  
  -- Labor (from Labor Reports)
  total_labor_hours FLOAT64,
  total_labor_cost FLOAT64,
  
  -- Derived metrics
  sales_per_labor_hour FLOAT64,
  labor_cost_percentage FLOAT64,      -- labor_cost / sales
  
  PRIMARY KEY (summary_id) NOT ENFORCED
);
```

---

## 7. Data Relationships

### 7.1 Entity Relationship Diagram

```
reports (1) ──< (N) metrics
                │
                └──> valid_categories (derived)

reports (1) ──< (N) ingestion_log
                       │
                       └──< backfill_jobs (1)

metrics ──> insights.daily_comparisons (derived)
        ──> insights.category_trends (derived)
        ──> insights.top_items (derived)
        ──> insights.daily_forecast (derived)

conversations ──> (thread_id groups messages)
```

### 7.2 Foreign Keys (Logical, Not Enforced)

BigQuery doesn't enforce FK constraints, but these relationships exist:

- `metrics.report_id` → `reports.report_id`
- `ingestion_log.report_id` → `reports.report_id`
- `ingestion_log.ingestion_id` → `backfill_jobs.failed_message_ids[]`

---

## 8. Data Types & Parsing Rules

### 8.1 Currency Values

**Storage:** STRING with "$" and commas (e.g., "$1,234.50")  
**Query Pattern:**
```sql
CAST(REPLACE(REPLACE(metric_value, '$', ''), ',', '') AS FLOAT64)
```

**Helper Function:**
```sql
CREATE OR REPLACE FUNCTION `restaurant_analytics.parse_currency`(value STRING)
RETURNS FLOAT64
AS (
  CAST(REPLACE(REPLACE(value, '$', ''), ',', '') AS FLOAT64)
);
```

### 8.2 Dates

**Format:** All dates stored as DATE type (not STRING)  
**Timezone:** America/Chicago (CT) for report_date  
**Timestamps:** Always UTC in TIMESTAMP columns

### 8.3 JSON Dimensions

**Access Pattern:**
```sql
-- Extract subcategory
JSON_EXTRACT_SCALAR(dimensions, '$.category')

-- Extract item name
JSON_EXTRACT_SCALAR(dimensions, '$.item_name')

-- Full JSON query
JSON_QUERY(dimensions, '$')
```

---

## 9. Query Patterns & Best Practices

### 9.1 Aggregating Metrics (Avoid Cartesian Product)

**WRONG (Cartesian product):**
```sql
SELECT 
  m1.primary_category,
  SUM(CAST(...)) as sales,
  SUM(CAST(...)) as quantity
FROM metrics m1, metrics m2
WHERE m1.report_id = m2.report_id
  AND m1.metric_name = 'net_sales'
  AND m2.metric_name = 'quantity_sold'
GROUP BY m1.primary_category;
```

**CORRECT (Separate CTEs):**
```sql
WITH sales AS (
  SELECT primary_category, SUM(...) as total
  FROM metrics
  WHERE metric_name = 'net_sales'
  GROUP BY primary_category
),
quantity AS (
  SELECT primary_category, SUM(...) as total
  FROM metrics
  WHERE metric_name = 'quantity_sold'
  GROUP BY primary_category
)
SELECT s.primary_category, s.total as sales, q.total as quantity
FROM sales s
LEFT JOIN quantity q USING (primary_category);
```

### 9.2 Category Validation

**Check if category exists:**
```sql
SELECT 1
FROM `restaurant_analytics.valid_categories`
WHERE primary_category = @input_category
  OR subcategory = @input_category
LIMIT 1;
```

### 9.3 Idempotency Check

**Before processing Gmail message:**
```sql
SELECT status
FROM `ingestion.ingestion_log`
WHERE source_id = @message_id
  AND tenant_id = @tenant_id;
```

---

## 10. Sample Data

### 10.1 Typical Report Stats

- **Reports per month:** 30 (daily)
- **Metrics per report:** ~250 rows
- **Categories:** 6 primary, 30 subcategories
- **Unique items:** ~150

### 10.2 Growth Projections

| Metric | Current | 1 Year | 5 Years |
|--------|---------|--------|---------|
| Reports | 213 | 578 | 2,038 |
| Metrics rows | 52K | 144K | 509K |
| Storage | 15 MB | 50 MB | 180 MB |
| Monthly queries | 300 | 1,000 | 5,000 |

**Partitioning handles scale well** - queries scan minimal data due to date partitioning.

---

## 11. Data Quality Rules

### 11.1 Validation Rules

1. **report_date** must not be in future
2. **metric_value** must parse to valid FLOAT64
3. **primary_category** must exist in valid_categories
4. **report_id** must be unique (enforced by MERGE)
5. **JSON dimensions** must be valid JSON

### 11.2 Cleaning Rules

- Strip "$" and "," from currency values
- Trim whitespace from category names
- Normalize date formats to DATE type
- NULL for missing/invalid data (don't use empty strings)

---

## 12. Backup & Recovery

### 12.1 Backup Strategy

- **Automatic:** BQ snapshots retained 7 days
- **Manual:** Export key tables to GCS monthly
- **Export format:** Parquet (compressed, columnar)

### 12.2 Recovery Procedures

1. **Recent data loss (<7 days):** Restore from BQ snapshot
2. **Older data loss:** Re-run ingestion from Gmail
3. **Corruption:** Drop table, restore from GCS export

---

**Document Version:** 1.0  
**Last Updated:** October 22, 2025  
**Dependencies:** 01-system-requirements.md, 02-api-contracts.md
