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
  cards?: Card[];             // Google Chat cards (for charts - DEFERRED IN V1)
  threadId: string;           // Thread to reply in
  responseType: 'NEW_MESSAGE' | 'UPDATE_MESSAGE';
}

async function handleChatMessage(
  request: ChatMessageRequest
): Promise<ChatMessageResponse>
```

#### `handleSetupCommand()`
Initialize tenant and start backfill (**V2 feature - not implemented in V1**).

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

**Note:** V1 uses hardcoded single-tenant configuration. Multi-tenant setup will be implemented in V2.

#### `handleStatusCommand()`
Check backfill progress (**V2 feature - not implemented in V1**).

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
  bqDataset: string;          // e.g., "restaurant_analytics"
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
// Hardcoded single tenant in tenantConfig.ts
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

**File:** `services/response-engine/src/config/tenantConfig.ts`

---

## 3. Conversation Manager Interface

Manages chat history and provides context for queries (**V1: Disabled for performance**).

```typescript
interface ConversationContext {
  relevantMessages: Array<{
    role: 'user' | 'model';   // Note: 'model' NOT 'assistant' for Vertex AI
    content: string;
    timestamp: Date;
  }>;
  summary?: string;           // Optional condensed summary (future)
  entitiesExtracted?: {       // Optional entity tracking (future)
    categories?: string[];
    dateRanges?: string[];
    metrics?: string[];
  };
}

interface ConversationManager {
  /**
   * Get relevant context from chat history.
   * Uses Gemini 2.5 Flash Lite to summarize when history exceeds 10 messages.
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
    role: 'user' | 'model',
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
  role STRING NOT NULL,        -- 'user' or 'model' (Vertex AI terminology)
  content STRING NOT NULL,
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  tenant_id STRING NOT NULL
);
```

**V1 Status:** Context extraction is **disabled** for performance (saves 4-6 seconds per query). Empty context passed to ResponseGenerator.

**File:** `services/conversation-manager/src/core/ConversationManager.ts`

---

## 4. Response Generator Interface

Orchestrates Gemini function calling, BigQuery execution, and response formatting.

```typescript
interface ResponseGeneratorInput {
  userMessage: string;
  context: ConversationContext;     // Currently empty in V1
  tenantConfig: TenantConfig;
  currentDateTime: Date;
  availableCategories: string[];    // NOT USED - categories cached in AnalyticsToolHandler
}

interface ResponseGeneratorOutput {
  responseText: string;             // Natural language response
  charts: ChartSpec[];              // DEFERRED IN V1 - always empty array
  toolCallsMade: ToolCall[];        // For debugging/logging
}

interface ToolCall {
  toolName: string;                 // Intent function name
  parameters: Record<string, any>;  // Extracted parameters
  result: any;                      // BigQuery result
  durationMs: number;
}

interface ResponseGenerator {
  /**
   * Generate response using Gemini 2.5 Flash + intent-based function calling.
   *
   * IMPORTANT: Uses Vertex AI (NOT Google Generative AI SDK).
   * Uses hybrid stateless-then-stateful function calling approach.
   * Thinking mode enabled for better parameter extraction.
   */
  generate(
    input: ResponseGeneratorInput
  ): Promise<ResponseGeneratorOutput>;
}
```

### 4.1 Vertex AI Integration

**Key Points:**
- Uses `@google-cloud/vertexai` SDK (NOT `@google/generative-ai`)
- Authentication via Application Default Credentials (no API keys)
- Regional endpoint: `us-central1`
- Model: `gemini-2.5-flash` (NOT 2.5-pro or 2.0-flash)

**Client Initialization:**
```typescript
import { VertexAI } from '@google-cloud/vertexai';

const vertexAI = new VertexAI({
  project: projectId,
  location: 'us-central1'
});

