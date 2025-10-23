# Testing Strategy
## Senso Restaurant Analytics - Version 1.0

**Purpose:** Define testing approach, scenarios, mock data, and coverage goals.

---

## 1. Testing Philosophy

### 1.1 Testing Pyramid

```
        /\
       /  \      E2E Tests (5%)
      /____\     - Full user flows
     /      \    Integration Tests (25%)
    /________\   - Component interactions
   /          \  Unit Tests (70%)
  /__________  \ - Individual functions
```

**Target Distribution:**
- **70% Unit Tests** - Fast, isolated, test business logic
- **25% Integration Tests** - Test component interactions
- **5% E2E Tests** - Test critical user paths

### 1.2 Test Coverage Goals

| Component | Target Coverage | Rationale |
|-----------|----------------|-----------|
| Business logic | 90% | Critical for correctness |
| API handlers | 80% | Important for reliability |
| Utilities | 85% | Reused everywhere |
| Configuration | 60% | Mostly declarative |
| **Overall** | **80%** | High confidence |

---

## 2. Unit Testing

### 2.1 Framework & Tools

```json
{
  "framework": "Jest",
  "libraries": [
    "@types/jest",
    "ts-jest",
    "@google-cloud/bigquery-mocking"
  ]
}
```

### 2.2 Unit Test Structure

```typescript
// __tests__/response-generator.test.ts

describe('ResponseGenerator', () => {
  let generator: ResponseGenerator;
  let mockMcpClient: jest.Mocked<MCPClient>;
  let mockChartBuilder: jest.Mocked<ChartBuilder>;
  
  beforeEach(() => {
    // Setup mocks
    mockMcpClient = {
      callTool: jest.fn()
    };
    mockChartBuilder = {
      generate: jest.fn()
    };
    
    generator = new ResponseGenerator(mockMcpClient, mockChartBuilder);
  });
  
  describe('generate()', () => {
    it('should generate response for simple sales query', async () => {
      // Arrange
      mockMcpClient.callTool.mockResolvedValue({
        rows: [{ total: 5234 }],
        totalRows: 1
      });
      
      const input = {
        userMessage: 'How are sales today?',
        context: { relevantMessages: [] },
        tenantConfig: MOCK_TENANT_CONFIG,
        currentDateTime: new Date('2025-10-22T10:00:00Z'),
        availableCategories: ['(Beer)', '(Sushi)']
      };
      
      // Act
      const result = await generator.generate(input);
      
      // Assert
      expect(result.responseText).toContain('$5,234');
      expect(mockMcpClient.callTool).toHaveBeenCalledWith('query_analytics', {
        metric: 'net_sales',
        timeframe: { type: 'relative', relative: 'today' },
        aggregation: 'sum'
      });
    });
    
    it('should handle invalid category gracefully', async () => {
      mockMcpClient.callTool.mockRejectedValue(
        new Error('INVALID_CATEGORY: (Beers) not found')
      );
      
      const result = await generator.generate({
        userMessage: 'Beer sales',
        ...MOCK_INPUT
      });
      
      expect(result.responseText).toContain('Did you mean');
      expect(result.responseText).toContain('(Beer)');
    });
    
    it('should include chart when data is suitable', async () => {
      mockMcpClient.callTool.mockResolvedValue({
        rows: [
          { category: '(Beer)', total: 1000 },
          { category: '(Sushi)', total: 2000 }
        ]
      });
      mockChartBuilder.generate.mockResolvedValue('https://chart.url');
      
      const result = await generator.generate({
        userMessage: 'Sales by category',
        ...MOCK_INPUT
      });
      
      expect(result.charts).toHaveLength(1);
      expect(result.charts[0].type).toBe('bar');
    });
  });
});
```

### 2.3 Unit Test Scenarios

#### Response Generator
- [x] Simple sales query
- [x] Category filtering
- [x] Date range queries
- [x] Comparison queries
- [x] Invalid category handling
- [x] Chart generation
- [x] Chart generation failure (fallback)
- [x] Multiple tool calls
- [x] Conversation context integration

