# Error Handling Strategy
## Senso Restaurant Analytics - Version 1.0

**Purpose:** Define error types, retry logic, fallback behaviors, and user-facing messages.

---

## 1. Error Classification

### 1.1 Error Categories

| Category | Severity | User Impact | Retry? | Example |
|----------|----------|-------------|---------|---------|
| User Input | Low | User can fix | No | Invalid category name |
| Transient | Medium | Temporary | Yes | Network timeout |
| Service Degradation | Medium | Partial failure | Depends | Chart generation failed |
| Configuration | High | Service broken | No | Missing secret |
| Data Integrity | High | Incorrect results | No | Duplicate records |
| System | Critical | Service down | No | Out of memory |

---

## 2. Error Codes & Types

### 2.1 User Input Errors (4xx)

```typescript
enum UserInputError {
  INVALID_CATEGORY = 'INVALID_CATEGORY',
  INVALID_TIMEFRAME = 'INVALID_TIMEFRAME',
  INVALID_DATE_RANGE = 'INVALID_DATE_RANGE',
  AMBIGUOUS_QUERY = 'AMBIGUOUS_QUERY',
  MISSING_REQUIRED_PARAM = 'MISSING_REQUIRED_PARAM',
  PARAM_OUT_OF_RANGE = 'PARAM_OUT_OF_RANGE'
}
```

**Handling:**
- ❌ Do not retry
- ✅ Return helpful error message
- ✅ Suggest corrections if possible
- ✅ Log at INFO level (not ERROR)

**Example:**
```json
{
  "error": true,
  "code": "INVALID_CATEGORY",
  "message": "Category '(Beers)' not found. Did you mean '(Beer)'?",
  "suggestions": ["(Beer)", "(Wine)", "(Liquor)"],
  "userMessage": "I couldn't find that category. Try one of these:\n• (Beer)\n• (Wine)\n• (Liquor)"
}
```

### 2.2 Transient Errors (5xx - Retryable)

```typescript
enum TransientError {
  NETWORK_TIMEOUT = 'NETWORK_TIMEOUT',
  SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE',
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
  BQ_STREAMING_BUFFER = 'BQ_STREAMING_BUFFER',
  VERTEX_AI_QUOTA_EXCEEDED = 'VERTEX_AI_QUOTA_EXCEEDED',
  VERTEX_AI_RATE_LIMIT = 'VERTEX_AI_RATE_LIMIT'
}
```

**Handling:**
- ✅ Retry with exponential backoff
- ✅ Max 3 retries
- ✅ Log at WARN level (first attempt), ERROR level (after retries exhausted)
- ✅ Return generic user message

**Example:**
```json
{
  "error": true,
  "code": "SERVICE_UNAVAILABLE",
  "message": "BigQuery temporarily unavailable (attempt 2/3)",
  "retryAfterMs": 4000,
  "userMessage": "I'm having trouble reaching the database. Let me try again in a moment..."
}
```

### 2.3 Service Degradation Errors (Partial Failure)

```typescript
enum DegradationError {
  CHART_GENERATION_FAILED = 'CHART_GENERATION_FAILED',
  FORECAST_UNAVAILABLE = 'FORECAST_UNAVAILABLE',
  ANOMALY_DETECTION_SKIPPED = 'ANOMALY_DETECTION_SKIPPED',
  CONVERSATION_HISTORY_UNAVAILABLE = 'CONVERSATION_HISTORY_UNAVAILABLE'
}
```

**Handling:**
- ✅ Graceful degradation - return partial result
- ❌ Do not retry (feature-specific)
- ✅ Log at WARN level
- ✅ Mention limitation in response

**Example:**
```json
{
  "success": true,
  "data": { "sales": 5234 },
  "warnings": [{
    "code": "CHART_GENERATION_FAILED",
    "message": "Chart service unavailable - text-only response"
  }],
  "userMessage": "Today's sales: $5,234 ↑ 12%\n\n_(Chart unavailable)_"
}
```

