# FDS Analytics - Restaurant Analytics Chat Assistant

A microservices-based system that provides natural language analytics for restaurant data via Google Chat, powered by Google Gemini AI.

## Overview

FDS Analytics enables restaurant operators to query their sales data using natural language through Google Chat. The system ingests daily PMIX reports from Gmail, stores the data in BigQuery, and uses Google Gemini AI with function calling to answer analytics questions.

**Current Customer:** Senso Sushi (Frankfort, KY)  
**Platform:** Google Cloud Platform  
**Status:** V1.0 Production (93.3% test success rate)

## Key Features

- **Natural Language Queries** - Ask questions like "show me beer sales for last month"
- **8 Analytics Functions** - Daily sales, comparisons, trends, top items, and more
- **Automated PDF Ingestion** - Parses PMIX reports from Gmail daily at 3am
- **Smart Insights** - Pre-computed daily comparisons, trends, and forecasts
- **Conversation History** - Maintains context for follow-up questions
- **Secure Architecture** - BigQuery stored procedures prevent SQL injection

## Architecture

```
┌─────────────┐
│ Google Chat │
└──────┬──────┘
       │
       v
┌─────────────────────────┐      ┌──────────────────┐
│   Response Engine       │─────>│  Conversation    │
│  (Gemini Function Call) │      │    Manager       │
└───────┬─────────────────┘      └──────────────────┘
        │
        v
┌────────────────────────────────┐
│  BigQuery Stored Procedures    │
│  - query_metrics               │
│  - sp_get_daily_summary        │
│  - sp_get_category_trends      │
│  - sp_get_top_items            │
└────────────────────────────────┘
        │
        v
┌────────────────────────────────┐
│      BigQuery Datasets         │
│  - restaurant_analytics        │
│  - insights                    │
│  - chat_history                │
└────────────────────────────────┘
```

### Services

1. **Response Engine** (Cloud Run) - Main orchestrator using Gemini Pro for function calling
2. **Conversation Manager** (Cloud Run) - Context extraction and message history
3. **Gmail Ingestion** (Cloud Function) - PMIX PDF parsing and data loading

## Quick Start

### Prerequisites

- Node.js 18+
- Docker & Docker Compose
- gcloud CLI
- Access to GCP project `fdsanalytics`

### Local Development

```bash
# Clone repository
git clone <repository-url>
cd fdsanalytics

# Install dependencies
npm install

# Start all services with Docker Compose
docker-compose up

# Services will be available at:
# - Response Engine: http://localhost:3000
# - Conversation Manager: http://localhost:3002
# - Gmail Ingestion: http://localhost:3003
```

### Running Tests

```bash
# Run automated test suite (30 tests across 8 functions)
./scripts/testing/test-all-intent-functions.sh

# Test specific function
./scripts/testing/test-all-intent-functions.sh --function show_daily_sales

# View test results
ls test-results/run-*/
```

## Deployment

### Deploy All Services

```bash
# Authenticate with GCP
gcloud auth login
gcloud config set project fdsanalytics

# Deploy all services in correct order
./scripts/deploy/deploy-all.sh
```

### Deploy Individual Components

```bash
# Deploy BigQuery stored procedures first
./scripts/deploy/deploy-stored-procedures.sh

# Then deploy services
./scripts/deploy/deploy-conversation-manager.sh
./scripts/deploy/deploy-response-engine.sh
./scripts/deploy/deploy-gmail-ingestion.sh
```

## Intent Functions

The system supports 8 analytics functions:

1. **show_daily_sales** - Daily sales breakdown with optional category filter
2. **compare_periods** - Compare two time periods (e.g., May vs June)
3. **find_peak_day** - Find best/worst performing day
4. **show_top_items** - Top N items by sales or quantity
5. **track_item_performance** - Track specific item over time
6. **show_category_breakdown** - Sales distribution by category
7. **compare_day_types** - Weekdays vs weekends comparison
8. **analyze_trends** - Detect trends and anomalies

## Data Model

### BigQuery Datasets

- **restaurant_analytics** - Sales data from PMIX reports
  - `reports` - Report metadata (213 reports as of Oct 2025)
  - `metrics` - Line-item sales data with category hierarchy

- **insights** - Pre-computed analytics
  - `daily_comparisons` - Day-of-week trends with anomaly detection
  - `category_trends` - Week-over-week performance
  - `top_items` - Top 10 performers per category
  - `daily_forecast` - 7-day predictions

- **chat_history** - Conversation data
  - `conversations` - User messages and bot responses

- **ingestion** - ETL tracking
  - `ingestion_log` - Processed emails/PDFs for idempotency

### Category Hierarchy

