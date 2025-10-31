#!/bin/bash

# Tool Server Test Suite
# Tests all 8 intent functions via the /execute-tool endpoint
#
# Usage:
#   ./scripts/testing/test-tool-server.sh [options]
#
# Options:
#   --url <url>          Service URL (default: auto-detect from Cloud Run)
#   --tenant <id>        Tenant ID to test (default: senso-sushi)
#   --function <name>    Test only specific function (default: all)
#   --output-dir <path>  Output directory for logs (default: ./test-results)
#
# Example:
#   ./scripts/testing/test-tool-server.sh
#   ./scripts/testing/test-tool-server.sh --function compare_periods
#   ./scripts/testing/test-tool-server.sh --tenant senso-sushi

set -e

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Default configuration
PROJECT_ID="${PROJECT_ID:-fdsanalytics}"
REGION="${REGION:-us-central1}"
TENANT_ID="senso-sushi"
OUTPUT_DIR="$PROJECT_ROOT/test-results"
TEST_FUNCTION=""
SERVICE_URL=""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --url)
            SERVICE_URL="$2"
            shift 2
            ;;
        --tenant)
            TENANT_ID="$2"
            shift 2
            ;;
        --function)
            TEST_FUNCTION="$2"
            shift 2
            ;;
        --output-dir)
            OUTPUT_DIR="$2"
            shift 2
            ;;
        --help)
            head -n 15 "$0" | grep "^#" | sed 's/^# *//'
            exit 0
            ;;
        *)
            echo "Unknown option: $1"
            echo "Use --help for usage information"
            exit 1
            ;;
    esac
done

# Auto-detect service URL if not specified
if [ -z "$SERVICE_URL" ]; then
    echo "Auto-detecting service URL..."
    SERVICE_URL=$(gcloud run services describe response-engine \
        --region $REGION \
        --project $PROJECT_ID \
        --format='value(status.url)')
    echo -e "${GREEN}Using service URL: $SERVICE_URL${NC}\n"
fi

# Create output directory
mkdir -p "$OUTPUT_DIR"
TIMESTAMP=$(date +"%Y%m%d-%H%M%S")
RUN_DIR="$OUTPUT_DIR/run-$TIMESTAMP"
mkdir -p "$RUN_DIR"

# Initialize markdown report
REPORT_FILE="$RUN_DIR/TEST_REPORT.md"
cat > "$REPORT_FILE" <<EOF
# Tool Server Test Report

**Date:** $(date)
**Service URL:** $SERVICE_URL
**Tenant ID:** $TENANT_ID

---

EOF

# Statistics
TOTAL_TESTS=0
SUCCESSFUL_TESTS=0
FAILED_TESTS=0

