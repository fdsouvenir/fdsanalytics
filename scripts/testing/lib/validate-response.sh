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

# Call Claude CLI for validation (uses Sonnet 4.5 for more robust validation)
VALIDATION=$(cat <<PROMPT | claude --print --model claude-sonnet-4-5 2>&1
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
- **Asks questions back** to the user (e.g., "What category?", "Which month?")
- **Deflects or promises** without delivering (e.g., "Let me get that for you...")
- **Logically impossible results** (e.g., weekend sales = \$0.00 for a busy restaurant)
- **Context bleeding** - includes data unrelated to the query (e.g., talks about May when asked about July, or mentions unrelated items from previous queries)
- **Generic errors** without explanation (e.g., "No data found" without saying why)
- **No specific data** - missing numbers, dates, percentages, or concrete analytics
- **Contains error messages** (e.g., "Something went wrong", "failed to retrieve")
- **Extraneous information** from conversation history that doesn't apply to current query

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
