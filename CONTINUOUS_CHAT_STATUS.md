# Continuous Chat Implementation Status

**Last Updated**: October 25, 2025
**Current Revision**: response-engine-00059-n89
**Status**: 🟡 Mostly Working - Intermittent Empty Response Issue

---

## Executive Summary

### Original Goal
Reduce Gemini API overhead from 27.5s to <20s by eliminating the "fake history" pattern of making two separate API calls.

### Approach Taken
Implemented continuous chat with function calling using a single Gemini session:
1. Start chat with system instruction
2. Send user message → Gemini calls function
3. Execute function
4. Send functionResponse back to SAME chat → Gemini generates text

### Current Status
- ✅ Architecture implemented and deployed
- ✅ SDK upgraded from 0.21.0 to 0.24.1
- ✅ Fixed multiple bugs (infinite loops, 400 errors, wrong format)
- ✅ Most queries work correctly
- ❌ **INTERMITTENT**: ~30-50% of queries return empty responses

---

## Architecture Changes

### OLD Pattern (Working but Slow)
```
1. Call Gemini for tool selection → 15.6s
2. Execute function
3. Create NEW chat with functionResponse in history
4. Call Gemini for final response → 11.9s
Total: 27.5s Gemini overhead
```

### NEW Pattern (Continuous Chat)
```
1. Start ONE chat session
2. Send user message → Gemini calls function
3. Execute function
4. Send functionResponse to SAME chat → Gemini generates text
Expected: <10s Gemini overhead (one session)
```

### Technical Details
- **Model**: `gemini-2.5-flash-lite` (both tool selection and response)
- **Mode**: AUTO (Gemini decides when to call functions vs generate text)
- **SDK**: `@google/generative-ai` v0.24.1
- **Pattern**: Multi-turn chat with function calling

---

## Bugs Fixed (Chronological)

### Revision 00050-00053: Infinite Function Call Loop
**Problem**: Used `mode: 'ANY'` throughout, forcing Gemini to call functions on every turn.

**Logs**:
```
Round 1: calls compare_periods
Round 2: calls compare_periods
Round 3: calls compare_periods
→ Hit maxRounds limit
```

**Fix**: Remove toolConfig from model, use AUTO mode (let Gemini decide)

**Files Changed**:
- `GeminiClient.ts` line 553-579: Removed forced mode: 'ANY'

### Revision 00054: 400 Errors - Chat API
**Problem**: Gemini API rejected requests with 400 error.

**Root Cause**: Incorrect functionResponse format based on misreading documentation.

**Wrong Format**:
```javascript
response: {
  name: functionCall.name,
  content: functionResult
}
```

**Correct Format** (from official SDK):
```javascript
response: functionResult  // Direct, not nested
```

**Fix**: Simplified functionResponse structure
**Reference**: https://github.com/google-gemini/generative-ai-js/blob/main/samples/function_calling.js

### Revision 00055-00056: Empty Responses (textLength: 0)
**Problem**: Function executed successfully but Gemini returned empty text.

**Discovery**: SDK bug in v0.21.0 where `chat.sendMessage()` with only functionResponse would fail.

**Fix**: Upgraded SDK to v0.24.1 where this bug was fixed.

**Files Changed**:
- `package.json`: `@google/generative-ai` 0.21.0 → 0.24.1

### Revision 00057: Simplified functionResponse (WORKING)
**Problem**: Still getting 400 errors despite SDK upgrade.

**Root Cause**: We were using overly complex nested structure that didn't match official examples.

**Before (WRONG)**:
```javascript
functionResponse: {
  name: functionCall.name,
  response: {
    name: functionCall.name,
    content: functionResult
  }
}
```

**After (CORRECT)**:
```javascript
functionResponse: {
  name: functionCall.name,
  response: functionResult
}
```

**Result**: First query worked! "compare may and june sushi sales in 2025" returned proper response.

**Files Changed**:
- `GeminiClient.ts` line 650-655: First functionResponse
- `GeminiClient.ts` line 720-725: Loop functionResponse