### 2.4 Configuration Errors (Fatal)

```typescript
enum ConfigurationError {
  MISSING_ENV_VAR = 'MISSING_ENV_VAR',
  SECRET_NOT_FOUND = 'SECRET_NOT_FOUND',
  INVALID_SERVICE_ACCOUNT = 'INVALID_SERVICE_ACCOUNT',
  BQ_DATASET_NOT_FOUND = 'BQ_DATASET_NOT_FOUND',
  OAUTH_NOT_CONFIGURED = 'OAUTH_NOT_CONFIGURED'
}
```

**Handling:**
- ❌ Do not retry
- ❌ Service should fail to start (startup validation)
- ✅ Log at CRITICAL level
- ✅ Alert ops team immediately

**Example:**
```json
{
  "error": true,
  "code": "SECRET_NOT_FOUND",
  "message": "GEMINI_API_KEY not found in Secret Manager",
  "fatal": true,
  "userMessage": "Service temporarily unavailable. Support has been notified."
}
```

### 2.5 Data Integrity Errors

```typescript
enum DataIntegrityError {
  DUPLICATE_REPORT = 'DUPLICATE_REPORT',
  INVALID_METRIC_VALUE = 'INVALID_METRIC_VALUE',
  MISSING_REQUIRED_DATA = 'MISSING_REQUIRED_DATA',
  DATA_VALIDATION_FAILED = 'DATA_VALIDATION_FAILED'
}
```

**Handling:**
- ❌ Do not retry
- ✅ Log at ERROR level with full context
- ✅ Alert if threshold exceeded (e.g., >5 failures/hour)
- ✅ Continue processing other data

**Example:**
```json
{
  "error": true,
  "code": "DUPLICATE_REPORT",
  "message": "Report 2025-10-22 already exists",
  "action": "skipped",
  "userMessage": null  // Don't show to end user
}
```

---

## 3. Retry Logic

### 3.1 Exponential Backoff

```typescript
interface RetryConfig {
  maxRetries: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
  jitterMs: number;
}

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  initialDelayMs: 1000,
  maxDelayMs: 30000,
  backoffMultiplier: 2,
  jitterMs: 500
};

async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  config: RetryConfig = DEFAULT_RETRY_CONFIG
): Promise<T> {
  let lastError: Error;
  let delay = config.initialDelayMs;
  
  for (let attempt = 1; attempt <= config.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      
      // Don't retry on user input errors
      if (error.code?.startsWith('INVALID_')) {
        throw error;
      }
      
      // Last attempt - throw error
      if (attempt === config.maxRetries) {
        break;
      }
      
      // Calculate delay with jitter
      const jitter = Math.random() * config.jitterMs;
      const currentDelay = Math.min(delay + jitter, config.maxDelayMs);
      
      console.warn(`Retry attempt ${attempt}/${config.maxRetries} after ${currentDelay}ms`, {
        error: error.message,
        code: error.code
      });
      
      await sleep(currentDelay);
      delay *= config.backoffMultiplier;
    }
  }
  
  throw lastError;
}
```

### 3.2 Retry Decision Matrix

| Error Type | Retry? | Max Attempts | Initial Delay | Max Delay |
|------------|--------|--------------|---------------|-----------|
| BQ timeout | ✅ Yes | 3 | 1s | 10s |
| Vertex AI rate limit | ✅ Yes | 5 | 10s | 30s |
| Vertex AI quota | ✅ Yes | 3 | 10s | 30s |
| Chart generation | ❌ No | 1 | - | - |
| Network timeout | ✅ Yes | 3 | 1s | 10s |
| Invalid input | ❌ No | 1 | - | - |
| Gmail API quota | ✅ Yes | 3 | 5s | 30s |

---

## 4. Fallback Strategies

### 4.1 Chart Generation Fallback

