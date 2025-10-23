# @fdsanalytics/shared

Shared types, utilities, and error classes for the restaurant analytics system.

## Installation

This is a local package meant to be used within the restaurant-analytics monorepo.

```bash
npm install
npm run build
```

## Package Structure

```
shared/
├── types/              # TypeScript type definitions
│   ├── api.types.ts    # API contracts and interfaces
│   ├── bigquery.types.ts  # BigQuery-specific types
│   ├── conversation.types.ts  # Conversation/message types
│   ├── config.types.ts # Configuration types
│   └── logging.types.ts # Logging types
├── utils/              # Utility functions
│   ├── logger.ts       # Structured JSON logger
│   ├── retry.ts        # Retry logic with exponential backoff
│   ├── date.ts         # Date formatting and manipulation
│   └── currency.ts     # Currency formatting utilities
├── errors/             # Error classes
│   ├── AppError.ts     # Base error class
│   ├── UserInputError.ts  # User input validation errors
│   └── TransientError.ts  # Retryable errors
├── constants/          # Application constants
│   └── index.ts        # Error codes, timeframes, etc.
└── __tests__/          # Unit tests
```

## Usage Examples

### Logger

```typescript
import { createLogger } from '@fdsanalytics/shared';

const logger = createLogger('my-service');

// Info logging
logger.info('User query processed', {
  userId: 'user123',
  requestId: 'req-abc',
  durationMs: 245
});

// Error logging with error object
try {
  throw new Error('Something went wrong');
} catch (error) {
  logger.error('Query execution failed', error, {
    query: 'SELECT * FROM ...',
    tenantId: 'tenant-123'
  });
}

// All logs output structured JSON for Cloud Logging
```

**Output:**
```json
{
  "severity": "INFO",
  "message": "User query processed",
  "timestamp": "2025-10-22T10:30:00.123Z",
  "component": "my-service",
  "userId": "user123",
  "requestId": "req-abc",
  "durationMs": 245,
  "metadata": {
    "userId": "user123",
    "requestId": "req-abc",
    "durationMs": 245
  }
}
```

### Retry Logic

```typescript
import { retryWithBackoff, DEFAULT_RETRY_CONFIG } from '@fdsanalytics/shared';

// Basic usage with default config (3 retries, exponential backoff)
const result = await retryWithBackoff(async () => {
  return await someApiCall();
});

// Custom retry configuration
const customConfig = {
  maxRetries: 5,
  initialDelayMs: 2000,
  maxDelayMs: 30000,
  backoffMultiplier: 2,
  jitterMs: 500
};

const result = await retryWithBackoff(
  async () => await bigQueryQuery(),
  customConfig,
  (attempt, error) => {
    console.log(`Retry attempt ${attempt}, error: ${error.message}`);
  }
);

// Automatically skips retry for UserInputError
import { UserInputError } from '@fdsanalytics/shared';

try {
  await retryWithBackoff(async () => {
    throw new UserInputError('Invalid category', 'INVALID_CATEGORY');
  });
} catch (error) {
  // No retries attempted - fails immediately
}
```

### Error Classes

```typescript
import { AppError, UserInputError, TransientError } from '@fdsanalytics/shared';

// Base error
throw new AppError('Something went wrong', 'INTERNAL_ERROR', {
  context: 'additional info'
});

// User input error with suggestions
throw new UserInputError(
  'Category not found',
  'INVALID_CATEGORY',
  { provided: 'Beers' },
  ['Beer', 'Wine', 'Liquor']
);

// Transient error with retry info
throw new TransientError(
  'Service unavailable',
  'SERVICE_UNAVAILABLE',
  { service: 'bigquery' },
  5000,  // retryAfterMs
  2,     // current attempt
  3      // max attempts
);

// All errors can be serialized to JSON
const error = new UserInputError('Invalid input', 'INVALID_CATEGORY');
console.log(error.toJSON());
// {
//   error: true,
//   code: 'INVALID_CATEGORY',
//   message: 'Invalid input',
//   details: undefined,
//   timestamp: '2025-10-22T10:30:00.123Z',
//   suggestions: undefined
// }
```

### Date Utilities

