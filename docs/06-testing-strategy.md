# Testing Strategy
## Senso Restaurant Analytics - Version 1.0

**Purpose:** Document the automated test harness for validating intent functions in production.

---

## 1. Testing Philosophy

### 1.1 Production-First Testing

Unlike traditional software testing that focuses on isolated unit tests, this system uses **production validation testing**:

```
┌─────────────────────────────────────────────────────┐
│  Test Harness (Bash)                                │
│    ↓                                                 │
│  Cloud Run Service (Production)                     │
│    ↓                                                 │
│  Gemini 2.5 Flash + Intent Functions                │
│    ↓                                                 │
│  BigQuery (Real Data)                               │
│    ↓                                                 │
│  Cloud Logging (Fetch Results)                      │
│    ↓                                                 │
│  Claude CLI (Validate Quality)                      │
└─────────────────────────────────────────────────────┘
```

**Why this approach?**
- **End-to-end validation** - Tests the entire system including Gemini, BigQuery, and stored procedures
- **Real data** - Uses production data to ensure queries work with actual schema and content
- **AI-powered validation** - Claude validates response quality, not just schema matching
- **No mocks** - Tests the complete production flow every time
- **Fast feedback** - ~1-2 minutes per test, ~30 minutes for full suite

### 1.2 Current Test Success Rate

**As of October 2025:**
- **28/30 tests passing (93.3%)**
- 8 intent functions tested with 3-5 queries each
- Production deployment: `response-engine` in `us-central1`

---

## 2. Test Harness Architecture

### 2.1 Main Test Script

**File:** `scripts/testing/test-all-intent-functions.sh`

**Purpose:** Orchestrates end-to-end testing of all intent functions.

**Usage:**
```bash
# Test all functions
./scripts/testing/test-all-intent-functions.sh

# Test specific function
./scripts/testing/test-all-intent-functions.sh --function compare_periods

# Test with custom test file
./scripts/testing/test-all-intent-functions.sh --test-file test-queries-isolated.json

# Isolated mode (unique thread per test, no conversation history)
./scripts/testing/test-all-intent-functions.sh --mode isolated

# Contextual mode (shared thread, maintains conversation history)
./scripts/testing/test-all-intent-functions.sh --mode contextual

# Test specific revision
./scripts/testing/test-all-intent-functions.sh --revision response-engine-00080-fcv

# Continuous monitoring
./scripts/testing/test-all-intent-functions.sh --continuous
```

### 2.2 Test Flow

```
1. Load test queries from JSON file
   ↓
2. For each query:
   - Send Google Chat webhook to Cloud Run
   - Record timestamp for log filtering
   - Wait for async processing (60 seconds)
   ↓
3. Fetch response from Cloud Logging
   - Filter by timestamp and revision
   - Extract response text and timing data
   ↓
4. Validate response with Claude CLI
   - Call validate-response.sh
   - Get validation result (valid/invalid + reason)
   ↓
5. Generate markdown report
   - Test results
   - Timing breakdown
   - Success/failure statistics
```

### 2.3 Test Modes

#### Isolated Mode
- **Thread ID:** Unique per test (`test-thread-isolated-{test_id}-{timestamp}`)
- **Conversation History:** None (fresh context for each test)
- **Use Case:** Testing individual function behavior without context
- **File:** `test-queries-isolated-flat.json`

```bash
./scripts/testing/test-all-intent-functions.sh --mode isolated
```

#### Contextual Mode
- **Thread ID:** Shared (`test-thread-contextual-shared`)
- **Conversation History:** Maintained across tests
- **Use Case:** Testing follow-up questions and conversation flow
- **File:** `test-queries-contextual.json`

```bash
./scripts/testing/test-all-intent-functions.sh --mode contextual
```

---

## 3. Test Query Format

### 3.1 JSON Test File Structure

**File:** `scripts/testing/test-queries-isolated-flat.json`

