# API Contracts & Interfaces
## Senso Restaurant Analytics - Version 1.0

**Purpose:** Define all interfaces between components for contract-driven development.

---

## 1. Response Engine Interface

### 1.1 Public API

#### `handleChatMessage()`
Entry point for all Google Chat messages.

```typescript
interface ChatMessageRequest {
  workspaceId: string;        // Google Workspace ID
  userId: string;             // User's Google ID
  message: string;            // User's message text
  threadId?: string;          // Optional conversation thread
  messageId: string;          // Unique message ID
  timestamp: string;          // ISO 8601 timestamp
}

interface ChatMessageResponse {
  text: string;               // Formatted response text
  cards?: Card[];             // Google Chat cards (for charts)
  threadId: string;           // Thread to reply in
  responseType: 'NEW_MESSAGE' | 'UPDATE_MESSAGE';
}

async function handleChatMessage(
  request: ChatMessageRequest
): Promise<ChatMessageResponse>
```

#### `handleSetupCommand()`
Initialize tenant and start backfill.

```typescript
interface SetupRequest {
  workspaceId: string;
  userId: string;
  gmailAuthCode: string;      // OAuth authorization code
}

interface SetupResponse {
  success: boolean;
  tenantId: string;
  message: string;            // "Setup started! Importing data..."
  backfillJobId: string;      // For status tracking
}

async function handleSetupCommand(
  request: SetupRequest
): Promise<SetupResponse>
```

#### `handleStatusCommand()`
Check backfill progress.

```typescript
interface StatusRequest {
  workspaceId: string;
  userId: string;
}

interface StatusResponse {
  status: 'not_started' | 'running' | 'completed' | 'failed';
  progress?: {
    totalReports: number;
    processedReports: number;
    failedReports: number;
    percentComplete: number;
    currentDate?: string;     // Which report date is processing
    estimatedMinutesRemaining?: number;
  };
  message: string;
}

async function handleStatusCommand(
  request: StatusRequest
): Promise<StatusResponse>
```

---

## 2. Tenant Resolver Interface

Maps user identity to tenant configuration.

```typescript
interface TenantConfig {
  tenantId: string;
  businessName: string;
  bqProject: string;
  bqDataset: string;          // e.g., "tenant_abc123"
  timezone: string;           // IANA timezone
  currency: string;           // ISO 4217 code
  createdAt: Date;
  status: 'active' | 'suspended' | 'trial';
}

interface TenantResolver {
  /**
   * Resolve tenant from user identity.
   * Returns null if user has no tenant (needs /setup).
   */
  resolveTenant(
    workspaceId: string,
    userId: string
  ): Promise<TenantConfig | null>;
  
  /**
   * Create new tenant (called during /setup).
   */
  createTenant(
    workspaceId: string,
    userId: string,
    businessName: string
  ): Promise<TenantConfig>;
}
```

**V1 Implementation:**
```typescript
// Hardcoded single tenant
async function resolveTenant(): Promise<TenantConfig> {
  return {
    tenantId: 'senso-sushi',
    businessName: 'Senso Sushi',
    bqProject: 'fdsanalytics',
    bqDataset: 'restaurant_analytics',
    timezone: 'America/Chicago',
    currency: 'USD',
    createdAt: new Date('2025-01-01'),
    status: 'active'
  };
}
```

---

## 3. Conversation Manager Interface

Summarizes chat history for context.

```typescript
interface ConversationContext {
  relevantMessages: Array<{
    role: 'user' | 'assistant';
    content: string;
    timestamp: Date;
  }>;
  summary?: string;           // Optional condensed summary
  entitiesExtracted?: {       // Optional entity tracking
    categories?: string[];
    dateRanges?: string[];
    metrics?: string[];
  };
}

interface ConversationManager {
  /**
   * Get relevant context from chat history.
   * Uses Gemini Flash to summarize.
   */
  getContext(
    userId: string,
    threadId: string,
    currentMessage: string,
    maxMessages?: number       // Default: 10
  ): Promise<ConversationContext>;
  
  /**
   * Store message in history.
   */
  storeMessage(
    userId: string,
    threadId: string,
    role: 'user' | 'assistant',
    content: string
  ): Promise<void>;
}
```

**Storage Schema (BigQuery):**
```sql
CREATE TABLE chat_history.conversations (
  conversation_id STRING NOT NULL,
  user_id STRING NOT NULL,
  thread_id STRING NOT NULL,
  role STRING NOT NULL,        -- 'user' or 'assistant'
  content STRING NOT NULL,
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  tenant_id STRING NOT NULL
);
```

