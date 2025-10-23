# MCP Server - Restaurant Analytics Data Layer

**Version:** 1.0.0
**Purpose:** MCP protocol server for secure BigQuery analytics access

## Overview

The MCP Server provides a secure data access layer for restaurant analytics using:
- **MCP Protocol** - Model Context Protocol for tool-based interfaces
- **BigQuery Stored Procedures** - Parameterized queries prevent SQL injection
- **Category Validation** - Validates against live BigQuery data
- **Timeout Protection** - All queries timeout at 30 seconds

## Security Features

### SQL Injection Prevention
- **NO string concatenation** - All queries use parameterized inputs
- **Stored procedures** - All SQL lives in BigQuery, not application code
- **Category validation** - Categories validated against actual BQ data
- **Type-safe parameters** - Zod schema validation on all inputs

### Example: Safe Query Construction
```typescript
// SAFE: Uses parameterized stored procedure
await bqClient.callProcedure('query_metrics', {
  primary_category: userInput  // Passed as parameter, never concatenated
});

// UNSAFE (never done in this codebase):
await bq.query(`SELECT * FROM metrics WHERE category = '${userInput}'`);
```

## Architecture

```
MCP Server
├── Tools (3)
│   ├── query_analytics  - Main query tool
│   ├── get_forecast     - 7-day forecasting
│   └── get_anomalies    - Anomaly detection
│
├── BigQuery Layer
│   ├── BigQueryClient   - Connection wrapper
│   ├── Validator        - Parameter validation
│   └── TimeframeConverter - Date range conversion
│
└── Stored Procedures (in BigQuery)
    ├── query_metrics    - Main query procedure
    ├── get_forecast     - Forecast procedure
    └── get_anomalies    - Anomalies procedure
```

## API Endpoints

### Health Check
```bash
GET /health
```

### MCP Protocol
```bash
POST /mcp
Content-Type: application/json

# List available tools
{
  "method": "tools/list"
}

# Call a tool
{
  "method": "tools/call",
  "params": {
    "name": "query_analytics",
    "arguments": {
      "metric": "net_sales",
      "timeframe": {
        "type": "relative",
        "relative": "last_week"
      },
      "aggregation": "sum",
      "groupBy": ["category"]
    }
  }
}
```

### Direct Tool Endpoints (Testing)
```bash
# Query analytics
POST /tools/query_analytics
{
  "metric": "net_sales",
  "timeframe": { "type": "relative", "relative": "today" },
  "aggregation": "sum"
}

# Get forecast
POST /tools/get_forecast
{
  "days": 7
}

# Get anomalies
POST /tools/get_anomalies
{
  "days": 7
}
```

## Tools Reference

### 1. query_analytics

**Purpose:** Query sales and quantity data with filtering, grouping, and comparison

**Parameters:**
- `metric` (required): `"net_sales"` or `"quantity_sold"`
- `timeframe` (required): Absolute or relative date range
- `aggregation` (required): `"sum"`, `"avg"`, `"count"`, `"min"`, `"max"`
- `filters` (optional): Category, subcategory, or item filters
- `groupBy` (optional): Array of `["date", "category", "subcategory", "item"]`
- `comparison` (optional): Baseline timeframe for comparison
- `limit` (optional): Max rows (default: 100, max: 100)
- `orderBy` (optional): Sort field and direction

**Example:**
```json
{
  "metric": "net_sales",
  "timeframe": {
    "type": "relative",
    "relative": "this_week"
  },
  "aggregation": "sum",
  "filters": {
    "primaryCategory": "(Beer)"
  },
  "groupBy": ["date"],
  "comparison": {
    "baselineTimeframe": {
      "type": "relative",
      "relative": "last_week"
    }
  }
}
```

### 2. get_forecast

**Purpose:** 7-day sales forecasting based on historical patterns

**Parameters:**
- `days` (optional): Number of days to forecast (default: 7, max: 14)

**Example:**
```json
{
  "days": 7
}
```

### 3. get_anomalies

**Purpose:** Detect anomalies in sales data (±40%/±60% thresholds)

**Parameters:**
- `days` (optional): Days back to check (default: 7, max: 90)

**Example:**
```json
{
  "days": 14
}
```

## Installation

```bash
cd /home/souvy/fdsanalytics/services/mcp-server

# Install dependencies
npm install

# Build TypeScript
npm run build

# Run tests
npm test

# Run with coverage
npm run test:coverage

# Start server
npm start

# Development mode
npm run dev
```

