# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Restaurant Analytics Chat Assistant for Google Chat**
A microservices-based system that provides natural language analytics for restaurant data via Google Chat, powered by Google Gemini AI.

- **Customer:** Senso Sushi (Frankfort) - Single tenant in V1
- **Platform:** Google Cloud Platform (project: `fdsanalytics`)
- **Region:** `us-central1`
- **Status:** V1.0 - Production-ready with multi-tenant design considerations

## Architecture

### Microservices Architecture

```
Google Chat → Response Engine → MCP Server → BigQuery
                     ↓              ↓
              Conversation    Stored Procedures
                Manager           (Security)
                     ↓
                BigQuery
               (chat_history)

Gmail API → Gmail Ingestion → BigQuery
                                (restaurant_analytics)
```

**Services:**
1. **Response Engine** (Cloud Run) - Orchestrates MCP, Conversation Manager, and Gemini Pro
2. **MCP Server** (Cloud Run) - Secure data access layer using Model Context Protocol
3. **Conversation Manager** (Cloud Run) - Context extraction and message history
4. **Gmail Ingestion** (Cloud Function) - PMIX PDF parsing from Gmail

**Security Design:** MCP protocol validates parameters → BigQuery stored procedures prevent SQL injection

## Common Development Commands

### Local Development

```bash
# Install all dependencies (monorepo with workspaces)
npm install

# Start all services locally with Docker Compose
docker-compose up

# Individual service development
cd services/response-engine
npm run dev

# Build all services
npm run build

# Run linter
npm run lint
```

### Testing

```bash
# Run all tests
npm test

# Unit tests only
npm run test:unit

# Integration tests only (requires GCP authentication)
npm run test:integration

# E2E tests (requires deployed services)
npm run test:e2e

# Test with coverage report
npm run test:coverage

# Watch mode for development
cd services/response-engine && npm run test:watch
```

**Test Structure:**
- 70% unit tests (fast, mocked)
- 25% integration tests (real BigQuery test dataset)
- 5% E2E tests (critical user flows)
- Target: 80%+ coverage overall, 90%+ for business logic

### Deployment

```bash
# Authenticate with GCP
gcloud auth login
gcloud auth application-default login
gcloud config set project fdsanalytics

# Deploy all services in correct order
./scripts/deploy/deploy-all.sh

# Deploy individual services
./scripts/deploy/deploy-response-engine.sh
./scripts/deploy/deploy-mcp-server.sh
./scripts/deploy/deploy-conversation-manager.sh
./scripts/deploy/deploy-gmail-ingestion.sh

# Deploy BigQuery stored procedures
./scripts/deploy/deploy-stored-procedures.sh

# Health check all services
./scripts/utilities/health-check-all.sh

# View logs for a service
gcloud run services logs read response-engine --region us-central1 --limit 50
```

## Critical Design Patterns

### 1. MCP Protocol for Security

**NEVER write raw SQL queries.** Always use MCP tools that call BigQuery stored procedures.

```typescript
// CORRECT: MCP tool validates parameters
await mcpClient.callTool('query_analytics', {
  metric: 'net_sales',
  filters: { primaryCategory: '(Beer)' },  // Validated!
  timeframe: { type: 'relative', relative: 'today' }
});

// WRONG: Direct SQL (vulnerable to injection)
const sql = `SELECT * FROM metrics WHERE category = '${userInput}'`;
```

**Why:** Stored procedures safely construct queries using FORMAT() with parameterized @variables.

### 2. MERGE Upserts for Idempotency

**ALWAYS use MERGE for reports and insights** to prevent duplicates during retries.

```sql
-- CORRECT: Idempotent upsert
MERGE `fdsanalytics.restaurant_analytics.reports` T
USING (SELECT @report_id as report_id, ...) S
ON T.report_id = S.report_id
WHEN MATCHED THEN UPDATE SET updated_at = CURRENT_TIMESTAMP()
WHEN NOT MATCHED THEN INSERT (...) VALUES (...);

-- WRONG: Creates duplicates on retry
INSERT INTO reports VALUES (...);
```

