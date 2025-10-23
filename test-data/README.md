# Test Data and Fixtures

This directory contains test data, fixtures, and scripts for integration and E2E testing.

## Directory Structure

```
test-data/
├── fixtures/          # Mock data and responses
│   ├── sample-pmix-data.json          # Sample PMIX report data
│   ├── sample-bq-results.json         # Sample BigQuery query results
│   ├── sample-chat-messages.json      # Sample Google Chat messages
│   └── mock-gemini-responses.json     # Mock Gemini AI responses
├── scripts/           # Test dataset management scripts
│   ├── setup-test-dataset.sh          # Create test BQ datasets and tables
│   ├── seed-test-data.sh              # Populate test data
│   └── cleanup-test-data.sh           # Remove test data
└── README.md          # This file
```

## Setup Instructions

### 1. Create Test BigQuery Dataset

The test dataset uses a separate GCP project to avoid polluting production data:

```bash
export PROJECT_ID=fdsanalytics-test
cd test-data/scripts
./setup-test-dataset.sh
```

This creates the following datasets:
- `restaurant_analytics` - Raw data (reports, metrics)
- `insights` - Pre-computed analytics
- `ingestion` - Ingestion logs
- `chat_history` - Conversation history

### 2. Seed Test Data

Populate the test datasets with sample data:

```bash
./seed-test-data.sh
```

This inserts:
- 5 test reports (Oct 14-22, 2025)
- ~20 metrics across categories (Beer, Sushi, Food)
- 4 conversation messages
- Pre-computed insights (comparisons, trends, forecasts)

### 3. Run Tests

Integration and E2E tests will use the test dataset:

```bash
# From project root
npm run test:integration
npm run test:e2e
```

### 4. Cleanup (Optional)

Remove all test data when done:

```bash
cd test-data/scripts
./cleanup-test-data.sh
```

## Test Data Details

### Sample PMIX Data

`fixtures/sample-pmix-data.json` contains a mock PMIX report with:
- Report metadata (ID, dates, location)
- 5 metrics (sales + quantity for Beer, Sushi, Food)
- Two-level category hierarchy

### Sample BigQuery Results

`fixtures/sample-bq-results.json` contains mock query results for:
- Simple sales queries (total sales)
- Category breakdown queries
- Comparison queries (today vs yesterday)
- Trend queries (week-over-week)
- Forecast queries (7-day predictions)

### Sample Chat Messages

`fixtures/sample-chat-messages.json` contains:
- 4-message conversation thread
- User and bot messages
- Conversation context object (for Conversation Manager tests)

### Mock Gemini Responses

`fixtures/mock-gemini-responses.json` contains Gemini AI responses for:
- Simple sales queries
- Category breakdowns
- Comparisons and trends
- Forecasts
- Context summarization
- Error scenarios (invalid category)

## Usage in Tests

### Integration Tests

Integration tests use the test BigQuery dataset:

```typescript
const testBQ = new BigQuery({
  projectId: process.env.TEST_PROJECT_ID || 'fdsanalytics-test'
});
```

### E2E Tests

E2E tests load fixtures for mocking external services:

```typescript
import mockGeminiResponses from '../test-data/fixtures/mock-gemini-responses.json';

// Mock Gemini API
jest.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: jest.fn(() => ({
    getGenerativeModel: jest.fn(() => ({
      generateContent: jest.fn(() =>
        Promise.resolve({ response: { text: () => mockGeminiResponses.simple_sales_response.text } })
      )
    }))
  }))
}));
```

## Environment Variables

Set these environment variables for testing:

```bash
export TEST_PROJECT_ID=fdsanalytics-test
export NODE_ENV=test
export GEMINI_API_KEY=test-key  # Not used (mocked in tests)
```

## Notes

- Test data is isolated from production
- All test data uses `source='test'` for easy identification
- BigQuery test tables use the same schema as production
- Test datasets can be recreated anytime using setup scripts
- Integration tests may incur small BigQuery costs (<$0.10/run)

## Troubleshooting

**Error: Dataset already exists**
- This is normal. The setup script will skip existing datasets.

**Error: Permission denied**
- Ensure your GCP credentials have BigQuery admin access
- Run `gcloud auth application-default login`

**Error: Table not found during tests**
- Run `./setup-test-dataset.sh` to create tables
- Run `./seed-test-data.sh` to populate data

**Tests fail with "no data found"**
- Verify test data was seeded: `bq query "SELECT COUNT(*) FROM \`fdsanalytics-test.restaurant_analytics.reports\`"`
- Re-run `./seed-test-data.sh` if needed