---

## 4. Response Generator Interface

Orchestrates query execution and response formatting.

```typescript
interface ResponseGeneratorInput {
  userMessage: string;
  context: ConversationContext;
  tenantConfig: TenantConfig;
  currentDateTime: Date;
  availableCategories: string[];  // From BQ
}

interface ResponseGeneratorOutput {
  responseText: string;         // Natural language response
  charts: ChartSpec[];          // Charts to generate
  toolCallsMade: ToolCall[];    // For debugging/logging
}

interface ToolCall {
  toolName: string;
  parameters: Record<string, any>;
  result: any;
  durationMs: number;
}

interface ResponseGenerator {
  /**
   * Generate response using Gemini 2.5 Pro + MCP tools.
   */
  generate(
    input: ResponseGeneratorInput
  ): Promise<ResponseGeneratorOutput>;
}
```

---

## 5. MCP Server Interface

### 5.1 MCP Protocol (Standard)

```typescript
interface MCPRequest {
  method: 'tools/list' | 'tools/call';
  params?: {
    name?: string;            // Tool name (for tools/call)
    arguments?: Record<string, any>;
  };
}

interface MCPResponse {
  result?: any;
  error?: {
    code: number;
    message: string;
  };
}
```

### 5.2 query_analytics Tool

```typescript
interface QueryAnalyticsParams {
  // What to measure
  metric: 'net_sales' | 'quantity_sold';
  
  // Time range
  timeframe: {
    type: 'absolute' | 'relative';
    start?: string;           // ISO date for absolute
    end?: string;             // ISO date for absolute
    relative?: 'today' | 'yesterday' | 'this_week' | 
               'last_week' | 'this_month' | 'last_month';
  };
  
  // Filters
  filters?: {
    primaryCategory?: string;  // Validated against BQ data
    subcategory?: string;      // Validated against BQ data
    itemName?: string;
  };
  
  // Aggregation
  aggregation: 'sum' | 'avg' | 'count' | 'min' | 'max';
  
  // Grouping
  groupBy?: Array<'date' | 'category' | 'subcategory' | 'item'>;
  
  // Comparison (optional)
  comparison?: {
    baselineTimeframe: {
      type: 'absolute' | 'relative';
      start?: string;
      end?: string;
      relative?: string;
    };
  };
  
  // Limits
  limit?: number;             // Max 100
  orderBy?: {
    field: string;
    direction: 'asc' | 'desc';
  };
}

interface QueryAnalyticsResult {
  rows: Array<Record<string, any>>;
  totalRows: number;
  executionTimeMs: number;
  queryUsed?: string;         // For debugging (redacted in prod)
}
```

**Tool Definition:**
```json
{
  "name": "query_analytics",
  "description": "Query sales and quantity data with flexible filtering, grouping, and comparison",
  "inputSchema": {
    "type": "object",
    "properties": {
      "metric": {
        "type": "string",
        "enum": ["net_sales", "quantity_sold"]
      },
      "timeframe": { "type": "object" },
      "filters": { "type": "object" },
      "aggregation": { "type": "string" },
      "groupBy": { "type": "array" },
      "comparison": { "type": "object" },
      "limit": { "type": "integer" },
      "orderBy": { "type": "object" }
    },
    "required": ["metric", "timeframe", "aggregation"]
  }
}
```

### 5.3 get_forecast Tool

```typescript
interface GetForecastParams {
  days?: number;              // Default: 7, max: 14
}

interface ForecastResult {
  forecasts: Array<{
    targetDate: string;       // ISO date
    predictedSales: number;
    confidenceLow: number;
    confidenceHigh: number;
    confidenceScore: number;  // 0-1
  }>;
}
```

### 5.4 get_anomalies Tool

```typescript
interface GetAnomaliesParams {
  days?: number;              // How many days back to check
}

interface AnomaliesResult {
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
```

---

## 6. BigQuery Stored Procedure Interface

### 6.1 Main Query Procedure

```sql
CREATE OR REPLACE PROCEDURE `restaurant_analytics.query_metrics`(
  -- What to measure
  metric_name STRING,
  
  -- Time range
  start_date DATE,
  end_date DATE,
  
  -- Filters (validated)
  primary_category STRING,
  subcategory STRING,
  item_name STRING,
  
  -- Aggregation
  agg_function STRING,
  
  -- Grouping
  group_by_fields ARRAY<STRING>,
  
  -- Comparison baseline (optional)
  baseline_start_date DATE,
  baseline_end_date DATE,
  
  -- Output control
  max_rows INT64,
  order_by_field STRING,
  order_direction STRING,
  
  -- Output table
  OUT result_table STRING
)
BEGIN
  -- 1. Validate inputs
  -- 2. Build dynamic SQL safely
  -- 3. Execute query
  -- 4. Return results in temp table
END;
```

