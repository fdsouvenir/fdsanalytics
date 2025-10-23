# Conversation Manager Service

> Handles chat history storage, context extraction, and conversation summarization using Gemini Flash

**Version:** 1.0.0
**Status:** Production Ready
**Port:** 8080

---

## Overview

The Conversation Manager service is responsible for:

1. **Message Storage** - Persisting user and assistant messages in BigQuery
2. **Context Extraction** - Retrieving the last 10 messages from a conversation thread
3. **Conversation Summarization** - Using Gemini Flash to generate concise summaries
4. **Entity Extraction** - Identifying categories, date ranges, and metrics from conversation history

---

## Features

- **Thread-based Grouping** - Messages organized by thread_id
- **Automatic Summarization** - Gemini Flash generates contextual summaries
- **Graceful Degradation** - Fallback mechanisms if Gemini fails
- **Retry Logic** - Automatic retries for transient BigQuery errors
- **Entity Extraction** - Identifies categories, timeframes, and metrics
- **TTL Management** - Auto-expiration after 90 days
- **Health Checks** - Monitors BigQuery and Gemini connectivity

---

## API Endpoints

### 1. Health Check

**Endpoint:** `GET /health`

**Response:**
```json
{
  "status": "healthy",
  "service": "conversation-manager",
  "timestamp": "2025-10-22T14:30:00.000Z",
  "dependencies": {
    "bigquery": "healthy",
    "gemini": "healthy"
  }
}
```

---

### 2. Get Conversation Context

**Endpoint:** `POST /get-context`

**Request Body:**
```json
{
  "userId": "user@sensosushi.com",
  "threadId": "thread_abc123",
  "currentMessage": "What about wine sales?",
  "maxMessages": 10
}
```

**Response:**
```json
{
  "success": true,
  "context": {
    "relevantMessages": [
      {
        "role": "user",
        "content": "How are beer sales this week?",
        "timestamp": "2025-10-22T14:00:00.000Z"
      },
      {
        "role": "assistant",
        "content": "Beer sales this week are $5,234, up 12% from last week.",
        "timestamp": "2025-10-22T14:01:00.000Z"
      }
    ],
    "summary": "User has been asking about beer sales this week. Previously discussed category trends and performance metrics.",
    "entitiesExtracted": {
      "categories": ["(Beer)", "(Sushi)"],
      "dateRanges": ["this week", "last week"],
      "metrics": ["sales", "trends"]
    }
  },
  "metadata": {
    "messageCount": 2,
    "durationMs": 245,
    "timestamp": "2025-10-22T14:05:00.000Z"
  }
}
```

**Empty Conversation Response:**
```json
{
  "success": true,
  "context": {
    "relevantMessages": [],
    "summary": "New conversation - no previous context available.",
    "entitiesExtracted": {
      "categories": [],
      "dateRanges": [],
      "metrics": []
    }
  },
  "metadata": {
    "messageCount": 0,
    "durationMs": 50,
    "timestamp": "2025-10-22T14:05:00.000Z"
  }
}
```

**Error Response:**
```json
{
  "error": true,
  "code": "INVALID_REQUEST",
  "message": "Missing required fields: userId, threadId, currentMessage",
  "metadata": {
    "durationMs": 5,
    "timestamp": "2025-10-22T14:05:00.000Z"
  }
}
```

---

### 3. Store Message

**Endpoint:** `POST /store-message`

**Request Body:**
```json
{
  "userId": "user@sensosushi.com",
  "threadId": "thread_abc123",
  "role": "user",
  "content": "What about wine sales?",
  "workspaceId": "workspace_xyz",
  "messageId": "msg_12345",
  "contextSummary": "User discussing beverage categories",
  "toolCalls": {
    "tool": "query_analytics",
    "params": { "metric": "net_sales" }
  }
}
```

**Response:**
```json
{
  "success": true,
  "message": "Message stored successfully",
  "metadata": {
    "durationMs": 123,
    "timestamp": "2025-10-22T14:05:00.000Z"
  }
}
```

**Error Response:**
```json
{
  "error": true,
  "code": "INVALID_ROLE",
  "message": "Role must be either \"user\" or \"assistant\"",
  "metadata": {
    "durationMs": 5,
    "timestamp": "2025-10-22T14:05:00.000Z"
  }
}
```

---

## Architecture

### Components

```
ConversationManager (Orchestrator)
├── BigQueryStorage (Message Persistence)
│   ├── storeMessage() - Insert with retry logic
│   └── getContext() - Retrieve last N messages
│
├── ContextSummarizer (Summarization)
│   ├── summarize() - Generate context summary
│   └── extractEntities() - Identify categories/dates/metrics
│
└── GeminiClient (Gemini API)
    ├── initialize() - Load API key from Secret Manager
    └── summarize() - Call Gemini Flash for summarization
```

### Data Flow

1. **Store Message:**
   ```
   HTTP Request → ConversationManager → BigQueryStorage → BigQuery
   ```

