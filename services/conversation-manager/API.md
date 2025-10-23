# Conversation Manager API Documentation

**Version:** 1.0.0
**Base URL:** `http://localhost:8080` (development) or Cloud Run URL (production)

---

## Authentication

Currently, the service allows unauthenticated requests. In production, consider adding:
- API key authentication
- Service-to-service authentication via IAM
- Request signature validation

---

## Endpoints

### 1. Health Check

Check if the service and its dependencies are healthy.

**Endpoint:** `GET /health`

**Parameters:** None

**Success Response (200):**
```json
{
  "status": "healthy",
  "service": "conversation-manager",
  "timestamp": "2025-10-22T14:30:00.123Z",
  "dependencies": {
    "bigquery": "healthy",
    "gemini": "healthy"
  }
}
```

**Unhealthy Response (503):**
```json
{
  "status": "unhealthy",
  "service": "conversation-manager",
  "timestamp": "2025-10-22T14:30:00.123Z",
  "dependencies": {
    "bigquery": "unhealthy",
    "gemini": "healthy"
  }
}
```

**Example:**
```bash
curl http://localhost:8080/health
```

---

### 2. Get Conversation Context

Retrieve conversation context including message history and AI-generated summary.

**Endpoint:** `POST /get-context`

**Content-Type:** `application/json`

**Request Body:**
```typescript
{
  userId: string;          // Required - User's unique identifier
  threadId: string;        // Required - Conversation thread ID
  currentMessage: string;  // Required - Current user message
  maxMessages?: number;    // Optional - Max messages to retrieve (default: 10)
}
```

**Success Response (200):**
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
    "summary": "User has been asking about beer sales this week. Previously discussed category trends.",
    "entitiesExtracted": {
      "categories": ["(Beer)"],
      "dateRanges": ["this week", "last week"],
      "metrics": ["sales"]
    }
  },
  "metadata": {
    "messageCount": 2,
    "durationMs": 245,
    "timestamp": "2025-10-22T14:05:00.000Z"
  }
}
```

**Empty Conversation Response (200):**
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

**Error Response (400):**
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

**Error Response (500):**
```json
{
  "error": true,
  "code": "INTERNAL_ERROR",
  "message": "Failed to retrieve conversation context",
  "details": "BigQuery connection timeout",
  "metadata": {
    "durationMs": 30000,
    "timestamp": "2025-10-22T14:05:00.000Z"
  }
}
```

**Example:**
```bash
curl -X POST http://localhost:8080/get-context \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "user@sensosushi.com",
    "threadId": "thread_abc123",
    "currentMessage": "What about wine sales?",
    "maxMessages": 10
  }'
```

**Response Time:** Target < 2000ms (including Gemini summarization)

---

### 3. Store Message

Store a user or assistant message in the conversation history.

**Endpoint:** `POST /store-message`

**Content-Type:** `application/json`

**Request Body:**
```typescript
{
  userId: string;           // Required - User's unique identifier
  threadId: string;         // Required - Conversation thread ID
  role: 'user' | 'assistant'; // Required - Message role
  content: string;          // Required - Message content
  workspaceId?: string;     // Optional - Google Workspace ID
  messageId?: string;       // Optional - Google Chat message ID
  contextSummary?: string;  // Optional - Context used for this message
  toolCalls?: object;       // Optional - Tools called (for assistant messages)
}
```

**Success Response (200):**
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

**Error Response (400) - Missing Fields:**
```json
{
  "error": true,
  "code": "INVALID_REQUEST",
  "message": "Missing required fields: userId, threadId, role, content",
  "metadata": {
    "durationMs": 5,
    "timestamp": "2025-10-22T14:05:00.000Z"
  }
}
```

**Error Response (400) - Invalid Role:**
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

**Error Response (500):**
```json
{
  "error": true,
  "code": "INTERNAL_ERROR",
  "message": "Failed to store message",
  "details": "BigQuery insert failed after 3 retries",
  "metadata": {
    "durationMs": 8500,
    "timestamp": "2025-10-22T14:05:00.000Z"
  }
}
```

**Example - Store User Message:**
```bash
curl -X POST http://localhost:8080/store-message \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "user@sensosushi.com",
    "threadId": "thread_abc123",
    "role": "user",
    "content": "What about wine sales?",
    "workspaceId": "workspace_xyz",
    "messageId": "msg_12345"
  }'
```

**Example - Store Assistant Message:**
```bash
curl -X POST http://localhost:8080/store-message \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "user@sensosushi.com",
    "threadId": "thread_abc123",
    "role": "assistant",
    "content": "Wine sales this week are $3,456, up 8% from last week.",
    "contextSummary": "User asking about beverage categories",
    "toolCalls": {
      "tool": "query_analytics",
      "params": {
        "metric": "net_sales",
        "filters": { "primaryCategory": "(Wine)" }
      }
    }
  }'
