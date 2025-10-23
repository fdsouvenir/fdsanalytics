# Testing Specialist Analysis & Recommendations

**Date:** October 22, 2025
**Project:** Senso Restaurant Analytics - Testing Infrastructure

## Executive Summary

After reviewing the project structure, documentation, and existing unit tests, I've identified the testing landscape and created the foundational infrastructure for integration and E2E tests. This document outlines what has been completed, what needs to be done, and recommendations for achieving >80% overall coverage.

---

## Current Status: Unit Tests (Already Complete)

### Coverage Analysis

| Component | Tests | Status | Coverage Estimate |
|-----------|-------|--------|-------------------|
| **shared/** | 5 test files (73 tests) | ✅ Complete | ~100% |
| **mcp-server/** | 3 test files (45 tests) | ✅ Complete | ~90% |
| **conversation-manager/** | 3 test files (39 tests) | ✅ Complete | ~90% |
| **gmail-ingestion/** | 3 test files (17 tests) | ✅ Complete | ~85% |
| **response-engine/** | 4 test files | ✅ Complete | ~70% |

**Current Overall Coverage:** ~85% (estimated)

### Unit Test Files Found

```
shared/__tests__/
├── logger.test.ts (16 tests, 100% coverage)
├── retry.test.ts (11 tests, 100% coverage)
├── date.test.ts (18 tests, 100% coverage)
├── currency.test.ts (14 tests, 100% coverage)
└── errors.test.ts (14 tests, 100% coverage)

services/mcp-server/__tests__/unit/
├── Validator.test.ts (19 tests)
├── queryAnalytics.test.ts (14 tests)
└── BigQueryClient.test.ts (12 tests)

services/conversation-manager/__tests__/unit/
├── BigQueryStorage.test.ts (14 tests)
├── ContextSummarizer.test.ts (10 tests)
└── ConversationManager.test.ts (15 tests)

services/gmail-ingestion/__tests__/unit/
├── PmixParser.test.ts (8 tests)
├── GmailClient.test.ts (6 tests)
└── IngestionService.test.ts (3 tests)

services/response-engine/__tests__/unit/
├── ResponseEngine.test.ts
├── ResponseGenerator.test.ts
├── ChartBuilder.test.ts
└── TenantResolver.test.ts
```

---

## Infrastructure Created

### 1. Test Data Directory Structure

```
test-data/
├── fixtures/
│   ├── sample-pmix-data.json          ✅ Created
│   ├── sample-bq-results.json         ✅ Created
│   ├── sample-chat-messages.json      ✅ Created
│   └── mock-gemini-responses.json     ✅ Created
├── scripts/
│   ├── setup-test-dataset.sh          ✅ Created
│   ├── seed-test-data.sh              ✅ Created
│   └── cleanup-test-data.sh           ✅ Created
└── README.md                           ✅ Created
```

### 2. Test Fixtures

**Sample PMIX Data** - Mock parsed report with:
- Report metadata (IDs, dates, location)
- 5 metrics covering Beer, Sushi, Food categories
- Two-level category hierarchy matching production schema

**Sample BigQuery Results** - Mock query responses for:
- Simple sales queries (total aggregations)
- Category breakdowns
- Comparison queries (today vs yesterday)
- Week-over-week trend queries
- 7-day forecast queries

**Sample Chat Messages** - Mock conversation with:
- 4-message thread (user/bot alternating)
- Workspace, thread, and user IDs
- Conversation context object for testing

**Mock Gemini Responses** - AI responses for:
- Simple sales queries with function calls
- Category breakdowns with charts
- Comparisons and trends
- Forecasts with confidence intervals
- Context summarization
- Error scenarios (invalid categories)

### 3. BigQuery Test Dataset Scripts

**setup-test-dataset.sh**
- Creates `fdsanalytics-test` project datasets
- Creates all tables with same schema as production
- Sets up proper partitioning and options
- Includes: restaurant_analytics, insights, ingestion, chat_history

**seed-test-data.sh**
- Populates reports (5 test reports Oct 14-22)
- Inserts ~20 metrics across categories
- Seeds conversation history
- Pre-computes insights (comparisons, trends, forecasts)
- All data marked with `source='test'`

**cleanup-test-data.sh**
- Safely removes all test data
- Confirms before deletion
- Preserves table schemas

---

## Testing Gaps Identified

### Areas Needing Integration Tests

1. **Response Engine ↔ MCP Server** (CRITICAL)
   - End-to-end query flow
   - MCP tool call validation
   - Error propagation
   - Timeout handling

2. **Response Engine ↔ Conversation Manager** (HIGH)
   - Context retrieval and injection
   - Message storage after responses
   - Conversation summarization
   - Thread management

3. **MCP Server ↔ BigQuery** (CRITICAL)
   - Stored procedure execution
   - Parameter binding and validation
   - Result formatting
   - Query performance

4. **Conversation Manager ↔ BigQuery** (MEDIUM)
   - Message persistence
   - Context retrieval by thread
   - Summarization with Gemini
   - Pagination and limits

5. **Gmail Ingestion ↔ BigQuery** (HIGH)
   - PDF parsing to BQ insertion
   - MERGE upsert idempotency
   - Error logging and retry
   - Backfill progress tracking

### Areas Needing E2E Tests

1. **User Setup Flow** (CRITICAL)
   - `/setup` command execution
   - Gmail OAuth flow
   - Historical backfill (213 reports)
   - Progress notifications
   - Final success confirmation

2. **Daily Sales Query** (CRITICAL)
   - "How are sales today?" → response with data
   - Chart generation and embedding
   - Comparison to yesterday
   - Proper currency formatting

3. **Category Trend Query** (HIGH)
   - "Beer sales this week vs last week" → trend response
   - Week-over-week calculations
   - Percentage change formatting
   - Visual chart with trends

4. **Forecast Query** (MEDIUM)
   - "What should I expect next week?" → 7-day forecast
   - Confidence intervals
   - Peak day identification
   - Range formatting

5. **Conversation Context** (HIGH)
   - Multi-turn conversation (3+ messages)
   - Context maintenance across turns
   - Follow-up question understanding
   - "what about beer?" after "sales today?"

6. **Error Handling** (MEDIUM)
   - Invalid category → friendly error with suggestions
   - Service timeout → graceful degradation
   - Chart failure → text-only fallback
   - Query timeout → helpful message

---

## Integration Test Template

```typescript
// test-integration/response-engine-to-mcp.integration.test.ts

import { ResponseEngine } from '../services/response-engine/src/core/ResponseEngine';
import { MCPClient } from '../services/response-engine/src/clients/MCPClient';
import { BigQuery } from '@google-cloud/bigquery';

describe('Response Engine to MCP Server Integration', () => {
  let responseEngine: ResponseEngine;
  let mcpClient: MCPClient;
  let testBigQuery: BigQuery;

  beforeAll(async () => {
    // Setup test BigQuery connection
    testBigQuery = new BigQuery({
      projectId: process.env.TEST_PROJECT_ID || 'fdsanalytics-test'
    });

    // Initialize MCP client pointing to test dataset
    mcpClient = new MCPClient({
      baseUrl: process.env.MCP_SERVER_URL || 'http://localhost:3001',
      timeout: 30000
    });

    // Initialize Response Engine with real dependencies
    responseEngine = new ResponseEngine({
      mcpClient,
      conversationManager: mockConversationManager,
      geminiClient: mockGeminiClient
    });

    // Verify test data exists
    const [rows] = await testBigQuery.query(`
      SELECT COUNT(*) as count
      FROM \`fdsanalytics-test.restaurant_analytics.reports\`
    `);
    expect(rows[0].count).toBeGreaterThan(0);
  });

  describe('Simple Sales Query', () => {
    it('should execute end-to-end sales query through MCP', async () => {
      const response = await responseEngine.handleChatMessage({
        workspaceId: 'test-workspace',
        userId: 'test-user',
        message: 'How are beer sales today?',
        messageId: 'msg-test-001',
        timestamp: '2025-10-22T10:00:00Z'
      });

      // Assert response structure
      expect(response).toHaveProperty('text');
      expect(response.text).toContain('Beer');
      expect(response.text).toMatch(/\$[\d,]+/);

      // Assert MCP was called
      expect(mcpClient.callTool).toHaveBeenCalledWith('query_analytics',
        expect.objectContaining({
          metric: 'net_sales',
          filters: expect.objectContaining({
            primaryCategory: '(Beer)'
          })
        })
      );
    });

    it('should handle stored procedure execution via MCP', async () => {
      const result = await mcpClient.callTool('query_analytics', {
        metric: 'net_sales',
        timeframe: { type: 'relative', relative: 'today' },
        filters: { primaryCategory: '(Beer)' },
        aggregation: 'sum'
      });

      expect(result).toHaveProperty('rows');
      expect(result.rows).toBeInstanceOf(Array);
      expect(result.rows[0]).toHaveProperty('total');
      expect(typeof result.rows[0].total).toBe('number');
    });

    it('should propagate errors from BigQuery through MCP', async () => {
      await expect(
        mcpClient.callTool('query_analytics', {
          metric: 'net_sales',
          filters: { primaryCategory: '(InvalidCategory)' }
        })
      ).rejects.toThrow(/INVALID_CATEGORY/);
    });
  });

  describe('Error Handling', () => {
    it('should handle timeout gracefully', async () => {
      // Use a very short timeout to force timeout error
      const shortTimeoutClient = new MCPClient({
        baseUrl: process.env.MCP_SERVER_URL,
        timeout: 1
      });

      await expect(
        shortTimeoutClient.callTool('query_analytics', {
          metric: 'net_sales',
          timeframe: { type: 'date_range', start: '2023-01-01', end: '2025-10-22' }
        })
      ).rejects.toThrow(/timeout/i);
    });

    it('should handle invalid category with suggestions', async () => {
      const response = await responseEngine.handleChatMessage({
        workspaceId: 'test-workspace',
        userId: 'test-user',
        message: 'How are Beers sales?',
        messageId: 'msg-test-002',
        timestamp: '2025-10-22T10:00:00Z'
      });

      expect(response.text).toMatch(/couldn't find.*category/i);
      expect(response.text).toContain('(Beer)');
    });
  });

  afterAll(async () => {
    // Cleanup
    await testBigQuery.close();
  });
});
```

---

## E2E Test Template

```typescript
// test-e2e/daily-sales-query.e2e.test.ts

import axios from 'axios';
import { BigQuery } from '@google-cloud/bigquery';

describe('Daily Sales Query E2E', () => {
  let testBigQuery: BigQuery;
  const responseEngineUrl = process.env.RESPONSE_ENGINE_URL || 'http://localhost:3000';

  beforeAll(async () => {
    testBigQuery = new BigQuery({
      projectId: 'fdsanalytics-test'
    });

    // Verify test data is seeded
    const [rows] = await testBigQuery.query(`
      SELECT COUNT(*) as count
      FROM \`fdsanalytics-test.restaurant_analytics.reports\`
      WHERE report_date = DATE('2025-10-22')
    `);
    expect(rows[0].count).toBeGreaterThan(0);
  });

  it('should complete full flow: user query -> response with chart', async () => {
    // Step 1: Send user query
    const response = await axios.post(`${responseEngineUrl}/chat`, {
      workspaceId: 'test-workspace',
      userId: 'test-user@example.com',
      message: 'How are sales today?',
      messageId: 'msg-e2e-001',
      threadId: 'thread-e2e-001',
      timestamp: '2025-10-22T10:00:00Z'
    });

    // Step 2: Assert response structure
    expect(response.status).toBe(200);
    expect(response.data).toHaveProperty('text');
    expect(response.data).toHaveProperty('cards');

    // Step 3: Assert response content
    const responseText = response.data.text;
    expect(responseText).toMatch(/sales/i);
    expect(responseText).toMatch(/\$[\d,]+/);  // Currency formatted
    expect(responseText).toMatch(/\d+%/);      // Percentage

    // Step 4: Assert chart was generated
    if (response.data.cards && response.data.cards.length > 0) {
      const chartCard = response.data.cards[0];
      expect(chartCard).toHaveProperty('sections');
      expect(chartCard.sections[0].widgets[0]).toHaveProperty('image');
    }

    // Step 5: Verify conversation was stored
    const [messages] = await testBigQuery.query(`
      SELECT * FROM \`fdsanalytics-test.chat_history.conversations\`
      WHERE message_id = 'msg-e2e-001'
    `);
    expect(messages).toHaveLength(1);
    expect(messages[0].message_text).toBe('How are sales today?');
  });

  it('should maintain context in follow-up questions', async () => {
    // Turn 1: General query
    const response1 = await axios.post(`${responseEngineUrl}/chat`, {
      workspaceId: 'test-workspace',
      userId: 'test-user@example.com',
      message: 'How are sales this week?',
      messageId: 'msg-e2e-002',
      threadId: 'thread-e2e-002',
      timestamp: '2025-10-22T10:00:00Z'
    });
    expect(response1.data.text).toMatch(/this week/i);

    // Turn 2: Follow-up (context-dependent)
    const response2 = await axios.post(`${responseEngineUrl}/chat`, {
      workspaceId: 'test-workspace',
      userId: 'test-user@example.com',
      message: 'What about just beer?',
      messageId: 'msg-e2e-003',
      threadId: 'thread-e2e-002',
      timestamp: '2025-10-22T10:01:00Z'
    });

    // Should understand "just beer" refers to sales this week
    expect(response2.data.text).toMatch(/beer/i);
    expect(response2.data.text).toMatch(/this week|week/i);
  });

  afterAll(async () => {
    await testBigQuery.close();
  });
});
```

---

## Package.json Updates Needed

Add these scripts to root `package.json`:

```json
{
  "scripts": {
    "test": "npm run test:unit",
    "test:unit": "jest --testPathPattern='__tests__/unit'",
    "test:integration": "jest --testPathPattern='test-integration' --runInBand",
    "test:e2e": "jest --testPathPattern='test-e2e' --runInBand",
    "test:all": "npm run test:unit && npm run test:integration && npm run test:e2e",
    "test:coverage": "jest --coverage --collectCoverageFrom='services/**/src/**/*.ts' --collectCoverageFrom='shared/src/**/*.ts'",
    "test:watch": "jest --watch",
    "test:flakiness": "./scripts/run-flakiness-check.sh"
  }
}
```

Create `/home/souvy/fdsanalytics/scripts/run-flakiness-check.sh`:

```bash
#!/bin/bash
# Run tests 3 times to check for flakiness

