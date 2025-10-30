# Project Structure
## Senso Restaurant Analytics - Version 1.0

**Purpose:** Define the complete directory structure, file organization, and code layout.

---

## 1. Root Directory Structure

```
restaurant-analytics/
├── .github/
│   └── workflows/
│       ├── test.yml
│       ├── deploy.yml
│       └── lint.yml
│
├── services/
│   ├── response-engine/          # Main orchestrator (Cloud Run)
│   ├── conversation-manager/     # Chat history manager (Cloud Run)
│   └── gmail-ingestion/          # PMIX PDF parser (Cloud Function)
│
├── shared/
│   ├── types/
│   ├── utils/
│   ├── constants/
│   └── errors/
│
├── sql/
│   ├── stored-procedures/
│   └── migrations/
│
├── scripts/
│   ├── setup/
│   ├── deploy/
│   └── utilities/
│
├── docs/
│   ├── architecture/
│   ├── api/
│   └── runbooks/
│
├── test-data/
│   ├── pdfs/
│   ├── mock-data/
│   └── fixtures/
│
├── .env.development.template
├── .env.production.template
├── .gitignore
├── package.json
├── tsconfig.json
├── jest.config.js
├── docker-compose.yml
└── README.md
```

---

## 2. Service: response-engine

```
services/response-engine/
├── src/
│   ├── index.ts                      # Entry point (Cloud Run)
│   ├── server.ts                     # HTTP server setup
│   │
│   ├── handlers/
│   │   ├── chatMessage.handler.ts    # Handle chat messages
│   │   ├── setup.handler.ts          # Handle /setup command
│   │   └── status.handler.ts         # Handle /status command
│   │
│   ├── core/
│   │   ├── ResponseEngine.ts         # Main orchestrator
│   │   ├── TenantResolver.ts         # Resolve tenant config
│   │   └── ResponseFormatter.ts      # Format for Google Chat
│   │
│   ├── clients/
│   │   ├── GeminiClient.ts           # Vertex AI Gemini integration
│   │   ├── ConversationClient.ts     # Call conversation manager
│   │   └── GoogleChatClient.ts       # Send messages to Chat
│   │
│   ├── tools/
│   │   ├── AnalyticsToolHandler.ts   # Execute intent functions via BQ
│   │   └── intentFunctions.ts        # 8 intent function definitions
│   │
│   └── config/
│       ├── config.ts                 # Load environment config
│       └── tenantConfig.ts           # Single-tenant hardcoded config
│
├── __tests__/
│   ├── unit/
│   │   ├── ResponseEngine.test.ts
│   │   └── TenantResolver.test.ts
│   │
│   ├── integration/
│   │   └── chatMessage.integration.test.ts
│   │
│   └── fixtures/
│       └── mockMessages.ts
│
├── Dockerfile
├── package.json
├── tsconfig.json
└── README.md
```

**Key Files:**

### src/index.ts
```typescript
import express from 'express';
import { handleChatMessage } from './handlers/chatMessage.handler';
import { handleSetupCommand } from './handlers/setup.handler';
import { handleStatusCommand } from './handlers/status.handler';

const app = express();
app.use(express.json());

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'healthy' });
});

// Chat webhook
app.post('/webhook', async (req, res) => {
  try {
    const message = req.body.message;
    
    // Route commands
    if (message.text.startsWith('/setup')) {
      const response = await handleSetupCommand(req.body);
      return res.json(response);
    }
    
    if (message.text.startsWith('/status')) {
      const response = await handleStatusCommand(req.body);
      return res.json(response);
    }
    
    // Regular message
    const response = await handleChatMessage(req.body);
    res.json(response);
  } catch (error) {
    console.error('Error handling message', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

const port = process.env.PORT || 8080;
app.listen(port, () => {
  console.log(`Response Engine listening on port ${port}`);
});
```