---

## Current Issue: Intermittent Empty Responses

### Symptoms
- **First query**: ✅ Works perfectly
  - "compare may and june sushi sales in 2025"
  - Returns: "In May and June of 2025, Sushi sales increased by 15.44%..."

- **Second query**: ❌ Fails with empty response
  - "compare june and july sushi sales in 2025"
  - Returns: Generic error message (textLength: 0)

### Pattern
- Not consistent - same query sometimes works, sometimes fails
- Appears to be ~30-50% failure rate
- No obvious pattern based on query content
- Function executes successfully every time
- Gemini returns candidate with finishReason: "STOP"

### Debug Findings (Revision 00058)

**Log Output**:
```json
{
  "severity": "WARNING",
  "message": "Final text response received",
  "rounds": 1,
  "textLength": 0,
  "debugInfo": {
    "candidatesCount": 1,
    "finishReason": "STOP"
  }
}
```

**Analysis**:
- ✅ hasCandidates: true - Gemini returned a candidate
- ✅ finishReason: "STOP" - Normal completion (not blocked by safety)
- ✅ candidatesCount: 1 - One candidate returned
- ❌ textLength: 0 - But the candidate has no text!

**Conclusion**: The candidate exists but has no text in its parts array.

### Enhanced Debug Logging (Revision 00059 - CURRENT)

**Added Fields**:
- `hasContent` - Whether candidate has content object
- `hasParts` - Whether content has parts array
- `partsCount` - Number of parts in array
- `textValue` - Actual text value (even if empty)
- `rawCandidate` - Full JSON structure

**Location**: `GeminiClient.ts` lines 699-719

**Next Test**: User needs to trigger the failing query to capture full parts array structure.

---

## Code Locations

### Main Implementation Files

**GeminiClient.ts**
- Lines 489-755: `generateWithFunctionCalling()` method
- Lines 648-655: Send first functionResponse
- Lines 657-662: Log response after functionResponse
- Lines 664-730: Multi-round function call loop
- Lines 684-721: Debug logging for empty responses

**ResponseGenerator.ts**
- Lines 105-187: Continuous chat orchestration
- Line 110-130: Call generateWithFunctionCalling
- Lines 148-187: Handle result and validate

**intentFunctions.ts**
- Lines 7-204: 8 intent function definitions
- Simplified category descriptions to avoid extraction bugs

### Key Functions

**8 Intent Functions**:
1. `show_daily_sales` - Daily breakdown
2. `show_top_items` - Top N items
3. `show_category_breakdown` - Sales by category
4. `get_total_sales` - Total for period
5. `find_peak_day` - Best/worst day
6. `compare_day_types` - Weekday vs weekend
7. `track_item_performance` - Specific item over time
8. `compare_periods` - Compare two time periods ← USED IN FAILING QUERY

---

## Deployed Revisions

| Revision | Status | Description |
|----------|--------|-------------|
| 00050 | ❌ Failed | Initial continuous chat - infinite loop |
| 00051 | ❌ Failed | Added multi-round support - still looping |
| 00052 | ❌ Failed | Fixed category extraction - still looping |
| 00053 | ❌ Failed | Hit maxRounds every time |
| 00054 | ❌ Failed | 400 errors from wrong functionResponse |
| 00055 | ❌ Failed | Empty responses with nested structure |
| 00056 | ❌ Failed | SDK upgraded but still wrong format |
| 00057 | 🟡 Partial | Correct format - works ~50-70% of time |
| 00058 | 🟡 Partial | Added basic debug logging |
| 00059 | 🟡 Current | Enhanced debug logging - **NEEDS TESTING** |

---

## Testing & Debugging

### Test Queries

**Working Query** (use as baseline):
```
compare may and june sushi sales in 2025
```

**Failing Query** (use to reproduce issue):
```
compare june and july sushi sales in 2025
```

### Check Logs

