-- Create ingestion dataset and tables for Gmail Ingestion Service
-- Project: fdsanalytics
-- Purpose: Track ingestion logs and backfill jobs for idempotency

-- ============================================================================
-- Create Dataset
-- ============================================================================

CREATE SCHEMA IF NOT EXISTS `fdsanalytics.ingestion`
OPTIONS (
  description = "Ingestion tracking and audit logs",
  location = "us-central1"
);

-- ============================================================================
-- Table: ingestion_log
-- Purpose: Track all report processing attempts (idempotency + audit)
-- ============================================================================

CREATE TABLE IF NOT EXISTS `fdsanalytics.ingestion.ingestion_log` (
  -- Primary identification
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
  processed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP(),
  status STRING NOT NULL,               -- 'success', 'failed', 'skipped'

  -- Results
  report_id STRING,                     -- FK to reports table (if successful)
  rows_inserted INT64,
  duration_ms INT64,

  -- Error handling
  error_code STRING,
  error_message STRING,
  retry_count INT64 DEFAULT 0
)
PARTITION BY DATE(processed_at)
CLUSTER BY tenant_id, status, report_type
OPTIONS (
  description = "Ingestion log for idempotency tracking and audit",
  labels = [("service", "gmail-ingestion")]
);

-- Create index for idempotency checks
-- Note: BigQuery doesn't have explicit indexes, but clustering serves this purpose
-- Query pattern: WHERE source_id = ? AND tenant_id = ?

-- ============================================================================
-- Table: backfill_jobs
-- Purpose: Track long-running historical imports with progress
-- ============================================================================

CREATE TABLE IF NOT EXISTS `fdsanalytics.ingestion.backfill_jobs` (
  -- Job identification
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
  last_notification_at TIMESTAMP
)
CLUSTER BY tenant_id, status
OPTIONS (
  description = "Backfill job tracking with progress reporting",
  labels = [("service", "gmail-ingestion")]
);

-- ============================================================================
-- Sample Queries
-- ============================================================================

-- Check if message already processed (idempotency):
-- SELECT status, retry_count
-- FROM `fdsanalytics.ingestion.ingestion_log`
-- WHERE source_id = 'msg_abc123' AND tenant_id = 'senso-sushi'
-- ORDER BY processed_at DESC
-- LIMIT 1

-- Get failed ingestions eligible for retry:
-- SELECT *
-- FROM `fdsanalytics.ingestion.ingestion_log`
-- WHERE tenant_id = 'senso-sushi'
--   AND status = 'failed'
--   AND retry_count < 3
-- ORDER BY processed_at DESC

-- Get backfill job status:
-- SELECT *
-- FROM `fdsanalytics.ingestion.backfill_jobs`
-- WHERE job_id = 'senso-sushi-1729584000'

-- Get ingestion statistics (last 7 days):
-- SELECT
--   DATE(processed_at) as date,
--   status,
--   COUNT(*) as count,
--   AVG(duration_ms) as avg_duration_ms
-- FROM `fdsanalytics.ingestion.ingestion_log`
-- WHERE tenant_id = 'senso-sushi'
--   AND processed_at >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 7 DAY)
-- GROUP BY date, status
-- ORDER BY date DESC, status