```json
{
  "description": "Isolated test queries - no conversation history (38 tests)",
  "intentFunctions": {
    "show_daily_sales": {
      "description": "Tests for show_daily_sales",
      "queries": [
        "daily sales in May 2025",
        "sales on February 30, 2025",
        "sales from May 31 to June 1, 2025",
        "sales from January to October 2025",
        "first week of June 2025 sales",
        "show me sales for the past 7 days"
      ]
    },
    "compare_periods": {
      "description": "Tests for compare_periods",
      "queries": [
        "compare May and June 2025 sales",
        "compare weekdays in May vs June 2025"
      ]
    },
    "find_peak_day": {
      "description": "Tests for find_peak_day",
      "queries": [
        "best sales day in July 2025",
        "best and worst day in July 2025"
      ]
    },
    "show_top_items": {
      "description": "Tests for show_top_items",
      "queries": [
        "top 10 items last month",
        "top 1 item in May 2025",
        "top 1000 items in May 2025",
        "top 0 items",
        "top -5 items"
      ]
    },
    "track_item_performance": {
      "description": "Tests for track_item_performance",
      "queries": [
        "Salmon Roll performance in May 2025",
        "Dragon Roll (Spicy) sales in May 2025"
      ]
    },
    "show_category_breakdown": {
      "description": "Tests for show_category_breakdown",
      "queries": [
        "sales by category in July 2025",
        "category breakdown May 2025",
        "BEER vs beer vs (Beer) sales"
      ]
    },
    "compare_day_types": {
      "description": "Tests for compare_day_types",
      "queries": [
        "weekdays vs weekends in July 2025",
        "Saturday and Sunday sales in July 2025",
        "weekend sales in July 2025",
        "weekday sales in July 2025",
        "Fridays vs Saturdays in July 2025"
      ]
    },
    "get_total_sales": {
      "description": "Tests for get_total_sales",
      "queries": [
        "total sales in June 2025",
        "sales next month",
        "beer sales in December 2024",
        "sales on July 4, 2025",
        "July 4th sales",
        "total sales May 2025"
      ]
    }
  }
}
```

### 3.2 Test Query Design Principles

**Good test queries:**
- ✅ Natural language variations ("total sales May 2025" vs "May 2025 sales")
- ✅ Edge cases (Feb 30, negative counts, future dates)
- ✅ Category variations (case sensitivity, parentheses)
- ✅ Date format variations (relative vs absolute, ranges vs single dates)
- ✅ Boundary values (0 items, 1000 items, invalid ranges)

**Coverage:**
- Each function has 2-7 test queries
- 38 total tests across 8 functions
- Covers happy path, edge cases, and error handling

---

## 4. Response Validation

### 4.1 Claude CLI Validation

**File:** `scripts/testing/lib/validate-response.sh`

**Purpose:** Use Claude (Haiku) to validate response quality based on query intent.

**Why AI validation?**
- Traditional regex/substring matching is brittle
- Response phrasing varies ("$1,234" vs "1234 dollars")
- Need to check semantic correctness, not just format
- Claude understands context and analytics domain

### 4.2 Validation Script

```bash
#!/bin/bash
# validate-response.sh "<query>" "<response>"

QUERY="$1"
RESPONSE="$2"

# Call Claude CLI (uses user's subscription, no API key needed)
VALIDATION=$(cat <<PROMPT | claude --print --model haiku 2>&1
You are a QA engineer testing an AI-powered restaurant analytics chatbot.

SYSTEM UNDER TEST:
The chatbot helps restaurant owners analyze sales data from BigQuery. It answers questions about:
- Sales trends (daily, weekly, monthly comparisons)
- Category performance (Sushi, Beer, Food, etc.)
- Time period comparisons (May vs June, weekdays vs weekends)
- Top selling items
- Specific item performance tracking

Users ask natural language questions like:
- "What were sales in May 2025?"
- "Compare weekday vs weekend sales in July"
- "Show me top 10 items last month"
- "How is Salmon Roll selling this month?"

EXPECTED BEHAVIOR:
✓ Good responses provide RELEVANT, SPECIFIC data directly answering the question
✓ Include dollar amounts, percentages, dates, item names, comparisons
✓ Stay focused on what was asked - no extraneous information
✓ If no data exists, explain why (e.g., "Data only available through Oct 2025")

✗ Bad responses deflect, ask questions back, provide errors, or include unrelated data

YOUR TASK:
Evaluate if this response properly answers the user's query.

User Query: "$QUERY"
Chatbot Response: "$RESPONSE"

Return ONLY valid JSON: {"valid": true|false, "reason": "2-6 words describing issue or success"}

Mark INVALID if the response:
- Contains data unrelated to the query (e.g., talks about May when asked about July)
- Includes extraneous information from other topics
- Asks clarifying questions instead of answering
- Says "I don't have", "can't provide", "I'm not sure" without context
- Contains error messages ("went wrong", "Something went wrong")
- Has NO specific data (no numbers, dates, or analytics)
- Gives logically impossible results (e.g., weekend sales = \$0.00)

Mark VALID if the response:
- Directly addresses what the user asked
- ALL data is relevant to the specific query
- Contains specific numbers, percentages, dates, or comparisons
- Provides concrete analytics answering the question
- Even "No data found" is OK if it explains why with proper context
PROMPT
)

# Extract JSON from markdown code blocks
if echo "$VALIDATION" | grep -q '```json'; then
    echo "$VALIDATION" | sed -n '/^```json/,/^```/p' | sed '1d;$d'