const model = vertexAI.getGenerativeModel({
  model: 'gemini-2.5-flash'
});
```

### 4.2 Hybrid Stateless-Then-Stateful Function Calling

**Two-Phase Approach:**

**Phase 1: Force Function Call (mode: ANY)**
```typescript
const modelConfigWithAny = {
  model: 'gemini-2.5-flash',
  systemInstruction: { parts: [{ text: systemInstruction }] },
  generationConfig: {
    temperature: 1,
    topP: 0.95,
    thinkingConfig: {
      thinkingBudget: 1024,
      includeThoughts: true
    }
  },
  tools: [{ functionDeclarations: INTENT_FUNCTIONS }],
  toolConfig: {
    functionCallingConfig: {
      mode: 'ANY'  // Force function call on this turn only
    }
  }
};

const result1 = await modelForFirstCall.generateContent({
  contents: [...history, { role: 'user', parts: [{ text: userMessage }] }]
});
```

**Phase 2: Get Final Response (mode: AUTO)**
```typescript
// Execute function call from Phase 1
const functionResult = await analyticsToolHandler.execute(
  functionCall.name,
  functionCall.args
);

// Create NEW chat session with mode: AUTO (default)
const modelConfigForFinal = {
  model: 'gemini-2.5-flash',
  systemInstruction: { parts: [{ text: systemInstruction }] },
  generationConfig: { temperature: 1, topP: 0.95 },
  tools: [{ functionDeclarations: INTENT_FUNCTIONS }]
  // NO toolConfig = defaults to mode: AUTO
};

const chatForFinalResponse = modelForFinalResponse.startChat({
  history: [
    ...history,
    { role: 'user', parts: [{ text: userMessage }] },
    { role: 'model', parts: [functionCallParts] }
  ]
});

// Send function results to get natural language response
const result2 = await chatForFinalResponse.sendMessage(functionResponseParts);
```

**Why Hybrid?**
- **mode: ANY** guarantees function call execution (no "I can't help with that")
- **mode: AUTO** allows natural language response generation
- Maintains full conversation context across both phases

**File:** `services/response-engine/src/clients/GeminiClient.ts:469-746`

### 4.3 Thinking Mode

Gemini 2.5 Flash supports thinking mode for improved function calling accuracy.

**Configuration:**
```typescript
generationConfig: {
  temperature: 1,
  topP: 0.95,
  thinkingConfig: {
    thinkingBudget: 1024,      // Max tokens for thinking
    includeThoughts: true       // Return thinking in response
  }
}
```

**Extracting Thinking vs Answer:**
```typescript
for (const part of candidates[0].content.parts) {
  if (part.thought) {
    // Internal reasoning (log for debugging)
    thinkingSummaries.push(part.text);
  } else if (part.text) {
    // Final answer (for users)
    answerParts.push(part.text);
  }
}
```

**File:** `services/response-engine/src/clients/GeminiClient.ts:754-781`

**See:** `docs/09-gemini-integration.md` for full details

---

## 5. Intent Functions Interface

The Response Engine uses **8 specific intent functions** (NOT a monolithic query_analytics tool).

**All Functions:**

| Function | Purpose | Cache Strategy |
|----------|---------|----------------|
| show_daily_sales | Daily sales breakdown | Hybrid (insights → query_metrics) |
| show_top_items | Top N best-selling items | Hybrid (insights → query_metrics) |
| show_category_breakdown | Sales by category | Hybrid (insights → query_metrics) |
| get_total_sales | Total sales for period | Direct (query_metrics) |
| find_peak_day | Highest or lowest day | Direct (query_metrics) |
| compare_day_types | Weekday vs weekend | Direct (query_metrics) |
| track_item_performance | Specific item over time | Direct (query_metrics) |
| compare_periods | Compare two time periods | Direct (query_metrics) |

### 5.1 Function Declaration Format

**Example: compare_periods**

```typescript
{
  name: 'compare_periods',
  description: 'Compare sales between two separate time periods (months, weeks, or custom date ranges) for overall sales, categories, or specific items. Use for queries like "compare May and June", "May vs June", "this month vs last month", "Q1 vs Q2", "salmon roll sales May vs June"',
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      startDate1: {
        type: SchemaType.STRING,
        description: 'Start date of first period in YYYY-MM-DD format'
      },
      endDate1: {
        type: SchemaType.STRING,
        description: 'End date of first period in YYYY-MM-DD format'
      },
      startDate2: {
        type: SchemaType.STRING,
        description: 'Start date of second period in YYYY-MM-DD format'
      },
      endDate2: {
        type: SchemaType.STRING,
        description: 'End date of second period in YYYY-MM-DD format'
      },
      category: {
        type: SchemaType.STRING,
        description: 'Optional category filter. Examples: Sushi, Beer, Food, Bottle Beer, Signature Rolls'
      },
      itemName: {
        type: SchemaType.STRING,
        description: 'Optional specific item name to compare. Examples: "Salmon Roll", "Spicy Tuna", "Edamame". Use when comparing a specific item across periods.'
      }
    },
    required: ['startDate1', 'endDate1', 'startDate2', 'endDate2']
  }
}
```

**File:** `services/response-engine/src/tools/intentFunctions.ts`

### 5.2 AnalyticsToolHandler Interface

Executes intent functions by calling BigQuery stored procedures.

```typescript
interface ToolResult {
  rows: any[];
  totalRows: number;
  executionTimeMs: number;
}

