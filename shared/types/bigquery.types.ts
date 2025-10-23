/**
 * BigQuery-specific types
 */

// Gmail Ingestion Interface
export interface IngestionResult {
  totalProcessed: number;
  successCount: number;
  failedCount: number;
  skippedCount: number;
  errors: Array<{
    messageId: string;
    filename: string;
    error: string;
  }>;
  durationMs: number;
}

export interface BackfillProgress {
  totalEmails: number;
  processedEmails: number;
  currentDate?: string;
  percentComplete: number;
  estimatedMinutesRemaining: number;
}

export interface ReportMetadata {
  messageId: string;
  emailDate: Date;
  filename: string;
  tenantId: string;
}

export interface ProcessingResult {
  success: boolean;
  reportDate?: Date;
  rowsInserted?: number;
  error?: string;
}

// Tenant Configuration Row
export interface TenantConfigRow {
  tenant_id: string;
  business_name: string;
  bq_project: string;
  bq_dataset: string;
  timezone: string;
  currency: string;
  created_at: Date;
  updated_at: Date;
  status: 'active' | 'suspended' | 'trial';
  gmail_refresh_token_encrypted: string;
  ingestion_enabled: boolean;
  forecast_enabled: boolean;
  anomaly_detection_enabled: boolean;
}