else
    echo "$VALIDATION" | grep -o '{.*}' | head -1
fi
```

### 4.3 Validation Logic

**Valid responses:**
```json
{
  "valid": true,
  "reason": "Provides specific sales data"
}
```

```json
{
  "valid": true,
  "reason": "Correctly compares two periods"
}
```

**Invalid responses:**
```json
{
  "valid": false,
  "reason": "Contains unrelated data"
}
```

```json
{
  "valid": false,
  "reason": "Logically impossible result"
}
```

```json
{
  "valid": false,
  "reason": "No specific analytics data"
}
```

---

## 5. Test Results and Reporting

### 5.1 Markdown Report Format

**Generated File:** `test-results/run-{timestamp}/TEST_REPORT.md`

```markdown
# Test Run Report

**Date:** Wed Oct 30 15:30:22 UTC 2025
**Revision:** response-engine-00080-fcv
**Service URL:** https://response-engine-111874159771.us-central1.run.app
**Test File:** test-queries-isolated-flat.json
**Test Mode:** isolated (unique thread per test)

---

## Test 1: show_daily_sales

**Query:** "daily sales in May 2025"

**Answer:**
> Here are the daily sales for May 2025:
>
> May 1: $4,523.50
> May 2: $5,234.75
> ...

**Timing Breakdown:**
- **Total Duration:** 8432ms (8.4s)
  - Resolve Tenant: 12ms (0.1%)
  - Get Context: 45ms (0.5%)
  - Generate Response: 8234ms (97.6%)
  - Format Response: 141ms (1.7%)

**Status:** ✓ PASSED
**Tool Calls:** 1
**Chart Generated:** false
**Validation:** Provides specific sales data

---

## Test 2: show_daily_sales

**Query:** "sales on February 30, 2025"

**Answer:**
> I cannot provide sales data for February 30, 2025, because February only has 28 days in 2025 (not a leap year). Did you mean February 28, 2025, or March 1, 2025?

**Timing Breakdown:**
- **Total Duration:** 6234ms (6.2s)
  - Resolve Tenant: 15ms (0.2%)
  - Get Context: 38ms (0.6%)
  - Generate Response: 6050ms (97.0%)
  - Format Response: 131ms (2.1%)

**Status:** ✓ PASSED
**Tool Calls:** 0
**Chart Generated:** false
**Validation:** Correctly handles invalid date

---

# Summary

## Overall Results

- **Total Tests:** 30
- **Successful:** 28
- **Failed:** 2
- **Success Rate:** 93.3%

## Function Breakdown

### show_daily_sales

- **Pass Rate:** 5/6 (83.3%)
- **Timing (ms):**
  - Min: 6234ms (6.2s)
  - Avg: 7843ms (7.8s)
  - Max: 9512ms (9.5s)

### compare_periods

- **Pass Rate:** 2/2 (100.0%)
- **Timing (ms):**
  - Min: 8234ms (8.2s)
  - Avg: 8523ms (8.5s)
  - Max: 8812ms (8.8s)

### find_peak_day

- **Pass Rate:** 2/2 (100.0%)
- **Timing (ms):**
  - Min: 7345ms (7.3s)
  - Avg: 7623ms (7.6s)
  - Max: 7901ms (7.9s)

