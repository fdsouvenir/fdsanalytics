/**
 * Ingestion logger for idempotency and audit tracking
 */

import { BigQuery } from '@google-cloud/bigquery';
import { IngestionLogEntry } from '../types';

export class IngestionLogger {
  private bq: BigQuery;
  private projectId: string;
  private ingestionDataset: string;

  constructor(projectId: string, ingestionDataset: string) {
    this.bq = new BigQuery({ projectId });
    this.projectId = projectId;
    this.ingestionDataset = ingestionDataset;
  }

  /**
   * Check if message has already been processed
   * Returns the log entry if found, null otherwise
   */
  async checkProcessed(
    tenantId: string,
    sourceId: string
  ): Promise<IngestionLogEntry | null> {
    const query = `
      SELECT *
      FROM \`${this.projectId}.${this.ingestionDataset}.ingestion_log\`
      WHERE tenant_id = @tenant_id
        AND source_id = @source_id
      ORDER BY processed_at DESC
      LIMIT 1
    `;

    const [rows] = await this.bq.query({
      query,
      params: {
        tenant_id: tenantId,
        source_id: sourceId,
      },
    });

    if (rows.length === 0) {
      return null;
    }

    return this.rowToLogEntry(rows[0]);
  }

  /**
   * Log successful ingestion
   */
  async logSuccess(
    tenantId: string,
    sourceId: string,
    reportType: 'pmix' | 'labor' | 'inventory',
    metadata: {
      filename: string;
      emailSubject?: string;
      emailDate?: Date;
      reportDate: Date;
      reportId: string;
      rowsInserted: number;
      durationMs: number;
    }
  ): Promise<void> {
    const ingestionId = `${tenantId}-${sourceId}`;

    const entry: IngestionLogEntry = {
      ingestionId,
      tenantId,
      sourceType: `gmail_${reportType}` as any,
      sourceId,
      reportType,
      reportDate: metadata.reportDate,
      filename: metadata.filename,
      emailSubject: metadata.emailSubject,
      emailDate: metadata.emailDate,
      processedAt: new Date(),
      status: 'success',
      reportId: metadata.reportId,
      rowsInserted: metadata.rowsInserted,
      durationMs: metadata.durationMs,
      retryCount: 0,
    };

    await this.insertLogEntry(entry);
    console.log(`Logged successful ingestion: ${ingestionId}`);
  }

  /**
   * Log failed ingestion
   */
  async logFailure(
    tenantId: string,
    sourceId: string,
    reportType: 'pmix' | 'labor' | 'inventory',
    metadata: {
      filename: string;
      emailSubject?: string;
      emailDate?: Date;
      errorCode: string;
      errorMessage: string;
      retryCount: number;
      durationMs?: number;
    }
  ): Promise<void> {
    const ingestionId = `${tenantId}-${sourceId}`;

    const entry: IngestionLogEntry = {
      ingestionId,
      tenantId,
      sourceType: `gmail_${reportType}` as any,
      sourceId,
      reportType,
      filename: metadata.filename,
      emailSubject: metadata.emailSubject,
      emailDate: metadata.emailDate,
      processedAt: new Date(),
      status: 'failed',
      errorCode: metadata.errorCode,
      errorMessage: metadata.errorMessage,
      retryCount: metadata.retryCount,
      durationMs: metadata.durationMs,
    };

    await this.insertLogEntry(entry);
    console.log(`Logged failed ingestion: ${ingestionId} (retry ${metadata.retryCount})`);
  }

  /**
   * Log skipped ingestion (already processed)
   */
  async logSkipped(
    tenantId: string,
    sourceId: string,
    reportType: 'pmix' | 'labor' | 'inventory',
    metadata: {
      filename: string;
      emailSubject?: string;
      emailDate?: Date;
      reason: string;
    }
  ): Promise<void> {
    const ingestionId = `${tenantId}-${sourceId}`;

    const entry: IngestionLogEntry = {
      ingestionId,
      tenantId,
      sourceType: `gmail_${reportType}` as any,
      sourceId,
      reportType,
      filename: metadata.filename,
      emailSubject: metadata.emailSubject,
      emailDate: metadata.emailDate,
      processedAt: new Date(),
      status: 'skipped',
      errorMessage: metadata.reason,
      retryCount: 0,
    };

    await this.insertLogEntry(entry);
    console.log(`Logged skipped ingestion: ${ingestionId}`);
  }

