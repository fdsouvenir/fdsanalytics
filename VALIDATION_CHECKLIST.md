# MCP Server + Data Layer - Validation Checklist

**Use this checklist to verify the build before deployment**

## ✅ Code Structure

- [x] MCP server directory created at `services/mcp-server/`
- [x] BigQuery client wrapper created
- [x] Parameter validator created
- [x] Three MCP tools implemented
- [x] Tool schemas defined
- [x] Config management implemented
- [x] Timeframe converter implemented

## ✅ Stored Procedures

- [x] `query_metrics.sql` created (200+ lines)
- [x] `get_forecast.sql` created (70+ lines)
- [x] `get_anomalies.sql` created (120+ lines)
- [x] All procedures use parameterized queries
- [x] All procedures use EXECUTE IMMEDIATE with USING clause
- [x] Migration script created

## ✅ Security

- [x] No SQL string concatenation found
- [x] All queries use parameters
- [x] Category validation against live BQ data
- [x] Schema validation with Zod
- [x] Query timeout set to 30s
- [x] Result limit set to 100 rows
- [x] Security audit document created
- [x] Security audit PASSED

## ✅ Tests

- [x] Validator unit tests (19 test cases)
- [x] QueryAnalyticsTool unit tests (14 test cases)
- [x] BigQueryClient unit tests (12 test cases)
- [x] Jest config with 90% coverage thresholds
- [x] Mock BigQuery client for tests

## ✅ Configuration

- [x] package.json with dependencies
- [x] tsconfig.json with strict mode
- [x] jest.config.js with coverage thresholds
- [x] Dockerfile multi-stage build
- [x] .dockerignore for clean builds
- [x] .eslintrc.json for linting

## ✅ Documentation

- [x] README.md with usage guide (230+ lines)
- [x] SECURITY_AUDIT.md (passed)
- [x] DELIVERABLES.md (build summary)
- [x] DATA_LAYER_COMPLETE.md (final summary)
- [x] Inline code comments

## ✅ Deployment

- [x] deploy-stored-procedures.sh script
- [x] deploy-mcp-server.sh script
- [x] Scripts are executable (chmod +x)
- [x] Health check endpoint implemented
- [x] Structured JSON logging

## ✅ MCP Protocol

- [x] tools/list endpoint
- [x] tools/call endpoint
- [x] Error responses in MCP format
- [x] Direct tool endpoints for testing

## ✅ Tool Implementation

### query_analytics
- [x] Parameter validation
- [x] Timeframe conversion
- [x] Filter handling
- [x] Baseline comparison support
- [x] Limit and ordering
- [x] Error handling

### get_forecast
- [x] Days parameter validation
- [x] Procedure call
- [x] Result formatting
- [x] Error handling

### get_anomalies
- [x] Days parameter validation
- [x] Procedure call
- [x] Result formatting
- [x] Error handling

## ✅ Error Handling

- [x] User-friendly error messages
- [x] MCP error code mapping
- [x] Validation error responses
- [x] Timeout error handling
- [x] BigQuery error transformation

## ✅ Performance

- [x] Query timeout: 30s
- [x] Max results: 100 rows
- [x] Category cache: 1 hour TTL
- [x] Timeout protection in all queries

## Pre-Deployment Tests

### Local Tests
```bash
cd services/mcp-server
npm install
npm run build
npm test
npm run lint
```

Expected: All pass with 0 errors

### Security Audit
```bash
cd services/mcp-server
grep -r "\${" src/ | grep -E "(SELECT|WHERE|FROM)" | grep -v "config\."
```

Expected: 0 results (no user input in SQL)

### File Count Verification
```bash
find services/mcp-server/src -name "*.ts" | wc -l
```

Expected: ~14 TypeScript files

### SQL Verification
```bash
grep -c "EXECUTE IMMEDIATE" sql/stored-procedures/*.sql
```

Expected: 6 total (3 procedures with 1-3 each)

## Deployment Verification

### Step 1: Deploy Stored Procedures
```bash
./scripts/deploy-stored-procedures.sh
```

Expected: All 3 procedures created in BigQuery

Verify:
```bash
bq ls --project_id=fdsanalytics --routines restaurant_analytics
bq ls --project_id=fdsanalytics --routines insights
```

### Step 2: Deploy MCP Server
```bash
./scripts/deploy-mcp-server.sh
```

Expected: Service deployed to Cloud Run

### Step 3: Test Deployed Service
```bash
# Get service URL
SERVICE_URL=$(gcloud run services describe mcp-server --region us-central1 --format 'value(status.url)')

# Test health
curl $SERVICE_URL/health

# Test tools/list
curl -X POST $SERVICE_URL/mcp \
  -H "Content-Type: application/json" \
  -d '{"method": "tools/list"}'
```

Expected:
- Health: 200 OK with JSON
- tools/list: Returns 3 tools

## Integration Verification

### Test query_analytics Tool
```bash
curl -X POST $SERVICE_URL/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "method": "tools/call",
    "params": {
      "name": "query_analytics",
      "arguments": {
        "metric": "net_sales",
        "timeframe": {"type": "relative", "relative": "today"},
        "aggregation": "sum"
      }
    }
  }'
```

Expected: Returns result with rows array

### Test get_forecast Tool
```bash
curl -X POST $SERVICE_URL/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "method": "tools/call",
    "params": {
      "name": "get_forecast",
      "arguments": {"days": 7}
    }
  }'
```

Expected: Returns 7 forecast rows

### Test get_anomalies Tool
```bash
curl -X POST $SERVICE_URL/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "method": "tools/call",
    "params": {
      "name": "get_anomalies",
      "arguments": {"days": 7}
    }
  }'
```

Expected: Returns anomalies array (may be empty)

## Final Checklist

- [ ] All unit tests passing
- [ ] Security audit passed
- [ ] Stored procedures deployed
- [ ] MCP server deployed
- [ ] Health check working
- [ ] tools/list returns 3 tools
- [ ] query_analytics tested and working
- [ ] get_forecast tested and working
- [ ] get_anomalies tested and working
- [ ] Documentation reviewed
- [ ] No SQL injection vulnerabilities
- [ ] Ready for Response Engine integration

## Sign-Off

**Validated By:** _________________  
**Date:** _________________  
**Status:** [ ] APPROVED FOR PRODUCTION

---

**Notes:**
- All template literals in code use config values, not user input
- All SQL construction uses parameterized queries
- Category validation happens before any queries
- Timeout protection prevents long-running queries
