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

# Extract JSON from markdown code blocks (Claude CLI wraps in ```json)
# If no code blocks, return as-is
if echo "$VALIDATION" | grep -q '```json'; then
    echo "$VALIDATION" | sed -n '/^```json/,/^```/p' | sed '1d;$d'
else
    # Try to extract just the JSON object
    echo "$VALIDATION" | grep -o '{.*}' | head -1
fi