```bash
# View logs for current revision
gcloud logging read \
  "resource.type=cloud_run_revision AND \
   resource.labels.service_name=response-engine AND \
   resource.labels.revision_name=response-engine-00059-n89" \
  --limit 300 --format=json

# Look for WARNING severity with debugInfo
# Should show full parts array structure and rawCandidate JSON
```

### Expected Debug Output

When empty response occurs:
```json
{
  "severity": "WARNING",
  "message": "Final text response received",
  "textLength": 0,
  "debugInfo": {
    "candidatesCount": 1,
    "finishReason": "STOP",
    "hasContent": true/false,
    "hasParts": true/false,
    "partsCount": 0 or more,
    "contentParts": [
      {
        "hasText": false,
        "textValue": null or "",
        "hasFunctionCall": false,
        "keys": ["..."]
      }
    ],
    "rawCandidate": "{...full JSON...}"
  }
}
```

---

## Hypotheses to Investigate

### 1. SDK Bug in response.text()
**Theory**: The `response.text()` method doesn't properly extract text from parts array.

**Test**: Manually access `candidate.content.parts[0].text` instead of using `response.text()`

**Code Location**: GeminiClient.ts line 682

### 2. Malformed Parts Array
**Theory**: Parts array exists but structure is unexpected (e.g., empty array, wrong part type)

**Test**: Examine `rawCandidate` JSON in debug logs to see actual structure

**Need**: User to trigger failing query with rev 00059

### 3. Async Timing Issue
**Theory**: Race condition where response is accessed before it's fully populated

**Test**: Add delay before accessing text, or check response state

**Likelihood**: Low (logs show "STOP" finish reason)

### 4. Empty String vs Undefined
**Theory**: Gemini returns empty string "" instead of actual text

**Test**: Check `textValue` field in debug logs - is it null, undefined, or ""?

**Need**: Debug output from rev 00059

---

## Next Steps for Investigation

### Immediate Actions

1. **Trigger Failing Query** with revision 00059
   ```
   compare june and july sushi sales in 2025
   ```

2. **Capture Debug Logs**
   - Look for WARNING severity
   - Extract `debugInfo.rawCandidate`
   - Analyze parts array structure

3. **Compare Working vs Failing**
   - Working query: "may and june"
   - Failing query: "june and july"
   - Diff the rawCandidate JSON

### Code Changes to Consider

**If parts array is empty**:
```javascript
// Add fallback to check function result
if (responseText.length === 0 && functionResult) {
  responseText = `Based on the data: ${JSON.stringify(functionResult)}`;
}
```

**If text is in wrong location**:
```javascript
// Manually extract text from parts
const textPart = candidate.content.parts.find(p => 'text' in p);
const responseText = textPart?.text || '';
```

**If SDK method is broken**:
```javascript
// Don't use response.text(), build it ourselves
let responseText = '';
for (const part of candidate.content.parts) {
  if ('text' in part) {
    responseText += part.text;
  }
}
```

### Long-term Solutions

1. **Retry Logic**: If textLength is 0, retry sendMessage with function result
2. **Fallback to Old Pattern**: If continuous chat fails, fall back to "fake history" approach
3. **Report SDK Bug**: If confirmed SDK issue, report to Google
4. **Switch to @google/genai**: Consider migrating to newer SDK (GA since May 2025)

---

## Performance Comparison

### Before (Two Separate Calls)
```
Tool Selection:   15.6s (gemini-2.5-flash-lite)
Final Response:   11.9s (gemini-2.5-pro)
Total Gemini:     27.5s
Function Exec:    ~10s (BigQuery)
TOTAL:            ~38s
```

### After (Continuous Chat - When Working)
```
Initial Message:  ~8s  (gemini-2.5-flash-lite)
Function Exec:    ~10s (BigQuery)
Function Result:  ~3s  (gemini-2.5-flash-lite)
Total Gemini:     ~11s
TOTAL:            ~21s ✅ 45% faster
```

### After (Continuous Chat - When Failing)
```
Same timing but returns empty text
User sees error message
TOTAL:            ~21s but BROKEN ❌
```