interface AnalyticsToolHandler {
  /**
   * Execute an intent function.
   * Routes to appropriate BigQuery stored procedure.
   * Implements hybrid caching (insights fast path vs query_metrics slow path).
   */
  execute(
    functionName: string,
    args: Record<string, any>
  ): Promise<ToolResult>;

  /**
   * Get latest available date in dataset (cached).
   */
  getLatestAvailableDate(): Promise<string | null>;

  /**
   * Get first available date in dataset (cached).
   */
  getFirstAvailableDate(): Promise<string | null>;
}
```

**File:** `services/response-engine/src/tools/AnalyticsToolHandler.ts`

### 5.3 Hybrid Cache Implementation

**Fast Path (insights dataset):**
- Pre-computed daily summaries, top items, category trends
- Checks coverage via `sp_check_insights_coverage` stored procedure
- Used when `isFullyCovered === true`
- Typical latency: 1-2 seconds

**Slow Path (query_metrics):**
- Raw metrics aggregation on-the-fly
- Used when date range not fully cached
- Typical latency: 4-8 seconds

**Coverage Check:**
```typescript
const coverage = await this.checkInsightsCoverage(startDate, endDate);

if (coverage.isFullyCovered) {
  // FAST PATH: Use insights cache
  return this.callStoredProcedure(
    'sp_get_daily_summary',
    { start_date, end_date, customer_id, primary_category, subcategory },
    'insights'
  );
}

// SLOW PATH: Fall back to raw metrics
return this.callStoredProcedure('query_metrics', { ... });
```

**See:** `docs/10-intent-functions.md` for full details on all 8 functions

---

## 6. BigQuery Stored Procedure Interface

### 6.1 Main Query Procedure

**Procedure:** `restaurant_analytics.query_metrics`

```sql
CREATE OR REPLACE PROCEDURE `restaurant_analytics.query_metrics`(
  -- What to measure
  metric_name STRING,              -- 'net_sales', 'quantity_sold'

  -- Time range
  start_date STRING,               -- YYYY-MM-DD
  end_date STRING,                 -- YYYY-MM-DD

  -- Filters (nullable)
  primary_category STRING,         -- '(Beer)', '(Sushi)', NULL
  subcategory STRING,              -- 'Bottle Beer', 'Signature Rolls', NULL
  item_name STRING,                -- 'Salmon Roll', NULL

  -- Aggregation
  aggregation STRING,              -- 'SUM', 'AVG', 'COUNT'

  -- Grouping (nullable)
  group_by_fields STRING,          -- 'date', 'item', 'category', NULL

  -- Comparison baseline (nullable)
  baseline_start_date STRING,      -- YYYY-MM-DD or NULL
  baseline_end_date STRING,        -- YYYY-MM-DD or NULL

  -- Output control
  max_rows INT64,                  -- Max results to return
  order_by_field STRING,           -- 'metric_value', 'date'
  order_direction STRING,          -- 'ASC', 'DESC'

  -- Output table (temp table name)
  OUT result_table STRING
)
BEGIN
  -- 1. Validate inputs
  -- 2. Build dynamic SQL safely using FORMAT() with @variables
  -- 3. Execute query
  -- 4. Return results in temp table