```

**Response Time:** Target < 500ms

---

## Error Codes

| Code | HTTP Status | Description | Retry? |
|------|-------------|-------------|--------|
| `INVALID_REQUEST` | 400 | Missing required fields | No |
| `INVALID_ROLE` | 400 | Role is not 'user' or 'assistant' | No |
| `INTERNAL_ERROR` | 500 | Unexpected server error | Yes, with backoff |

---

## Rate Limiting

Currently, no rate limiting is enforced. Consider implementing:
- Per-user rate limits: 100 requests/minute
- Per-thread rate limits: 50 requests/minute
- Global rate limits: 1000 requests/minute

---

## Data Model

### ConversationMessage

```typescript
interface ConversationMessage {
  conversationId: string;     // Format: {tenantId}-{threadId}-{timestamp}
  tenantId: string;           // Default: 'senso-sushi'
  userId: string;             // User identifier
  threadId: string;           // Conversation thread
  workspaceId?: string;       // Google Workspace ID
  role: 'user' | 'assistant'; // Message role
  content: string;            // Message text
  timestamp: Date;            // Message timestamp
  messageId?: string;         // External message ID
  contextSummary?: string;    // Context used
  toolCalls?: object;         // Tools called
  expirationTimestamp?: Date; // TTL (90 days)
}
```

### ConversationContext

```typescript
interface ConversationContext {
  relevantMessages: Array<{
    role: 'user' | 'assistant';
    content: string;
    timestamp: Date;
  }>;
  summary?: string;           // AI-generated summary
  entitiesExtracted?: {
    categories?: string[];    // e.g., ["(Beer)", "(Sushi)"]
    dateRanges?: string[];    // e.g., ["this week", "last month"]
    metrics?: string[];       // e.g., ["sales", "revenue"]
  };
}
```

---

## Integration Examples

### JavaScript/TypeScript

```typescript
import axios from 'axios';

const API_BASE_URL = 'http://localhost:8080';

// Get conversation context
async function getContext(userId: string, threadId: string, currentMessage: string) {
  const response = await axios.post(`${API_BASE_URL}/get-context`, {
    userId,
    threadId,
    currentMessage,
    maxMessages: 10,
  });
  return response.data.context;
}

// Store message
async function storeMessage(
  userId: string,
  threadId: string,
  role: 'user' | 'assistant',
  content: string
) {
  await axios.post(`${API_BASE_URL}/store-message`, {
    userId,
    threadId,
    role,
    content,
  });
}

// Usage
const context = await getContext('user@example.com', 'thread123', 'Show me sales');
await storeMessage('user@example.com', 'thread123', 'user', 'Show me sales');
```

### Python

```python
import requests

API_BASE_URL = 'http://localhost:8080'

def get_context(user_id: str, thread_id: str, current_message: str):
    response = requests.post(f'{API_BASE_URL}/get-context', json={
        'userId': user_id,
        'threadId': thread_id,
        'currentMessage': current_message,
        'maxMessages': 10
    })
    return response.json()['context']

def store_message(user_id: str, thread_id: str, role: str, content: str):
    requests.post(f'{API_BASE_URL}/store-message', json={
        'userId': user_id,
        'threadId': thread_id,
        'role': role,
        'content': content
    })

# Usage
context = get_context('user@example.com', 'thread123', 'Show me sales')
store_message('user@example.com', 'thread123', 'user', 'Show me sales')
```

---

## Best Practices

### 1. Thread Management

- Use consistent `threadId` for related messages
- Create new threads for unrelated conversations
- Include `workspaceId` for multi-tenant scenarios

### 2. Error Handling

- Always check for `error: true` in responses
- Implement retry logic for `INTERNAL_ERROR` (500 status)
- Don't retry `INVALID_REQUEST` or `INVALID_ROLE` errors

### 3. Performance Optimization

- Keep `maxMessages` at 10 or below for best performance
- Store messages asynchronously (fire-and-forget)
- Cache context for frequently accessed threads

### 4. Message Content

- Keep messages concise (< 1000 characters recommended)
- Don't include PII in message content if possible
- Use `contextSummary` to help track conversation flow

---

## Changelog

### Version 1.0.0 (2025-10-22)

- Initial release
- Endpoints: `/health`, `/get-context`, `/store-message`
- Gemini Flash integration for summarization
- BigQuery storage with 90-day TTL
- Entity extraction (categories, dates, metrics)
- Retry logic for transient failures
- Graceful degradation on Gemini failures

---

## Support

For issues or questions, contact the development team or create an issue in the repository.

**Last Updated:** October 22, 2025