**Validation Logic:**
```sql
-- Check category exists in data
IF primary_category IS NOT NULL 
   AND NOT EXISTS (
     SELECT 1 FROM metrics 
     WHERE primary_category = primary_category
   ) THEN
  RAISE USING MESSAGE = 'Invalid primary_category';
END IF;

-- Check enum values
IF agg_function NOT IN ('SUM', 'AVG', 'COUNT', 'MIN', 'MAX') THEN
  RAISE USING MESSAGE = 'Invalid aggregation function';
END IF;
```

---

## 7. Chart Builder Interface

```typescript
interface ChartSpec {
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

interface ChartBuilder {
  /**
   * Generate quickchart.io URL from spec.
   * Returns null if chart generation fails (for fallback).
   */
  generateChartUrl(spec: ChartSpec): Promise<string | null>;
  
  /**
   * Create Google Chat card with embedded chart.
   */
  createChartCard(
    chartUrl: string,
    title: string,
    subtitle?: string
  ): Card;
}
```

**quickchart.io URL Format:**
```
https://quickchart.io/chart?c={urlEncodedConfig}
```

**Example Config:**
```json
{
  "type": "bar",
  "data": {
    "labels": ["Beer", "Sushi", "Food"],
    "datasets": [{
      "label": "Sales",
      "data": [5000, 8000, 12000]
    }]
  }
}
```

---

## 8. Gmail Ingestion Interface

### 8.1 Ingestion Service

```typescript
interface IngestionService {
  /**
   * Main ingestion loop (called by Cloud Scheduler).
   */
  ingestNewReports(tenantId: string): Promise<IngestionResult>;
  
  /**
   * Backfill historical data (called by /setup).
   */
  backfillHistoricalReports(
    tenantId: string,
    startDate: Date,
    endDate: Date,
    progressCallback?: (progress: BackfillProgress) => void
  ): Promise<IngestionResult>;
}

interface IngestionResult {
  totalProcessed: number;
  successCount: number;
  failedCount: number;
  skippedCount: number;       // Already processed
  errors: Array<{
    messageId: string;
    filename: string;
    error: string;
  }>;
  durationMs: number;
}

interface BackfillProgress {
  totalEmails: number;
  processedEmails: number;
  currentDate?: string;
  percentComplete: number;
  estimatedMinutesRemaining: number;
}
```

### 8.2 Report Processor

```typescript
interface ReportProcessor {
  /**
   * Detect report type from email/filename.
   */
  detectReportType(
    subject: string,
    filename: string
  ): 'pmix' | 'labor' | 'unknown';
  
  /**
   * Process report (parse + load to BQ).
   */
  processReport(
    reportType: string,
    pdfBuffer: Buffer,
    metadata: ReportMetadata
  ): Promise<ProcessingResult>;
}

interface ReportMetadata {
  messageId: string;
  emailDate: Date;
  filename: string;
  tenantId: string;
}

interface ProcessingResult {
  success: boolean;
  reportDate?: Date;
  rowsInserted?: number;
  error?: string;
}
```

---

## 9. Configuration Schema

### 9.1 Environment Variables

```typescript
interface EnvironmentConfig {
  // GCP
  PROJECT_ID: string;                    // 'fdsanalytics'
  REGION: string;                        // 'us-central1'
  
  // BigQuery
  BQ_DATASET_ANALYTICS: string;          // 'restaurant_analytics'
  BQ_DATASET_INSIGHTS: string;           // 'insights'
  BQ_DATASET_CHAT_HISTORY: string;       // 'chat_history'
  
  // Secrets
  GEMINI_SECRET_NAME: string;            // 'GEMINI_API_KEY'
  GMAIL_OAUTH_SECRET_NAME: string;       // 'GMAIL_OAUTH_CREDENTIALS'
  
  // Gemini Models
  GEMINI_MODEL_FLASH: string;            // 'gemini-2.5-flash'
  GEMINI_MODEL_PRO: string;              // 'gemini-2.5-pro'
  
  // Application
  DEFAULT_TIMEZONE: string;              // 'America/Chicago'
  DEFAULT_CURRENCY: string;              // 'USD'
  LOG_LEVEL: 'debug' | 'info' | 'warn' | 'error';
  
  // Feature Flags
  ENABLE_CHARTS: boolean;                // true
  ENABLE_FORECASTS: boolean;             // true
  ENABLE_ANOMALY_DETECTION: boolean;     // true
  
  // Rate Limits
  MAX_CHART_DATAPOINTS: number;          // 20
  MAX_CONVERSATION_HISTORY: number;      // 10 messages
  MAX_QUERY_RESULTS: number;             // 100 rows
  
  // Ingestion
  INGESTION_SCHEDULE: string;            // '0 3 * * *' (3am daily)
  GMAIL_SEARCH_QUERY: string;            // 'from:spoton subject:pmix'
  BACKFILL_BATCH_SIZE: number;           // 10 reports at a time
}
```

