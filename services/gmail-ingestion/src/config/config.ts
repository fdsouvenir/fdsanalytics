/**
 * Configuration for Gmail Ingestion Service
 */

export interface Config {
  // GCP Project
  projectId: string;
  region: string;

  // BigQuery
  bqDatasetAnalytics: string;
  bqDatasetIngestion: string;

  // Gmail
  gmailSearchQuery: string;
  gmailOAuthSecretName: string;

  // Gemini
  geminiSecretName: string;
  geminiModel: string;

  // Ingestion
  backfillBatchSize: number;
  maxRetries: number;

  // Timeouts
  parseTimeoutMs: number;
  gmailTimeoutMs: number;
}

export function loadConfig(): Config {
  return {
    projectId: process.env.PROJECT_ID || 'fdsanalytics',
    region: process.env.REGION || 'us-central1',

    bqDatasetAnalytics: process.env.BQ_DATASET_ANALYTICS || 'restaurant_analytics',
    bqDatasetIngestion: process.env.BQ_DATASET_INGESTION || 'ingestion',

    gmailSearchQuery: process.env.GMAIL_SEARCH_QUERY || 'from:spoton subject:pmix has:attachment',
    gmailOAuthSecretName: process.env.GMAIL_OAUTH_SECRET_NAME || 'GMAIL_OAUTH_CREDENTIALS',

    geminiSecretName: process.env.GEMINI_SECRET_NAME || 'GEMINI_API_KEY',
    geminiModel: process.env.GEMINI_MODEL || 'gemini-2.5-flash-lite',

    backfillBatchSize: parseInt(process.env.BACKFILL_BATCH_SIZE || '10', 10),
    maxRetries: parseInt(process.env.MAX_RETRIES || '3', 10),

    parseTimeoutMs: parseInt(process.env.PARSE_TIMEOUT_MS || '30000', 10),
    gmailTimeoutMs: parseInt(process.env.GMAIL_TIMEOUT_MS || '10000', 10),
  };
}
