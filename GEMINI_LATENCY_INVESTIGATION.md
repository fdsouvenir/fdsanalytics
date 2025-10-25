# Gemini API Latency Investigation
## 27-Second Overhead Mystery in Production vs AI Studio

**Date**: October 25, 2025
**Status**: Under Investigation
**Impact**: Critical - 57% of total response time is unexplained overhead

---

## Executive Summary

Our production response-engine service experiences **~27 seconds of overhead** when calling Gemini API, while Google AI Studio performs identical operations **instantly** (sub-second). This 27s represents 57% of our total 47-second response time for the query "compare may and june sushi sales in 2025".

**Key Finding**: The overhead is **NOT** caused by:
- Model processing time (AI Studio proves models are fast)
- Payload size (only 5KB total)
- Number of functions (8 functions, instant in AI Studio)
- Our code logic (only 1ms overhead)

**Hypothesis**: Infrastructure/networking issue between Cloud Run (us-central1) and Gemini API endpoints.

---

## Timeline of Discovery

### Initial Performance Measurement (Revision 00049)
Production query: "compare may and june sushi sales in 2025"

**Total Duration**: 47.6 seconds

| Phase | Duration | % of Total |
|-------|----------|-----------|
| Build Context | 0ms | 0% |
| **Gemini Tool Selection** | **15.6s** | **32.8%** |
| Intent Function Execution | 19.9s | 41.8% |
| **Gemini Final Response** | **11.9s** | **25.0%** |
| Chart Generation | 0ms | 0% |

**Gemini API calls total**: 27.5s (57.8% of total time)

### Detailed Breakdown of Tool Selection (15.6s)

Our code has extensive DEBUG logging that breaks down the tool selection phase:

```
Gemini initialization: 1ms (API key cached)
Function declarations prepared: 0ms
Generative model created: 0ms
Gemini API call (network): 15,530ms ⚠️ 99.5% OF TIME
Response parsing: <1ms
```

**Critical Discovery**: Our code overhead is only **1ms**. The actual `model.generateContent()` call takes 15.5 seconds.

### AI Studio Comparison Testing

To isolate whether the issue is model-related or infrastructure-related, we tested identical operations in Google AI Studio:

#### Test 1: Tool Selection (4 functions)
- **Query**: "compare may and june sushi sales in 2025"
- **Functions**: Initial 4 functions (missing compare_periods)
- **Model**: gemini-2.5-flash-lite
- **Result**: INSTANT function selection
- **Note**: Selected WRONG functions (show_daily_sales, show_category_breakdown) but was instant

#### Test 2: Tool Selection (8 functions)
- **Query**: "compare may and june sushi sales in 2025"
- **Functions**: All 8 current functions (including compare_periods)
- **Model**: gemini-2.5-flash-lite
- **Result**: INSTANT function selection
- **Function Selected**: compare_periods ✓ (correct)
- **Arguments**: Correctly extracted May/June 2025 dates and (Sushi) category

#### Test 3: Final Response Generation
- **Model**: gemini-2.5-pro (default)
- **Input**: Function response with generic field names (metric_value, baseline_value)
- **Result**: INSTANT text generation
- **Quality**: Incorrect (swapped May/June values - ambiguous field names)

#### Test 4: Final Response with Clear Format
- **Model**: gemini-2.5-pro
- **Input**: Function response with explicit period1/period2 structure
- **Behavior**: Called compare_periods TWICE, then generated text
- **Result**: INSTANT (all operations)
- **Quality**: Correct answer ✓

---

## What We Know with Certainty

### 1. Gemini Models Are Fast
AI Studio proves that both gemini-2.5-flash-lite and gemini-2.5-pro can:
- Select tools from 8 function definitions: **instant** (<1s)
- Generate final responses: **instant** (<1s)
- Even multiple function calls + final response: **instant**

### 2. Our Code Is Not The Bottleneck
- Initialization: 1ms (cached API key)
- Function prep: 0ms
- Model creation: 0ms
- Response parsing: <1ms
- **Total code overhead: ~1ms**

### 3. The Payload Is Small
- 8 function definitions: 4,711 chars (~4.7KB)
- System instruction: 339 chars
- User message: 40 chars
- **Total payload: ~5KB**

This is trivial for modern APIs and cannot explain 15.6s latency.

### 4. It's Not A Model Limitation
AI Studio uses the **exact same models** (gemini-2.5-flash-lite, gemini-2.5-pro) and they perform instantly. This rules out:
- Model loading time
- Token processing time
- Function calling complexity

