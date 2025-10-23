/**
 * Backfill service for historical data import with progress tracking
 */

import { BigQuery } from '@google-cloud/bigquery';
import { GmailClient } from '../gmail/GmailClient';
import { ReportProcessor } from './ReportProcessor';
import {
  IngestionResult,
  BackfillProgress,
  BackfillJob,
  OAuthTokens,
} from '../types';
import { Config } from '../config/config';

export class BackfillService {
  private gmailClient: GmailClient;
  private processor: ReportProcessor;
  private bq: BigQuery;
  private config: Config;
  private projectId: string;
  private ingestionDataset: string;

  constructor(
    gmailClient: GmailClient,
    processor: ReportProcessor,
    config: Config,
    projectId: string,
    ingestionDataset: string
  ) {
    this.gmailClient = gmailClient;
    this.processor = processor;
    this.config = config;
    this.projectId = projectId;
    this.ingestionDataset = ingestionDataset;
    this.bq = new BigQuery({ projectId });
  }

  /**
   * Backfill historical reports with progress tracking
   */
  async backfillHistoricalReports(
    tenantId: string,
    oauthTokens: OAuthTokens,
    startDate: Date,
    endDate: Date,
    progressCallback?: (progress: BackfillProgress) => void
  ): Promise<IngestionResult> {
    const overallStartTime = Date.now();

    // Create backfill job record
    const jobId = `${tenantId}-${Date.now()}`;
    const job: BackfillJob = {
      jobId,
      tenantId,
      startedAt: new Date(),
      status: 'running',
      startDate,
      endDate,
      reportTypes: ['pmix'],
      totalEmails: 0,
      processedEmails: 0,
      successfulEmails: 0,
      failedEmails: 0,
      skippedEmails: 0,
      percentComplete: 0,
      failedMessageIds: [],
    };

    await this.createBackfillJob(job);

    console.log(`Starting backfill job ${jobId} for ${tenantId}`);
    console.log(`Date range: ${startDate.toISOString()} to ${endDate.toISOString()}`);

    // Initialize Gmail client
    await this.gmailClient.initialize(oauthTokens);

    // Search for all PMIX emails in date range
    const messages = await this.gmailClient.searchEmails({
      query: this.config.gmailSearchQuery,
      afterDate: startDate,
      beforeDate: endDate,
      maxResults: 1000,
    });

    job.totalEmails = messages.length;
    await this.updateBackfillJob(job);

    console.log(`Found ${messages.length} emails to backfill`);

    let successCount = 0;
    let failedCount = 0;
    let skippedCount = 0;
    const errors: Array<{ messageId: string; filename: string; error: string }> = [];

    // Process in batches with progress tracking
    for (let i = 0; i < messages.length; i++) {
      const message = messages[i];

      console.log(
        `[${i + 1}/${messages.length}] Processing message ${message.id}: ${message.subject}`
      );

      // Download PDF attachments
      const attachments = await this.gmailClient.downloadPdfAttachments(message);

      if (attachments.length === 0) {
        console.log(`No PDF attachments in message ${message.id}, skipping`);
        skippedCount++;
        job.skippedEmails++;
        job.processedEmails++;
        continue;
      }

      // Process each attachment
      for (const attachment of attachments) {
        const result = await this.processor.processReport(
          message,
          attachment,
          {
            messageId: message.id,
            emailDate: message.date,
            filename: attachment.filename,
            tenantId,
            emailSubject: message.subject,
          }
        );

        if (result.success) {
          successCount++;
          job.successfulEmails++;
        } else {
          failedCount++;
          job.failedEmails++;
          errors.push({
            messageId: message.id,
            filename: attachment.filename,
            error: result.error || 'Unknown error',
          });
        }
      }

      job.processedEmails++;
      job.percentComplete = (job.processedEmails / job.totalEmails) * 100;

      // Report progress every 20 emails
      if ((i + 1) % 20 === 0 || i === messages.length - 1) {
        const progress: BackfillProgress = {
          totalEmails: job.totalEmails,
          processedEmails: job.processedEmails,
          percentComplete: job.percentComplete,
          estimatedMinutesRemaining: this.estimateTimeRemaining(
            overallStartTime,
            job.processedEmails,
            job.totalEmails
          ),
        };

        await this.updateBackfillJob(job);

        if (progressCallback) {
          progressCallback(progress);
        }

        console.log(
          `Progress: ${job.processedEmails}/${job.totalEmails} (${job.percentComplete.toFixed(1)}%) - ${successCount} succeeded, ${failedCount} failed`
        );
      }
    }

    // Mark job as completed
    job.status = failedCount === messages.length ? 'failed' : 'completed';
    job.completedAt = new Date();

    if (failedCount === messages.length) {
      job.errorMessage = 'All messages failed to process';
    }

    job.failedMessageIds = errors.map((e) => e.messageId);

    await this.updateBackfillJob(job);

    const durationMs = Date.now() - overallStartTime;

    console.log(`Backfill job ${jobId} completed in ${durationMs}ms`);
    console.log(
      `Results: ${successCount} succeeded, ${failedCount} failed, ${skippedCount} skipped`
    );

    return {
      totalProcessed: messages.length,
      successCount,
      failedCount,
      skippedCount,
      errors,
      durationMs,
    };
  }