### 9.2 Tenant Configuration

```typescript
interface TenantConfigRow {
  tenant_id: string;
  business_name: string;
  bq_project: string;
  bq_dataset: string;
  timezone: string;
  currency: string;
  created_at: Date;
  updated_at: Date;
  status: 'active' | 'suspended' | 'trial';
  
  // OAuth tokens (encrypted)
  gmail_refresh_token_encrypted: string;
  
  // Settings
  ingestion_enabled: boolean;
  forecast_enabled: boolean;
  anomaly_detection_enabled: boolean;
}
```

---

## 10. Error Response Standards

All errors follow this format:

```typescript
interface ErrorResponse {
  error: true;
  code: string;               // Machine-readable code
  message: string;            // User-friendly message
  details?: any;              // Optional debug info
  timestamp: string;          // ISO 8601
  requestId?: string;         // For tracing
}
```

**Error Codes:**

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `TENANT_NOT_FOUND` | 404 | User needs to run /setup |
| `INVALID_CATEGORY` | 400 | Category not in data |
| `INVALID_TIMEFRAME` | 400 | Invalid date range |
| `QUERY_TIMEOUT` | 504 | BQ query exceeded 30s |
| `RATE_LIMIT_EXCEEDED` | 429 | Too many requests |
| `GEMINI_API_ERROR` | 502 | Gemini API failed |
| `CHART_GENERATION_FAILED` | 500 | Chart service unavailable |
| `INTERNAL_ERROR` | 500 | Unexpected error |

**Example Error:**
```json
{
  "error": true,
  "code": "INVALID_CATEGORY",
  "message": "Category '(Beers)' not found. Did you mean '(Beer)'?",
  "details": {
    "providedCategory": "(Beers)",
    "availableCategories": ["(Beer)", "(Sushi)", "(Food)"]
  },
  "timestamp": "2025-10-22T10:30:00Z",
  "requestId": "req_abc123"
}
```

---

## 11. Logging Standards

All components use structured JSON logging:

```typescript
interface LogEntry {
  severity: 'DEBUG' | 'INFO' | 'WARNING' | 'ERROR' | 'CRITICAL';
  message: string;
  timestamp: string;          // ISO 8601
  component: string;          // 'response-engine', 'mcp-server', etc.
  tenantId?: string;
  userId?: string;
  requestId?: string;
  durationMs?: number;
  metadata?: Record<string, any>;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
}
```

**Example:**
```json
{
  "severity": "INFO",
  "message": "Query executed successfully",
  "timestamp": "2025-10-22T10:30:00Z",
  "component": "mcp-server",
  "tenantId": "senso-sushi",
  "userId": "user123",
  "requestId": "req_abc123",
  "durationMs": 245,
  "metadata": {
    "tool": "query_analytics",
    "rowsReturned": 15
  }
}
```

---

## 12. Google Chat Message Format

### 12.1 Text Response
```json
{
  "text": "**Today's sales:** $5,234 ↑ 12% vs yesterday\n\nTop categories:\n• Sushi: $2,100\n• Beer: $1,850",
  "thread": {
    "threadKey": "thread_abc123"
  }
}
```

### 12.2 Response with Chart
```json
{
  "text": "Here's this week's sales trend:",
  "cardsV2": [{
    "cardId": "chart_1",
    "card": {
      "sections": [{
        "widgets": [{
          "image": {
            "imageUrl": "https://quickchart.io/chart?c=...",
            "altText": "Sales trend chart"
          }
        }]
      }]
    }
  }],
  "thread": {
    "threadKey": "thread_abc123"
  }
}
```

---

**Document Version:** 1.0  
**Last Updated:** October 22, 2025  
**Dependencies:** 01-system-requirements.md