```typescript
async function generateResponseWithChart(data: any, chartSpec: ChartSpec): Promise<Response> {
  let chartUrl: string | null = null;
  
  try {
    // Attempt chart generation
    chartUrl = await chartBuilder.generate(chartSpec);
  } catch (error) {
    console.warn('Chart generation failed, falling back to text', {
      error: error.message,
      spec: chartSpec
    });
    // Continue without chart
  }
  
  // Always return response (with or without chart)
  return {
    text: formatTextResponse(data),
    chartUrl: chartUrl,  // null if failed
    degraded: chartUrl === null
  };
}
```

### 4.2 Forecast Fallback

```typescript
async function getForecasts(): Promise<ForecastResult> {
  try {
    // Try pre-computed forecasts
    return await bq.query('SELECT * FROM insights.daily_forecast WHERE ...');
  } catch (error) {
    console.warn('Forecast query failed, using simple average', { error });
    
    // Fallback: simple 4-week average
    const historicalAvg = await bq.query('SELECT AVG(sales) FROM ...');
    return {
      forecasts: generateSimpleForecasts(historicalAvg),
      confidence: 'low',
      method: 'fallback_average'
    };
  }
}
```

### 4.3 Conversation History Fallback

```typescript
async function getConversationContext(threadId: string): Promise<ConversationContext> {
  try {
    // Try to load history
    return await conversationManager.getContext(threadId);
  } catch (error) {
    console.warn('Could not load conversation history, proceeding without context', { error });
    
    // Fallback: no context
    return {
      relevantMessages: [],
      summary: null,
      degraded: true
    };
  }
}
```

---

## 5. User-Facing Messages

### 5.1 Message Templates

```typescript
const ERROR_MESSAGES = {
  // User input errors
  INVALID_CATEGORY: (providedCategory: string, suggestions: string[]) => 
    `I couldn't find the category "${providedCategory}". Did you mean one of these?\n${suggestions.map(s => `• ${s}`).join('\n')}`,
  
  INVALID_TIMEFRAME: (provided: string) =>
    `I don't understand "${provided}". Try "today", "this week", "this month", or a specific date.`,
  
  AMBIGUOUS_QUERY: (reason: string, options?: string[]) =>
    `I need a bit more info: ${reason}${options ? `\n\nOptions:\n${options.map(o => `• ${o}`).join('\n')}` : ''}`,
  
  // Service errors
  SERVICE_UNAVAILABLE: () =>
    `I'm having trouble accessing the data right now. Please try again in a moment.`,
  
  QUERY_TIMEOUT: () =>
    `That query is taking longer than expected. Try narrowing the date range or category.`,
  
  RATE_LIMIT: () =>
    `Whoa, slow down! 😅 Too many requests. Give me a few seconds and try again.`,
  
  // Degraded service
  CHARTS_UNAVAILABLE: () =>
    `_(Chart temporarily unavailable - showing text results instead)_`,
  
  // Generic fallback
  UNKNOWN_ERROR: () =>
    `Something went wrong on my end. I've logged the issue. Please try again or contact support.`
};
```

### 5.2 Message Tone Guidelines

**Do:**
- ✅ Be friendly and conversational
- ✅ Acknowledge the issue clearly
- ✅ Provide specific next steps
- ✅ Use emojis sparingly for tone (1-2 max)

**Don't:**
- ❌ Show stack traces or technical details
- ❌ Blame the user ("You entered...")
- ❌ Use jargon ("HTTP 503", "BigQuery quota")
- ❌ Be overly apologetic ("So sorry!")

**Examples:**

**Bad:**
```
Error: BigQuery streaming buffer delay (code: BQ_STREAMING_BUFFER_001)
Please wait 90 minutes and retry your query.
```

**Good:**
```
That data is still processing and should be ready in about an hour.
I can check another date range if you'd like?
```

---

## 6. Logging Standards

### 6.1 Error Log Format

```typescript
interface ErrorLog {
  severity: 'ERROR' | 'WARN' | 'INFO';
  timestamp: string;
  component: string;
  errorCode: string;
  message: string;
  