  /**
   * Create backfill job record
   */
  private async createBackfillJob(job: BackfillJob): Promise<void> {
    const query = `
      INSERT INTO \`${this.projectId}.${this.ingestionDataset}.backfill_jobs\`
      (
        job_id,
        tenant_id,
        started_at,
        status,
        start_date,
        end_date,
        report_types,
        total_emails,
        processed_emails,
        successful_emails,
        failed_emails,
        skipped_emails,
        percent_complete
      )
      VALUES (
        @job_id,
        @tenant_id,
        CURRENT_TIMESTAMP(),
        @status,
        DATE(@start_date),
        DATE(@end_date),
        @report_types,
        @total_emails,
        @processed_emails,
        @successful_emails,
        @failed_emails,
        @skipped_emails,
        @percent_complete
      )
    `;

    await this.bq.query({
      query,
      params: {
        job_id: job.jobId,
        tenant_id: job.tenantId,
        status: job.status,
        start_date: job.startDate?.toISOString().split('T')[0],
        end_date: job.endDate?.toISOString().split('T')[0],
        report_types: job.reportTypes,
        total_emails: job.totalEmails,
        processed_emails: job.processedEmails,
        successful_emails: job.successfulEmails,
        failed_emails: job.failedEmails,
        skipped_emails: job.skippedEmails,
        percent_complete: job.percentComplete,
      },
    });
  }

  /**
   * Update backfill job progress
   */
  private async updateBackfillJob(job: BackfillJob): Promise<void> {
    const query = `
      UPDATE \`${this.projectId}.${this.ingestionDataset}.backfill_jobs\`
      SET
        status = @status,
        processed_emails = @processed_emails,
        successful_emails = @successful_emails,
        failed_emails = @failed_emails,
        skipped_emails = @skipped_emails,
        percent_complete = @percent_complete,
        ${job.completedAt ? 'completed_at = @completed_at,' : ''}
        ${job.errorMessage ? 'error_message = @error_message,' : ''}
        ${job.failedMessageIds.length > 0 ? 'failed_message_ids = @failed_message_ids,' : ''}
        last_notification_at = CURRENT_TIMESTAMP()
      WHERE job_id = @job_id
    `;

    const params: any = {
      job_id: job.jobId,
      status: job.status,
      processed_emails: job.processedEmails,
      successful_emails: job.successfulEmails,
      failed_emails: job.failedEmails,
      skipped_emails: job.skippedEmails,
      percent_complete: job.percentComplete,
    };

    if (job.completedAt) {
      params.completed_at = job.completedAt.toISOString();
    }

    if (job.errorMessage) {
      params.error_message = job.errorMessage;
    }

    if (job.failedMessageIds.length > 0) {
      params.failed_message_ids = job.failedMessageIds;
    }

    await this.bq.query({ query, params });
  }

  /**
   * Estimate remaining time in minutes
   */
  private estimateTimeRemaining(
    startTime: number,
    processed: number,
    total: number
  ): number {
    if (processed === 0) {
      return 0;
    }

    const elapsed = Date.now() - startTime;
    const avgTimePerEmail = elapsed / processed;
    const remaining = total - processed;
    const estimatedMs = remaining * avgTimePerEmail;

    return Math.ceil(estimatedMs / 60000); // Convert to minutes
  }

  /**
   * Get backfill job status
   */
  async getJobStatus(jobId: string): Promise<BackfillJob | null> {
    const query = `
      SELECT *
      FROM \`${this.projectId}.${this.ingestionDataset}.backfill_jobs\`
      WHERE job_id = @job_id
    `;

    const [rows] = await this.bq.query({
      query,
      params: { job_id: jobId },
    });

    if (rows.length === 0) {
      return null;
    }

    const row = rows[0];

    return {
      jobId: row.job_id,
      tenantId: row.tenant_id,
      startedAt: new Date(row.started_at.value),
      completedAt: row.completed_at ? new Date(row.completed_at.value) : undefined,
      status: row.status,
      startDate: row.start_date ? new Date(row.start_date.value) : undefined,
      endDate: row.end_date ? new Date(row.end_date.value) : undefined,
      reportTypes: row.report_types || [],
      totalEmails: row.total_emails || 0,
      processedEmails: row.processed_emails || 0,
      successfulEmails: row.successful_emails || 0,
      failedEmails: row.failed_emails || 0,
      skippedEmails: row.skipped_emails || 0,
      percentComplete: row.percent_complete || 0,
      errorMessage: row.error_message,
      failedMessageIds: row.failed_message_ids || [],
      userId: row.user_id,
      notificationThreadId: row.notification_thread_id,
      lastNotificationAt: row.last_notification_at
        ? new Date(row.last_notification_at.value)
        : undefined,
    };
  }
}