### src/core/ResponseEngine.ts
```typescript
import { AnalyticsToolHandler } from '../clients/AnalyticsToolHandler';
import { ConversationClient } from '../clients/ConversationClient';
import { ResponseGenerator } from './ResponseGenerator';
import { TenantResolver } from './TenantResolver';

export class ResponseEngine {
  constructor(
    private analyticsHandler: AnalyticsToolHandler,
    private conversationClient: ConversationClient,
    private tenantResolver: TenantResolver
  ) {}
  
  async handleMessage(request: ChatMessageRequest): Promise<ChatMessageResponse> {
    // 1. Resolve tenant
    const tenantConfig = await this.tenantResolver.resolveTenant(
      request.workspaceId,
      request.userId
    );
    
    if (!tenantConfig) {
      return {
        text: 'Please run /setup first to configure your account.',
        threadId: request.threadId,
        responseType: 'NEW_MESSAGE'
      };
    }
    
    // 2. Get conversation context
    const context = await this.conversationClient.getContext(
      request.userId,
      request.threadId,
      request.message
    );
    
    // 3. Generate response
    const generator = new ResponseGenerator(this.analyticsHandler);
    const result = await generator.generate({
      userMessage: request.message,
      context,
      tenantConfig,
      currentDateTime: new Date(),
      availableCategories: await this.getAvailableCategories(tenantConfig)
    });
    
    // 4. Format for Google Chat
    return this.formatResponse(result, request.threadId);
  }
}
```

---

## 3. Service: conversation-manager

```
services/conversation-manager/
├── src/
│   ├── index.ts
│   ├── server.ts
│   │
│   ├── core/
│   │   ├── ConversationManager.ts    # Main logic
│   │   └── ContextSummarizer.ts      # Gemini-based summarization
│   │
│   ├── storage/
│   │   └── BigQueryStorage.ts        # Store/retrieve messages
│   │
│   └── config/
│       └── config.ts
│
├── __tests__/
│   ├── ConversationManager.test.ts
│   └── ContextSummarizer.test.ts
│
├── Dockerfile
├── package.json
└── README.md
```

---

## 4. Service: gmail-ingestion

```
services/gmail-ingestion/
├── src/
│   ├── index.ts                      # Entry point (Cloud Function)
│   │
│   ├── core/
│   │   ├── IngestionService.ts       # Main orchestrator
│   │   ├── BackfillService.ts        # Historical backfill
│   │   └── ReportProcessor.ts        # Process single report
│   │
│   ├── gmail/
│   │   ├── GmailClient.ts            # Gmail API wrapper
│   │   └── OAuth.ts                  # OAuth token management
│   │
│   ├── parsers/
│   │   ├── PmixParser.ts             # Parse PMIX PDFs
│   │   └── BaseParser.ts             # Abstract parser
│   │
│   ├── bigquery/
│   │   ├── BigQueryClient.ts
│   │   └── IngestionLogger.ts        # Log to ingestion_log table
│   │
│   └── config/
│       └── config.ts
│
├── __tests__/
│   ├── unit/
│   │   ├── PmixParser.test.ts
│   │   └── IngestionService.test.ts
│   │
│   └── integration/
│       └── gmail-to-bigquery.test.ts
│
├── package.json
└── README.md
```

**Key Files:**

### src/index.ts (Cloud Function)
```typescript
import { IngestionService } from './core/IngestionService';

export async function ingestReports(message: PubSubMessage, context: Context) {
  const ingestionService = new IngestionService();
  
  try {
    const result = await ingestionService.ingestNewReports('senso-sushi');
    
    console.log('Ingestion complete', {
      totalProcessed: result.totalProcessed,
      successCount: result.successCount,
      failedCount: result.failedCount
    });
  } catch (error) {
    console.error('Ingestion failed', error);
    throw error;  // Retry via Pub/Sub
  }
}
```

---

## 5. Shared Code

```
shared/
├── types/
│   ├── chat.types.ts                 # Google Chat message types
│   ├── bigquery.types.ts             # BQ result types
│   ├── tenant.types.ts               # Tenant config types
│   ├── analytics.types.ts                  # Direct BigQuery types
│   └── index.ts                      # Re-export all
│
├── utils/
│   ├── logger.ts                     # Structured logging
│   ├── retry.ts                      # Retry with backoff
│   ├── dateUtils.ts                  # Date manipulation
│   ├── currencyUtils.ts              # Format currency
│   └── index.ts
│
├── constants/
│   ├── errorCodes.ts                 # Error code constants
│   ├── timeframes.ts                 # Timeframe constants
│   └── index.ts
│
├── errors/
│   ├── AppError.ts                   # Base error class
│   ├── UserInputError.ts             # User input errors
│   ├── TransientError.ts             # Retryable errors
│   └── index.ts
│
└── package.json                      # Shared dependencies
```

