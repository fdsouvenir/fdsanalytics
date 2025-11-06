# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Restaurant Analytics Tool Server for Vertex AI Agent Builder**
A stateless, multi-tenant Tool Server that exposes 8 analytics intent functions via a secure API for Vertex AI Agent Builder to consume.

- **Customer:** Senso Sushi (Frankfort) - Single tenant in V2.0, multi-tenant ready
- **Platform:** Google Cloud Platform (project: `fdsanalytics`)
- **Region:** `us-central1`
- **Status:** V2.0 - Tool Server Architecture (refactored October 2025)

## Architecture

### Tool Server Architecture

```
Google Workspace Addon → Vertex AI Agent Builder → Tool Server (/execute-tool)
                             (The "Brain")              ↓
                                                  IAM Authentication
                                                        ↓
                                              AnalyticsToolHandler
                                                        ↓
                                           BigQuery Stored Procedures
                                                        ↓
                                              restaurant_analytics
                                                   insights

Gmail API → Gmail Ingestion → BigQuery (restaurant_analytics)
```

**Services:**
1. **Response Engine (Tool Server)** (Cloud Run) - Stateless API exposing 8 intent functions via /execute-tool endpoint
2. **Gmail Ingestion** (Cloud Function) - PMIX PDF parsing from Gmail

**What Vertex AI Agent Handles:**
- Conversation history and session management
- Natural Language Understanding (NLU) to map user text to tools
- Natural Language Generation (NLG) to create user-facing responses
- Multi-turn context resolution

**What Tool Server Handles:**
- Executing analytics queries via 8 intent functions
- Multi-tenant data isolation via TenantConfigService
- Secure parameter validation and BigQuery stored procedure calls
- Chart URL generation for data visualization

**Security Design:**
- IAM authentication via service account tokens
- Vertex AI Agent service account allowed to invoke Tool Server
- AnalyticsToolHandler validates parameters and tenant isolation
- BigQuery stored procedures prevent SQL injection

### Hybrid ADK Agent Architecture (November 2025)

**100% CLI-Based Deployment - Zero GUI Interaction**

The project uses a hybrid approach combining ADK (Python) for orchestration with the existing Node.js Tool Server:

```
ADK Agent (Python - ~150 lines)
  ├─ Conversation Management
  ├─ Function Calling Orchestration
  ├─ Session/Memory Handling
  └─ OpenAPI Tool Integration
       ↓ HTTP (OIDC Auth)
Node.js Tool Server (Unchanged)
  ├─ 8 Intent Functions
  ├─ BigQuery Integration
  ├─ Multi-Tenant Config
  └─ Chart Generation
```

**Key Benefits:**
- **100% Scriptable:** `./scripts/deploy/deploy-agent.sh` (zero GUI)
- **Version Controlled:** All agent code in Git
- **Claude Code Friendly:** Can read/write all files
- **Minimal Python:** ~150 lines total (easy to maintain)
- **Keep Node.js:** Existing Tool Server unchanged

**Files:**
- `agent/agent.py` - Main agent definition (50 lines)
- `agent/deploy.py` - Deployment script (40 lines)
- `agent/test_agent.py` - Test suite (150 lines)
- `vertex-ai-tools-config.yaml` - OpenAPI spec for all 8 functions

**Deployment:**
```bash
# One-time setup
./scripts/deploy/setup-agent-infrastructure.sh

# Deploy agent
./scripts/deploy/deploy-agent.sh

# Test agent
cd agent && python test_agent.py
```

**Blue/Green Deployment:**
ADK agents don't support Cloud Run-style revisions. Use Blue/Green for safe rollback:

```bash
# List current agents
./scripts/deploy/list-agents.sh

# Deploy v2 alongside v1
AGENT_DISPLAY_NAME="FDS Analytics Agent v2" ./scripts/deploy/deploy-agent.sh

# Test v2
python test_agent.py --resource <v2-resource>

# If good: Update app config to use v2, delete v1
./scripts/deploy/delete-agent.sh <v1-resource>

# If bad: Keep using v1, delete v2
./scripts/deploy/delete-agent.sh <v2-resource>
```

**Helper Scripts:**
- `./scripts/deploy/list-agents.sh` - List all deployed agents
- `./scripts/deploy/delete-agent.sh` - Delete agent with confirmation
- `./scripts/deploy/delete-agent.sh --force` - Force delete without prompt

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
# Run full Tool Server test suite (9 tests, 8 intent functions)
./scripts/testing/test-tool-server.sh