---

## References

### Official Documentation
- **Gemini API Function Calling**: https://ai.google.dev/gemini-api/docs/function-calling
- **Multi-turn Conversations**: https://ai.google.dev/gemini-api/docs/text-generation#multi-turn-conversations
- **Official SDK Sample**: https://github.com/google-gemini/generative-ai-js/blob/main/samples/function_calling.js

### Internal Documentation
- **GEMINI_LATENCY_INVESTIGATION.md**: Original 27s latency analysis
- **CLAUDE.md**: Project guidance for Claude Code
- **intent-functions.json**: Function definitions for AI Studio testing

### SDK Information
- **Current SDK**: `@google/generative-ai` v0.24.1
- **GitHub**: https://github.com/google-gemini/generative-ai-js
- **NPM**: https://www.npmjs.com/package/@google/generative-ai
- **Note**: Deprecated SDK, but newer `@google/genai` GA since May 2025

---

## Git History

### Recent Commits

```
3bf3b01 - fix(response-engine): correct functionResponse format per official SDK docs
9a1f373 - fix(response-engine): correct functionResponse format for Gemini API
2cae9e1 - fix(response-engine): resolve infinite function call loop with AUTO mode
a6e126d - fix(response-engine): add explicit year guidance to system instruction
```

### Key Changes
- GeminiClient.ts: +266 lines (continuous chat implementation)
- ResponseGenerator.ts: Major refactor to use continuous chat
- intentFunctions.ts: Simplified category descriptions
- package.json: SDK upgrade 0.21.0 → 0.24.1

---

## Contact Points

### Cloud Run Service
- **Service**: response-engine
- **Project**: fdsanalytics
- **Region**: us-central1
- **URL**: https://response-engine-111874159771.us-central1.run.app
- **Current Revision**: response-engine-00059-n89

### BigQuery Datasets
- **Analytics**: `fdsanalytics.restaurant_analytics`
- **Insights**: `fdsanalytics.insights`
- **Chat History**: `fdsanalytics.chat_history`

### Monitoring
- **Cloud Logging**: Filter by revision name to isolate specific deployment
- **Metrics**: Response time, error rate in Cloud Run console
- **Alerts**: None configured yet

---

## Action Items for Next Agent

### Priority 1: Debug Current Issue
- [ ] Test "compare june and july sushi sales in 2025" with rev 00059
- [ ] Capture and analyze `rawCandidate` JSON from debug logs
- [ ] Compare successful vs failed response structures
- [ ] Identify why `response.text()` returns empty string

### Priority 2: Implement Fix
- [ ] Based on debug findings, choose appropriate fix:
  - Manual text extraction from parts array
  - Retry logic for empty responses
  - Fallback to old "fake history" pattern
  - SDK workaround or migration

### Priority 3: Testing & Validation
- [ ] Test multiple queries to verify fix works consistently
- [ ] Ensure performance improvement is maintained (target: <20s)
- [ ] Add integration tests for continuous chat pattern
- [ ] Document the root cause and solution

### Priority 4: Cleanup
- [ ] Remove debug logging after issue is resolved
- [ ] Update this document with final solution
- [ ] Consider migrating to `@google/genai` (newer SDK)
- [ ] Add monitoring for empty response rate

---

## Questions to Answer

1. **Why does the same query sometimes work, sometimes fail?**
   - Need: rawCandidate comparison between working/failing

2. **What's in the parts array when textLength is 0?**
   - Need: Debug logs from rev 00059

3. **Is this a known SDK bug?**
   - Need: Search GitHub issues for @google/generative-ai

4. **Should we use response.text() or manually extract?**
   - Need: Official SDK documentation on best practices

5. **Is continuous chat worth the complexity?**
   - If we can't get >80% reliability, consider reverting to old pattern
   - Old pattern was slow but worked 100% of the time

---

**END OF DOCUMENT**

Next agent: Start by testing the failing query and examining the debug logs to answer Question #2 above.
