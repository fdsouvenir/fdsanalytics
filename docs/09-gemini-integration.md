# Gemini Integration with Vertex AI
## Senso Restaurant Analytics - Version 1.0

**Purpose:** Document the Vertex AI Gemini integration architecture, hybrid function calling approach, and thinking mode implementation.

---

## 1. Overview

This system uses **Google Cloud Vertex AI** (not the Generative AI SDK) to integrate with Gemini models. This approach provides:
- Application Default Credentials (no API key management)
- Regional endpoint optimization (us-central1)
- Enterprise-grade reliability and quotas
- Seamless GCP service integration

**Key Implementation:** `services/response-engine/src/clients/GeminiClient.ts`

---

## 2. Vertex AI Setup

### 2.1 Client Initialization

```typescript
import { VertexAI } from '@google-cloud/vertexai';

export class GeminiClient {
  private vertexAI: VertexAI;
  private readonly location = 'us-central1';

  constructor(
    private projectId: string,
    private geminiSecretName: string,  // Kept for backwards compatibility but not used
    private modelName: string = 'gemini-2.5-pro'
  ) {
    // Initialize Vertex AI with regional endpoint
    this.vertexAI = new VertexAI({
      project: this.projectId,
      location: this.location
    });
  }
}
```

**Important Notes:**
- Uses Application Default Credentials automatically
- `geminiSecretName` parameter is legacy and unused (kept for backwards compatibility)
- No API key loading from Secret Manager required
- Regional endpoint ensures low latency with Cloud Run and BigQuery

### 2.2 Authentication

**Development:**
```bash
gcloud auth application-default login
```

**Production:**
Service account automatically has ADC via Cloud Run environment.

---

## 3. Model Selection

### 3.1 Current Model: gemini-2.5-flash

**Primary Model:** `gemini-2.5-flash` (used in ResponseGenerator.ts:128)

**Characteristics:**
- Fast response times (<2s typical)
- Cost-effective for high-volume analytics queries
- Excellent function calling accuracy
- Supports thinking mode

**Usage:**
```typescript
const chatResult = await this.geminiClient.generateWithFunctionCalling({
  userMessage: input.userMessage,
  systemInstruction: systemInstruction,
  conversationHistory: conversationHistory,
  availableFunctions: INTENT_FUNCTIONS.map(fn => ({
    name: fn.name,
    description: fn.description,
    parameters: fn.parameters
  }))
}, async (functionName: string, functionArgs: Record<string, any>) => {
  return await this.analyticsToolHandler.execute(functionName, functionArgs);
}, 'gemini-2.5-flash');  // Model specified here
```

### 3.2 Model Naming Convention

**✅ Correct:**
- `gemini-2.5-flash` (stable, auto-updates)
- `gemini-2.5-pro` (stable, auto-updates)
- `gemini-2.0-flash` (stable, auto-updates)

**❌ Incorrect (DO NOT USE):**
- `gemini-2.5-flash-20250122` (date-suffixed versions)
- `gemini-1.5-pro` (deprecated 1.x versions)
- Any model without explicit Vertex AI availability

---

## 4. Hybrid Stateless-Then-Stateful Function Calling

### 4.1 The Problem

Traditional Gemini function calling has two approaches:
1. **Stateless (mode: ANY)** - Forces function call but loses chat state
2. **Stateful (mode: AUTO)** - Maintains chat but may skip function calls

### 4.2 The Solution: Hybrid Approach

The implementation uses a **two-phase approach** to get the best of both:

**Phase 1: Force Function Call (Stateless)**
```typescript
// Step 1: Create model with mode: ANY to force function call
const modelConfigWithAny: any = {
  model: modelToUse,
  systemInstruction: { parts: [{ text: input.systemInstruction }] },
  generationConfig: {
    temperature: 1,
    topP: 0.95,
    thinkingConfig: {
      thinkingBudget: 1024,
      includeThoughts: true
    }
  },
  tools: [{ functionDeclarations }],
  toolConfig: {
    functionCallingConfig: {
      mode: 'ANY'  // Force function call on this turn only
    }
  }
};

const result1 = await modelForFirstCall.generateContent({
  contents: [...history, { role: 'user', parts: [{ text: input.userMessage }] }]
});
```