### 3. Date Handling in BigQuery

**ALWAYS cast dates explicitly:**

```sql
-- CORRECT
WHERE DATE(report_date) = DATE('2025-10-20')

-- WRONG (type mismatch error)
WHERE report_date = '2025-10-20'
```

### 4. Gemini Model Selection

**Available models (January 2025):**
- `gemini-2.5-flash-lite` - Fast, cheap for PDF extraction and intent classification
- `gemini-2.5-pro` - Expensive, powerful for complex analysis
- `gemini-2.0-flash` - For function calling

**NEVER use:**
- Models with date suffixes (e.g., `gemini-2.5-flash-lite-20250122`)
- Any 1.x models (deprecated)

### 5. Avoid Cartesian Products in BigQuery

**ALWAYS aggregate separately before joining:**

```sql
-- CORRECT: Pre-aggregate to avoid Cartesian product
WITH sales_by_category AS (
  SELECT category, SUM(CAST(metric_value AS FLOAT64)) as sales
  FROM metrics WHERE metric_name = 'net_sales'
  GROUP BY category
),
quantity_by_category AS (
  SELECT category, SUM(CAST(metric_value AS FLOAT64)) as qty
  FROM metrics WHERE metric_name = 'quantity_sold'
  GROUP BY category
)
SELECT s.category, s.sales, q.qty
FROM sales_by_category s
LEFT JOIN quantity_by_category q ON s.category = q.category;

-- WRONG: Cartesian product explosion
SELECT category,
  SUM(CASE WHEN metric_name = 'net_sales' THEN value END),
  SUM(CASE WHEN metric_name = 'quantity_sold' THEN value END)
FROM metrics
GROUP BY category;  -- Multiple rows per category!
```

## Service Architecture Details

### Response Engine (Port 3000)
- **Entry:** `services/response-engine/src/index.ts`
- **Role:** Main orchestrator, handles Google Chat webhooks
- **Dependencies:** MCP Server, Conversation Manager, Gemini Pro
- **Environment:** `MCP_SERVER_URL`, `CONVERSATION_MANAGER_URL`, `GEMINI_SECRET_NAME`

### MCP Server (Port 3001)
- **Entry:** `services/mcp-server/src/index.ts`
- **Role:** Secure data access via stored procedures
- **Tools:** `query_analytics`, `get_forecast`, `get_anomalies`
- **SQL:** `services/mcp-server/sql/stored-procedures/`
- **Important:** All parameters validated in `src/bigquery/Validator.ts`

### Conversation Manager (Port 3002)
- **Entry:** `services/conversation-manager/src/index.ts`
- **Role:** Extract context, summarize history (>10 messages)
- **Storage:** BigQuery `chat_history.conversations`
- **Gemini:** Uses `gemini-2.5-flash-lite` for summarization

### Gmail Ingestion (Port 3003)
- **Entry:** `services/gmail-ingestion/src/index.ts`
- **Role:** Parse PMIX PDFs from Gmail, load to BigQuery
- **Trigger:** Cloud Scheduler (daily 3am) or manual
- **Parser:** `src/parsers/PmixParser.ts` uses Gemini for extraction

## BigQuery Datasets

### restaurant_analytics
- `reports` - Daily PMIX report metadata (213 reports as of Oct 2025)
- `metrics` - Line-item sales data with category hierarchy

### insights
- `daily_comparisons` - Day-of-week trends with anomaly detection
- `category_trends` - Week-over-week performance
- `top_items` - Top 10 performers per category
- `daily_forecast` - 7-day predictions

### chat_history
- `conversations` - User messages and bot responses

### ingestion
- `ingestion_log` - Track processed emails/PDFs for idempotency

## Category Hierarchy (CRITICAL)

