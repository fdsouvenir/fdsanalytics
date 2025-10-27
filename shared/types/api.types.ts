/**
 * API Contracts & Interfaces
 * Based on docs/02-api-contracts.md
 */

// Response Engine Interface
export interface ChatMessageRequest {
  workspaceId: string;
  userId: string;
  message: string;
  threadId?: string;
  messageId: string;
  timestamp: string;
}

export interface ChatMessageResponse {
  text: string;
  cards?: Card[];
  threadId: string;
  responseType: 'NEW_MESSAGE' | 'UPDATE_MESSAGE';
}

export interface SetupRequest {
  workspaceId: string;
  userId: string;
  gmailAuthCode: string;
}

export interface SetupResponse {
  success: boolean;
  tenantId: string;
  message: string;
  backfillJobId: string;
}

export interface StatusRequest {
  workspaceId: string;
  userId: string;
}

export interface StatusResponse {
  status: 'not_started' | 'running' | 'completed' | 'failed';
  progress?: {
    totalReports: number;
    processedReports: number;
    failedReports: number;
    percentComplete: number;
    currentDate?: string;
    estimatedMinutesRemaining?: number;
  };
  message: string;
}

export interface QueryAnalyticsParams {
  metric: 'net_sales' | 'quantity_sold';
  timeframe: {
    type: 'absolute' | 'relative';
    start?: string;
    end?: string;
    relative?: 'today' | 'yesterday' | 'this_week' | 'last_week' | 'this_month' | 'last_month';
  };
  filters?: {
    primaryCategory?: string;
    subcategory?: string;
    itemName?: string;
  };
  aggregation: 'sum' | 'avg' | 'count' | 'min' | 'max';
  groupBy?: Array<'date' | 'category' | 'subcategory' | 'item'>;
  comparison?: {
    baselineTimeframe: {
      type: 'absolute' | 'relative';
      start?: string;
      end?: string;
      relative?: string;
    };
  };
  limit?: number;
  orderBy?: {
    field: string;
    direction: 'asc' | 'desc';
  };
}

export interface QueryAnalyticsResult {
  rows: Array<Record<string, any>>;
  totalRows: number;
  executionTimeMs: number;
  queryUsed?: string;
}

export interface GetForecastParams {
  days?: number;
}

export interface ForecastResult {
  forecasts: Array<{
    targetDate: string;
    predictedSales: number;
    confidenceLow: number;
    confidenceHigh: number;
    confidenceScore: number;
  }>;
}

export interface GetAnomaliesParams {
  days?: number;
}

export interface AnomaliesResult {
  anomalies: Array<{
    date: string;
    metric: string;
    currentValue: number;
    expectedValue: number;
    percentChange: number;
    anomalyType: 'spike' | 'drop';
    severity: 'minor' | 'major';
  }>;
}

// Chart Builder Interface
export interface ChartSpec {
  type: 'bar' | 'line' | 'pie' | 'horizontalBar';
  title: string;
  data: {
    labels: string[];
    datasets: Array<{
      label: string;
      data: number[];
      backgroundColor?: string | string[];
      borderColor?: string;
      borderWidth?: number;
    }>;
  };
  options?: {
    scales?: any;
    plugins?: any;
  };
}

// Google Chat Message Format
export interface Card {
  header?: {
    title: string;
    subtitle?: string;
  };
  sections: Section[];
}

export interface Section {
  widgets: Widget[];
}

export type Widget = TextWidget | ImageWidget | ButtonWidget;

export interface TextWidget {
  textParagraph: {
    text: string;
  };
}

export interface ImageWidget {
  image: {
    imageUrl: string;
    altText: string;
  };
}

export interface ButtonWidget {
  buttons: Array<{
    textButton: {
      text: string;
      onClick: {
        openLink: {
          url: string;
        };
      };
    };
  }>;
}

// Error Response Standards
export interface ErrorResponse {
  error: true;
  code: string;
  message: string;
  details?: any;
  timestamp: string;
  requestId?: string;
}

// Tool Call Interface
export interface ToolCall {
  toolName: string;
  parameters: Record<string, any>;
  result: any;
  durationMs: number;
}

// Response Generator
export interface ResponseGeneratorInput {
  userMessage: string;
  context: ConversationContext;
  tenantConfig: TenantConfig;
  currentDateTime: Date;
  availableCategories: string[];
}

export interface ResponseGeneratorOutput {
  responseText: string;
  charts: ChartSpec[];
  toolCallsMade: ToolCall[];
}

// Tenant Resolver Interface
export interface TenantConfig {
  tenantId: string;
  businessName: string;
  bqProject: string;
  bqDataset: string;
  timezone: string;
  currency: string;
  createdAt: Date;
  status: 'active' | 'suspended' | 'trial';
}

// Conversation Manager Interface
export interface ConversationContext {
  relevantMessages: Array<{
    role: 'user' | 'assistant';
    content: string;
    timestamp: Date;
  }>;
  summary?: string;
  entitiesExtracted?: {
    categories?: string[];
    dateRanges?: string[];
    metrics?: string[];
  };
}