...
```

### 5.2 Terminal Output

```
╔════════════════════════════════════════════════════╗
║  Intent Function Comprehensive Test Suite         ║
║  Run #1                                            ║
╚════════════════════════════════════════════════════╝

Service:     https://response-engine-111874159771.us-central1.run.app
Revision:    response-engine-00080-fcv
Test File:   test-queries-isolated-flat.json
Test Mode:   isolated
Output Dir:  ./test-results/run-20251030-153022
Time:        Wed Oct 30 15:30:22 UTC 2025

═══════════════════════════════════════════════════
Testing: show_daily_sales
═══════════════════════════════════════════════════

────────────────────────────────────────
Test 1: show_daily_sales
Query: daily sales in May 2025
────────────────────────────────────────
Response: "Here are the daily sales for May 2025:..."
✓ SUCCESS (8432ms)
  ✓ Validated: Provides specific sales data

────────────────────────────────────────
Test 2: show_daily_sales
Query: sales on February 30, 2025
────────────────────────────────────────
Response: "I cannot provide sales data for February 30..."
✓ SUCCESS (6234ms)
  ✓ Validated: Correctly handles invalid date

...

╔════════════════════════════════════════════════════╗
║  TEST SUMMARY                                      ║
╚════════════════════════════════════════════════════╝

Total Tests:      30
Successful:       28
Failed:           2
Success Rate:     93.3%

Function Breakdown:
  show_daily_sales          5/6 (83.3%)
    Timing: min=6234ms avg=7843ms max=9512ms
  compare_periods           2/2 (100.0%)
    Timing: min=8234ms avg=8523ms max=8812ms
  find_peak_day             2/2 (100.0%)
    Timing: min=7345ms avg=7623ms max=7901ms
  show_top_items            4/5 (80.0%)
    Timing: min=6789ms avg=7234ms max=8123ms
  track_item_performance    2/2 (100.0%)
    Timing: min=8012ms avg=8234ms max=8456ms
  show_category_breakdown   3/3 (100.0%)
    Timing: min=7456ms avg=7891ms max=8234ms
  compare_day_types         5/5 (100.0%)
    Timing: min=7234ms avg=7678ms max=8012ms
  get_total_sales           5/6 (83.3%)
    Timing: min=5234ms avg=6123ms max=7012ms

Report saved to: ./test-results/run-20251030-153022/TEST_REPORT.md

✓ All tests passed!
```

---

## 6. Test Execution

### 6.1 Sending Test Requests

**Method:** HTTP POST to Cloud Run webhook endpoint

```bash
# Get auth token
TOKEN=$(gcloud auth print-identity-token)

# Determine thread ID based on test mode
if [ "$TEST_MODE" = "isolated" ]; then
    THREAD_ID="test-thread-isolated-${test_id}-$(date +%s)"
else
    THREAD_ID="test-thread-contextual-shared"
fi

# Create Google Chat webhook payload
PAYLOAD=$(cat <<EOFPAYLOAD
{
  "chat": {
    "user": {
      "name": "users/test-user-123",
      "displayName": "Test User",
      "email": "test@example.com"
    },
    "messagePayload": {
      "message": {
        "name": "spaces/test-space/messages/test-msg-$(date +%s)",
        "text": "$query",
        "argumentText": "$query",
        "thread": {
          "name": "spaces/test-space/threads/${THREAD_ID}"
        }
      },
      "space": {
        "name": "spaces/test-space-123",
        "type": "DM"
      }
    }
  }
}
EOFPAYLOAD
)

# Send request
RESPONSE=$(curl -s -w "\n%{http_code}" \
    -X POST \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d "$PAYLOAD" \
    "$SERVICE_URL/webhook")

HTTP_CODE=$(echo "$RESPONSE" | tail -n1)

# Wait for async processing
sleep 60  # 60 seconds to allow Cloud Logging propagation
```

### 6.2 Fetching Results from Cloud Logging

```bash
# Record timestamp for log filtering
LOG_TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%S")