# Test specific function
./scripts/testing/test-tool-server.sh --function compare_periods

# Test with specific tenant
./scripts/testing/test-tool-server.sh --tenant senso-sushi

# Test results location
ls test-results/run-*/
```

**Test Infrastructure:**
- Direct /execute-tool endpoint testing (synchronous responses)
- Tests all 8 intent functions with representative queries
- Validates response format: {status, data, chartUrl, metadata}
- Saves JSON responses for inspection
- Generates markdown test report

### Deployment

```bash
# Authenticate with GCP
gcloud auth login
gcloud auth application-default login
gcloud config set project fdsanalytics

# Create Vertex AI service account (one-time setup)
./scripts/deploy/create-vertex-ai-service-account.sh

# Setup agent infrastructure (one-time)
./scripts/deploy/setup-agent-infrastructure.sh

# Deploy all services in correct order (Tool Server + Agent)
./scripts/deploy/deploy-all.sh

# Deploy individual services
./scripts/deploy/deploy-response-engine.sh  # Tool Server
./scripts/deploy/deploy-gmail-ingestion.sh
./scripts/deploy/deploy-agent.sh            # Vertex AI Agent (ADK)

# Deploy BigQuery stored procedures
./scripts/deploy/deploy-stored-procedures.sh

# Health check Tool Server
curl https://response-engine-XXXXXXXXXX-uc.a.run.app/health

# Test Agent
cd agent && python test_agent.py

# View logs
gcloud run services logs read response-engine --region us-central1 --limit 50

# View agent logs
gcloud logging read 'resource.type="aiplatform.googleapis.com/ReasoningEngine"' \
  --project=fdsanalytics --limit=50
```

### MCP Server Integration

**Gemini API Documentation MCP Server** - Provides Claude Code with integrated access to official Gemini API documentation.

**Purpose:**
- Instant access to Gemini API docs while working on Vertex AI integration code
- No context-switching to external browser needed
- Helps validate API usage patterns and stay current with model capabilities

**Installation (One-Time Setup):**
```bash
# Add the MCP server using the official CLI command
claude mcp add --transport stdio --scope project gemini-docs -- uvx --from git+https://github.com/philschmid/gemini-api-docs-mcp gemini-docs-mcp

# Verify it was added
claude mcp get gemini-docs
```

**Configuration Details:**
- Location: `.mcp.json` at project root (auto-created by `claude mcp add`)
- Scope: Project-level (can be committed to git and shared with team)
- Database: `~/.mcp/gemini-api-docs/database.db` (auto-created on first use, 3.8MB)
- Transport: stdio with `uvx` (no manual installation required)

**Available MCP Tools:**
- `search_documentation(queries)` - Full-text search across Gemini API docs
- `get_capability_page(capability)` - Retrieve specific documentation pages
- `get_current_model()` - Get latest Gemini model information

**When to Use:**
- Verifying Gemini 2.5 Flash capabilities and parameters
- Looking up function calling patterns and best practices
- Checking model specifications (token limits, thinking mode, etc.)
- Validating Vertex AI Agent Builder integration patterns

**Verification:**
- Command line: `claude mcp get gemini-docs` (should show "✓ Connected")
- In Claude Code: Use `/mcp` command to see available MCP tools
- No restart required after adding via CLI command

## Critical Design Patterns

### 1. BigQuery Stored Procedures for Security

**ALWAYS use stored procedures.** NEVER write raw SQL queries in application code.

```typescript
// CORRECT: Via AnalyticsToolHandler which calls stored procedures
const result = await analyticsToolHandler.handle('show_daily_sales', {
  startDate: '2025-05-01',
  endDate: '2025-05-31',
  category: '(Beer)'
});