```typescript
import {
  formatDate,
  formatDateTime,
  parseDate,
  addDays,
  subtractDays,
  getStartOfDay,
  getEndOfDay,
  getDayOfWeek
} from '@fdsanalytics/shared';

const date = new Date('2025-10-22T14:30:00Z');

// Format as YYYY-MM-DD
formatDate(date); // "2025-10-22"

// Format with timezone
formatDateTime(date, 'America/Chicago'); // "10/22/2025, 09:30:00"

// Parse date string
const parsed = parseDate('2025-10-22'); // Date object

// Date manipulation
const future = addDays(date, 7); // Oct 29, 2025
const past = subtractDays(date, 7); // Oct 15, 2025

// Start/end of day
const start = getStartOfDay(date); // 2025-10-22 00:00:00.000
const end = getEndOfDay(date);     // 2025-10-22 23:59:59.999

// Get day of week
getDayOfWeek(date); // "Wednesday"
```

### Currency Utilities

```typescript
import {
  formatCurrency,
  parseCurrencyString,
  formatPercentage,
  calculatePercentageChange
} from '@fdsanalytics/shared';

// Format as USD currency
formatCurrency(1234.56); // "$1,234.56"
formatCurrency(1234.56, 'EUR'); // "€1,234.56" (locale-dependent)

// Parse currency string
parseCurrencyString('$1,234.56'); // 1234.56
parseCurrencyString('1234.56');   // 1234.56

// Format percentage
formatPercentage(12.5); // "12.5%"
formatPercentage(12.567, 2); // "12.57%"

// Calculate percentage change
calculatePercentageChange(150, 100); // 50 (50% increase)
calculatePercentageChange(75, 100);  // -25 (25% decrease)
```

### Type Definitions

```typescript
import {
  ChatMessageRequest,
  ChatMessageResponse,
  TenantConfig,
  QueryAnalyticsParams,
  LogEntry
} from '@fdsanalytics/shared';

// Use types for type safety
const request: ChatMessageRequest = {
  workspaceId: 'workspace-123',
  userId: 'user-456',
  message: 'What were sales today?',
  messageId: 'msg-789',
  timestamp: new Date().toISOString()
};

const tenantConfig: TenantConfig = {
  tenantId: 'senso-sushi',
  businessName: 'Senso Sushi',
  bqProject: 'fdsanalytics',
  bqDataset: 'restaurant_analytics',
  timezone: 'America/Chicago',
  currency: 'USD',
  createdAt: new Date(),
  status: 'active'
};
```

### Constants

```typescript
import { ERROR_CODES, TIMEFRAMES, DEFAULT_VALUES } from '@fdsanalytics/shared';

// Error codes
if (error.code === ERROR_CODES.INVALID_CATEGORY) {
  // Handle invalid category
}

// Timeframes
const timeframe = TIMEFRAMES.TODAY; // 'today'

// Default values
const timezone = DEFAULT_VALUES.TIMEZONE; // 'America/Chicago'
const maxRetries = DEFAULT_VALUES.MAX_RETRIES; // 3
```

## Development

### Running Tests

```bash
# Run all tests
npm test

# Run tests with coverage
npm run test:coverage

# Run tests in watch mode
npm run test:watch
```

### Building

```bash
# Compile TypeScript
npm run build

# The compiled output will be in the dist/ directory
```

### Linting

```bash
# Run ESLint
npm run lint

# Fix auto-fixable issues
npm run lint:fix
```

## Test Coverage

All utility functions have 100% test coverage:

- Logger: 100% coverage
- Retry logic: 100% coverage
- Date utilities: 100% coverage
- Currency utilities: 100% coverage
- Error classes: 100% coverage

## Design Principles

### TypeScript Strict Mode
All code is written with TypeScript strict mode enabled for maximum type safety.

### No External Dependencies
The shared package has zero runtime dependencies to ensure it can be used across all services without conflicts.

### Comprehensive Testing
Every utility function has comprehensive unit tests with edge cases covered.

### Follows Specifications
All implementations strictly follow the specifications defined in:
- `docs/02-api-contracts.md` - API contracts and logging standards
- `docs/05-error-handling.md` - Error types and retry logic
- `docs/08-project-structure.md` - Project structure and organization

## License

ISC