**Phase 2: Get Final Response (Stateful)**
```typescript
// Step 2: Execute the function
const functionResult = await executeFunction(functionCall.name, functionCall.args);

// Step 3: Create NEW chat session with mode: AUTO (default)
const modelConfigForFinal: any = {
  model: modelToUse,
  systemInstruction: { parts: [{ text: input.systemInstruction }] },
  generationConfig: { temperature: 1, topP: 0.95 },
  tools: [{ functionDeclarations }]
  // NO toolConfig = defaults to mode: AUTO
};

const chatForFinalResponse = modelForFinalResponse.startChat({
  history: [
    ...history,
    { role: 'user', parts: [{ text: input.userMessage }] },
    { role: 'model', parts: [functionCallParts] }
  ]
});

// Send function results to get natural language response
const result2 = await chatForFinalResponse.sendMessage(functionResponseParts);
```

### 4.3 Benefits

✅ **Guaranteed function calls** - mode: ANY ensures analytics query is executed
✅ **Natural responses** - mode: AUTO allows Gemini to craft conversational replies
✅ **Context preservation** - Full history maintained across both phases
✅ **Reliable execution** - No "I can't help with that" responses

### 4.4 Implementation Location

**File:** `services/response-engine/src/clients/GeminiClient.ts`
**Method:** `generateWithFunctionCalling()`
**Lines:** 469-746

---

## 5. Thinking Mode

### 5.1 What is Thinking Mode?

Gemini 2.5 Flash supports a "thinking mode" where it can show its reasoning process before providing the final answer. This improves:
- Function calling accuracy
- Complex query understanding
- Parameter extraction quality

### 5.2 Configuration

**Enabled in all Gemini calls:**
```typescript
generationConfig: {
  temperature: 1,
  topP: 0.95,
  thinkingConfig: {
    thinkingBudget: 1024,  // Max tokens for thinking
    includeThoughts: true   // Return thinking in response
  }
}
```

### 5.3 Extracting Thinking vs Answer

Responses contain two types of parts:
- **Thinking parts:** `part.thought === true` - Internal reasoning (for logging)
- **Answer parts:** `part.thought === undefined` - Final response (for users)

**Implementation:**
```typescript
private extractThinkingAndAnswer(candidates: any[]): {
  thinkingSummaries: string[];
  answerText: string;
} {
  const thinkingSummaries: string[] = [];
  const answerParts: string[] = [];

  if (candidates.length === 0 || !candidates[0].content?.parts) {
    return { thinkingSummaries, answerText: '' };
  }

  for (const part of candidates[0].content.parts) {
    if (part.thought) {
      // This part contains thinking summary (for debugging/logging)
      if (part.text) {
        thinkingSummaries.push(part.text);
      }
    } else if (part.text) {
      // This part contains final answer (for users)
      answerParts.push(part.text);
    }
  }

  return {
    thinkingSummaries,
    answerText: answerParts.join('')
  };
}
```

**File:** `services/response-engine/src/clients/GeminiClient.ts:754-781`

### 5.4 Logging Thinking Summaries

Thinking summaries are logged for test analysis and debugging:

```typescript
if (thinkingSummaries.length > 0) {
  console.log(JSON.stringify({
    severity: 'DEBUG',
    message: 'Gemini thinking summary captured',
    thinkingCount: thinkingSummaries.length,
    thinkingPreview: thinkingSummaries[0].substring(0, 200),
    thoughtsTokenCount: (response.usageMetadata as any)?.thoughtsTokenCount || 0
  }));
}
```

**Why log thinking?**
- Understand why Gemini chose specific functions
- Debug parameter extraction issues
- Analyze query interpretation
- Improve test coverage

---

## 6. Conversation History Management

### 6.1 History Format

Vertex AI expects conversation history in this format:
```typescript
Array<{
  role: 'user' | 'model';  // NOT 'assistant'!
  parts: Array<{ text: string }>;
}>
```

