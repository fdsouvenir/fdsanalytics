#!/bin/bash

# Automated Test Harness for Response Engine
# Tests the response-engine service with various queries and captures detailed logs
#
# Usage:
#   ./scripts/testing/test-response-engine.sh [options]
#
# Options:
#   --revision <name>    Specific revision to test (default: auto-detect latest)
#   --queries <file>     Custom queries file (default: built-in test queries)
#   --output-dir <path>  Output directory for logs (default: ./test-results)
#   --wait-time <secs>   Wait time after sending query (default: 12)
#
# Example:
#   ./scripts/testing/test-response-engine.sh --revision response-engine-00064-xkm

set -e

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Default configuration
SERVICE_URL="https://response-engine-111874159771.us-central1.run.app"
PROJECT_ID="fdsanalytics"
REGION="us-central1"
REVISION=""
OUTPUT_DIR="$PROJECT_ROOT/test-results"
WAIT_TIME=12

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --revision)
            REVISION="$2"
            shift 2
            ;;
        --output-dir)
            OUTPUT_DIR="$2"
            shift 2
            ;;
        --wait-time)
            WAIT_TIME="$2"
            shift 2
            ;;
        --help)
            head -n 20 "$0" | grep "^#" | sed 's/^# *//'
            exit 0
            ;;
        *)
            echo "Unknown option: $1"
            echo "Use --help for usage information"
            exit 1
            ;;
    esac
done

# Auto-detect latest revision if not specified
if [ -z "$REVISION" ]; then
    echo "Auto-detecting latest revision..."
    REVISION=$(gcloud run services describe response-engine \
        --region $REGION \
        --project $PROJECT_ID \
        --format='value(status.latestReadyRevisionName)')
    echo -e "${GREEN}Using revision: $REVISION${NC}\n"
fi

# Create output directory
mkdir -p "$OUTPUT_DIR"
TIMESTAMP=$(date +"%Y%m%d-%H%M%S")
RUN_DIR="$OUTPUT_DIR/run-$TIMESTAMP"
mkdir -p "$RUN_DIR"

# Function to send a test query
send_query() {
    local query="$1"
    local test_name="$2"

    echo -e "\n${YELLOW}========================================${NC}"
    echo -e "${YELLOW}TEST: $test_name${NC}"
    echo -e "${YELLOW}Query: $query${NC}"
    echo -e "${YELLOW}========================================${NC}\n"

    # Get auth token
    echo "Getting auth token..."
    TOKEN=$(gcloud auth print-identity-token)

    # Record timestamp for log filtering
    LOG_TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%S")

    # Create Google Chat webhook payload
    PAYLOAD=$(cat <<EOF
{
  "chat": {
    "user": {
      "name": "users/test-user-123",
      "displayName": "Test User",
      "email": "test@example.com"
    },
    "messagePayload": {
      "message": {
        "name": "spaces/test-space/messages/test-msg-$(date +%s)",
        "text": "$query",
        "argumentText": "$query",
        "thread": {
          "name": "spaces/test-space/threads/test-thread-1"
        }
      },
      "space": {
        "name": "spaces/test-space-123",
        "type": "DM"
      }
    }
  }
}
EOF
)

    # Send request
    echo "Sending query to $SERVICE_URL/webhook..."
    RESPONSE=$(curl -s -w "\n%{http_code}" \
        -X POST \
        -H "Authorization: Bearer $TOKEN" \
        -H "Content-Type: application/json" \
        -d "$PAYLOAD" \
        "$SERVICE_URL/webhook")

    HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
    BODY=$(echo "$RESPONSE" | head -n-1)

    if [ "$HTTP_CODE" = "200" ]; then
        echo -e "${GREEN}✓ Request accepted (HTTP 200)${NC}"
    else
        echo -e "${RED}✗ Request failed (HTTP $HTTP_CODE)${NC}"
        echo "Response: $BODY"
        return 1
    fi

    # Wait for async processing
    echo "Waiting ${WAIT_TIME} seconds for async processing..."
    sleep $WAIT_TIME

    # Fetch logs for this query
    echo -e "\n${YELLOW}Fetching logs...${NC}"

    # Get all final text responses
    echo -e "\n--- Final Response Status ---"
    gcloud logging read \
        "resource.type=cloud_run_revision AND \
         resource.labels.service_name=response-engine AND \
         resource.labels.revision_name=$REVISION AND \
         timestamp>=\"$LOG_TIMESTAMP\" AND \
         jsonPayload.message=\"Final text response received\"" \
        --limit 5 \
        --format=json \
        --project=$PROJECT_ID > "$RUN_DIR/${test_name}-final.json"

    if [ -s "$RUN_DIR/${test_name}-final.json" ]; then
        local text_length=$(cat "$RUN_DIR/${test_name}-final.json" | jq -r '.[0].jsonPayload.textLength // 0')
        local used_fallback=$(cat "$RUN_DIR/${test_name}-final.json" | jq -r '.[0].jsonPayload.usedFallback // false')

        if [ "$text_length" -gt 0 ]; then
            echo -e "${GREEN}✓ SUCCESS${NC} - textLength: $text_length"
            if [ "$used_fallback" = "true" ]; then
                echo -e "${BLUE}  ℹ Used fallback pattern${NC}"
            fi
        else
            echo -e "${RED}✗ FAILED${NC} - Empty response (textLength: 0)"
        fi
    else
        echo -e "${RED}✗ NO RESPONSE${NC} - No final response logged"
    fi

    # Get fallback logs
    gcloud logging read \
        "resource.type=cloud_run_revision AND \
         resource.labels.service_name=response-engine AND \
         resource.labels.revision_name=$REVISION AND \
         timestamp>=\"$LOG_TIMESTAMP\" AND \
         jsonPayload.message:\"Fallback\"" \
        --limit 10 \
        --format=json \
        --project=$PROJECT_ID > "$RUN_DIR/${test_name}-fallback.json"

    # Get debug info for empty responses
    gcloud logging read \
        "resource.type=cloud_run_revision AND \
         resource.labels.service_name=response-engine AND \
         resource.labels.revision_name=$REVISION AND \
         timestamp>=\"$LOG_TIMESTAMP\" AND \
         severity=WARNING AND \
         jsonPayload.debugInfo.rawCandidate:*" \
        --limit 5 \
        --format=json \
        --project=$PROJECT_ID > "$RUN_DIR/${test_name}-debug.json"

    echo -e "\n${GREEN}Logs saved to: $RUN_DIR/${test_name}-*.json${NC}"
}