END;
```

**Validation:**
- Enum values validated (aggregation, order_direction)
- SQL injection prevented via parameterized FORMAT()
- Null values handled correctly

**File:** `sql/stored-procedures/query_metrics.sql`

### 6.2 Insights Stored Procedures

**Location:** `insights` dataset in BigQuery

| Stored Procedure | Purpose | Used By |
|-----------------|---------|---------|
| sp_get_daily_summary | Daily sales with trends | show_daily_sales |
| sp_get_top_items_from_insights | Top items per category | show_top_items |
| sp_get_category_trends | Week-over-week category trends | show_category_breakdown |
| sp_check_insights_coverage | Check cache availability | All hybrid functions |

**Example Call:**
```typescript
const callStatement = `
  DECLARE result_table STRING;
  CALL \`${projectId}.insights.sp_get_daily_summary\`(
    @start_date,
    @end_date,
    @customer_id,
    @primary_category,
    @subcategory,
    result_table
  );
  EXECUTE IMMEDIATE FORMAT('SELECT * FROM %s', result_table);
`;

const [rows] = await bqClient.query({
  query: callStatement,
  params: {
    start_date: '2025-07-01',
    end_date: '2025-07-31',
    customer_id: 'senso-sushi',
    primary_category: null,
    subcategory: null
  },
  types: {
    primary_category: 'STRING',  // Explicit type for null
    subcategory: 'STRING'
  },
  location: 'us-central1',
  jobTimeoutMs: 30000
});
```

**File:** `services/response-engine/src/tools/AnalyticsToolHandler.ts:825-867`

---

## 7. Chart Builder Interface

**V1 Status:** Chart generation is **deferred**. Always returns empty array.

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
   * V1: Always returns null (deferred).
   */
  generateChartUrl(spec: ChartSpec): Promise<string | null>;

  /**
   * Create Google Chat card with embedded chart.
   * V1: Not used.
   */
  createChartCard(
    chartUrl: string,
    title: string,
    subtitle?: string
  ): Card;
}
```

**Deferred Reason:** Adds 2-3 seconds to response time. Text-only responses prioritized for V1.

**Future V2 Implementation:**
- quickchart.io for chart generation
- Google Chat cards for embedding
- User preference toggle (text vs charts)

---

## 8. Gmail Ingestion Interface

### 8.1 Ingestion Service

```typescript
interface IngestionService {
  /**
   * Main ingestion loop (called by Cloud Scheduler daily at 3am).
   */
  ingestNewReports(tenantId: string): Promise<IngestionResult>;

  /**
   * Backfill historical data (V2 feature - called by /setup).
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
  skippedCount: number;       // Already processed (idempotent)
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
   * V1: Only 'pmix' supported. 'labor' not implemented.
   */
  detectReportType(
    subject: string,
    filename: string
  ): 'pmix' | 'labor' | 'unknown';

  /**
   * Process report (parse PDF with Gemini + load to BQ).
   * Uses Gemini 2.5 Flash Lite for PDF extraction.
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

**Idempotency:** Uses `ingestion.ingestion_log` table to track processed message IDs. MERGE upserts prevent duplicates.

**File:** `services/gmail-ingestion/src/parsers/PmixParser.ts`

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
  BQ_DATASET_INGESTION: string;          // 'ingestion'

  // Vertex AI (NO API KEYS)
  // Uses Application Default Credentials automatically
  // No GEMINI_SECRET_NAME needed

  // Gemini Models (Vertex AI versions)
  GEMINI_MODEL_FLASH: string;            // 'gemini-2.5-flash' (CURRENT)
  GEMINI_MODEL_FLASH_LITE: string;       // 'gemini-2.5-flash-lite' (for PDF parsing)

  // Application
  DEFAULT_TIMEZONE: string;              // 'America/Chicago'
  DEFAULT_CURRENCY: string;              // 'USD'
  LOG_LEVEL: 'debug' | 'info' | 'warn' | 'error';

  // Feature Flags
  ENABLE_CHARTS: boolean;                // false (deferred in V1)
  ENABLE_CONVERSATION_CONTEXT: boolean;  // false (disabled in V1 for performance)

  // Rate Limits
  MAX_CHART_DATAPOINTS: number;          // 20 (future)
  MAX_CONVERSATION_HISTORY: number;      // 10 messages (future)
  MAX_QUERY_RESULTS: number;             // 100 rows

  // Ingestion
  INGESTION_SCHEDULE: string;            // '0 3 * * *' (3am daily CT)
  GMAIL_SEARCH_QUERY: string;            // 'from:spoton subject:pmix'
  GMAIL_OAUTH_SECRET_NAME: string;       // 'GMAIL_OAUTH_CREDENTIALS'
  BACKFILL_BATCH_SIZE: number;           // 10 reports at a time (future)
}
```