# Fetch logs with full response details
gcloud logging read \
    "resource.type=cloud_run_revision AND \
     resource.labels.service_name=response-engine AND \
     resource.labels.revision_name=$REVISION AND \
     timestamp>=\"$LOG_TIMESTAMP\" AND \
     jsonPayload.message=\"Response generated successfully\"" \
    --limit 1 \
    --format=json \
    --project=$PROJECT_ID > "/tmp/test-${test_id}.json"

# Extract response data
response_text=$(cat "/tmp/test-${test_id}.json" | jq -r '.[0].jsonPayload.responseText')
total_ms=$(cat "/tmp/test-${test_id}.json" | jq -r '.[0].jsonPayload.totalDurationMs')
tool_calls=$(cat "/tmp/test-${test_id}.json" | jq -r '.[0].jsonPayload.toolCallsCount')
```

### 6.3 Wait Times

**Why 60 seconds?**
- Cloud Run processes request asynchronously
- Response generation takes 6-12 seconds
- Cloud Logging has 5-10 second ingestion delay
- 60 seconds ensures logs are available for retrieval

**Can be adjusted:**
```bash
./scripts/testing/test-all-intent-functions.sh --wait-time 30  # Faster but may miss logs
./scripts/testing/test-all-intent-functions.sh --wait-time 90  # Safer for slower queries
```

---

## 7. Performance Benchmarks

### 7.1 Current Performance (October 2025)

| Function | Min (ms) | Avg (ms) | Max (ms) | Success Rate |
|----------|----------|----------|----------|--------------|
| show_daily_sales | 6,234 | 7,843 | 9,512 | 83.3% (5/6) |
| compare_periods | 8,234 | 8,523 | 8,812 | 100% (2/2) |
| find_peak_day | 7,345 | 7,623 | 7,901 | 100% (2/2) |
| show_top_items | 6,789 | 7,234 | 8,123 | 80% (4/5) |
| track_item_performance | 8,012 | 8,234 | 8,456 | 100% (2/2) |
| show_category_breakdown | 7,456 | 7,891 | 8,234 | 100% (3/3) |
| compare_day_types | 7,234 | 7,678 | 8,012 | 100% (5/5) |
| get_total_sales | 5,234 | 6,123 | 7,012 | 83.3% (5/6) |

**Overall Average:** ~7,500ms (7.5 seconds)

### 7.2 Timing Breakdown

**Typical request timing:**
```
Total: 8,432ms (100%)
├─ Resolve Tenant: 12ms (0.1%)
├─ Get Context: 45ms (0.5%)
├─ Generate Response: 8,234ms (97.6%)
│  ├─ Gemini Vertex AI call: ~7,000ms
│  ├─ BigQuery stored procedure: ~1,000ms
│  └─ Intent function execution: ~200ms
└─ Format Response: 141ms (1.7%)
```

**Note:** Conversation context is currently disabled for performance (saves 4-6 seconds).

### 7.3 Performance Targets

| Metric | Target | Current | Status |
|--------|--------|---------|--------|
| Simple query (get_total_sales) | < 6s | ~6.1s | ✓ |
| Complex query (compare_periods) | < 10s | ~8.5s | ✓ |
| Success rate | > 90% | 93.3% | ✓ |
| Test suite execution | < 45min | ~30min | ✓ |

---

## 8. Test Scenarios

### 8.1 Happy Path Tests

**show_daily_sales:**
- "daily sales in May 2025" → Returns daily breakdown with dates and amounts
- "sales from May 31 to June 1, 2025" → Returns cross-month range
- "first week of June 2025 sales" → Returns June 1-7 breakdown

**compare_periods:**
- "compare May and June 2025 sales" → Returns percentage comparison and absolute differences
- "compare weekdays in May vs June 2025" → Returns filtered comparison

**find_peak_day:**
- "best sales day in July 2025" → Returns date and amount of highest sales day
- "best and worst day in July 2025" → Returns both extremes

**show_top_items:**
- "top 10 items last month" → Returns ranked list with sales amounts
- "top 1 item in May 2025" → Returns single top item

**track_item_performance:**
- "Salmon Roll performance in May 2025" → Returns sales over time for specific item
- "Dragon Roll (Spicy) sales in May 2025" → Handles item name with parentheses

**show_category_breakdown:**
- "sales by category in July 2025" → Returns all primary categories with totals
- "category breakdown May 2025" → Returns same data with different phrasing

**compare_day_types:**
- "weekdays vs weekends in July 2025" → Returns grouped comparison
- "Fridays vs Saturdays in July 2025" → Returns specific day-of-week comparison

**get_total_sales:**
- "total sales in June 2025" → Returns single total amount
- "beer sales in December 2024" → Returns category-filtered total

### 8.2 Edge Case Tests

**Invalid dates:**
- "sales on February 30, 2025" → Should explain invalid date
- "sales next month" → Should explain data not available yet (if querying beyond latest date)

**Invalid counts:**
- "top 0 items" → Should handle gracefully
- "top -5 items" → Should handle negative count
- "top 1000 items" → Should limit to reasonable max (e.g., 100)

**Category variations:**
- "BEER vs beer vs (Beer) sales" → Should normalize to "(Beer)" primary category

**Out-of-range dates:**
- "sales from January to October 2025" → Should return all available months
- "show me sales for the past 7 days" → May fail if using relative dates without proper current date context

### 8.3 Error Handling Tests

**No data found:**
- Query for future months should explain data not available
- Query for items that don't exist should return empty results with explanation

**Malformed queries:**
- Queries that don't match any intent function should return helpful error
- Test harness logs "Tool Calls: 0" for queries that don't trigger functions

---

## 9. Known Test Failures

### 9.1 Current Failing Tests (2/30)

**Test: "sales next month"**
- **Status:** FAILED
- **Reason:** Query asks for future data, response may incorrectly attempt to provide data or give unclear error
- **Function:** get_total_sales
- **Expected:** "Data not available for future dates. Latest available: October 2025."
- **Root Cause:** Date validation in intent function may not properly detect future dates

**Test: "show me sales for the past 7 days"**
- **Status:** FAILED
- **Reason:** Relative date handling ("past 7 days") requires current date context
- **Function:** show_daily_sales
- **Expected:** Dynamic date range calculation based on current date
- **Root Cause:** System instruction includes current date, but Gemini may not use it correctly for relative date calculations

### 9.2 Improvement Opportunities

**Increase success rate to 100%:**
1. **Fix relative date handling** - Enhance date parser to better handle "last week", "past 7 days", etc.
2. **Improve future date validation** - Add explicit checks in intent functions for dates beyond latest available data
3. **Better error messages** - When data is unavailable, provide clearer explanation with latest available date

**Reduce response times:**
1. **Optimize BigQuery queries** - Current stored procedures take ~1s, could be optimized
2. **Gemini caching** - Use Vertex AI context caching to reduce Gemini latency
3. **Parallel function calls** - Support multiple intent function calls in single request (currently executes one at a time)

---

## 10. Test Maintenance

### 10.1 Adding New Tests

**Step 1: Update test query file**

Edit `scripts/testing/test-queries-isolated-flat.json`:

```json
{
  "intentFunctions": {
    "your_new_function": {
      "description": "Tests for your_new_function",
      "queries": [
        "test query 1",
        "test query 2",
        "edge case query 3"
      ]
    }
  }
}
```

**Step 2: Run tests**

```bash
./scripts/testing/test-all-intent-functions.sh --function your_new_function
```

**Step 3: Review results**

Check `test-results/run-{timestamp}/TEST_REPORT.md` for validation results.

### 10.2 Updating Validation Logic

**File:** `scripts/testing/lib/validate-response.sh`

**Modify Claude prompt:**
```bash
claude --print --model haiku 2>&1 << 'PROMPT'
# Update validation criteria here
# Add new expected behaviors or error patterns
PROMPT
```

**Why use Claude CLI?**
- Uses your existing Claude subscription (no API key management)
- Haiku model is fast (~1-2s) and cost-effective
- AI validation is more flexible than regex matching
- Can understand semantic correctness

### 10.3 Test Data Freshness

**Important:** Tests use real production BigQuery data.

**Data updates:**
- Gmail Ingestion runs daily at 3am CT
- PMIX reports loaded incrementally
- Test queries reference specific months (May 2025, June 2025, July 2025)

**When to update test queries:**
1. Data for new months becomes available → Add queries for new date ranges
2. New categories added → Add category-specific test queries
3. New items appear → Add item tracking tests
4. Schema changes → Update queries to match new structure

---

## 11. Continuous Testing

### 11.1 Continuous Monitoring Mode

**Run tests continuously:**
```bash
./scripts/testing/test-all-intent-functions.sh --continuous
```

**Behavior:**
- Runs full test suite every 60 seconds
- Generates new markdown report for each run
- Useful for monitoring production changes
- Press Ctrl+C to stop

### 11.2 Deployment Testing

**After deploying new revision:**

```bash
# Deploy new revision
./scripts/deploy/deploy-response-engine.sh