# Main test execution
echo "========================================="
echo "Response Engine Automated Test Suite"
echo "========================================="
echo "Service:    $SERVICE_URL"
echo "Revision:   $REVISION"
echo "Output Dir: $RUN_DIR"
echo "Time:       $(date)"
echo ""

# Run test queries
send_query "compare may and june sushi sales in 2025" "test-1-sushi-comparison"
send_query "compare june and july sushi sales in 2025" "test-2-sushi-comparison"
send_query "compare april and may beer sales in 2025" "test-3-beer-comparison"
send_query "compare may and june food sales in 2025" "test-4-food-comparison"
send_query "what were the top 5 selling items in july 2025" "test-5-top-items"

# Generate summary report
echo -e "\n${YELLOW}========================================${NC}"
echo -e "${YELLOW}GENERATING TEST SUMMARY${NC}"
echo -e "${YELLOW}========================================${NC}\n"

SUMMARY_FILE="$RUN_DIR/SUMMARY.md"

cat > "$SUMMARY_FILE" <<EOF
# Test Run Summary

**Date:** $(date)
**Revision:** $REVISION
**Service:** $SERVICE_URL

## Results

EOF

# Count successes and failures
TOTAL=0
SUCCESS=0
FALLBACK_USED=0

for file in "$RUN_DIR"/test-*-final.json; do
    if [ -f "$file" ]; then
        TOTAL=$((TOTAL + 1))
        test_name=$(basename "$file" | sed 's/-final.json//')
        text_length=$(cat "$file" | jq -r '.[0].jsonPayload.textLength // 0')
        used_fallback=$(cat "$file" | jq -r '.[0].jsonPayload.usedFallback // false')

        if [ "$text_length" -gt 0 ]; then
            SUCCESS=$((SUCCESS + 1))
            status="✓ SUCCESS"
            if [ "$used_fallback" = "true" ]; then
                FALLBACK_USED=$((FALLBACK_USED + 1))
                status="$status (fallback)"
            fi
        else
            status="✗ FAILED"
        fi

        echo "- **$test_name**: $status (textLength: $text_length)" >> "$SUMMARY_FILE"
    fi
done

cat >> "$SUMMARY_FILE" <<EOF

## Statistics

- **Total Tests:** $TOTAL
- **Successful:** $SUCCESS
- **Failed:** $((TOTAL - SUCCESS))
- **Fallback Used:** $FALLBACK_USED
- **Success Rate:** $(echo "scale=1; $SUCCESS * 100 / $TOTAL" | bc)%

## Log Files

All detailed logs are available in: \`$RUN_DIR\`

EOF

# Display summary
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}TEST SUMMARY${NC}"
echo -e "${GREEN}========================================${NC}\n"
cat "$SUMMARY_FILE"

echo -e "\n${BLUE}Full report saved to: $SUMMARY_FILE${NC}\n"

# Exit with appropriate code
if [ $SUCCESS -eq $TOTAL ]; then
    echo -e "${GREEN}✓ All tests passed!${NC}\n"
    exit 0
else
    echo -e "${RED}✗ Some tests failed${NC}\n"
    exit 1
fi