### 5. The Overhead Is In The Network Call Itself
Our logs show:
```typescript
const apiCallStart = Date.now();
result = await model.generateContent({...});  // ← 15,530ms spent HERE
const apiCallDuration = Date.now() - apiCallStart;
```

The JavaScript `await` is blocking for 15.5 seconds on the SDK's HTTP request.

---

## What We Don't Know

### Question 1: Is It A Cold Start Issue?
**Hypothesis**: First Gemini API call from a Cloud Run instance is slow due to:
- DNS resolution
- TLS handshake
- Connection pooling initialization
- Model endpoint routing

**Test Needed**: Make 2 identical queries in quick succession (<30s apart) to the same Cloud Run instance and compare:
- First call: 15.6s (expected)
- Second call: ??? (if <2s, confirms cold start)

**How To Test**:
```bash
# Get Cloud Run URL
SERVICE_URL=$(gcloud run services describe response-engine --region us-central1 --format 'value(status.url)')

# Send 2 requests quickly
curl -X POST $SERVICE_URL/webhook -H "Content-Type: application/json" -d '{"message": {"text": "compare may and june sushi sales in 2025"}}'
sleep 5
curl -X POST $SERVICE_URL/webhook -H "Content-Type: application/json" -d '{"message": {"text": "compare may and june sushi sales in 2025"}}'

# Check logs for both requests
gcloud logging read 'resource.labels.service_name="response-engine" AND jsonPayload.message="Gemini API call completed"' --limit 5
```

### Question 2: Is It Regional Routing?
**Hypothesis**: Cloud Run in us-central1 → Gemini API might route through distant endpoints.

**Unknowns**:
- Where are Gemini API endpoints located?
- Does the Node.js SDK allow specifying endpoint regions?
- Is there a us-central1 Gemini endpoint we should use?

**Research Needed**:
- Check `@google/generative-ai` SDK documentation for endpoint configuration
- Check if there's a `baseUrl` or `apiEndpoint` parameter
- Test from different Cloud Run regions (us-east1, us-west1)

### Question 3: SDK HTTP Client Configuration
**Hypothesis**: Node.js SDK's underlying HTTP client (likely axios or fetch) might not be optimized for Cloud Run.

**Potential Issues**:
- No connection pooling (new TCP connection per request)
- No HTTP/2 support
- Default timeouts too conservative
- No Keep-Alive headers

**SDK Version**: We're using `@google/generative-ai` v0.21.0 (latest is v0.24.1)

**Investigation**:
```bash
# Check SDK release notes for performance improvements
npm view @google/generative-ai@0.24.1 --json | grep -A 5 "description"

# Check what HTTP library it uses
cd services/response-engine
npm ls axios
npm ls node-fetch
```

### Question 4: Cloud Run Networking Overhead
**Hypothesis**: Cloud Run's network configuration adds latency.

**Potential Issues**:
- VPC connector overhead (if configured)
- Egress routing through Google Cloud NAT
- Cloud Run → VPC → Internet routing
- Firewall rules inspection

**Current Setup**:
- Region: us-central1
- VPC: Not explicitly configured (default)
- Service Account: response-engine@fdsanalytics.iam.gserviceaccount.com

**Check Current Config**:
```bash
gcloud run services describe response-engine --region us-central1 --format json | grep -A 3 "vpc\|network"
```

### Question 5: Rate Limiting / Queueing
**Hypothesis**: Production requests might be queued or rate-limited differently than AI Studio.

**Unknowns**:
- Does AI Studio use different API tier/priority?
- Are we hitting Gemini API rate limits?
- Is there a queue for free-tier vs paid-tier API keys?

**Check Rate Limits**:
```bash
# Check if we're getting 429 errors
gcloud logging read 'resource.labels.service_name="response-engine" AND (jsonPayload.error=~"429" OR jsonPayload.error=~"quota" OR jsonPayload.error=~"rate limit")' --limit 20
```

### Question 6: Concurrent Requests Impact
**Hypothesis**: Cloud Run instance handling multiple concurrent requests slows down.

**Test**: Send 5 concurrent requests and measure latency distribution.

---

## Architecture Context

### Current Request Flow
```
Google Chat
    ↓ (webhook)
Cloud Run: response-engine (us-central1)
    ↓ (initialize)
Secret Manager: Load Gemini API key (1ms - cached)
    ↓ (tool selection)
Gemini API: gemini-2.5-flash-lite (15.6s ⚠️)
    ↓ (execute function)
BigQuery: query_metrics stored procedure (19.9s)
    ↓ (final response)
Gemini API: gemini-2.5-pro (11.9s ⚠️)
    ↓ (return)
Google Chat (display to user)

Total: 47.6s
Gemini overhead: 27.5s (57.8%)
```