  // Context
  tenantId?: string;
  userId?: string;
  requestId?: string;
  
  // Error details
  error: {
    name: string;
    message: string;
    stack?: string;
    cause?: any;
  };
  
  // Additional context
  metadata?: {
    query?: string;
    params?: any;
    attempt?: number;
    maxAttempts?: number;
    durationMs?: number;
  };
}
```

**Example:**
```json
{
  "severity": "ERROR",
  "timestamp": "2025-10-22T10:30:00.123Z",
  "component": "response-engine",
  "errorCode": "BQ_TIMEOUT",
  "message": "BigQuery query timed out after 30s",
  "tenantId": "senso-sushi",
  "userId": "user@sensosushi.com",
  "requestId": "req_abc123",
  "error": {
    "name": "TimeoutError",
    "message": "Query exceeded 30000ms timeout",
    "stack": "..."
  },
  "metadata": {
    "query": "SELECT SUM(...) FROM ...",
    "attempt": 3,
    "maxAttempts": 3,
    "durationMs": 30142
  }
}
```

### 6.2 Log Levels by Error Category

| Error Category | First Attempt | After Retry | Failed |
|----------------|---------------|-------------|--------|
| User Input | INFO | - | - |
| Transient | WARN | WARN | ERROR |
| Service Degradation | WARN | - | - |
| Configuration | CRITICAL | - | - |
| Data Integrity | ERROR | - | - |

---

## 7. Error Recovery Procedures

### 7.1 Gmail Ingestion Failures

**Scenario:** PDF parsing fails

```typescript
try {
  const parsed = await parser.parse(pdfBuffer);
  await bq.upsertReport(parsed);
  
  await logIngestion({
    status: 'success',
    messageId,
    reportDate: parsed.reportDate
  });
} catch (error) {
  // Log failure
  await logIngestion({
    status: 'failed',
    messageId,
    error: error.message,
    retryCount: 0
  });
  
  // Don't throw - continue with other PDFs
  console.error('PDF parsing failed, will retry later', {
    messageId,
    filename,
    error
  });
}
```

**Recovery:**
- Separate Cloud Function: `gmail-ingestion-retry`
- Runs hourly
- Queries `ingestion_log WHERE status='failed' AND retryCount < 3`
- Re-attempts parsing with exponential backoff

### 7.2 BigQuery Query Failures

**Scenario:** Query times out

```typescript
try {
  const result = await retryWithBackoff(async () => {
    return await bq.query({
      query: sqlQuery,
      timeoutMs: 30000
    });
  }, {
    maxRetries: 3,
    initialDelayMs: 2000
  });
  
  return result;
} catch (error) {
  if (error.code === 'QUERY_TIMEOUT') {
    // Return helpful message
    return {
      error: true,
      code: 'QUERY_TIMEOUT',
      userMessage: ERROR_MESSAGES.QUERY_TIMEOUT()
    };
  }
  throw error;
}
```

### 7.3 Vertex AI Gemini Failures

**Scenario:** Rate limit or quota exceeded

```typescript
try {
  return await geminiClient.generateWithFunctionCalling(input, executeFunction);
} catch (error) {
  if (error.message?.includes('quota') || error.message?.includes('rate limit')) {
    console.warn('Vertex AI rate limit hit, waiting and retrying...');
    // Wait and retry with longer delay
    await sleep(10000);
    return await geminiClient.generateWithFunctionCalling(input, executeFunction);
  }
  throw new Error(`Vertex AI error: ${error.message}`);
}
```

**Common Vertex AI Errors:**
- Rate limit exceeded - Retry after 10 seconds
- Quota exceeded - Retry with exponential backoff
- Invalid model name - Configuration error, fail fast
- ADC credentials missing - Configuration error, fail fast

---

## 8. Circuit Breaker Pattern

### 8.1 Circuit Breaker Implementation

```typescript
class CircuitBreaker {
  private failureCount = 0;
  private lastFailureTime: number | null = null;
  private state: 'CLOSED' | 'OPEN' | 'HALF_OPEN' = 'CLOSED';
  
