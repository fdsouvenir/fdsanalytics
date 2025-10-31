export interface Config {
  projectId: string;
  region: string;
  environment: string;
  logLevel: string;
  port: number;
  enableCharts: boolean;
  maxChartDatapoints: number;
  maxQueryResults: number;
  defaultTimezone: string;
  defaultCurrency: string;
}

export function loadConfig(): Config {
  return {
    projectId: process.env.PROJECT_ID || 'fdsanalytics',
    region: process.env.REGION || 'us-central1',
    environment: process.env.ENVIRONMENT || 'development',
    logLevel: process.env.LOG_LEVEL || 'info',
    port: parseInt(process.env.PORT || '8080', 10),
    enableCharts: process.env.ENABLE_CHARTS !== 'false',
    maxChartDatapoints: parseInt(process.env.MAX_CHART_DATAPOINTS || '20', 10),
    maxQueryResults: parseInt(process.env.MAX_QUERY_RESULTS || '100', 10),
    defaultTimezone: process.env.DEFAULT_TIMEZONE || 'America/Chicago',
    defaultCurrency: process.env.DEFAULT_CURRENCY || 'USD'
  };
}