// WRONG: Direct SQL (vulnerable to injection)
const sql = `SELECT * FROM metrics WHERE category = '${userInput}'`;
```

**Why:** Stored procedures safely construct queries using FORMAT() with parameterized @variables.

**Deployed Procedures:**
- `restaurant_analytics.query_metrics` - Main analytics query engine
- `insights.sp_get_daily_summary` - Daily comparisons with trends
- `insights.sp_get_category_trends` - Week-over-week performance
- `insights.sp_get_top_items_from_insights` - Top performers per category

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

### 4. Vertex AI Gemini Model Selection & Thinking Mode

**Primary Model:** `gemini-2.5-flash`
- Used for function calling (hybrid stateless-then-stateful approach)
- Thinking mode enabled with 1024 token budget
- Temperature: 1, topP: 0.95
- Regional endpoint: us-central1

**Hybrid Function Calling Approach:**
1. **Phase 1 (Stateless):** mode:ANY forces function call on first turn
2. **Phase 2 (Stateful):** mode:AUTO continues conversation with natural response
3. **Thinking Mode:** Separates reasoning (thought parts) from final answer (answer parts)

**Other Models:**
- `gemini-2.5-flash-lite` - Fast, cheap for PDF extraction and context summarization
- `gemini-2.5-pro` - Expensive, powerful for complex analysis (optional)

**NEVER use:**
- Models with date suffixes (e.g., `gemini-2.5-flash-lite-20250122`)
- Any 1.x models (deprecated)
- `gemini-2.0-flash` (superseded by 2.5-flash)

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

### Response Engine - Tool Server (Port 3000)
- **Entry:** `services/response-engine/src/index.ts`
- **Role:** Stateless API server exposing 8 analytics intent functions
- **Dependencies:** BigQuery only
- **Authentication:** IAM-based (requires valid service account token)
- **Endpoints:**
  - `POST /execute-tool` - Main tool execution endpoint (IAM protected)
  - `GET /health` - Health check (unauthenticated)
  - `GET /` - Status endpoint (unauthenticated)
- **Key Logic:**
  - `src/server.ts` - Express server with endpoint routing
  - `src/middleware/iamAuth.ts` - IAM token verification
  - `src/handlers/executeTool.handler.ts` - Tool execution handler
  - `src/services/TenantConfigService.ts` - Multi-tenant configuration
  - `src/tools/AnalyticsToolHandler.ts` - Static method to execute 8 intent functions
  - `src/core/ResponseFormatter.ts` - Format tool results as structured JSON
  - `src/chart/ChartBuilder.ts` - Generate chart URLs for visualization

**Request Format:**
```json
{
  "tool_name": "show_daily_sales",
  "tenant_id": "senso-sushi",
  "args": {
    "startDate": "2025-05-01",
    "endDate": "2025-05-31"
  }
}
```

**Response Format:**
```json
{
  "status": "success",
  "data": [...],
  "chartUrl": "https://...",
  "metadata": {
    "tool_name": "show_daily_sales",
    "row_count": 31,
    "execution_time_ms": 245,
    "tenant_id": "senso-sushi"
  }
}
```

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

### ingestion
- `ingestion_log` - Track processed emails/PDFs for idempotency

**Note:** The `chat_history` dataset is deprecated in V2.0. Conversation history is now managed by Vertex AI Agent Builder.

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
DEFAULT_TIMEZONE=America/Chicago
BQ_DATASET_ANALYTICS=restaurant_analytics
BQ_DATASET_INSIGHTS=insights
BQ_DATASET_INGESTION=ingestion
ENABLE_CHARTS=true
MAX_CHART_DATAPOINTS=100
BYPASS_IAM_AUTH=true  # Development only - bypasses IAM auth
```

### Service-Specific
- **Gmail Ingestion:** `GMAIL_OAUTH_SECRET_NAME`, `GMAIL_SEARCH_QUERY`

## Multi-Tenant Considerations

**V2.0 (Current):** Multi-tenant ready with TenantConfigService

**Phase 1 (Current Implementation):**
- `TenantConfigService.getConfig(tenantId)` returns hardcoded config for "senso-sushi"
- Convention-based mapping for other tenants (e.g., "company-a" → "company_a_analytics" dataset)
- All tool calls require explicit `tenant_id` parameter
- Data isolation enforced via BigQuery dataset separation

**Phase 2 (Future):**
1. Create `config.tenants` table in BigQuery
2. Store tenant configurations: {tenant_id, dataset_analytics, dataset_insights, customer_id, status}
3. Update `TenantConfigService.getConfig()` to query this table
4. Implement caching with TTL to avoid repeated BigQuery hits
5. Add tenant onboarding flow in Google Workspace Addon

**Design principle:** Complete tenant isolation - each tenant's data lives in separate BigQuery datasets.

## Intent Functions (8 Functions)

