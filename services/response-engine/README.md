# Response Engine

Main orchestration service that integrates MCP Server, Conversation Manager, Gemini Pro, and Google Chat.

## Overview

The Response Engine is the central hub of the Senso Restaurant Analytics system. It:

- Receives Google Chat messages via webhook
- Resolves tenant configuration (hardcoded senso-sushi in V1)
- Retrieves conversation context from Conversation Manager
- Uses Gemini Pro to determine which MCP tools to call
- Executes MCP tools (query_analytics, get_forecast, get_anomalies)
- Generates natural language responses with Gemini Pro
- Creates charts using quickchart.io
- Formats responses for Google Chat (text + cards)

## Architecture

```
Google Chat Webhook
       ↓
Response Engine
       ↓
   ┌───┴───┬────────────┬──────────┐
   │       │            │          │
   ↓       ↓            ↓          ↓
Gemini  MCP Server  Conversation  Chart
 Pro                Manager       Builder
```

## Key Features

### Orchestration
- Coordinates all services
- Handles errors gracefully with fallbacks
- Implements retry logic with exponential backoff
- Circuit breaker for chart generation (after 5 failures)

### Function Calling
- Uses Gemini Pro function calling to determine which MCP tools to execute
- Sends tool results back to Gemini for natural language generation
- Supports all MCP tools: query_analytics, get_forecast, get_anomalies

### Chart Generation
- Generates bar, line, and pie charts using quickchart.io
- Automatic color assignment
- Falls back to text-only on failure (graceful degradation)
- Circuit breaker prevents repeated failures

### Conversation Context
- Retrieves recent conversation history
- Uses context to improve response quality
- Falls back to empty context on failure

## API Endpoints

### POST /webhook
Google Chat webhook handler. Accepts Google Chat message format.

**Request Body:**
```json
{
  "type": "MESSAGE",
  "message": {
    "name": "spaces/.../messages/...",
    "text": "What were sales today?",
    "thread": { "name": "spaces/.../threads/..." },
    "sender": { "name": "users/...", "displayName": "..." }
  },
  "space": { "name": "spaces/...", "type": "ROOM" }
}
```

**Response:**
```json
{
  "text": "Today's sales were $5,234 ↑ 12% vs yesterday",
  "cardsV2": [
    {
      "cardId": "card_0",
      "card": {
        "header": { "title": "Sales by Category" },
        "sections": [
          {
            "widgets": [
              {
                "image": {
                  "imageUrl": "https://quickchart.io/chart?c=...",
                  "altText": "Sales by Category"
                }
              }
            ]
          }
        ]
      }
    }
  ],
  "thread": { "threadKey": "spaces/.../threads/..." }
}
```

### GET /health
Health check endpoint.

**Response:**
```json
{
  "status": "healthy",
  "service": "response-engine",
  "version": "1.0.0",
  "timestamp": "2025-10-22T10:30:00.000Z"
}
```

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `PROJECT_ID` | Yes | `fdsanalytics` | GCP project ID |
| `REGION` | No | `us-central1` | GCP region |
| `ENVIRONMENT` | No | `development` | Environment name |
| `PORT` | No | `8080` | HTTP server port |
| `GEMINI_SECRET_NAME` | Yes | `GEMINI_API_KEY` | Secret Manager secret name |
| `MCP_SERVER_URL` | Yes | - | MCP Server URL |
| `CONVERSATION_MANAGER_URL` | Yes | - | Conversation Manager URL |
| `ENABLE_CHARTS` | No | `true` | Enable chart generation |
| `ENABLE_FORECASTS` | No | `true` | Enable forecast queries |
| `MAX_CHART_DATAPOINTS` | No | `20` | Max data points for charts |
| `MAX_CONVERSATION_HISTORY` | No | `10` | Max messages to retrieve |
| `GEMINI_MODEL_PRO` | No | `gemini-2.5-pro` | Gemini Pro model name |

## Development

### Install dependencies
```bash
npm install
```