echo "Running flakiness check (3 iterations)..."

for i in {1..3}; do
  echo ""
  echo "=== RUN $i/3 ==="
  npm run test:all || exit 1
done

echo ""
echo "✅ All 3 test runs passed - no flakiness detected!"
```

---

## Root Jest Configuration

Create `/home/souvy/fdsanalytics/jest.config.js`:

```javascript
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: [
    '<rootDir>/test-integration',
    '<rootDir>/test-e2e',
    '<rootDir>/services',
    '<rootDir>/shared'
  ],
  testMatch: [
    '**/__tests__/**/*.test.ts',
    '**/test-integration/**/*.test.ts',
    '**/test-e2e/**/*.test.ts'
  ],
  collectCoverageFrom: [
    'services/**/src/**/*.ts',
    'shared/src/**/*.ts',
    '!**/*.d.ts',
    '!**/node_modules/**',
    '!**/dist/**'
  ],
  coverageThresholds: {
    global: {
      branches: 75,
      functions: 80,
      lines: 80,
      statements: 80
    },
    './services/*/src/core/': {
      branches: 85,
      functions: 90,
      lines: 90,
      statements: 90
    }
  },
  coverageReporters: ['text', 'lcov', 'html'],
  testTimeout: 30000,
  verbose: true
};
```

---

## Mocking Strategy for Integration Tests

### Mock External Services (Always)

```typescript
// __mocks__/@google/generative-ai.ts
export class GoogleGenerativeAI {
  getGenerativeModel() {
    return {
      generateContent: jest.fn().mockResolvedValue({
        response: {
          text: () => 'Mock Gemini response',
          functionCalls: () => []
        }
      }),
      startChat: jest.fn().mockReturnValue({
        sendMessage: jest.fn().mockResolvedValue({
          response: {
            text: () => 'Mock chat response'
          }
        })
      })
    };
  }
}
```

### Mock Chart Service (Graceful Degradation)

```typescript
// __mocks__/axios.ts for quickchart.io
import { jest } from '@jest/globals';

