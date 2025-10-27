export interface Config {
  projectId: string;
  region: string;
  environment: string;
  logLevel: string;
  geminiSecretName: string;
  conversationManagerUrl: string;
  port: number;
  enableCharts: boolean;
  enableForecasts: boolean;
  enableAnomalyDetection: boolean;
  maxChartDatapoints: number;
  maxConversationHistory: number;
  maxQueryResults: number;
  geminiModelPro: string;
  defaultTimezone: string;
  defaultCurrency: string;
}

export function loadConfig(): Config {
  return {
    projectId: process.env.PROJECT_ID || 'fdsanalytics',
    region: process.env.REGION || 'us-central1',
    environment: process.env.ENVIRONMENT || 'development',
    logLevel: process.env.LOG_LEVEL || 'info',
    geminiSecretName: process.env.GEMINI_SECRET_NAME || 'GEMINI_API_KEY',
    conversationManagerUrl: process.env.CONVERSATION_MANAGER_URL || 'http://localhost:3002',
    port: parseInt(process.env.PORT || '8080', 10),
    enableCharts: process.env.ENABLE_CHARTS !== 'false',
    enableForecasts: process.env.ENABLE_FORECASTS !== 'false',
    enableAnomalyDetection: process.env.ENABLE_ANOMALY_DETECTION !== 'false',
    maxChartDatapoints: parseInt(process.env.MAX_CHART_DATAPOINTS || '20', 10),
    maxConversationHistory: parseInt(process.env.MAX_CONVERSATION_HISTORY || '10', 10),
    maxQueryResults: parseInt(process.env.MAX_QUERY_RESULTS || '100', 10),
    geminiModelPro: process.env.GEMINI_MODEL_PRO || 'gemini-2.5-pro',
    defaultTimezone: process.env.DEFAULT_TIMEZONE || 'America/Chicago',
    defaultCurrency: process.env.DEFAULT_CURRENCY || 'USD'
  };
}