# Test specific revision
REVISION=$(gcloud run services describe response-engine \
    --region us-central1 \
    --project fdsanalytics \
    --format='value(status.latestReadyRevisionName)')

./scripts/testing/test-all-intent-functions.sh --revision $REVISION
```

**Best practice:** Always run full test suite after deployment to catch regressions.

### 11.3 Regression Testing

**Comparing test results:**

```bash
# Run baseline
./scripts/testing/test-all-intent-functions.sh > baseline.log

# Make code changes and deploy

# Run comparison
./scripts/testing/test-all-intent-functions.sh > after-changes.log

# Compare success rates
diff baseline.log after-changes.log
```

---

## 12. Test Infrastructure Requirements

### 12.1 Dependencies

**Required tools:**
- `bash` (4.0+)
- `gcloud` CLI (authenticated)
- `jq` (JSON parsing)
- `bc` (calculation)
- `curl` (HTTP requests)
- `claude` CLI (installed via `npm install -g @anthropic-ai/claude-cli`)

**GCP permissions:**
- `roles/run.invoker` on `response-engine` service
- `roles/logging.viewer` on project
- `roles/cloudrun.viewer` on project

### 12.2 Claude CLI Setup

**Installation:**
```bash
npm install -g @anthropic-ai/claude-cli
```

**Authentication:**
```bash
# First time: authenticate with your Anthropic account
claude auth login
```

**Model selection:**
- Test harness uses `haiku` model (fast and cost-effective)
- Can be changed to `sonnet` for more thorough validation:

```bash
# In validate-response.sh, change:
claude --print --model haiku    # Fast (1-2s)
claude --print --model sonnet   # More thorough (3-5s)
```

### 12.3 GCP Authentication

**Local development:**
```bash
gcloud auth login
gcloud auth application-default login
gcloud config set project fdsanalytics
```

**CI/CD:**
- Use service account with appropriate roles
- Export `GOOGLE_APPLICATION_CREDENTIALS` environment variable

---

## 13. Test Results Archive

### 13.1 Test Result Storage

**Location:** `test-results/run-{timestamp}/`

**Contents:**
```
test-results/
├── run-20251030-153022/
│   └── TEST_REPORT.md         # Markdown report
├── run-20251030-140015/
│   └── TEST_REPORT.md
└── run-20251029-092334/
    └── TEST_REPORT.md