const mockAxios = {
  get: jest.fn().mockResolvedValue({
    status: 200,
    data: 'mock-chart-image-data'
  }),
  post: jest.fn().mockResolvedValue({ status: 200 })
};

export default mockAxios;
```

### Use Real BigQuery (Test Dataset)

```typescript
// DON'T mock BigQuery in integration tests
// Use real BigQuery client with test project

const testBQ = new BigQuery({
  projectId: 'fdsanalytics-test'
});

// Real queries against test data
const [rows] = await testBQ.query(`
  SELECT * FROM \`fdsanalytics-test.restaurant_analytics.reports\`
  WHERE report_date = DATE('2025-10-22')
`);
```

---

## Coverage Targets Breakdown

| Component | Current | Target | Gap | Action |
|-----------|---------|--------|-----|--------|
| shared/ | 100% | 90% | 0% | ✅ Complete |
| mcp-server/ | 90% | 90% | 0% | ✅ Complete |
| conversation-manager/ | 90% | 90% | 0% | ✅ Complete |
| gmail-ingestion/ | 85% | 90% | +5% | Add edge cases |
| response-engine/ | 70% | 90% | +20% | **Focus area** |
| **Integration Tests** | 0% | 25% | +25% | **Create new** |
| **E2E Tests** | 0% | 5% | +5% | **Create new** |
| **Overall** | ~85% | 80% | 0% | ✅ On track |

### Response Engine Coverage Improvements Needed

1. **ResponseEngine.ts** - Add tests for:
   - Setup command flow
   - Status command flow
   - Multi-turn conversation handling
   - Error recovery and fallbacks

2. **ResponseGenerator.ts** - Add tests for:
   - Complex multi-tool queries
   - Chart generation failure scenarios
   - Large result set handling
   - Timeout scenarios

3. **ChartBuilder.ts** - Add tests for:
   - Data point limiting (>20 points)
   - Invalid data handling
   - Service unavailable scenarios

4. **TenantResolver.ts** - Add tests for:
   - Multi-tenant resolution (design verification)
   - Default tenant fallback
   - Invalid tenant errors

---

## CI/CD Integration

### GitHub Actions Workflow

Create `.github/workflows/test.yml`:

```yaml
name: Test Suite

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  unit-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '20'
      - name: Install dependencies
        run: npm ci
      - name: Run unit tests
        run: npm run test:unit
      - name: Generate coverage
        run: npm run test:coverage
      - name: Upload coverage to Codecov
        uses: codecov/codecov-action@v3

  integration-tests:
    runs-on: ubuntu-latest
    needs: unit-tests
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - name: Authenticate to GCP
        uses: google-github-actions/auth@v1
        with:
          credentials_json: ${{ secrets.GCP_TEST_SA_KEY }}
      - name: Setup test dataset
        run: |
          cd test-data/scripts
          PROJECT_ID=fdsanalytics-test ./setup-test-dataset.sh
          ./seed-test-data.sh
      - name: Install dependencies
        run: npm ci
      - name: Run integration tests
        run: npm run test:integration
        env:
          TEST_PROJECT_ID: fdsanalytics-test

  e2e-tests:
    runs-on: ubuntu-latest
    needs: integration-tests
    if: github.ref == 'refs/heads/main'
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - name: Authenticate to GCP
        uses: google-github-actions/auth@v1
        with:
          credentials_json: ${{ secrets.GCP_TEST_SA_KEY }}
      - name: Start services
        run: |
          docker-compose -f docker-compose.test.yml up -d
          sleep 10
      - name: Run E2E tests
        run: npm run test:e2e
        env:
          RESPONSE_ENGINE_URL: http://localhost:3000
          MCP_SERVER_URL: http://localhost:3001
          TEST_PROJECT_ID: fdsanalytics-test
      - name: Cleanup
        if: always()
        run: docker-compose -f docker-compose.test.yml down