### 6.2 Dynamic Truncation

To prevent context window overflow:

```typescript
private buildConversationHistory(context: ConversationContext): Array<{
  role: 'user' | 'model';
  content: string;
}> {
  if (!context || !context.relevantMessages || context.relevantMessages.length === 0) {
    return [];
  }

  const MAX_TOKENS = 8000;  // Conservative limit for Gemini context window
  let messages = context.relevantMessages;

  // Estimate tokens (rough: 1 token ≈ 4 characters)
  const estimateTokens = (msgs: typeof messages) =>
    msgs.reduce((sum, msg) => sum + Math.ceil(msg.content.length / 4), 0);

  // Truncate from oldest while over limit, but keep at least 2 most recent messages
  while (estimateTokens(messages) > MAX_TOKENS && messages.length > 2) {
    messages = messages.slice(1);  // Remove oldest
  }

  // Ensure first message is from user (Gemini API requirement)
  while (messages.length > 0 && messages[0].role !== 'user') {
    messages = messages.slice(1);  // Skip assistant messages at start
  }

  return messages.map(msg => ({
    role: msg.role === 'user' ? 'user' : 'model',
    content: msg.content
  }));
}
```

**File:** `services/response-engine/src/core/ResponseGenerator.ts:259-309`

---

## 7. System Instructions

### 7.1 Dynamic System Instruction

System instructions are built dynamically to include:
- Business context (name, timezone, currency)
- Current date/time
- Data availability dates (from BigQuery)

```typescript
private async buildSystemInstruction(input: ResponseGeneratorInput): Promise<string> {
  const currentYear = input.currentDateTime.getFullYear();

  // Get data availability dates dynamically
  const latestDate = await this.analyticsToolHandler.getLatestAvailableDate();
  const firstDate = await this.analyticsToolHandler.getFirstAvailableDate();

  let dataAvailabilityNote = '';
  if (latestDate) {
    dataAvailabilityNote = `\nData availability: Reports are available through ${latestDate}.`;
  }
  if (firstDate) {
    dataAvailabilityNote += `\nData starts from: ${firstDate}.`;
  }

  return `You are an analytics assistant for ${input.tenantConfig.businessName}.
Business timezone: ${input.tenantConfig.timezone}
Currency: ${input.tenantConfig.currency}
Current date and time: ${input.currentDateTime.toISOString()}
Current year: ${currentYear}${dataAvailabilityNote}

IMPORTANT:
- When users mention months without specifying a year (e.g., "May and June"), assume they mean the current year (${currentYear}) unless context suggests otherwise.
- When users say "last month", "this month", "last quarter", etc., calculate the actual dates based on the current date above.
- If querying for dates beyond the latest available data, explain that data is only available through ${latestDate || 'the latest report date'}.`;
}
```

**File:** `services/response-engine/src/core/ResponseGenerator.ts:229-254`

### 7.2 Why Dynamic Instructions?

**Date awareness:**
- Gemini knows "current date" for relative date calculation
- Can warn users when querying beyond available data

**Business context:**
- Responses use correct timezone
- Currency formatting matches business locale

---

## 8. Error Handling

### 8.1 Rate Limit Retry

```typescript
catch (error: any) {
  // Check for rate limit
  if (error.message?.includes('quota') || error.message?.includes('rate limit')) {
    console.warn('Gemini rate limit hit, waiting and retrying...');
    await this.sleep(10000);  // Wait 10 seconds
    return await this.generateWithFunctionCalling(input, executeFunction, modelOverride);
  }

  throw new Error(`Vertex AI hybrid function calling error: ${error.message}`);
}
```

### 8.2 Empty Response Handling

If Gemini returns no text (only thinking), log warning:
```typescript
const logData: any = {
  severity: answerText.length === 0 ? 'WARNING' : 'INFO',
  message: 'Final text response received (hybrid approach)',
  textLength: answerText.length,
  responsePreview: answerText.substring(0, 200),
  hasThinking: thinkingSummaries.length > 0
};
```

