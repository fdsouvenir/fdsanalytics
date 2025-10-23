/**
 * Main ingestion service - daily scheduled processing
 */

import { GmailClient } from '../gmail/GmailClient';
import { ReportProcessor } from './ReportProcessor';
import { IngestionResult, OAuthTokens } from '../types';
import { Config } from '../config/config';

export class IngestionService {
  private gmailClient: GmailClient;
  private processor: ReportProcessor;
  private config: Config;

  constructor(
    gmailClient: GmailClient,
    processor: ReportProcessor,
    config: Config
  ) {
    this.gmailClient = gmailClient;
    this.processor = processor;
    this.config = config;
  }

  /**
   * Ingest new reports since last run
   * Called by Cloud Scheduler daily at 3am CT
   */
  async ingestNewReports(
    tenantId: string,
    oauthTokens: OAuthTokens,
    sinceDate?: Date
  ): Promise<IngestionResult> {
    const startTime = Date.now();

    console.log('Starting daily ingestion service...');

    // Initialize Gmail client
    await this.gmailClient.initialize(oauthTokens);

    // Default to last 2 days to catch any missed reports
    const afterDate = sinceDate || new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);

    console.log(`Searching for emails after ${afterDate.toISOString()}`);

    // Search for PMIX emails
    const messages = await this.gmailClient.searchEmails({
      query: this.config.gmailSearchQuery,
      afterDate,
      maxResults: 100,
    });

    console.log(`Found ${messages.length} emails to process`);

    // Process each message
    let successCount = 0;
    let failedCount = 0;
    let skippedCount = 0;
    const errors: Array<{ messageId: string; filename: string; error: string }> = [];

    for (const message of messages) {
      console.log(
        `Processing message ${message.id}: ${message.subject} from ${message.from}`
      );

      // Download PDF attachments
      const attachments = await this.gmailClient.downloadPdfAttachments(message);

      if (attachments.length === 0) {
        console.log(`No PDF attachments found in message ${message.id}, skipping`);
        skippedCount++;
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
        } else {
          failedCount++;
          errors.push({
            messageId: message.id,
            filename: attachment.filename,
            error: result.error || 'Unknown error',
          });
        }
      }
    }

    const durationMs = Date.now() - startTime;

    console.log(
      `Ingestion complete: ${successCount} succeeded, ${failedCount} failed, ${skippedCount} skipped in ${durationMs}ms`
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
}