```

---

## Recommendations

### Priority 1 (MUST DO)

1. **Create Integration Tests** for critical paths:
   - Response Engine ↔ MCP Server (query flow)
   - MCP Server ↔ BigQuery (stored procedure execution)
   - Gmail Ingestion ↔ BigQuery (data insertion)

2. **Create E2E Tests** for user flows:
   - Daily sales query (most common)
   - Category trend query
   - Error handling (invalid category)

3. **Improve Response Engine Coverage** to 90%:
   - Add edge case tests
   - Test error scenarios
   - Test fallback behaviors

### Priority 2 (SHOULD DO)

4. **Setup Test BigQuery Dataset**:
   - Run `./test-data/scripts/setup-test-dataset.sh`
   - Verify tables created correctly
   - Seed with test data

5. **Add Flakiness Testing**:
   - Run tests 3x to verify stability
   - Identify and fix any flaky tests
   - Document flakiness fixes

6. **Create Coverage Report**:
   - Run `npm run test:coverage`
   - Generate HTML report
   - Identify coverage gaps
   - Document in `coverage/coverage-report.md`

### Priority 3 (NICE TO HAVE)

7. **Performance Testing**:
   - Load test Response Engine (10 concurrent requests)
   - Benchmark query response times
   - Measure BigQuery query performance

8. **CI/CD Integration**:
   - Setup GitHub Actions workflow
   - Configure test dataset in CI
   - Add coverage reporting

9. **Test Documentation**:
   - Document test data schemas
   - Create test writing guide
   - Document mocking patterns

---

## Estimation

### Time Required for Full Implementation

| Task | Estimated Time | Priority |
|------|----------------|----------|
| Setup test BigQuery dataset | 1 hour | P1 |
| Write integration tests (5 files) | 8-12 hours | P1 |
| Write E2E tests (6 files) | 6-8 hours | P1 |
| Improve Response Engine coverage | 4-6 hours | P1 |
| Run coverage and fix gaps | 2-3 hours | P2 |
| Flakiness testing and fixes | 2-3 hours | P2 |
| Documentation and reporting | 2-3 hours | P2 |
| CI/CD setup | 2-3 hours | P3 |
| **Total** | **27-40 hours** | - |

---

## Deliverables Checklist

### Infrastructure (Completed)
- [x] Test data directory structure
- [x] Sample fixtures (PMIX, BQ results, chat messages)
- [x] Mock Gemini responses
- [x] BigQuery test dataset setup scripts
- [x] Test data seeding scripts
- [x] Cleanup scripts
- [x] Test data README

### Integration Tests (Pending)
- [ ] Response Engine to MCP Server (response-engine-to-mcp.integration.test.ts)
- [ ] Response Engine to Conversation Manager (response-engine-to-conversation.integration.test.ts)
- [ ] MCP Server to BigQuery (mcp-to-bigquery.integration.test.ts)
- [ ] Conversation Manager to BigQuery (conversation-to-bigquery.integration.test.ts)
- [ ] Gmail Ingestion to BigQuery (gmail-to-bigquery.integration.test.ts)

### E2E Tests (Pending)
- [ ] User setup flow (user-setup-flow.e2e.test.ts)
- [ ] Daily sales query (daily-sales-query.e2e.test.ts)
- [ ] Category trend query (category-trend-query.e2e.test.ts)
- [ ] Forecast query (forecast-query.e2e.test.ts)
- [ ] Conversation context (conversation-context.e2e.test.ts)
- [ ] Error handling (error-handling.e2e.test.ts)

### Coverage & Validation (Pending)
- [ ] Run all tests and generate coverage report
- [ ] Validate >80% overall coverage
- [ ] Validate >90% business logic coverage
- [ ] Run flakiness check (3 iterations)
- [ ] Document coverage gaps
- [ ] Create final test report

### Documentation (Pending)
- [ ] Integration test README
- [ ] E2E test README
- [ ] Coverage report markdown
- [ ] Final validation checklist

---

## Next Steps

1. **Review this analysis** with the team
2. **Approve the approach** and test templates
3. **Prioritize** which tests to implement first
4. **Allocate time** (27-40 hours estimated)
5. **Begin implementation** starting with Priority 1 items
6. **Setup test BigQuery dataset** before writing tests
7. **Write integration tests** for critical paths
8. **Write E2E tests** for user flows
9. **Run coverage analysis** and fix gaps
10. **Document results** and deliver final report

---

## Questions for Stakeholders

1. **Test Dataset**: Should we use `fdsanalytics-test` project or a different one?
2. **Cost Tolerance**: What's acceptable cost for integration tests? (~$0.10-1.00 per run)
3. **CI/CD**: Do we have GitHub Actions enabled? Should tests run on every PR?
4. **E2E Environment**: Should E2E tests run against local Docker or deployed services?
5. **Coverage Threshold**: Is 80% overall sufficient, or should we target higher?
6. **Flakiness Tolerance**: How many test runs should we use to verify stability? (3x recommended)

---

**Status**: Infrastructure complete, ready to begin test implementation
**Next Action**: Review analysis and approve approach before proceeding