**Primary categories ALWAYS have parentheses:**
- `(Beer)`, `(Sushi)`, `(Food)`, `(Liquor)`, `(Wine)`, `(N/A Beverages)`

**Subcategories have NO parentheses:**
- `Bottle Beer`, `Draft Beer`, `Signature Rolls`, `Classic Rolls`, etc.

**Storage:**
- Primary category: `metrics.primary_category` column
- Subcategory: `metrics.dimensions.category` JSON field

## Shared Code

Located in `shared/` directory with workspace linking:

```typescript
// Import from shared package (use @fdsanalytics/shared alias)
import { Logger } from '@fdsanalytics/shared/utils';
import { AppError, UserInputError, TransientError } from '@fdsanalytics/shared/errors';
import { ChatMessageRequest } from '@fdsanalytics/shared/types';
```

**Key utilities:**
- `shared/utils/logger.ts` - Structured JSON logging for Cloud Logging
- `shared/errors/` - Standard error classes (AppError, UserInputError, TransientError)
- `shared/utils/currency.ts` - Format currency (handles "$1,234.56" strings from BQ)

## Environment Variables

### Development (.env.development)
```bash
PROJECT_ID=fdsanalytics
REGION=us-central1
ENVIRONMENT=development
GEMINI_SECRET_NAME=GEMINI_API_KEY
DEFAULT_TIMEZONE=America/Chicago
BQ_DATASET_ANALYTICS=restaurant_analytics
BQ_DATASET_INSIGHTS=insights
BQ_DATASET_CHAT_HISTORY=chat_history
BQ_DATASET_INGESTION=ingestion
```

### Service-Specific
- **Response Engine:** `MCP_SERVER_URL`, `CONVERSATION_MANAGER_URL`
- **Gmail Ingestion:** `GMAIL_OAUTH_SECRET_NAME`, `GMAIL_SEARCH_QUERY`

## Multi-Tenant Considerations

**V1 (Current):** Single tenant hardcoded in `services/response-engine/src/config/tenantConfig.ts`

**Future V2 Changes Required:**
1. Add `tenants` table in BigQuery `config` dataset
2. Implement dynamic tenant resolver (currently returns hardcoded config)
3. Add tenant_id to all queries and data models
4. Implement /setup flow to create tenant records

**Design principle:** All services accept `tenantId` parameter but currently use hardcoded "senso-sushi".

## Testing Notes

- **Fixtures:** Test PDFs in `test-data/pdfs/`
- **Mocks:** Mock data in `services/*/tests/fixtures/`
- **Test BQ Dataset:** Use `fdsanalytics-test` project for integration tests
- **Coverage:** Jest configs enforce 80-90% coverage thresholds
- **CI/CD:** GitHub Actions runs tests on push (see `.github/workflows/`)

## Deployment Dependencies

**Deploy in this order:**
1. BigQuery stored procedures (schema changes)
2. MCP Server (no dependencies)
3. Conversation Manager (no dependencies)
4. Response Engine (depends on MCP + Conversation Manager)
5. Gmail Ingestion (independent)

**Service-to-Service Auth:** Response Engine service account needs `roles/run.invoker` on MCP Server and Conversation Manager.

## Important Documentation

- **Complete specs:** See `docs/00-index.md` for document map
- **API contracts:** `docs/02-api-contracts.md`
- **Data models:** `docs/03-data-models.md`
- **Testing strategy:** `docs/06-testing-strategy.md`
- **Deployment guide:** `docs/07-deployment-architecture.md`
- **Project reference:** `docs/PROJECT_INFO.md` (quick command reference)

## Key Files to Understand

- `services/response-engine/src/core/ResponseEngine.ts` - Main orchestration logic
- `services/mcp-server/src/tools/queryAnalytics.tool.ts` - Primary data access tool
- `services/gmail-ingestion/src/parsers/PmixParser.ts` - PDF extraction with Gemini
- `shared/utils/logger.ts` - Structured logging pattern used everywhere
- `docker-compose.yml` - Local development environment setup