---

## 9. Performance Optimization

### 9.1 Regional Co-location

```
┌─────────────────────────────────────┐
│  All in us-central1 (same region)   │
├─────────────────────────────────────┤
│  • Cloud Run (Response Engine)      │
│  • Vertex AI (Gemini endpoint)      │
│  • BigQuery (analytics data)        │
└─────────────────────────────────────┘
```

**Benefit:** <50ms latency between services

### 9.2 Model Selection Impact

| Model | Typical Latency | Cost | Use Case |
|-------|----------------|------|----------|
| gemini-2.5-flash | 1-2s | $ | Analytics queries (current) |
| gemini-2.5-pro | 3-5s | $$$ | Complex analysis (future) |
| gemini-2.0-flash | 1-3s | $$ | Alternative option |

**Current choice:** gemini-2.5-flash balances speed and accuracy for analytics.

---

## 10. Debugging

### 10.1 Detailed Logging

All Gemini calls log:
```typescript
console.log(JSON.stringify({
  severity: 'INFO',
  message: 'Vertex AI API call completed',
  model: modelToUse,
  durationMs: apiCallDuration,
  hasHistory: history.length > 0,
  location: this.location
}));
```

### 10.2 Viewing Logs

```bash
# View Response Engine logs
gcloud run services logs read response-engine \
  --region us-central1 \
  --limit 100 \
  | grep "Vertex AI"

# Filter for thinking summaries
gcloud run services logs read response-engine \
  --region us-central1 \
  --limit 100 \
  | grep "thinking summary"
```

---

## 11. Migration Notes

### 11.1 From Generative AI SDK to Vertex AI

**Old approach (NOT used):**
```typescript
import { GoogleGenerativeAI } from '@google/generative-ai';

// Load API key from Secret Manager
const apiKey = await loadGeminiApiKey();
const genAI = new GoogleGenerativeAI(apiKey);
const model = genAI.getGenerativeModel({ model: 'gemini-2.5-pro' });
```

**New approach (current):**
```typescript
import { VertexAI } from '@google-cloud/vertexai';

// No API key needed - uses ADC
const vertexAI = new VertexAI({
  project: projectId,
  location: 'us-central1'
});
const model = vertexAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
```

**Benefits of Vertex AI:**
- ✅ No secret management required
- ✅ Regional endpoint optimization
- ✅ Enterprise quotas and SLAs
- ✅ Integrated with GCP IAM

### 11.2 Legacy Code

Some code still references `geminiSecretName` parameter for backwards compatibility, but it's unused:

```typescript
constructor(
  private projectId: string,
  private geminiSecretName: string,  // LEGACY - not used
  private modelName: string = 'gemini-2.5-pro'
) {
```

**Can be removed** in future refactoring without impacting functionality.

---

## 12. Testing Considerations

### 12.1 Thinking Mode in Tests

When running tests, thinking summaries provide insight into:
- Why function was called (or not called)
- How parameters were extracted
- Query interpretation logic

**Test validation script uses thinking logs:**
```bash
# scripts/testing/lib/validate-response.sh logs thinking for analysis
```

### 12.2 Model Consistency

Tests should use the same model as production:
- Production: `gemini-2.5-flash`
- Tests: `gemini-2.5-flash`

Avoid switching models between environments for consistent behavior.

---

## 13. Future Enhancements

### 13.1 Potential Improvements

**Model experimentation:**
- A/B test gemini-2.5-pro for complex queries
- Evaluate gemini-2.0-flash-exp for newer features

**Caching:**
- System instruction caching (reduce tokens)
- Conversation history compression

**Parallel function calls:**
- Currently executes 1 function per query
- Could support multiple parallel function calls

### 13.2 Multi-tenancy

When implementing multi-tenant support:
- Per-tenant model selection
- Per-tenant quota management
- Tenant-specific system instructions

---

**Document Version:** 1.0
**Last Updated:** October 30, 2025
**Implementation:** services/response-engine/src/clients/GeminiClient.ts