**Key Files:**

### shared/types/chat.types.ts
```typescript
export interface ChatMessageRequest {
  workspaceId: string;
  userId: string;
  message: string;
  threadId?: string;
  messageId: string;
  timestamp: string;
}

export interface ChatMessageResponse {
  text: string;
  cards?: Card[];
  threadId: string;
  responseType: 'NEW_MESSAGE' | 'UPDATE_MESSAGE';
}

export interface Card {
  header?: { title: string; subtitle?: string };
  sections: Section[];
}

export interface Section {
  widgets: Widget[];
}

export type Widget = TextWidget | ImageWidget | ButtonWidget;

export interface TextWidget {
  textParagraph: { text: string };
}

export interface ImageWidget {
  image: {
    imageUrl: string;
    altText: string;
  };
}

export interface ButtonWidget {
  buttons: Array<{
    textButton: {
      text: string;
      onClick: { openLink: { url: string } };
    };
  }>;
}
```

### shared/utils/logger.ts
```typescript
export interface LogEntry {
  severity: 'DEBUG' | 'INFO' | 'WARNING' | 'ERROR' | 'CRITICAL';
  message: string;
  timestamp: string;
  component: string;
  tenantId?: string;
  userId?: string;
  requestId?: string;
  metadata?: Record<string, any>;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
}

export class Logger {
  constructor(private component: string) {}
  
  info(message: string, metadata?: Record<string, any>) {
    this.log('INFO', message, metadata);
  }
  
  error(message: string, error?: Error, metadata?: Record<string, any>) {
    this.log('ERROR', message, metadata, error);
  }
  
  private log(
    severity: LogEntry['severity'],
    message: string,
    metadata?: Record<string, any>,
    error?: Error
  ) {
    const entry: LogEntry = {
      severity,
      message,
      timestamp: new Date().toISOString(),
      component: this.component,
      metadata,
      error: error ? {
        name: error.name,
        message: error.message,
        stack: error.stack
      } : undefined
    };
    
    // Cloud Logging automatically parses JSON
    console.log(JSON.stringify(entry));
  }
}
```

---

## 6. Scripts

```
scripts/
├── setup/
│   ├── create-service-accounts.sh    # Create all service accounts
│   ├── grant-iam-permissions.sh      # Grant IAM bindings
│   ├── create-bigquery-datasets.sh   # Create BQ datasets
│   ├── deploy-stored-procedures.sh   # Deploy SQL stored procedures
│   └── create-secrets.sh             # Create secrets in Secret Manager
│
├── deploy/
│   ├── deploy-all.sh                 # Deploy all services
│   ├── deploy-conversation-manager.sh
│   └── deploy-gmail-ingestion.sh
│
└── utilities/
    ├── test-ingestion.sh             # Manually trigger ingestion
    ├── check-logs.sh                 # Tail recent logs
    ├── rollback-service.sh           # Rollback to previous version
    └── export-bigquery-data.sh       # Backup data to GCS
```

**Key Script:**

### scripts/deploy/deploy-all.sh
```bash
#!/bin/bash
set -e

PROJECT_ID="fdsanalytics"
REGION="us-central1"

echo "🚀 Deploying all services..."

# 1. Deploy Conversation Manager (no dependencies)
echo "💬 Deploying Conversation Manager..."
./scripts/deploy/deploy-conversation-manager.sh

# 2. Deploy Response Engine (depends on Conversation Manager)
echo "🤖 Deploying Response Engine..."
./scripts/deploy/deploy-response-engine.sh

# 3. Deploy Gmail Ingestion (independent)
echo "📧 Deploying Gmail Ingestion..."
./scripts/deploy/deploy-gmail-ingestion.sh

echo "✅ All 3 services deployed successfully!"

# Print service URLs
echo ""
echo "📋 Service URLs:"
echo "Response Engine: $(gcloud run services describe response-engine --region $REGION --format 'value(status.url)')"
echo "Conversation Manager: $(gcloud run services describe conversation-manager --region $REGION --format 'value(status.url)')"
```

---

## 7. Documentation

