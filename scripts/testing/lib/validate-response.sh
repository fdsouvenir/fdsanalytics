#!/bin/bash
#
# Validate chatbot response using Claude CLI (uses your subscription, no API key needed)
#
# Usage: validate-response.sh "<query>" "<response>"
# Returns: JSON with {valid: boolean, reason: string}
#

QUERY="$1"
RESPONSE="$2"

if [ -z "$QUERY" ] || [ -z "$RESPONSE" ]; then
    echo '{"valid": false, "reason": "missing arguments"}'
    exit 1
fi

# Call Claude CLI for validation (uses 'haiku' alias for latest Haiku model)
VALIDATION=$(cat <<PROMPT | claude --print --model haiku 2>&1
Validate this chatbot response. Return ONLY valid JSON, no explanation.

User Query: "$QUERY"
Chatbot Response: "$RESPONSE"

Output format (nothing else): {"valid": true|false, "reason": "2-4 words"}

Mark as INVALID (valid: false) if response:
- Asks a question back to the user (ends with "?" or asks for clarification)
- Says "I don't have", "no data", "can't provide", "unable to", "I'm not sure"
- Contains error messages ("went wrong", "error occurred", "failed to", "Something went wrong")
- Apologizes without providing data
- Provides NO actual numbers, figures, percentages, or analytics
- Says "What category", "What is the comparison", "Can you specify"
- Is just a deflection or asks user to provide more info
- Is nonsensical or obviously wrong

Mark as VALID (valid: true) ONLY if response:
- Contains actual dollar amounts, numbers, percentages, or specific data
- Provides specific dates, timeframes, or comparisons
- Gives concrete analytics data or insights
- Actually answers the query with DATA (not questions)
- Even "No data found" is OK if it explains WHY or provides context
PROMPT
)

# Extract JSON from markdown code blocks (Claude CLI wraps in ```json)
# If no code blocks, return as-is
if echo "$VALIDATION" | grep -q '```json'; then
    echo "$VALIDATION" | sed -n '/^```json/,/^```/p' | sed '1d;$d'
else
    # Try to extract just the JSON object
    echo "$VALIDATION" | grep -o '{.*}' | head -1
fi