**Key Changes from Documentation:**
- ❌ **REMOVED:** `GEMINI_SECRET_NAME` (Vertex AI uses ADC, no API keys)
- ✅ **ADDED:** `BQ_DATASET_INGESTION`
- ✅ **ADDED:** `GEMINI_MODEL_FLASH_LITE`
- ✅ **UPDATED:** Feature flags reflect V1 status (charts and context disabled)

### 9.2 Tenant Configuration

**V1:** Hardcoded in `tenantConfig.ts`

**V2:** Will use BigQuery table:

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
  insights_generation_enabled: boolean;  // Daily 3am insights job
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

**Error Classes:**

```typescript
// User Input Errors (400 errors)
class UserInputError extends Error {
  code: UserInputErrorCodes;
  userMessage: string;
  details?: any;
  suggestions?: string[];
}

// Transient Errors (500 errors, retryable)
class TransientError extends Error {
  code: TransientErrorCodes;
  retryAfterMs?: number;
  details?: any;
}
```

**Error Codes:**

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `TENANT_NOT_FOUND` | 404 | User needs to run /setup (V2) |
| `INVALID_CATEGORY` | 400 | Category not in data |
| `INVALID_DATE_RANGE` | 400 | Invalid date format or range |
| `PARAM_OUT_OF_RANGE` | 400 | Parameter value out of bounds |
| `MISSING_REQUIRED_PARAM` | 400 | Required parameter missing |
| `NO_DATA_FOUND` | 404 | Query returned no results |
| `NETWORK_TIMEOUT` | 504 | BQ query exceeded timeout |
| `RATE_LIMIT_EXCEEDED` | 429 | Too many requests |
| `SERVICE_UNAVAILABLE` | 503 | BigQuery or Vertex AI unavailable |
| `INTERNAL_ERROR` | 500 | Unexpected error |

**Example Error:**
```json
{
  "error": true,
  "code": "INVALID_CATEGORY",
  "message": "Category '(Beers)' not found. Did you mean '(Beer)'?",
  "details": {
    "providedCategory": "(Beers)",
    "availableCategories": ["(Beer)", "(Sushi)", "(Food)", "(Wine)", "(Liquor)", "(N/A Beverages)"]
  },
  "suggestions": [
    "Check category spelling (e.g., '(Beer)', '(Sushi)')",
    "Primary categories always have parentheses",
    "Subcategories have no parentheses (e.g., 'Bottle Beer')"
  ],
  "timestamp": "2025-10-30T10:30:00Z",
  "requestId": "req_abc123"
}
```

**File:** `shared/errors/`

---

## 11. Logging Standards

All components use structured JSON logging for Cloud Logging:

```typescript
interface LogEntry {
  severity: 'DEBUG' | 'INFO' | 'WARNING' | 'ERROR' | 'CRITICAL';
  message: string;
  timestamp: string;          // ISO 8601
  component: string;          // 'response-engine', 'conversation-manager', 'gmail-ingestion'
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

**Gemini-Specific Logging:**

```typescript
// Function call logging
console.log(JSON.stringify({
  severity: 'DEBUG',
  message: 'Intent function called',
  function: 'compare_periods',
  parameters: {
    startDate1: '2025-05-01',
    endDate1: '2025-05-31',
    startDate2: '2025-06-01',
    endDate2: '2025-06-30'
  }
}));