  /**
   * Get failed ingestions eligible for retry
   */
  async getFailedForRetry(
    tenantId: string,
    maxRetries: number = 3
  ): Promise<IngestionLogEntry[]> {
    const query = `
      SELECT *
      FROM \`${this.projectId}.${this.ingestionDataset}.ingestion_log\`
      WHERE tenant_id = @tenant_id
        AND status = 'failed'
        AND retry_count < @max_retries
      ORDER BY processed_at DESC
    `;

    const [rows] = await this.bq.query({
      query,
      params: {
        tenant_id: tenantId,
        max_retries: maxRetries,
      },
    });

    return rows.map(this.rowToLogEntry);
  }

  /**
   * Insert log entry using MERGE (upsert by ingestion_id)
   */
  private async insertLogEntry(entry: IngestionLogEntry): Promise<void> {
    const query = `
      MERGE \`${this.projectId}.${this.ingestionDataset}.ingestion_log\` T
      USING (
        SELECT
          @ingestion_id AS ingestion_id,
          @tenant_id AS tenant_id,
          @source_type AS source_type,
          @source_id AS source_id,
          @report_type AS report_type,
          ${entry.reportDate ? 'DATE(@report_date) AS report_date,' : 'NULL AS report_date,'}
          @filename AS filename,
          @email_subject AS email_subject,
          ${entry.emailDate ? 'TIMESTAMP(@email_date) AS email_date,' : 'NULL AS email_date,'}
          CURRENT_TIMESTAMP() AS processed_at,
          @status AS status,
          @report_id AS report_id,
          @rows_inserted AS rows_inserted,
          @duration_ms AS duration_ms,
          @error_code AS error_code,
          @error_message AS error_message,
          @retry_count AS retry_count
      ) S
      ON T.ingestion_id = S.ingestion_id
      WHEN MATCHED THEN
        UPDATE SET
          status = S.status,
          processed_at = S.processed_at,
          report_id = S.report_id,
          rows_inserted = S.rows_inserted,
          duration_ms = S.duration_ms,
          error_code = S.error_code,
          error_message = S.error_message,
          retry_count = S.retry_count
      WHEN NOT MATCHED THEN
        INSERT (
          ingestion_id,
          tenant_id,
          source_type,
          source_id,
          report_type,
          report_date,
          filename,
          email_subject,
          email_date,
          processed_at,
          status,
          report_id,
          rows_inserted,
          duration_ms,
          error_code,
          error_message,
          retry_count
        )
        VALUES (
          S.ingestion_id,
          S.tenant_id,
          S.source_type,
          S.source_id,
          S.report_type,
          S.report_date,
          S.filename,
          S.email_subject,
          S.email_date,
          S.processed_at,
          S.status,
          S.report_id,
          S.rows_inserted,
          S.duration_ms,
          S.error_code,
          S.error_message,
          S.retry_count
        )
    `;

    const params: any = {
      ingestion_id: entry.ingestionId,
      tenant_id: entry.tenantId,
      source_type: entry.sourceType,
      source_id: entry.sourceId,
      report_type: entry.reportType,
      filename: entry.filename || null,
      email_subject: entry.emailSubject || null,
      status: entry.status,
      report_id: entry.reportId || null,
      rows_inserted: entry.rowsInserted || null,
      duration_ms: entry.durationMs || null,
      error_code: entry.errorCode || null,
      error_message: entry.errorMessage || null,
      retry_count: entry.retryCount,
    };

    if (entry.reportDate) {
      params.report_date = entry.reportDate.toISOString().split('T')[0];
    }

    if (entry.emailDate) {
      params.email_date = entry.emailDate.toISOString();
    }

    await this.bq.query({ query, params });
  }

  /**
   * Transform BigQuery row to IngestionLogEntry
   */
  private rowToLogEntry(row: any): IngestionLogEntry {
    return {
      ingestionId: row.ingestion_id,
      tenantId: row.tenant_id,
      sourceType: row.source_type,
      sourceId: row.source_id,
      reportType: row.report_type,
      reportDate: row.report_date ? new Date(row.report_date.value) : undefined,
      filename: row.filename,
      emailSubject: row.email_subject,
      emailDate: row.email_date ? new Date(row.email_date.value) : undefined,
      processedAt: new Date(row.processed_at.value),
      status: row.status,
      reportId: row.report_id,
      rowsInserted: row.rows_inserted,
      durationMs: row.duration_ms,
      errorCode: row.error_code,
      errorMessage: row.error_message,
      retryCount: row.retry_count || 0,
    };
  }
}