### Run tests
```bash
npm test
npm run test:coverage
```

### Run locally
```bash
# Set environment variables
export PROJECT_ID=fdsanalytics
export MCP_SERVER_URL=http://localhost:3001
export CONVERSATION_MANAGER_URL=http://localhost:3002
export GEMINI_SECRET_NAME=GEMINI_API_KEY

# Start server
npm run dev
```

### Build
```bash
npm run build
```

## Deployment

### Build Docker image
```bash
docker build -t response-engine .
```

### Deploy to Cloud Run
```bash
gcloud run deploy response-engine \
  --source . \
  --region us-central1 \
  --platform managed \
  --service-account response-engine@fdsanalytics.iam.gserviceaccount.com \
  --memory 512Mi \
  --cpu 1 \
  --timeout 60s \
  --min-instances 0 \
  --max-instances 10 \
  --concurrency 10 \
  --ingress all \
  --allow-unauthenticated \
  --set-env-vars PROJECT_ID=fdsanalytics,ENVIRONMENT=production \
  --set-secrets GEMINI_API_KEY=GEMINI_API_KEY:latest
```

## Error Handling

### Fallback Strategies

1. **Chart Generation Fails** → Return text-only response
2. **MCP Server Fails** → Retry 3x with exponential backoff, then return error
3. **Conversation Manager Fails** → Proceed without context
4. **Gemini Pro Fails** → Retry with backoff, return friendly error

### Circuit Breaker

Chart generation implements a circuit breaker:
- Opens after 5 consecutive failures
- Remains open for 1 minute
- Automatically resets after timeout

## Testing

### Unit Tests
```bash
npm test
```

**Coverage Threshold:** 90% (branches, functions, lines, statements)

**Test Files:**
- `__tests__/unit/TenantResolver.test.ts`
- `__tests__/unit/MCPClient.test.ts`
- `__tests__/unit/ConversationClient.test.ts`
- `__tests__/unit/ChartBuilder.test.ts`
- `__tests__/unit/ResponseFormatter.test.ts`
- `__tests__/unit/ResponseEngine.test.ts`

### Integration Tests
```bash
npm run test:integration
```

### Manual Testing
```bash
# Test health check
curl http://localhost:8080/health

# Test webhook (requires full stack running)
curl -X POST http://localhost:8080/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "message": {
      "text": "What were sales today?",
      "name": "spaces/test/messages/test",
      "sender": { "name": "users/test" }
    },
    "space": { "name": "spaces/test" }
  }'
```

## Success Criteria

- [x] Handles natural language queries correctly
- [x] Calls MCP tools appropriately
- [x] Generates conversational responses with Gemini Pro
- [x] Creates charts when appropriate
- [x] Formats for Google Chat (text + cards)
- [x] Errors are user-friendly (no stack traces)
- [x] Service runs with health check
- [x] Unit tests pass with mocked services
- [x] TypeScript compiles with zero errors
- [x] Fallbacks work for all external dependencies
- [x] Response time target: <5s (p95)

## Performance

**Target Response Time:** <5 seconds (p95)

**Optimization Strategies:**
- Parallel service calls where possible
- Circuit breaker for failing services
- Retry with exponential backoff (limited to 3 attempts)
- Chart generation timeout after 5 failures
- Connection pooling for HTTP clients

## Monitoring

**Key Metrics:**
- Request rate (requests/sec)
- Error rate (%)
- P50/P95/P99 latency
- Chart generation success rate
- MCP tool call duration
- Gemini API call duration

**Logs:**
All logs are structured JSON for Cloud Logging:
```json
{
  "severity": "INFO",
  "message": "Response generated successfully",
  "userId": "user123",
  "tenantId": "senso-sushi",
  "durationMs": 2450,
  "toolCallsCount": 1,
  "chartGenerated": true
}
```

## Future Enhancements

- Multi-tenant support (query config.customers table)
- /setup command implementation
- /status command with real backfill tracking
- Proactive insights (push notifications)
- Voice interface support
- A/B testing for response formats