**Primary categories** (always with parentheses):
- `(Beer)`, `(Sushi)`, `(Food)`, `(Liquor)`, `(Wine)`, `(N/A Beverages)`

**Subcategories** (no parentheses):
- `Bottle Beer`, `Draft Beer`, `Signature Rolls`, `Classic Rolls`, etc.

## Testing

### Automated Test Suite

- **30 test queries** across 8 intent functions
- **AI-powered validation** using Claude CLI
- **93.3% success rate** (28/30 passing)
- **Response preview logging** for debugging

### Test Structure

```bash
scripts/testing/
├── test-all-intent-functions.sh    # Main test runner
├── lib/
│   └── validate-response.sh         # Claude CLI validator
└── test-cases.json                  # 30 test queries
```

## Project Structure

```
fdsanalytics/
├── services/
│   ├── response-engine/             # Main orchestrator
│   ├── conversation-manager/        # Context & history
│   └── gmail-ingestion/             # PDF parsing
├── shared/                          # Shared utilities
│   ├── utils/                       # Logger, currency formatter
│   ├── errors/                      # Error classes
│   └── types/                       # TypeScript types
├── sql/
│   ├── stored-procedures/           # Security layer
│   └── insights/                    # Pre-computed queries
├── scripts/
│   ├── deploy/                      # Deployment scripts
│   ├── testing/                     # Automated tests
│   └── utilities/                   # Health checks, etc.
└── docs/                            # Technical documentation
```

## Configuration

### Environment Variables

```bash
# Core
PROJECT_ID=fdsanalytics
REGION=us-central1
ENVIRONMENT=production

# Services
CONVERSATION_MANAGER_URL=<cloud-run-url>
GEMINI_SECRET_NAME=GEMINI_API_KEY

# BigQuery
BQ_DATASET_ANALYTICS=restaurant_analytics
BQ_DATASET_INSIGHTS=insights
BQ_DATASET_CHAT_HISTORY=chat_history

# Gmail Ingestion
GMAIL_OAUTH_SECRET_NAME=GMAIL_OAUTH_CREDENTIALS
GMAIL_SEARCH_QUERY=from:spoton subject:pmix has:attachment
```

## Security

- **No raw SQL** - All queries through BigQuery stored procedures
- **Parameterized queries** - Using FORMAT() with @variables
- **Input validation** - Via AnalyticsToolHandler before calling procedures
- **Service-to-service auth** - Cloud Run IAM with least privilege
- **Secrets management** - GCP Secret Manager for API keys

## Performance

- **Typical response time:** 6-12 seconds
- **Fast path (insights):** 1-2 seconds
- **Slow path (stored procedures):** 4-8 seconds
- **Conversation context:** Disabled for performance (saves 4-6s)
- **Chart generation:** Adds 2-3 seconds when enabled

## Monitoring

```bash
# View logs
gcloud run services logs read response-engine --region us-central1 --limit 50

# Health check all services
./scripts/utilities/health-check-all.sh

# Check BigQuery procedures
bq ls --routines restaurant_analytics
bq ls --routines insights
```

## Documentation

- **[CLAUDE.md](CLAUDE.md)** - Development guide for Claude Code
- **[docs/00-index.md](docs/00-index.md)** - Technical documentation index
- **[docs/02-api-contracts.md](docs/02-api-contracts.md)** - API specifications
- **[docs/03-data-models.md](docs/03-data-models.md)** - Database schemas
- **[docs/06-testing-strategy.md](docs/06-testing-strategy.md)** - Test approach
- **[docs/07-deployment-architecture.md](docs/07-deployment-architecture.md)** - Deployment guide

## Recent Improvements

- **October 2025:** Deployed all 7 BigQuery stored procedures
- **October 2025:** Fixed SQL column alias bugs
- **October 2025:** Built comprehensive automated test suite with AI validation
- **October 2025:** Achieved 93.3% test success rate (up from 60%)
- **October 2025:** Simplified architecture by removing MCP layer
- **October 2025:** Added response preview logging for debugging

## Roadmap

### V2 - Multi-Tenant Support
- Dynamic tenant configuration from BigQuery
- Per-tenant data isolation
- Self-service /setup command
- Tenant-specific analytics

### Future Enhancements
- Real-time alerts for anomalies
- Mobile app integration
- Advanced forecasting models
- Custom report scheduling
- Export to Excel/PDF

## License

Proprietary - Internal use only

## Support

For questions or issues:
- Check [docs/](docs/) for technical details
- Review [CLAUDE.md](CLAUDE.md) for development guidance
- Contact the development team

---

**Built with:** Google Cloud Platform, Gemini AI, BigQuery, Cloud Run, TypeScript, Node.js