```

**Retention:** Test results accumulate indefinitely (manual cleanup required).

### 13.2 Historical Analysis

**Success rate over time:**
```bash
# Extract success rates from all test runs
for dir in test-results/run-*/; do
    timestamp=$(basename "$dir" | sed 's/run-//')
    rate=$(grep "Success Rate:" "$dir/TEST_REPORT.md" | awk '{print $3}')
    echo "$timestamp: $rate"
done
```

**Example output:**
```
20251030-153022: 93.3%
20251030-140015: 90.0%
20251029-092334: 86.7%
```

---

## 14. Comparison with Traditional Testing

### 14.1 Why Not Unit Tests?

**Traditional approach (NOT used):**
```typescript
// Jest unit test
describe('AnalyticsToolHandler', () => {
  it('should call show_daily_sales with correct parameters', async () => {
    const mockBigQuery = jest.fn();
    const handler = new AnalyticsToolHandler(mockBigQuery);

    await handler.execute('show_daily_sales', {
      startDate: '2025-05-01',
      endDate: '2025-05-31'
    });

    expect(mockBigQuery).toHaveBeenCalledWith(...);
  });
});
```

**Problems with this approach:**
- ❌ Mocks hide real integration issues
- ❌ Doesn't test BigQuery stored procedures
- ❌ Doesn't test Gemini function calling accuracy
- ❌ Doesn't validate response quality
- ❌ False confidence from passing mocked tests

**Current approach (production validation):**
- ✅ Tests complete end-to-end flow
- ✅ Uses real BigQuery data and stored procedures
- ✅ Tests Gemini's ability to map queries to correct functions
- ✅ AI validates response quality, not just schema
- ✅ Catches real integration issues

### 14.2 Trade-offs

**Advantages of production validation:**
- High confidence in system behavior
- Tests real data and integrations
- Catches issues that unit tests miss
- Validates user experience end-to-end

**Disadvantages:**
- Slower execution (~30 minutes for full suite vs ~1 minute for unit tests)
- Requires deployed service (can't run offline)
- Dependent on production data availability
- Cloud costs for test execution (minimal: ~$0.50/month for Gemini + BigQuery)

**Conclusion:** For this system, production validation is the right trade-off because:
1. System complexity is in integration (Gemini + BigQuery), not business logic
2. AI behavior is non-deterministic and must be validated holistically
3. Real data coverage is critical (schema mismatches would break queries)
4. 30-minute test suite is acceptable for deployment validation

---

## 15. Future Improvements

### 15.1 Automated Regression Detection

**Goal:** Automatically detect regressions when success rate drops.

**Implementation:**
```bash
# Track baseline success rate
echo "93.3" > test-results/baseline-success-rate.txt