## Environment Variables

```bash
PROJECT_ID=fdsanalytics
REGION=us-central1
BQ_DATASET_ANALYTICS=restaurant_analytics
BQ_DATASET_INSIGHTS=insights
DEFAULT_TIMEZONE=America/Chicago
PORT=8080
NODE_ENV=production
```

## Deploying Stored Procedures

Before deploying the MCP server, deploy the stored procedures to BigQuery:

```bash
# Deploy all stored procedures
cd /home/souvy/fdsanalytics/sql

# Deploy query_metrics
bq query --project_id=fdsanalytics --use_legacy_sql=false < stored-procedures/query_metrics.sql

# Deploy get_forecast
bq query --project_id=fdsanalytics --use_legacy_sql=false < stored-procedures/get_forecast.sql

# Deploy get_anomalies
bq query --project_id=fdsanalytics --use_legacy_sql=false < stored-procedures/get_anomalies.sql

# Verify procedures were created
bq ls --project_id=fdsanalytics --routines restaurant_analytics
bq ls --project_id=fdsanalytics --routines insights
```

## Testing

### Unit Tests
```bash
npm run test:unit
```

### Integration Tests (requires BigQuery access)
```bash
npm run test:integration
```

### Coverage Report
```bash
npm run test:coverage
```

**Coverage Goals:**
- Branches: >90%
- Functions: >90%
- Lines: >90%
- Statements: >90%

## Security Audit

### SQL Injection Check
```bash
# Search for unsafe query patterns
grep -r "SELECT.*\${" src/
grep -r "WHERE.*\${" src/
grep -r "FROM.*\${" src/

# Should return 0 results - all queries use parameterized inputs
```

### Parameter Validation Check
All user inputs are validated:
1. **Schema validation** - Zod schemas validate types
2. **Live data validation** - Categories checked against BigQuery
3. **Business rule validation** - Date ranges, limits, etc.

## Error Handling

### Error Codes
- `-32602`: Invalid parameters (validation failed)
- `-32601`: Method/tool not found
- `-32603`: Internal server error
- `504`: Query timeout (exceeded 30s)

### Example Error Response
```json
{
  "error": {
    "code": -32602,
    "message": "Category '(Beers)' not found in data",
    "details": {
      "suggestions": ["(Beer)", "(Wine)", "(Liquor)"]
    }
  }
}
```

## Performance

- **Query Timeout:** 30 seconds (hard limit)
- **Max Results:** 100 rows per query
- **Category Cache:** 1 hour TTL
- **Typical Response Time:** 200-500ms

## Deployment

### Cloud Run (Recommended)
```bash
# Build container
docker build -t gcr.io/fdsanalytics/mcp-server:latest .

# Push to Container Registry
docker push gcr.io/fdsanalytics/mcp-server:latest

# Deploy to Cloud Run
gcloud run deploy mcp-server \
  --image gcr.io/fdsanalytics/mcp-server:latest \
  --region us-central1 \
  --platform managed \
  --allow-unauthenticated \
  --set-env-vars PROJECT_ID=fdsanalytics,BQ_DATASET_ANALYTICS=restaurant_analytics
```

### Local Development
```bash
npm run dev
```

Server runs on `http://localhost:8080`

## Monitoring

### Health Check
```bash
curl http://localhost:8080/health
```

### Logs
Structured JSON logs compatible with Google Cloud Logging:
```json
{
  "severity": "INFO",
  "message": "Query executed successfully",
  "component": "mcp-server",
  "executionTimeMs": 245,
  "timestamp": "2025-10-22T10:30:00.123Z"
}
```

## Troubleshooting

### Query Timeout
- **Symptom:** 504 error after 30 seconds
- **Solution:** Narrow date range or add more specific filters

### Invalid Category
- **Symptom:** "Category not found" error
- **Solution:** Check available categories with validator or query BigQuery directly

### Permission Denied
- **Symptom:** BigQuery access errors
- **Solution:** Ensure service account has BigQuery Data Viewer and Job User roles

## Support

- **Documentation:** `/home/souvy/fdsanalytics/docs/`
- **Issues:** Check error logs in Cloud Logging
- **BigQuery Console:** https://console.cloud.google.com/bigquery?project=fdsanalytics

## Version History

- **1.0.0** (2025-10-22): Initial release with 3 tools, stored procedures, and full validation