### AI Studio Flow
```
Browser
    ↓
AI Studio Frontend
    ↓ (optimized connection)
Gemini API (same models)
    ↓
INSTANT response (<1s)
```

**Key Difference**: AI Studio → Gemini is instant, Cloud Run → Gemini is 27s slower.

---

## Potential Root Causes (Ranked by Likelihood)

### 1. HTTP Connection Pooling [HIGH LIKELIHOOD]
**Evidence**:
- 15.6s for first call suggests cold start
- AI Studio likely maintains warm connections

**Solution**:
- Investigate SDK connection pooling settings
- Keep Gemini client instance warm
- Use HTTP/2 with connection reuse

### 2. Regional Routing [HIGH LIKELIHOOD]
**Evidence**:
- us-central1 might route to distant Gemini endpoints
- AI Studio browser might use closer endpoints

**Solution**:
- Test from multiple Cloud Run regions
- Check if SDK allows endpoint specification
- Consider us-east1 or us-west1

### 3. SDK Version [MEDIUM LIKELIHOOD]
**Evidence**:
- We're on v0.21.0, latest is v0.24.1
- 3 versions behind might have performance fixes

**Solution**:
- Review changelogs for v0.22.0, v0.23.0, v0.24.x
- Upgrade and benchmark

### 4. Cloud Run Network Configuration [MEDIUM LIKELIHOOD]
**Evidence**:
- Default Cloud Run networking might add overhead
- VPC routing, NAT, egress paths

**Solution**:
- Review Cloud Run networking config
- Test with/without VPC connector
- Check egress paths

### 5. Rate Limiting / API Tier [LOW LIKELIHOOD]
**Evidence**:
- No 429 errors in logs
- Consistent 15.6s (not variable)

**Solution**:
- Verify API key tier
- Check quota usage
- Compare with AI Studio auth

### 6. DNS / TLS Handshake [LOW LIKELIHOOD]
**Evidence**:
- Would only affect first request
- Subsequent requests should be faster

**Solution**:
- Test consecutive requests
- Monitor DNS resolution time
- Check TLS handshake duration

---

## Configuration Details

### Current SDK Usage
```typescript
// services/response-engine/src/clients/GeminiClient.ts

// Initialization (once per instance)
this.genAI = new GoogleGenerativeAI(this.apiKey);

// Per request (new model instance)
const model = this.genAI.getGenerativeModel({
  model: 'gemini-2.5-flash-lite',
  systemInstruction: {...},
  generationConfig: {
    temperature: 1,
    topP: 0.95
  },
  tools: [{ functionDeclarations }],
  toolConfig: {
    functionCallingConfig: { mode: 'ANY' }
  }
});

// The slow call
result = await model.generateContent({
  contents: [{ role: 'user', parts: [{ text: userMessage }] }]
});
```

### Package Versions
- `@google/generative-ai`: ^0.21.0 (current: 0.24.1)
- `node`: 20.x
- Cloud Run platform: managed

### Cloud Run Configuration
```yaml
Service: response-engine
Region: us-central1
CPU: 1
Memory: 512Mi
Timeout: 300s
Max instances: 100
Min instances: 0 (scales to zero)
Concurrency: 80
```

---

## Recommended Investigation Steps

### Phase 1: Confirm Cold Start Hypothesis
**Priority**: HIGH
**Effort**: LOW (5 minutes)

1. Send 2 consecutive requests to production
2. Compare Gemini API call durations
3. If second call is <2s → cold start confirmed
4. If second call is still ~15s → deeper issue

### Phase 2: SDK Upgrade
**Priority**: HIGH
**Effort**: LOW (15 minutes)

1. Upgrade `@google/generative-ai` to v0.24.1
2. Review changelogs for performance improvements
3. Deploy and benchmark
4. Expected: 10-30% improvement if there were fixes

### Phase 3: Connection Pooling Investigation
**Priority**: HIGH
**Effort**: MEDIUM (1-2 hours)

1. Review SDK source code for HTTP client
2. Check if it supports connection reuse
3. Investigate keep-alive settings
4. Test with explicit HTTP/2 configuration

### Phase 4: Regional Testing
**Priority**: MEDIUM
**Effort**: MEDIUM (1 hour)

1. Deploy to us-east1 and us-west1
2. Benchmark identical queries
3. Compare latencies across regions
4. Identify if proximity to Gemini endpoints matters

### Phase 5: Local Testing
**Priority**: MEDIUM
**Effort**: LOW (30 minutes)

1. Create minimal reproduction script
2. Run locally (not from Cloud Run)
3. Compare latency: local vs Cloud Run
4. Isolates Cloud Run networking from SDK