#### MCP Server
- [x] Query validation (valid params)
- [x] Query validation (invalid category)
- [x] Query validation (invalid timeframe)
- [x] Parameter sanitization
- [x] Result formatting
- [x] Timeout handling
- [x] Error propagation

#### Conversation Manager
- [x] Context extraction (< 10 messages)
- [x] Context extraction (> 10 messages, truncate)
- [x] Summarization with Gemini
- [x] Empty history handling
- [x] Message storage
- [x] Thread grouping

#### Chart Builder
- [x] Bar chart generation
- [x] Line chart generation
- [x] Pie chart generation
- [x] Data point limiting (max 20)
- [x] URL encoding
- [x] Service unavailable handling

---

## 3. Integration Testing

### 3.1 Integration Test Scenarios

#### Response Engine → MCP Server → BigQuery

```typescript
// __tests__/integration/query-flow.test.ts

describe('Query Flow Integration', () => {
  let responseEngine: ResponseEngine;
  let mcpServer: MCPServer;
  let testBigQuery: BigQuery;
  
  beforeAll(async () => {
    // Use test BQ dataset
    testBigQuery = new BigQuery({ projectId: 'fdsanalytics-test' });
    await setupTestData(testBigQuery);
    
    mcpServer = new MCPServer(testBigQuery);
    responseEngine = new ResponseEngine(mcpServer, ...);
  });
  
  it('should execute end-to-end sales query', async () => {
    const response = await responseEngine.handleChatMessage({
      workspaceId: 'test-workspace',
      userId: 'test-user',
      message: 'How are beer sales today?',
      messageId: 'msg-123',
      timestamp: '2025-10-22T10:00:00Z'
    });
    
    expect(response.text).toContain('Beer');
    expect(response.text).toMatch(/\$[\d,]+/);
  });
  
  it('should handle stored procedure execution', async () => {
    // Test that MCP server correctly calls BQ stored procedures
    const result = await mcpServer.callTool('query_analytics', {
      metric: 'net_sales',
      timeframe: { type: 'relative', relative: 'today' },
      filters: { primaryCategory: '(Beer)' },
      aggregation: 'sum'
    });
    
    expect(result.rows).toBeDefined();
    expect(result.rows[0]).toHaveProperty('total');
  });
});
```

#### Gmail Ingestion → Parser → BigQuery

```typescript
describe('Ingestion Flow Integration', () => {
  it('should ingest PMIX PDF and load to BigQuery', async () => {
    const pdfBuffer = fs.readFileSync('./test-data/pmix-sample.pdf');
    
    const result = await ingestionService.processReport({
      reportType: 'pmix',
      pdfBuffer,
      metadata: {
        messageId: 'test-msg-123',
        emailDate: new Date(),
        filename: 'pmix-sample.pdf',
        tenantId: 'test-tenant'
      }
    });
    
    expect(result.success).toBe(true);
    expect(result.rowsInserted).toBeGreaterThan(0);
    
    // Verify data in BQ
    const [rows] = await testBigQuery.query(`
      SELECT * FROM restaurant_analytics.reports
      WHERE report_id = '${result.reportId}'
    `);
    expect(rows).toHaveLength(1);
  });
  
  it('should be idempotent (no duplicates on re-process)', async () => {
    const pdfBuffer = fs.readFileSync('./test-data/pmix-sample.pdf');
    
    // Process once
    await ingestionService.processReport({ pdfBuffer, ... });
    
    // Process again (same PDF)
    await ingestionService.processReport({ pdfBuffer, ... });
    
    // Verify only one report exists
    const [rows] = await testBigQuery.query(`
      SELECT COUNT(*) as count FROM restaurant_analytics.reports
      WHERE report_date = DATE('2025-10-22')
    `);
    expect(rows[0].count).toBe(1);
  });
});
```

---

## 4. End-to-End Testing

### 4.1 E2E Test Scenarios

