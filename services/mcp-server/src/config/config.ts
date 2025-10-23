// Configuration for MCP Server
// Loads environment variables and secrets

export interface Config {
  projectId: string;
  region: string;
  bqDatasetAnalytics: string;
  bqDatasetInsights: string;
  timezone: string;
  port: number;
  queryTimeoutMs: number;
  maxQueryResults: number;
  environment: 'development' | 'production' | 'test';
}

export function loadConfig(): Config {
  return {
    projectId: process.env.PROJECT_ID || 'fdsanalytics',
    region: process.env.REGION || 'us-central1',
    bqDatasetAnalytics: process.env.BQ_DATASET_ANALYTICS || 'restaurant_analytics',
    bqDatasetInsights: process.env.BQ_DATASET_INSIGHTS || 'insights',
    timezone: process.env.DEFAULT_TIMEZONE || 'America/Chicago',
    port: parseInt(process.env.PORT || '8080', 10),
    queryTimeoutMs: 30000, // 30 seconds
    maxQueryResults: 100,
    environment: (process.env.NODE_ENV || 'development') as Config['environment']
  };
}

export const config = loadConfig();