### Phase 6: Alternative SDK/API
**Priority**: LOW
**Effort**: HIGH (4-6 hours)

1. Test Vertex AI SDK instead of generative-ai SDK
2. Test direct REST API calls (bypass SDK)
3. Compare latencies
4. Might reveal SDK-specific issues

---

## Success Criteria

### Target Performance
- Tool selection: **<2s** (vs current 15.6s) = 87% improvement
- Final response: **<3s** (vs current 11.9s) = 75% improvement
- **Total Gemini overhead: <5s** (vs current 27.5s) = 82% improvement
- **Total response time: <25s** (vs current 47.6s) = 48% improvement

### Minimum Acceptable
- Tool selection: <5s (68% improvement)
- Final response: <5s (58% improvement)
- Total Gemini overhead: <10s (64% improvement)
- Total response time: <35s (27% improvement)

---

## Open Questions for Google Support

If investigation doesn't reveal obvious fix, escalate to Google Cloud support:

1. **Are there regional Gemini API endpoints?**
   - Can we specify us-central1 endpoint for lower latency?
   - What's the recommended Cloud Run region for Gemini API calls?

2. **Is the generative-ai SDK optimized for Cloud Run?**
   - Does it support HTTP/2 connection pooling?
   - Are there Cloud Run-specific configuration recommendations?

3. **Why is AI Studio instant but SDK is 15s+ for same operation?**
   - Different API tier/priority?
   - Different endpoints?
   - Client-side optimizations we're missing?

4. **What's the expected latency for gemini-2.5-flash-lite function calling?**
   - From Cloud Run us-central1
   - With 8 function definitions (~5KB payload)
   - With mode: ANY

---

## Related Files

- Investigation document: `/home/souvy/fdsanalytics/GEMINI_LATENCY_INVESTIGATION.md` (this file)
- Function definitions: `/home/souvy/fdsanalytics/intent-functions.json`
- Gemini client: `/home/souvy/fdsanalytics/services/response-engine/src/clients/GeminiClient.ts`
- Response generator: `/home/souvy/fdsanalytics/services/response-engine/src/core/ResponseGenerator.ts`
- Package config: `/home/souvy/fdsanalytics/services/response-engine/package.json`

---

## Appendix A: Actual vs Expected Latency

### Current Production Performance
```
User query → Response: 47.6s
├─ Context building: 0ms (0%)
├─ Tool selection (flash-lite): 15.6s (33%) ⚠️
├─ BigQuery execution: 19.9s (42%)
├─ Final response (pro): 11.9s (25%) ⚠️
└─ Chart generation: 0ms (0%)

Gemini total: 27.5s (58% of total)
```

### Expected Performance (Based on AI Studio)
```
User query → Response: ~20s
├─ Context building: 0ms
├─ Tool selection: <1s ✓
├─ BigQuery execution: 19.9s (can't optimize much)
├─ Final response: <1s ✓
└─ Chart generation: 0ms

Gemini total: <2s (10% of total)
```

### Performance Gap
**Current Gemini overhead**: 27.5s
**Expected Gemini overhead**: <2s
**Unexplained latency**: 25.5s (92% overhead)

---

## Appendix B: AI Studio Test Results

### Test Configuration
- **URL**: https://aistudio.google.com/
- **Model**: Gemini 2.5 Flash-Lite
- **System Instructions**:
  ```
  You are an analytics assistant for Senso Sushi restaurant.
  Business timezone: America/Chicago
  Currency: USD
  Current date and time: 2025-10-24T21:00:00.000Z
  Current year: 2025

  IMPORTANT: When users mention months without specifying a year,
  assume they mean the current year (2025).
  ```
- **Functions**: All 8 intent functions (see intent-functions.json)
- **Settings**:
  - Temperature: 1
  - Top P: 0.95
  - Function calling: Edit (enabled)

### Test Results Summary
| Test | Query | Result | Duration | Notes |
|------|-------|--------|----------|-------|
| 1 | "compare may and june sushi sales in 2025" (4 funcs) | Wrong function selected | Instant | Selected show_daily_sales |
| 2 | "compare may and june sushi sales in 2025" (8 funcs) | compare_periods ✓ | Instant | Correct args |
| 3 | Function response (generic) | Text generated | Instant | Wrong values (swapped) |
| 4 | Function response (clear) | compare_periods x2 → text | Instant | Correct answer |

**Conclusion**: All operations instant in AI Studio, 27.5s in production.

---

## Document Version
- **Created**: 2025-10-25
- **Last Updated**: 2025-10-25
- **Status**: Investigation in progress
- **Next Review**: After Phase 1 testing (consecutive requests)