```typescript
// __tests__/e2e/user-flows.test.ts

describe('User Flows E2E', () => {
  let chatClient: GoogleChatClient;
  let testThreadId: string;
  
  beforeAll(async () => {
    chatClient = new GoogleChatClient(TEST_CREDENTIALS);
    testThreadId = await chatClient.createThread();
  });
  
  it('should complete setup flow', async () => {
    // 1. User runs /setup
    const setupResponse = await chatClient.sendMessage(testThreadId, '/setup');
    expect(setupResponse.text).toContain('Setup started');
    
    // 2. Wait for backfill to complete
    await waitForCondition(async () => {
      const statusResponse = await chatClient.sendMessage(testThreadId, '/status');
      return statusResponse.text.includes('completed');
    }, 300000);  // 5 minutes timeout
    
    // 3. Verify can query data
    const queryResponse = await chatClient.sendMessage(testThreadId, 'How are sales today?');
    expect(queryResponse.text).toMatch(/\$[\d,]+/);
  });
  
  it('should handle multi-turn conversation', async () => {
    // Turn 1: General query
    const response1 = await chatClient.sendMessage(testThreadId, 'How are sales this week?');
    expect(response1.text).toContain('this week');
    
    // Turn 2: Follow-up (should use context)
    const response2 = await chatClient.sendMessage(testThreadId, 'How about last week?');
    expect(response2.text).toContain('last week');
    expect(response2.text).toMatch(/vs|compared to/i);
    
    // Turn 3: Category drill-down
    const response3 = await chatClient.sendMessage(testThreadId, 'What about just beer?');
    expect(response3.text).toContain('Beer');
  });
});
```

---

## 5. Test Data

### 5.1 Mock Data Sets

#### Mock Reports
```typescript
// test-data/mock-reports.ts

export const MOCK_REPORTS = [
  {
    report_id: '2025-10-22-pmix-test',
    report_date: '2025-10-22',
    business_date: '2025-10-22',
    pdf_filename: 'test.pdf',
    location_name: 'Test Restaurant'
  },
  // ... more reports
];
```

#### Mock Metrics
```typescript
export const MOCK_METRICS = [
  {
    metric_id: '2025-10-22-pmix-test-001',
    report_id: '2025-10-22-pmix-test',
    metric_name: 'net_sales',
    metric_value: '$234.50',
    primary_category: '(Beer)',
    dimensions: {
      category: 'Draft Beer',
      item_name: 'IPA'
    }
  },
  {
    metric_id: '2025-10-22-pmix-test-002',
    report_id: '2025-10-22-pmix-test',
    metric_name: 'quantity_sold',
    metric_value: '15',
    primary_category: '(Beer)',
    dimensions: {
      category: 'Draft Beer',
      item_name: 'IPA'
    }
  },
  // ... more metrics
];
```

#### Mock Categories
```typescript
export const MOCK_CATEGORIES = {
  '(Beer)': ['Draft Beer', 'Bottle Beer', 'Can Beer'],
  '(Sushi)': ['Signature Rolls', 'Classic Rolls', 'Nigiri'],
  '(Food)': ['Starters', 'Entrees', 'Desserts']
};
```

### 5.2 Test BigQuery Dataset

**Setup Script:**
```sql
-- Create test dataset
CREATE SCHEMA IF NOT EXISTS `fdsanalytics-test.restaurant_analytics`;

-- Create tables (same schema as prod)
CREATE TABLE `fdsanalytics-test.restaurant_analytics.reports` AS
SELECT * FROM `fdsanalytics.restaurant_analytics.reports` WHERE FALSE;

CREATE TABLE `fdsanalytics-test.restaurant_analytics.metrics` AS
SELECT * FROM `fdsanalytics.restaurant_analytics.metrics` WHERE FALSE;

-- Load test data
INSERT INTO `fdsanalytics-test.restaurant_analytics.reports`
VALUES
  ('2025-10-22-test-001', DATE('2025-10-22'), DATE('2025-10-22'), CURRENT_TIMESTAMP(), 'test.pdf', 'pmix', 'Test Restaurant', 'test-001', NULL, NULL, 'test', '1.0'),
  ('2025-10-21-test-001', DATE('2025-10-21'), DATE('2025-10-21'), CURRENT_TIMESTAMP(), 'test2.pdf', 'pmix', 'Test Restaurant', 'test-001', NULL, NULL, 'test', '1.0');

-- Load test metrics
INSERT INTO `fdsanalytics-test.restaurant_analytics.metrics`
VALUES
  ('2025-10-22-test-001-001', '2025-10-22-test-001', 'net_sales', '$1000.00', '(Beer)', JSON '{"category": "Draft Beer", "item_name": "IPA"}', CURRENT_TIMESTAMP()),
  ('2025-10-22-test-001-002', '2025-10-22-test-001', 'quantity_sold', '50', '(Beer)', JSON '{"category": "Draft Beer", "item_name": "IPA"}', CURRENT_TIMESTAMP());
```