1. **show_daily_sales** - Daily sales breakdown with optional category filter
2. **compare_periods** - Compare two time periods for a metric
3. **find_peak_day** - Find best/worst day in a period
4. **show_top_items** - Top N items by metric
5. **track_item_performance** - Track specific item over time
6. **show_category_breakdown** - Sales by category for a period
7. **compare_day_types** - Compare weekdays vs weekends
8. **analyze_trends** - Detect trends and anomalies

## Deployment Dependencies

**Deploy in this order:**
1. Create Vertex AI service account (`create-vertex-ai-service-account.sh`)
2. BigQuery stored procedures (schema changes)
3. Response Engine Tool Server (no dependencies)
4. Gmail Ingestion (independent)

**IAM Configuration:**
- Vertex AI Agent service account (`vtx-agent-fds-tool-invoker`) needs `roles/run.invoker` on Response Engine
- Response Engine service account needs `roles/bigquery.dataViewer` and `roles/bigquery.jobUser`

## Important Documentation

- **Complete specs:** See `docs/00-index.md` for document map
- **API contracts:** `docs/02-api-contracts.md`
- **Data models:** `docs/03-data-models.md`
- **Testing strategy:** `docs/06-testing-strategy.md`
- **Deployment guide:** `docs/07-deployment-architecture.md`
- **Vertex AI integration:** `docs/09-gemini-integration.md` (hybrid function calling, thinking mode)
- **Intent functions:** `docs/10-intent-functions.md` (all 8 functions + hybrid cache)

## Key Files to Understand (V2.0 Tool Server)

- `services/response-engine/src/server.ts` - Express server with /execute-tool endpoint
- `services/response-engine/src/middleware/iamAuth.ts` - IAM authentication middleware
- `services/response-engine/src/handlers/executeTool.handler.ts` - Main request handler
- `services/response-engine/src/services/TenantConfigService.ts` - Multi-tenant configuration
- `services/response-engine/src/tools/AnalyticsToolHandler.ts` - Static execute() method for 8 intent functions
- `services/response-engine/src/core/ResponseFormatter.ts` - Formats tool results as structured JSON
- `services/response-engine/src/tools/intentFunctions.ts` - 8 intent function definitions for Vertex AI
- `services/response-engine/src/chart/ChartBuilder.ts` - Chart URL generation
- `services/gmail-ingestion/src/parsers/PmixParser.ts` - PDF extraction with Gemini
- `shared/utils/logger.ts` - Structured logging pattern used everywhere
- `docker-compose.yml` - Local development environment setup
- `sql/stored-procedures/query_metrics.sql` - Main analytics query engine
- `scripts/testing/test-tool-server.sh` - Tool Server test suite
- `scripts/deploy/create-vertex-ai-service-account.sh` - Service account setup

## Recent Improvements

**V2.0 - Tool Server Architecture (October 2025):**
- **October 2025:** Refactored from stateful chatbot to stateless Tool Server
- **October 2025:** Deleted Conversation Manager service (now handled by Vertex AI Agent)
- **October 2025:** Deleted GeminiClient, ResponseEngine, ResponseGenerator (conversation logic moved to Vertex AI)
- **October 2025:** Implemented IAM-based authentication middleware
- **October 2025:** Created TenantConfigService for true multi-tenancy
- **October 2025:** Refactored AnalyticsToolHandler to static pattern with explicit tenant_id
- **October 2025:** Updated ResponseFormatter to return generic JSON (not Google Chat cards)
- **October 2025:** Created /execute-tool endpoint as single entry point
- **October 2025:** Simplified test suite - direct synchronous API calls
- **October 2025:** Updated deployment scripts with IAM configuration

**V1.0 (Earlier October 2025):**
- Migrated to Vertex AI with hybrid stateless-then-stateful function calling
- Deployed all 7 missing BigQuery stored procedures
- Fixed SQL column alias bugs in query_metrics procedure
- Built comprehensive automated test suite
- Achieved 93.3% test success rate

## Performance Notes

**Tool Server (V2.0):**
- /execute-tool endpoint responds synchronously in 200-500ms (BigQuery execution time)
- Insights queries (fast path) complete in 100-200ms
- Stored procedure queries (slow path) complete in 300-800ms
- Chart generation adds 50-100ms
- No conversation overhead - truly stateless
- All context management handled by Vertex AI Agent (zero cost to us)
