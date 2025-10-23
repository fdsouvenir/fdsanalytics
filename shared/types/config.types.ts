/**
 * Configuration and environment types
 */

export interface EnvironmentConfig {
  // GCP
  PROJECT_ID: string;
  REGION: string;

  // BigQuery
  BQ_DATASET_ANALYTICS: string;
  BQ_DATASET_INSIGHTS: string;
  BQ_DATASET_CHAT_HISTORY: string;

  // Secrets
  GEMINI_SECRET_NAME: string;
  GMAIL_OAUTH_SECRET_NAME: string;

  // Gemini Models
  GEMINI_MODEL_FLASH: string;
  GEMINI_MODEL_PRO: string;

  // Application
  DEFAULT_TIMEZONE: string;
  DEFAULT_CURRENCY: string;
  LOG_LEVEL: 'debug' | 'info' | 'warn' | 'error';

  // Feature Flags
  ENABLE_CHARTS: boolean;
  ENABLE_FORECASTS: boolean;
  ENABLE_ANOMALY_DETECTION: boolean;

  // Rate Limits
  MAX_CHART_DATAPOINTS: number;
  MAX_CONVERSATION_HISTORY: number;
  MAX_QUERY_RESULTS: number;

  // Ingestion
  INGESTION_SCHEDULE: string;
  GMAIL_SEARCH_QUERY: string;
  BACKFILL_BATCH_SIZE: number;
}