```
docs/
├── architecture/
│   ├── system-overview.md
│   ├── data-flow.md
│   └── security-model.md
│
├── api/
│   ├── response-engine-api.md
│   ├── analytics-protocol.md
│   └── google-chat-webhook.md
│
└── runbooks/
    ├── deployment.md
    ├── rollback.md
    ├── troubleshooting.md
    └── monitoring.md
```

---

## 8. Configuration Files

### package.json (Root)
```json
{
  "name": "restaurant-analytics",
  "version": "1.0.0",
  "private": true,
  "workspaces": [
    "services/*",
    "shared"
  ],
  "scripts": {
    "dev": "docker-compose up",
    "test": "npm run test:unit && npm run test:integration",
    "test:unit": "jest --testPathPattern='__tests__/unit'",
    "test:integration": "jest --testPathPattern='__tests__/integration'",
    "test:e2e": "jest --testPathPattern='__tests__/e2e'",
    "test:coverage": "jest --coverage",
    "lint": "eslint . --ext .ts",
    "build": "npm run build --workspaces",
    "deploy": "./scripts/deploy/deploy-all.sh"
  },
  "devDependencies": {
    "@types/jest": "^29.5.0",
    "@types/node": "^20.0.0",
    "@typescript-eslint/eslint-plugin": "^6.0.0",
    "@typescript-eslint/parser": "^6.0.0",
    "eslint": "^8.0.0",
    "jest": "^29.5.0",
    "ts-jest": "^29.1.0",
    "typescript": "^5.0.0"
  }
}
```

### tsconfig.json (Root)
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "commonjs",
    "lib": ["ES2022"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "**/*.test.ts", "dist"]
}
```

### jest.config.js
```javascript
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/services', '<rootDir>/shared'],
  testMatch: ['**/__tests__/**/*.test.ts'],
  collectCoverageFrom: [
    'services/*/src/**/*.ts',
    'shared/*/src/**/*.ts',
    '!**/*.d.ts',
    '!**/node_modules/**'
  ],
  coverageThresholds: {
    global: {
      branches: 75,
      functions: 80,
      lines: 80,
      statements: 80
    }
  }
};
```

### docker-compose.yml
```yaml
version: '3.8'

services:
  response-engine:
    build: ./services/response-engine
    ports:
      - "3000:8080"
    environment:
      - PROJECT_ID=fdsanalytics-test
      - ENVIRONMENT=development
    volumes:
      - ./services/response-engine:/app
      - /app/node_modules

  conversation-manager:
    build: ./services/conversation-manager
    ports:
      - "3001:8080"
    environment:
      - PROJECT_ID=fdsanalytics-test

  # Note: gmail-ingestion is a Cloud Function, not included in docker-compose
```

---

## 9. File Naming Conventions

### TypeScript Files
- **Classes:** PascalCase - `ResponseEngine.ts`
- **Interfaces:** PascalCase - `TenantConfig.ts`
- **Functions/Utils:** camelCase - `formatCurrency.ts`
- **Constants:** UPPER_SNAKE_CASE - `ERROR_CODES.ts`
- **Types:** camelCase with .types suffix - `chat.types.ts`

### Test Files
- Unit tests: `*.test.ts`
- Integration tests: `*.integration.test.ts`
- E2E tests: `*.e2e.test.ts`

### Scripts
- Make executable: `chmod +x scripts/**/*.sh`

### Documentation
- Markdown: kebab-case - `system-overview.md`

---

## 10. Import Patterns

### Absolute Imports (Use Path Aliases)
```typescript
// tsconfig.json
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@shared/*": ["shared/*/src"],
      "@response-engine/*": ["services/response-engine/src/*"]
    }
  }
}

// Usage
import { Logger } from '@shared/utils';
import { ChatMessageRequest } from '@shared/types';
import { ResponseEngine } from '@response-engine/core/ResponseEngine';
```

### Shared Code
```typescript
// Good: Import from shared package
import { Logger, retry } from '@shared/utils';

// Bad: Don't duplicate utility code across services
```

---

## 11. Environment-Specific Files

```
.env.development          # Local development (gitignored)
.env.development.template # Template for local setup (committed)
.env.production           # Production (never committed)
.env.test                 # Test environment (gitignored)
```

---

**Document Version:** 1.0  
**Last Updated:** October 22, 2025  
**Dependencies:** All previous documents
