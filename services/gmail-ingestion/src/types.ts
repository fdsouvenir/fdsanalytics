/**
 * Type definitions for Gmail Ingestion Service
 */

// ============================================================================
// Ingestion Results
// ============================================================================

export interface IngestionResult {
  totalProcessed: number;
  successCount: number;
  failedCount: number;
  skippedCount: number;
  errors: IngestionError[];
  durationMs: number;
}

export interface IngestionError {
  messageId: string;
  filename: string;
  error: string;
}

// ============================================================================
// Backfill Progress
// ============================================================================

export interface BackfillProgress {
  totalEmails: number;
  processedEmails: number;
  currentDate?: string;
  percentComplete: number;
  estimatedMinutesRemaining: number;
}

// ============================================================================
// Report Processing
// ============================================================================

export interface ReportMetadata {
  messageId: string;
  emailDate: Date;
  filename: string;
  tenantId: string;
  emailSubject?: string;
}

export interface ProcessingResult {
  success: boolean;
  reportDate?: Date;
  reportId?: string;
  rowsInserted?: number;
  error?: string;
  durationMs: number;
}

// ============================================================================
// OAuth Types
// ============================================================================

export interface OAuthTokens {
  access_token: string;
  refresh_token: string;
  expiry_date?: number;
}

// ============================================================================
// Gmail Types
// ============================================================================

export interface GmailMessage {
  id: string;
  threadId: string;
  internalDate: string;
  subject: string;
  from: string;
  date: Date;
  attachments: GmailAttachment[];
}

export interface GmailAttachment {
  filename: string;
  mimeType: string;
  size: number;
  attachmentId: string;
  data?: Buffer;
}

export interface GmailSearchOptions {
  query: string;
  maxResults?: number;
  afterDate?: Date;
  beforeDate?: Date;
}

// ============================================================================
// Parsed Report Data
// ============================================================================

export interface ParsedReport {
  reportDate: Date;
  businessDate: Date;
  locationName: string;
  locationId: string;
  reportType: 'pmix' | 'labor' | 'unknown';
  metrics: ParsedMetric[];
  metadata: {
    pdfFilename: string;
    parsedBy: string;
    parsingVersion: string;
  };
}

export interface ParsedMetric {
  metricName: 'net_sales' | 'quantity_sold';
  metricValue: string; // Stored as string with $ and commas
  primaryCategory: string; // Always has parentheses: "(Beer)"
  dimensions: {
    category?: string; // Subcategory (no parentheses)
    item_name?: string;
    price?: string;
    modifiers?: string[];
  };
}

// ============================================================================
// Ingestion Log
// ============================================================================

export interface IngestionLogEntry {
  ingestionId: string;
  tenantId: string;
  sourceType: 'gmail_pmix' | 'gmail_labor' | 'spoton_api';
  sourceId: string; // Gmail message_id
  reportType: 'pmix' | 'labor' | 'inventory';
  reportDate?: Date;
  filename?: string;
  emailSubject?: string;
  emailDate?: Date;
  processedAt: Date;
  status: 'success' | 'failed' | 'skipped';
  reportId?: string; // FK to reports table
  rowsInserted?: number;
  durationMs?: number;
  errorCode?: string;
  errorMessage?: string;
  retryCount: number;
}

// ============================================================================
// Backfill Job
// ============================================================================

export interface BackfillJob {
  jobId: string;
  tenantId: string;
  startedAt: Date;
  completedAt?: Date;
  status: 'running' | 'completed' | 'failed' | 'cancelled';
  startDate?: Date;
  endDate?: Date;
  reportTypes: string[];
  totalEmails: number;
  processedEmails: number;
  successfulEmails: number;
  failedEmails: number;
  skippedEmails: number;
  currentDate?: Date;
  percentComplete: number;
  estimatedCompletionTime?: Date;
  errorMessage?: string;
  failedMessageIds: string[];
  userId?: string;
  notificationThreadId?: string;
  lastNotificationAt?: Date;
}

// ============================================================================
// BigQuery Report Rows
// ============================================================================

export interface ReportRow {
  report_id: string;
  report_date: string; // DATE format: YYYY-MM-DD
  business_date: string;
  created_at: string; // TIMESTAMP
  pdf_filename: string;
  report_type: string;
  location_name: string;
  location_id: string;
  report_period_start?: string;
  report_period_end?: string;
  parsed_by: string;
  parsing_version: string;
}

export interface MetricRow {
  metric_id: string;
  report_id: string;
  metric_name: string;
  metric_value: string;
  primary_category: string;
  dimensions: string; // JSON string
  created_at: string; // TIMESTAMP
}