**Cleanup Script:**
```sql
-- Run after tests
DELETE FROM `fdsanalytics-test.restaurant_analytics.reports` WHERE TRUE;
DELETE FROM `fdsanalytics-test.restaurant_analytics.metrics` WHERE TRUE;
```

### 5.3 Sample PMIX PDFs

Store test PDFs in `test-data/pdfs/`:
- `pmix-simple.pdf` - Minimal valid report
- `pmix-complex.pdf` - Full report with all categories
- `pmix-malformed.pdf` - Invalid format (for error testing)
- `pmix-empty.pdf` - Empty PDF (for error testing)

---

## 6. Mocking Strategy

### 6.1 Mock External Services

```typescript
// __mocks__/@google-cloud/bigquery.ts

export class BigQuery {
  query = jest.fn();
  dataset = jest.fn(() => ({
    table: jest.fn(() => ({
      insert: jest.fn(),
      load: jest.fn()
    }))
  }));
}
```

```typescript
// __mocks__/@google/generative-ai.ts

export class GoogleGenerativeAI {
  getGenerativeModel = jest.fn(() => ({
    startChat: jest.fn(() => ({
      sendMessage: jest.fn(async (message) => ({
        response: {
          text: () => 'Mock Gemini response',
          functionCalls: () => []
        }
      }))
    }))
  }));
}
```

### 6.2 Mock Chart Service

```typescript
// __mocks__/chart-builder.ts

export class ChartBuilder {
  generate = jest.fn(async (spec: ChartSpec) => {
    return `https://mock-chart.url/${spec.type}`;
  });
  
  createChartCard = jest.fn((url: string) => ({
    header: { title: 'Chart' },
    sections: [{ widgets: [{ image: { imageUrl: url } }] }]
  }));
}
```

---

## 7. Test Scenarios by Component

### 7.1 Response Engine

| Scenario | Type | Priority |
|----------|------|----------|
| Handle simple query | Unit | High |
| Handle setup command | Integration | High |
| Handle status command | Integration | High |
| Multi-turn conversation | E2E | High |
| Invalid user input | Unit | Medium |
| Service degradation | Integration | Medium |

### 7.2 MCP Server

| Scenario | Type | Priority |
|----------|------|----------|
| Valid query parameters | Unit | High |
| Invalid category | Unit | High |
| Query timeout | Integration | High |
| Stored procedure execution | Integration | High |
| Result pagination | Unit | Medium |

### 7.3 Gmail Ingestion

| Scenario | Type | Priority |
|----------|------|----------|
| Parse valid PMIX | Unit | High |
| Parse malformed PDF | Unit | High |
| Idempotent processing | Integration | High |
| Backfill progress | Integration | High |
| Gmail API rate limit | Integration | Medium |

### 7.4 Conversation Manager

| Scenario | Type | Priority |
|----------|------|----------|
| Extract context (small history) | Unit | High |
| Extract context (large history) | Unit | High |
| Summarization | Integration | Medium |
| Store message | Integration | Medium |

---

## 8. Performance Testing

### 8.1 Load Testing

```typescript
// __tests__/load/response-engine.load.test.ts