// Thinking mode logging
console.log(JSON.stringify({
  severity: 'DEBUG',
  message: 'Gemini thinking summary captured',
  thinkingCount: 2,
  thinkingPreview: 'The user wants to compare...',
  thoughtsTokenCount: 512
}));

// Hybrid cache logging
console.log(JSON.stringify({
  severity: 'INFO',
  message: 'Using FAST PATH (insights cache) for show_daily_sales',
  startDate: '2025-07-01',
  endDate: '2025-07-31',
  coveragePercent: 100
}));
```

**Example:**
```json
{
  "severity": "INFO",
  "message": "Intent function executed successfully",
  "timestamp": "2025-10-30T10:30:00Z",
  "component": "response-engine",
  "tenantId": "senso-sushi",
  "userId": "user123",
  "requestId": "req_abc123",
  "durationMs": 1245,
  "metadata": {
    "function": "show_top_items",
    "rowCount": 10,
    "cachePath": "insights.sp_get_top_items_from_insights"
  }
}
```

**File:** `shared/utils/logger.ts`

---

## 12. Google Chat Message Format

### 12.1 Text Response (V1 Standard)
```json
{
  "text": "**Total sales for July 2025:** $160,334.82\n\n**Top 5 items:**\n1. Salmon Roll: $8,250\n2. Spicy Tuna: $7,100\n3. California Roll: $6,500\n4. Edamame: $5,200\n5. Miso Soup: $4,800",
  "thread": {
    "threadKey": "thread_abc123"
  }
}
```

### 12.2 Response with Chart (V2 Future)
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

**V1 Status:** Only text responses. Chart cards deferred.

---

## 13. Date Parsing Interface

Custom date parser for relative date handling.

```typescript
interface DateParser {
  /**
   * Parse relative dates like "last month", "this week", "yesterday".
   * Returns [startDate, endDate] in YYYY-MM-DD format.
   *
   * Uses tenant timezone for calculations.
   */
  parseRelativeDate(
    relativeDate: string,
    timezone: string,
    referenceDate?: Date
  ): [string, string];

  /**
   * Parse absolute dates in various formats.
   */
  parseAbsoluteDate(
    dateString: string
  ): string;  // YYYY-MM-DD
}
```

**Example:**
```typescript
const parser = new DateParser();

// "last month" on 2025-10-30 in America/Chicago
const [start, end] = parser.parseRelativeDate('last month', 'America/Chicago', new Date('2025-10-30'));
// Returns: ['2025-09-01', '2025-09-30']

// "this week" on 2025-10-30 (Thursday)
const [start, end] = parser.parseRelativeDate('this week', 'America/Chicago', new Date('2025-10-30'));
// Returns: ['2025-10-27', '2025-11-02'] (Sunday to Saturday)
```

**File:** `shared/utils/dateParser.ts`

**Note:** V1 relies on Gemini to parse dates. Custom parser used for system instruction date ranges only.

---

## 14. API Versioning

**V1.0 (Current):**
- Single-tenant hardcoded configuration
- 8 intent functions
- Vertex AI Gemini 2.5 Flash
- Hybrid cache system
- Charts deferred
- Conversation context disabled

**V2.0 (Planned):**
- Multi-tenant support with /setup command
- Per-tenant OAuth credentials
- Chart generation with user preferences
- Conversation context re-enabled
- Backfill command for historical data
- Additional intent functions (forecasts, anomalies)

**Breaking Changes in V2:**
- Tenant resolver will require database lookup
- New tenant configuration table schema
- OAuth flow for Gmail credentials

---

**Document Version:** 1.0
**Last Updated:** October 30, 2025
**Dependencies:**
- 01-system-requirements.md
- 09-gemini-integration.md
- 10-intent-functions.md