  constructor(
    private threshold: number = 5,       // Open after 5 failures
    private resetTimeoutMs: number = 60000  // Try again after 1 minute
  ) {}
  
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === 'OPEN') {
      // Check if enough time has passed to try again
      if (Date.now() - this.lastFailureTime! > this.resetTimeoutMs) {
        this.state = 'HALF_OPEN';
      } else {
        throw new Error('CIRCUIT_BREAKER_OPEN');
      }
    }
    
    try {
      const result = await fn();
      
      // Success - reset
      if (this.state === 'HALF_OPEN') {
        this.state = 'CLOSED';
        this.failureCount = 0;
      }
      
      return result;
    } catch (error) {
      this.failureCount++;
      this.lastFailureTime = Date.now();
      
      if (this.failureCount >= this.threshold) {
        this.state = 'OPEN';
        console.error('Circuit breaker opened', {
          failureCount: this.failureCount,
          threshold: this.threshold
        });
      }
      
      throw error;
    }
  }
}

// Usage
const chartServiceBreaker = new CircuitBreaker(5, 60000);

async function generateChart(spec: ChartSpec): Promise<string | null> {
  try {
    return await chartServiceBreaker.execute(() => 
      quickchartClient.generate(spec)
    );
  } catch (error) {
    if (error.message === 'CIRCUIT_BREAKER_OPEN') {
      console.warn('Chart service circuit breaker open - skipping chart generation');
      return null;  // Graceful degradation
    }
    throw error;
  }
}
```

### 8.2 Circuit Breaker Use Cases

- **Chart generation** - Fails fast after 5 consecutive failures
- **Vertex AI Gemini API** - Opens circuit if quota consistently exceeded
- **Gmail API** - Opens circuit during extended outages

---

## 9. Monitoring & Alerting

### 9.1 Error Rate Alerts

```yaml
# Alert if error rate > 5% in 5 minutes
alert: HighErrorRate
expr: |
  (
    sum(rate(http_requests_total{status=~"5.."}[5m]))
    /
    sum(rate(http_requests_total[5m]))
  ) > 0.05
labels:
  severity: warning
annotations:
  summary: "High error rate detected"
  description: "Error rate is {{ $value | humanizePercentage }}"
```

### 9.2 Key Metrics to Track

| Metric | Threshold | Alert |
|--------|-----------|-------|
| Error rate | > 5% | Warning |
| Error rate | > 10% | Critical |
| P95 latency | > 10s | Warning |
| Failed ingestions | > 3/hour | Warning |
| Circuit breaker opens | Any | Warning |
| Configuration errors | Any | Critical |

---

## 10. Error Handling Checklist

### 10.1 Development Checklist

- [ ] Wrap all external calls in try-catch
- [ ] Use specific error codes (not generic "ERROR")
- [ ] Implement retry logic for transient failures
- [ ] Add fallback for non-critical features
- [ ] Log errors with full context
- [ ] Return user-friendly messages
- [ ] Test error scenarios (unit tests)
- [ ] Document error codes in API contracts

### 10.2 Deployment Checklist

- [ ] Configure error rate alerts
- [ ] Set up log-based metrics
- [ ] Test circuit breakers under load
- [ ] Verify fallbacks work in production
- [ ] Review error logs daily (first week)
- [ ] Tune retry thresholds based on real data

---

**Document Version:** 1.0  
**Last Updated:** October 22, 2025  
**Dependencies:** 01-system-requirements.md, 02-api-contracts.md