describe('Response Engine Load Test', () => {
  it('should handle 10 concurrent requests', async () => {
    const requests = Array(10).fill(null).map((_, i) => 
      responseEngine.handleChatMessage({
        workspaceId: 'test',
        userId: `user-${i}`,
        message: 'How are sales today?',
        messageId: `msg-${i}`,
        timestamp: new Date().toISOString()
      })
    );
    
    const start = Date.now();
    const responses = await Promise.all(requests);
    const duration = Date.now() - start;
    
    expect(responses).toHaveLength(10);
    expect(responses.every(r => r.text.length > 0)).toBe(true);
    expect(duration).toBeLessThan(30000);  // < 30s for 10 requests
  });
});
```

### 8.2 Performance Benchmarks

| Operation | Target | Measured | Status |
|-----------|--------|----------|--------|
| Simple query | < 5s | TBD | - |
| Complex query | < 10s | TBD | - |
| Chart generation | < 2s | TBD | - |
| PDF parsing | < 5s | TBD | - |
| Backfill (100 PDFs) | < 10min | TBD | - |

---

## 9. Test Automation

### 9.1 CI/CD Pipeline

```yaml
# .github/workflows/test.yml

name: Test Suite

on: [push, pull_request]

jobs:
  unit-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - uses: actions/setup-node@v2
        with:
          node-version: '20'
      - run: npm ci
      - run: npm run test:unit
      - run: npm run test:coverage
  
  integration-tests:
    runs-on: ubuntu-latest
    needs: unit-tests
    steps:
      - uses: actions/checkout@v2
      - uses: actions/setup-node@v2
      - run: npm ci
      - run: npm run test:integration
    env:
      GOOGLE_APPLICATION_CREDENTIALS: ${{ secrets.GCP_SA_KEY }}
      PROJECT_ID: fdsanalytics-test
  
  e2e-tests:
    runs-on: ubuntu-latest
    needs: integration-tests
    if: github.ref == 'refs/heads/main'
    steps:
      - uses: actions/checkout@v2
      - uses: actions/setup-node@v2
      - run: npm ci
      - run: npm run test:e2e
    env:
      GOOGLE_APPLICATION_CREDENTIALS: ${{ secrets.GCP_SA_KEY }}
```

### 9.2 Pre-commit Hooks

```json
// package.json
{
  "husky": {
    "hooks": {
      "pre-commit": "npm run test:unit && npm run lint",
      "pre-push": "npm run test:coverage"
    }
  }
}
```

---

## 10. Test Coverage Reports

### 10.1 Coverage Configuration

```javascript
// jest.config.js
module.exports = {
  collectCoverageFrom: [
    'src/**/*.{js,ts}',
    '!src/**/*.d.ts',
    '!src/**/*.test.{js,ts}',
    '!src/**/index.{js,ts}'
  ],
  coverageThresholds: {
    global: {
      branches: 75,
      functions: 80,
      lines: 80,
      statements: 80
    },
    './src/core/': {
      branches: 85,
      functions: 90,
      lines: 90,
      statements: 90
    }
  }
};
```

### 10.2 Coverage Reports

Generate and view coverage:
```bash
npm run test:coverage
open coverage/lcov-report/index.html
```

---

## 11. Testing Checklist

### 11.1 Before Deployment

- [ ] All unit tests passing
- [ ] All integration tests passing
- [ ] E2E tests passing (critical flows)
- [ ] Coverage > 80%
- [ ] No high-priority bugs
- [ ] Performance benchmarks met
- [ ] Load tests passed
- [ ] Manual testing completed

### 11.2 Manual Test Cases

1. **Setup Flow**
   - [ ] Run /setup successfully
   - [ ] Backfill completes
   - [ ] Progress notifications received

2. **Query Flows**
   - [ ] Simple sales query
   - [ ] Category filtering
   - [ ] Date range query
   - [ ] Comparison query
   - [ ] Chart displayed correctly

3. **Error Handling**
   - [ ] Invalid category error
   - [ ] Ambiguous query clarification
   - [ ] Service degradation (chart failure)
   - [ ] Query timeout handling

4. **Conversation**
   - [ ] Multi-turn conversation works
   - [ ] Context maintained
   - [ ] Follow-up questions understood

---

**Document Version:** 1.0  
**Last Updated:** October 22, 2025  
**Dependencies:** All previous documents