# Function to call the Tool Server
call_tool() {
    local tool_name="$1"
    local args_json="$2"
    local test_id="$3"
    local description="$4"

    echo -e "\n${CYAN}────────────────────────────────────────${NC}"
    echo -e "${CYAN}Test $test_id: $tool_name${NC}"
    echo -e "${YELLOW}Description: $description${NC}"
    echo -e "${CYAN}────────────────────────────────────────${NC}"

    TOTAL_TESTS=$((TOTAL_TESTS + 1))

    # Write markdown section header
    cat >> "$REPORT_FILE" <<EOF

---

## Test ${test_id}: ${tool_name}

**Description:** $description
**Args:** \`${args_json}\`

EOF

    # Get IAM auth token
    TOKEN=$(gcloud auth print-identity-token 2>/dev/null)
    if [ -z "$TOKEN" ]; then
        echo -e "${RED}✗ Failed to get IAM auth token${NC}"
        cat >> "$REPORT_FILE" <<EOF
**Status:** ✗ FAILED
**Reason:** Failed to get IAM auth token

EOF
        FAILED_TESTS=$((FAILED_TESTS + 1))
        return 1
    fi

    # Create request payload
    REQUEST_PAYLOAD=$(cat <<EOFPAYLOAD
{
  "tool_name": "$tool_name",
  "tenant_id": "$TENANT_ID",
  "args": $args_json
}
EOFPAYLOAD
)

    # Call /execute-tool endpoint
    echo -e "${BLUE}Calling /execute-tool...${NC}"
    START_TIME=$(date +%s%N)

    RESPONSE=$(curl -s -w "\n%{http_code}" \
        -X POST \
        -H "Authorization: Bearer $TOKEN" \
        -H "Content-Type: application/json" \
        -d "$REQUEST_PAYLOAD" \
        "$SERVICE_URL/execute-tool" 2>&1)

    END_TIME=$(date +%s%N)
    DURATION_MS=$(( ($END_TIME - $START_TIME) / 1000000 ))

    HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
    RESPONSE_BODY=$(echo "$RESPONSE" | sed '$d')

    # Check HTTP status
    if [ "$HTTP_CODE" != "200" ]; then
        echo -e "${RED}✗ Request failed (HTTP $HTTP_CODE)${NC}"
        echo "$RESPONSE_BODY" | jq '.' 2>/dev/null || echo "$RESPONSE_BODY"
        cat >> "$REPORT_FILE" <<EOF
**Status:** ✗ FAILED
**HTTP Code:** $HTTP_CODE
**Response:**
\`\`\`json
$RESPONSE_BODY
\`\`\`

EOF
        FAILED_TESTS=$((FAILED_TESTS + 1))
        return 1
    fi

    # Parse JSON response
    STATUS=$(echo "$RESPONSE_BODY" | jq -r '.status' 2>/dev/null || echo "unknown")
    ROW_COUNT=$(echo "$RESPONSE_BODY" | jq -r '.metadata.row_count' 2>/dev/null || echo "0")
    CHART_URL=$(echo "$RESPONSE_BODY" | jq -r '.chartUrl // "null"' 2>/dev/null)

    # Save response to file
    RESPONSE_FILE="$RUN_DIR/test-${test_id}-response.json"
    echo "$RESPONSE_BODY" | jq '.' > "$RESPONSE_FILE" 2>/dev/null || echo "$RESPONSE_BODY" > "$RESPONSE_FILE"

    # Check if response is valid
    if [ "$STATUS" = "success" ] && [ "$ROW_COUNT" != "null" ]; then
        echo -e "${GREEN}✓ Success${NC}"
        echo -e "${BLUE}  Rows: $ROW_COUNT${NC}"
        echo -e "${BLUE}  Duration: ${DURATION_MS}ms${NC}"
        if [ "$CHART_URL" != "null" ]; then
            echo -e "${BLUE}  Chart: $CHART_URL${NC}"
        fi

        # Preview data (first 3 rows)
        echo -e "${BLUE}  Data Preview:${NC}"
        echo "$RESPONSE_BODY" | jq -r '.data[:3] | .[]' 2>/dev/null | head -n 10 || echo "    (Could not parse data)"

        cat >> "$REPORT_FILE" <<EOF
**Status:** ✓ SUCCESS
**Rows:** $ROW_COUNT
**Duration:** ${DURATION_MS}ms
**Chart:** $CHART_URL

**Data Preview:**
\`\`\`json
$(echo "$RESPONSE_BODY" | jq '.data[:3]' 2>/dev/null || echo "[]")
\`\`\`

**Full Response:** See \`test-${test_id}-response.json\`

EOF
        SUCCESSFUL_TESTS=$((SUCCESSFUL_TESTS + 1))
        return 0
    else
        echo -e "${RED}✗ Failed${NC}"
        echo -e "${YELLOW}  Status: $STATUS${NC}"
        echo "$RESPONSE_BODY" | jq '.' 2>/dev/null || echo "$RESPONSE_BODY"

        cat >> "$REPORT_FILE" <<EOF
**Status:** ✗ FAILED
**Response Status:** $STATUS
**Response:**
\`\`\`json
$RESPONSE_BODY
\`\`\`

EOF
        FAILED_TESTS=$((FAILED_TESTS + 1))
        return 1
    fi
}

# Test Suite
echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}  Tool Server Test Suite${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""
echo -e "${YELLOW}Service: $SERVICE_URL${NC}"
echo -e "${YELLOW}Tenant: $TENANT_ID${NC}"
echo ""

# Test 1: show_daily_sales
if [ -z "$TEST_FUNCTION" ] || [ "$TEST_FUNCTION" = "show_daily_sales" ]; then
    call_tool "show_daily_sales" \
        '{"startDate": "2025-05-01", "endDate": "2025-05-31"}' \
        "1" \
        "Daily sales for May 2025"
fi

# Test 2: show_daily_sales with category filter
if [ -z "$TEST_FUNCTION" ] || [ "$TEST_FUNCTION" = "show_daily_sales" ]; then
    call_tool "show_daily_sales" \
        '{"startDate": "2025-05-01", "endDate": "2025-05-15", "category": "Beer"}' \
        "2" \
        "Beer sales for first half of May"
fi

# Test 3: show_top_items
if [ -z "$TEST_FUNCTION" ] || [ "$TEST_FUNCTION" = "show_top_items" ]; then
    call_tool "show_top_items" \
        '{"limit": 10, "startDate": "2025-05-01", "endDate": "2025-05-31"}' \
        "3" \
        "Top 10 items in May"
fi

# Test 4: show_category_breakdown
if [ -z "$TEST_FUNCTION" ] || [ "$TEST_FUNCTION" = "show_category_breakdown" ]; then
    call_tool "show_category_breakdown" \
        '{"startDate": "2025-05-01", "endDate": "2025-05-31"}' \
        "4" \
        "Category breakdown for May"
fi

# Test 5: get_total_sales
if [ -z "$TEST_FUNCTION" ] || [ "$TEST_FUNCTION" = "get_total_sales" ]; then
    call_tool "get_total_sales" \
        '{"startDate": "2025-05-01", "endDate": "2025-05-31"}' \
        "5" \
        "Total sales for May"
fi

# Test 6: find_peak_day
if [ -z "$TEST_FUNCTION" ] || [ "$TEST_FUNCTION" = "find_peak_day" ]; then
    call_tool "find_peak_day" \
        '{"startDate": "2025-05-01", "endDate": "2025-05-31", "type": "highest"}' \
        "6" \
        "Find highest sales day in May"
fi

# Test 7: compare_day_types
if [ -z "$TEST_FUNCTION" ] || [ "$TEST_FUNCTION" = "compare_day_types" ]; then
    call_tool "compare_day_types" \
        '{"startDate": "2025-05-01", "endDate": "2025-05-31", "comparison": "weekday_vs_weekend"}' \
        "7" \
        "Compare weekdays vs weekends in May"
fi

# Test 8: track_item_performance
if [ -z "$TEST_FUNCTION" ] || [ "$TEST_FUNCTION" = "track_item_performance" ]; then
    call_tool "track_item_performance" \
        '{"itemName": "Salmon Roll", "startDate": "2025-05-01", "endDate": "2025-05-31"}' \
        "8" \
        "Track Salmon Roll performance in May"
fi

# Test 9: compare_periods
if [ -z "$TEST_FUNCTION" ] || [ "$TEST_FUNCTION" = "compare_periods" ]; then
    call_tool "compare_periods" \
        '{"startDate1": "2025-05-01", "endDate1": "2025-05-31", "startDate2": "2025-04-01", "endDate2": "2025-04-30"}' \
        "9" \
        "Compare May vs April 2025"
fi

# Summary
echo ""
echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}  Test Summary${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""
echo -e "Total Tests: $TOTAL_TESTS"
echo -e "${GREEN}Successful: $SUCCESSFUL_TESTS${NC}"
echo -e "${RED}Failed: $FAILED_TESTS${NC}"
echo ""
SUCCESS_RATE=$(awk "BEGIN {printf \"%.1f\", ($SUCCESSFUL_TESTS/$TOTAL_TESTS)*100}")
echo -e "Success Rate: ${SUCCESS_RATE}%"
echo ""
echo -e "${YELLOW}Report saved to: $REPORT_FILE${NC}"
echo -e "${YELLOW}Response files: $RUN_DIR/test-*-response.json${NC}"
echo ""

# Write summary to report
cat >> "$REPORT_FILE" <<EOF

---

# Summary

**Total Tests:** $TOTAL_TESTS
**Successful:** $SUCCESSFUL_TESTS
**Failed:** $FAILED_TESTS
**Success Rate:** ${SUCCESS_RATE}%

EOF

# Exit with error if any test failed
if [ $FAILED_TESTS -gt 0 ]; then
    echo -e "${RED}Some tests failed. Check the report for details.${NC}"
    exit 1
else
    echo -e "${GREEN}All tests passed!${NC}"
    exit 0
fi