2. **Get Context:**
   ```
   HTTP Request → ConversationManager → BigQueryStorage → BigQuery
                                      ↓
                              ContextSummarizer → GeminiClient → Gemini API
                                      ↓
                              HTTP Response (with summary)
   ```

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PROJECT_ID` | `fdsanalytics` | GCP Project ID |
| `BQ_DATASET_CHAT_HISTORY` | `chat_history` | BigQuery dataset for conversations |
| `GEMINI_MODEL_FLASH` | `gemini-2.5-flash` | Gemini model for summarization |
| `GEMINI_SECRET_NAME` | `GEMINI_API_KEY` | Secret Manager secret name |
| `DEFAULT_TENANT_ID` | `senso-sushi` | Default tenant ID |
| `MAX_CONVERSATION_HISTORY` | `10` | Max messages to retrieve |
| `PORT` | `8080` | HTTP server port |
| `NODE_ENV` | `development` | Environment (development/production/test) |

---

## BigQuery Schema

**Table:** `fdsanalytics.chat_history.conversations`

```sql
CREATE TABLE `fdsanalytics.chat_history.conversations` (
  conversation_id STRING NOT NULL,
  tenant_id STRING NOT NULL,
  user_id STRING NOT NULL,
  thread_id STRING NOT NULL,
  workspace_id STRING,
  role STRING NOT NULL,                 -- 'user' or 'assistant'
  content STRING NOT NULL,
  timestamp TIMESTAMP NOT NULL,
  message_id STRING,
  context_summary STRING,
  tool_calls JSON,
  expiration_timestamp TIMESTAMP,

  PRIMARY KEY (conversation_id) NOT ENFORCED
)
PARTITION BY DATE(timestamp)
CLUSTER BY tenant_id, thread_id;
```

**TTL Policy:** 90 days (automatic partition expiration)

---

## Development

### Install Dependencies

```bash
npm install
```

### Run Development Server

```bash
npm run dev
```

### Build

```bash
npm run build
```

### Run Production Server

```bash
npm start
```

---

## Testing

### Run All Tests

```bash
npm test
```

### Run Tests in Watch Mode

```bash
npm run test:watch
```

### Generate Coverage Report

```bash
npm run test:coverage
```

**Coverage Thresholds:**
- Branches: 90%
- Functions: 90%
- Lines: 90%
- Statements: 90%

---

## Error Handling

### Retry Logic

- **BigQuery Insert:** 3 retries with exponential backoff (1s, 2s, 4s)
- **Gemini Summarization:** Fallback to simple concatenation on failure

### Graceful Degradation

- **Storage Failure:** Returns empty context instead of crashing
- **Gemini Failure:** Uses fallback summarization (simple text extraction)
- **Health Check Failure:** Reports specific component failures

### Error Codes

| Code | Description | HTTP Status |
|------|-------------|-------------|
| `INVALID_REQUEST` | Missing required fields | 400 |
| `INVALID_ROLE` | Role is not 'user' or 'assistant' | 400 |
| `INTERNAL_ERROR` | Unexpected server error | 500 |

---

## Performance

### Response Time Targets

- **GET /health:** < 100ms
- **POST /get-context:** < 2000ms (including Gemini call)
- **POST /store-message:** < 500ms

### Optimization Strategies

1. **Lazy Initialization** - Gemini client initialized on first request
2. **Connection Pooling** - BigQuery client reused across requests
3. **Query Limits** - Default max 10 messages (configurable)
4. **Caching** - Consider implementing Redis cache for frequent threads

---

## Monitoring

### Key Metrics to Track

- Request latency (p50, p95, p99)
- Error rate
- BigQuery query time
- Gemini API response time
- Storage retry rate

### Health Check Monitoring

```bash
# Check service health
curl http://localhost:8080/health

# Expected healthy response
{
  "status": "healthy",
  "dependencies": {
    "bigquery": "healthy",
    "gemini": "healthy"
  }
}
```

---

## Deployment

### Docker Build

```bash
docker build -t conversation-manager:latest .
```

### Cloud Run Deployment

```bash
gcloud run deploy conversation-manager \
  --source . \
  --region us-central1 \
  --platform managed \
  --allow-unauthenticated \
  --set-env-vars PROJECT_ID=fdsanalytics
```

---

## Troubleshooting

### Issue: Gemini API Key Not Found

**Symptoms:** Service fails to initialize, error: "Failed to retrieve Gemini API key"

**Solution:**
1. Verify secret exists: `gcloud secrets list`
2. Check IAM permissions: Service account needs `secretmanager.secretAccessor` role
3. Verify secret name matches `GEMINI_SECRET_NAME` env var

### Issue: BigQuery Table Not Found

**Symptoms:** Health check fails, error: "Table chat_history.conversations does not exist"

**Solution:**
1. Create table using schema from docs/03-data-models.md
2. Verify project ID and dataset name in environment variables
3. Check service account has `bigquery.dataEditor` role

### Issue: High Latency on /get-context

**Symptoms:** Response times > 5 seconds

**Solution:**
1. Check Gemini API response time (should be < 2s)
2. Verify BigQuery query is using partition/cluster filters
3. Reduce `maxMessages` parameter if needed
4. Consider implementing caching for frequently accessed threads

---

## Contributing

### Code Style

- Follow TypeScript strict mode guidelines
- Use ESLint for linting: `npm run lint`
- All functions must have JSDoc comments
- Prefer async/await over callbacks

### Adding New Features

1. Create feature branch from `main`
2. Write tests first (TDD approach)
3. Implement feature
4. Ensure coverage stays > 90%
5. Update README.md with new functionality
6. Submit pull request

---

## License

UNLICENSED - Proprietary to Senso Restaurant Analytics

---

## Support

For questions or issues, contact the development team.

**Last Updated:** October 22, 2025
**Service Version:** 1.0.0