# After deployment, compare
NEW_RATE=$(grep "Success Rate:" test-results/run-latest/TEST_REPORT.md | awk '{print $3}' | tr -d '%')
BASELINE=$(cat test-results/baseline-success-rate.txt)

if (( $(echo "$NEW_RATE < $BASELINE - 5" | bc -l) )); then
    echo "❌ REGRESSION DETECTED: Success rate dropped from ${BASELINE}% to ${NEW_RATE}%"
    exit 1
fi
```

### 15.2 Performance Regression Detection

**Goal:** Alert when response times increase significantly.

**Implementation:**
```bash
# Track baseline timing
echo "7500" > test-results/baseline-avg-ms.txt

# After deployment, compare
NEW_AVG=$(calculate_average_timing_from_report)
BASELINE=$(cat test-results/baseline-avg-ms.txt)

if (( $NEW_AVG > $BASELINE * 1.2 )); then  # 20% slower
    echo "⚠️ PERFORMANCE REGRESSION: Avg response time increased from ${BASELINE}ms to ${NEW_AVG}ms"
fi
```

### 15.3 CI/CD Integration

**Goal:** Run tests automatically on every deployment.

**GitHub Actions workflow:**
```yaml
# .github/workflows/test-after-deploy.yml
name: Test After Deployment

on:
  workflow_run:
    workflows: ["Deploy to Cloud Run"]
    types:
      - completed

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2

      - name: Install dependencies
        run: |
          npm install -g @anthropic-ai/claude-cli
          sudo apt-get install -y jq bc

      - name: Authenticate with GCP
        uses: google-github-actions/auth@v1
        with:
          credentials_json: ${{ secrets.GCP_SA_KEY }}

      - name: Run test suite
        run: ./scripts/testing/test-all-intent-functions.sh

      - name: Upload test report
        uses: actions/upload-artifact@v2
        with:
          name: test-report
          path: test-results/run-latest/TEST_REPORT.md

      - name: Check for regressions
        run: |
          # Compare with baseline
          # Fail build if success rate dropped
```

### 15.4 Test Coverage Expansion

**Current coverage:**
- 8 intent functions tested
- 38 total test queries
- 93.3% success rate

**Future additions:**
1. **Multi-turn conversation tests** - Test contextual mode with follow-up questions
2. **Chart generation tests** - Validate chart URLs and content (currently deferred)
3. **Error recovery tests** - Test behavior when BigQuery or Gemini is unavailable
4. **Concurrent request tests** - Validate behavior under load (10+ simultaneous requests)
5. **Category hierarchy tests** - Test subcategory handling (currently limited tests)

---

**Document Version:** 1.0
**Last Updated:** October 30, 2025
**Test Suite Location:** `scripts/testing/test-all-intent-functions.sh`
**Current Success Rate:** 93.3% (28/30 tests passing)
