/**
 * Configuration for Conversation Manager Service
 */

export interface Config {
  projectId: string;
  bqDatasetChatHistory: string;
  geminiModel: string;
  geminiSecretName: string;
  defaultTenantId: string;
  maxConversationHistory: number;
  port: number;
  environment: 'development' | 'production' | 'test';
}

export function loadConfig(): Config {
  return {
    projectId: process.env.PROJECT_ID || 'fdsanalytics',
    bqDatasetChatHistory: process.env.BQ_DATASET_CHAT_HISTORY || 'chat_history',
    geminiModel: process.env.GEMINI_MODEL_FLASH || 'gemini-2.5-flash',
    geminiSecretName: process.env.GEMINI_SECRET_NAME || 'GEMINI_API_KEY',
    defaultTenantId: process.env.DEFAULT_TENANT_ID || 'senso-sushi',
    maxConversationHistory: parseInt(process.env.MAX_CONVERSATION_HISTORY || '10', 10),
    port: parseInt(process.env.PORT || '8080', 10),
    environment: (process.env.NODE_ENV as Config['environment']) || 'development',
  };
}

export const config = loadConfig();
