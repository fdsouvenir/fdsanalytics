/**
 * Report processor - orchestrates parsing and BigQuery insertion
 */

import { BaseParser } from '../parsers/BaseParser';
import { PmixParser } from '../parsers/PmixParser';
import { BigQueryClient } from '../bigquery/BigQueryClient';
import { IngestionLogger } from '../bigquery/IngestionLogger';
import {
  ReportMetadata,
  ProcessingResult,
  GmailMessage,
  GmailAttachment,
} from '../types';

export class ReportProcessor {
  private parsers: BaseParser[];
  private bqClient: BigQueryClient;
  private logger: IngestionLogger;
  private maxRetries: number;

  constructor(
    bqClient: BigQueryClient,
    logger: IngestionLogger,
    pmixParser: PmixParser,
    maxRetries: number = 3
  ) {
    this.bqClient = bqClient;
    this.logger = logger;
    this.parsers = [pmixParser];
    this.maxRetries = maxRetries;
  }

  /**
   * Detect report type from email/filename
   */
  detectReportType(
    subject: string,
    filename: string
  ): 'pmix' | 'labor' | 'unknown' {
    for (const parser of this.parsers) {
      if (parser.canParse(filename, subject)) {
        return parser.getReportType();
      }
    }

    return 'unknown';
  }

  /**
   * Process a single report with idempotency
   */
  async processReport(
    message: GmailMessage,
    attachment: GmailAttachment,
    metadata: ReportMetadata
  ): Promise<ProcessingResult> {
    const startTime = Date.now();

    // Step 1: Check if already processed (idempotency)
    const existing = await this.logger.checkProcessed(
      metadata.tenantId,
      metadata.messageId
    );

    if (existing) {
      if (existing.status === 'success') {
        console.log(
          `Message ${metadata.messageId} already processed successfully, skipping`
        );

        await this.logger.logSkipped(metadata.tenantId, metadata.messageId, 'pmix', {
          filename: metadata.filename,
          emailSubject: message.subject,
          emailDate: metadata.emailDate,
          reason: 'Already processed successfully',
        });

        return {
          success: true,
          reportDate: existing.reportDate,
          reportId: existing.reportId,
          rowsInserted: existing.rowsInserted || 0,
          durationMs: Date.now() - startTime,
        };
      }

      if (existing.status === 'failed' && existing.retryCount >= this.maxRetries) {
        console.log(
          `Message ${metadata.messageId} failed ${existing.retryCount} times, max retries reached`
        );

        return {
          success: false,
          error: `Max retries (${this.maxRetries}) reached: ${existing.errorMessage}`,
          durationMs: Date.now() - startTime,
        };
      }

      console.log(
        `Message ${metadata.messageId} previously failed (attempt ${existing.retryCount}), retrying...`
      );
    }

    // Step 2: Select parser
    const reportType = this.detectReportType(message.subject, metadata.filename);

    if (reportType === 'unknown') {
      const error = 'Unknown report type - cannot parse';
      await this.logger.logFailure(metadata.tenantId, metadata.messageId, 'pmix', {
        filename: metadata.filename,
        emailSubject: message.subject,
        emailDate: metadata.emailDate,
        errorCode: 'UNKNOWN_REPORT_TYPE',
        errorMessage: error,
        retryCount: (existing?.retryCount || 0) + 1,
        durationMs: Date.now() - startTime,
      });

      return {
        success: false,
        error,
        durationMs: Date.now() - startTime,
      };
    }

    const parser = this.parsers.find((p) => p.getReportType() === reportType);
    if (!parser) {
      throw new Error(`No parser found for report type: ${reportType}`);
    }

    // Step 3: Parse PDF
    let parsed;
    try {
      if (!attachment.data) {
        throw new Error('Attachment data is missing');
      }

      console.log(
        `Parsing ${reportType} report: ${metadata.filename} (${attachment.size} bytes)`
      );

      parsed = await parser.parse(attachment.data, {
        filename: metadata.filename,
        emailDate: metadata.emailDate,
      });

      console.log(
        `Successfully parsed report: ${parsed.reportDate.toISOString().split('T')[0]} with ${
          parsed.metrics.length
        } metrics`
      );
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      console.error(`Failed to parse ${metadata.filename}:`, errorMessage);

      await this.logger.logFailure(metadata.tenantId, metadata.messageId, reportType, {
        filename: metadata.filename,
        emailSubject: message.subject,
        emailDate: metadata.emailDate,
        errorCode: 'PARSE_FAILED',
        errorMessage,
        retryCount: (existing?.retryCount || 0) + 1,
        durationMs: Date.now() - startTime,
      });

      return {
        success: false,
        error: `Parse failed: ${errorMessage}`,
        durationMs: Date.now() - startTime,
      };
    }

    // Step 4: Upsert to BigQuery
    try {
      const { reportId, rowsInserted } = await this.bqClient.upsertReport(parsed);

      const durationMs = Date.now() - startTime;

      await this.logger.logSuccess(
        metadata.tenantId,
        metadata.messageId,
        reportType,
        {
          filename: metadata.filename,
          emailSubject: message.subject,
          emailDate: metadata.emailDate,
          reportDate: parsed.reportDate,
          reportId,
          rowsInserted,
          durationMs,
        }
      );

      console.log(
        `Successfully processed report ${reportId} in ${durationMs}ms`
      );

      return {
        success: true,
        reportDate: parsed.reportDate,
        reportId,
        rowsInserted,
        durationMs,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      console.error(`Failed to upsert ${metadata.filename}:`, errorMessage);

      await this.logger.logFailure(metadata.tenantId, metadata.messageId, reportType, {
        filename: metadata.filename,
        emailSubject: message.subject,
        emailDate: metadata.emailDate,
        errorCode: 'BIGQUERY_UPSERT_FAILED',
        errorMessage,
        retryCount: (existing?.retryCount || 0) + 1,
        durationMs: Date.now() - startTime,
      });

      return {
        success: false,
        error: `BigQuery upsert failed: ${errorMessage}`,
        durationMs: Date.now() - startTime,
      };
    }
  }
}
