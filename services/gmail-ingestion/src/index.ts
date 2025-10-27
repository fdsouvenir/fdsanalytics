/**
 * Cloud Function entry point for Gmail Ingestion
 * Triggered by Pub/Sub (Cloud Scheduler daily at 3am CT)
 */

import { loadConfig } from './config/config';
import { GmailClient } from './gmail/GmailClient';
import { PmixParser } from './parsers/PmixParser';
import { BigQueryClient } from './bigquery/BigQueryClient';
import { IngestionLogger } from './bigquery/IngestionLogger';
import { ReportProcessor } from './core/ReportProcessor';
import { IngestionService } from './core/IngestionService';
import { BackfillService } from './core/BackfillService';
import { OAuthTokens } from './types';

// Load configuration
const config = loadConfig();

// V1: Hardcoded single tenant (per PROJECT_INFO.md)
const TENANT_ID = 'senso-sushi';

// V1: Load OAuth tokens from Secret Manager (mounted as env var at deployment)
// Secret contains JSON: {"access_token": "...", "refresh_token": "..."}
const OAUTH_TOKENS: OAuthTokens = (() => {
  const credentials = process.env.GMAIL_OAUTH_CREDENTIALS;
  if (!credentials) {
    throw new Error('GMAIL_OAUTH_CREDENTIALS environment variable not set');
  }
  try {
    return JSON.parse(credentials);
  } catch (error) {
    throw new Error('Invalid GMAIL_OAUTH_CREDENTIALS JSON format');
  }
})();

/**
 * Main Cloud Function entry point
 * Triggered by Pub/Sub message from Cloud Scheduler
 */
export async function ingestReports(
  message: any,
  context: any
): Promise<void> {
  console.log('Gmail Ingestion Cloud Function triggered');
  console.log('Pub/Sub message:', message);

  try {
    // Initialize services
    const gmailClient = new GmailClient(
      config.projectId,
      config.gmailOAuthSecretName
    );

    const pmixParser = new PmixParser(
      config.projectId,
      config.geminiSecretName,
      config.geminiModel
    );

    const bqClient = new BigQueryClient(
      config.projectId,
      config.bqDatasetAnalytics
    );

    const ingestionLogger = new IngestionLogger(
      config.projectId,
      config.bqDatasetIngestion
    );

    const processor = new ReportProcessor(
      bqClient,
      ingestionLogger,
      pmixParser,
      config.maxRetries
    );

    const ingestionService = new IngestionService(
      gmailClient,
      processor,
      config
    );

    // Run daily ingestion (last 2 days to catch missed reports)
    const result = await ingestionService.ingestNewReports(
      TENANT_ID,
      OAUTH_TOKENS
    );

    console.log('Ingestion completed successfully', {
      totalProcessed: result.totalProcessed,
      successCount: result.successCount,
      failedCount: result.failedCount,
      skippedCount: result.skippedCount,
      durationMs: result.durationMs,
      errors: result.errors,
    });

    // Alert if too many failures
    if (result.failedCount > 0) {
      console.warn(`${result.failedCount} reports failed to process:`, result.errors);
    }
  } catch (error) {
    console.error('Ingestion failed with error:', error);
    throw error; // Re-throw for Pub/Sub retry
  }
}

/**
 * HTTP endpoint for manual backfill
 * Can be called via gcloud functions call or HTTP POST
 */
export async function backfillReports(
  req: any,
  res: any
): Promise<void> {
  console.log('Backfill function triggered');

  try {
    const { startDate, endDate } = req.body || {};

    if (!startDate || !endDate) {
      res.status(400).json({
        error: 'Missing required parameters: startDate, endDate',
      });
      return;
    }

    const start = new Date(startDate);
    const end = new Date(endDate);

    console.log(`Starting backfill from ${startDate} to ${endDate}`);

    // Initialize services
    const gmailClient = new GmailClient(
      config.projectId,
      config.gmailOAuthSecretName
    );

    const pmixParser = new PmixParser(
      config.projectId,
      config.geminiSecretName,
      config.geminiModel
    );

    const bqClient = new BigQueryClient(
      config.projectId,
      config.bqDatasetAnalytics
    );

    const ingestionLogger = new IngestionLogger(
      config.projectId,
      config.bqDatasetIngestion
    );

    const processor = new ReportProcessor(
      bqClient,
      ingestionLogger,
      pmixParser,
      config.maxRetries
    );

    const backfillService = new BackfillService(
      gmailClient,
      processor,
      config,
      config.projectId,
      config.bqDatasetIngestion
    );

    // Run backfill with progress logging
    const result = await backfillService.backfillHistoricalReports(
      TENANT_ID,
      OAUTH_TOKENS,
      start,
      end,
      (progress) => {
        console.log(
          `Backfill progress: ${progress.percentComplete.toFixed(1)}% (${progress.processedEmails}/${progress.totalEmails})`
        );
      }
    );

    console.log('Backfill completed', result);

    res.status(200).json({
      success: true,
      result,
    });
  } catch (error) {
    console.error('Backfill failed:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
