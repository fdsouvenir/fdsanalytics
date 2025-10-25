#!/bin/bash

# Comprehensive Intent Function Test Suite
# Tests all 8 intent functions with multiple queries each
#
# Usage:
#   ./scripts/testing/test-all-intent-functions.sh [options]
#
# Options:
#   --revision <name>    Specific revision to test (default: auto-detect latest)
#   --function <name>    Test only specific function (default: all)
#   --output-dir <path>  Output directory for logs (default: ./test-results)
#   --wait-time <secs>   Wait time after sending query (default: 12)
#   --continuous         Run continuously in monitoring mode
#
# Example:
#   ./scripts/testing/test-all-intent-functions.sh
#   ./scripts/testing/test-all-intent-functions.sh --function compare_periods

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
TEST_FUNCTION=""
CONTINUOUS_MODE=false

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
        --revision)
            REVISION="$2"
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
        --wait-time)
            WAIT_TIME="$2"
            shift 2
            ;;
        --continuous)
            CONTINUOUS_MODE=true
            shift
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

# Load test queries from JSON
QUERIES_FILE="$SCRIPT_DIR/test-queries.json"
if [ ! -f "$QUERIES_FILE" ]; then
    echo -e "${RED}Error: test-queries.json not found${NC}"
    exit 1
fi

# Statistics
TOTAL_TESTS=0
SUCCESSFUL_TESTS=0
FAILED_TESTS=0
FALLBACK_USED=0
declare -A FUNCTION_STATS

# Function to send a test query
send_query() {
    local query="$1"
    local function_name="$2"
    local test_id="$3"

    echo -e "\n${CYAN}────────────────────────────────────────${NC}"
    echo -e "${CYAN}Test $test_id: $function_name${NC}"
    echo -e "${YELLOW}Query: $query${NC}"
    echo -e "${CYAN}────────────────────────────────────────${NC}"

    TOTAL_TESTS=$((TOTAL_TESTS + 1))

    # Get auth token
    TOKEN=$(gcloud auth print-identity-token 2>/dev/null)
    if [ -z "$TOKEN" ]; then
        echo -e "${RED}✗ Failed to get auth token${NC}"
        FAILED_TESTS=$((FAILED_TESTS + 1))
        return 1
    fi

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
    RESPONSE=$(curl -s -w "\n%{http_code}" \
        -X POST \
        -H "Authorization: Bearer $TOKEN" \
        -H "Content-Type: application/json" \
        -d "$PAYLOAD" \
        "$SERVICE_URL/webhook" 2>/dev/null)

    HTTP_CODE=$(echo "$RESPONSE" | tail -n1)

    if [ "$HTTP_CODE" != "200" ]; then
        echo -e "${RED}✗ Request failed (HTTP $HTTP_CODE)${NC}"
        FAILED_TESTS=$((FAILED_TESTS + 1))
        return 1
    fi

    # Wait for async processing
    sleep $WAIT_TIME

    # Fetch logs for this query
    gcloud logging read \
        "resource.type=cloud_run_revision AND \
         resource.labels.service_name=response-engine AND \
         resource.labels.revision_name=$REVISION AND \
         timestamp>=\"$LOG_TIMESTAMP\" AND \
         jsonPayload.message=\"Final text response received\"" \
        --limit 1 \
        --format=json \
        --project=$PROJECT_ID > "$RUN_DIR/test-${test_id}-${function_name}.json" 2>/dev/null

    if [ -s "$RUN_DIR/test-${test_id}-${function_name}.json" ]; then
        local text_length=$(cat "$RUN_DIR/test-${test_id}-${function_name}.json" | jq -r '.[0].jsonPayload.textLength // 0')
        local used_fallback=$(cat "$RUN_DIR/test-${test_id}-${function_name}.json" | jq -r '.[0].jsonPayload.usedFallback // false')

        if [ "$text_length" -gt 0 ]; then
            echo -e "${GREEN}✓ SUCCESS${NC} (textLength: $text_length)"
            SUCCESSFUL_TESTS=$((SUCCESSFUL_TESTS + 1))

            if [ "$used_fallback" = "true" ]; then
                echo -e "${BLUE}  ℹ Fallback pattern used${NC}"
                FALLBACK_USED=$((FALLBACK_USED + 1))
            fi

            # Update function stats
            if [ -z "${FUNCTION_STATS[$function_name]}" ]; then
                FUNCTION_STATS[$function_name]="1:0"
            else
                local success=$(echo "${FUNCTION_STATS[$function_name]}" | cut -d: -f1)
                local fail=$(echo "${FUNCTION_STATS[$function_name]}" | cut -d: -f2)
                FUNCTION_STATS[$function_name]="$((success + 1)):$fail"
            fi
        else
            echo -e "${RED}✗ FAILED${NC} (empty response)"
            FAILED_TESTS=$((FAILED_TESTS + 1))

            # Update function stats
            if [ -z "${FUNCTION_STATS[$function_name]}" ]; then
                FUNCTION_STATS[$function_name]="0:1"
            else
                local success=$(echo "${FUNCTION_STATS[$function_name]}" | cut -d: -f1)
                local fail=$(echo "${FUNCTION_STATS[$function_name]}" | cut -d: -f2)
                FUNCTION_STATS[$function_name]="$success:$((fail + 1))"
            fi
        fi
    else
        echo -e "${RED}✗ NO RESPONSE${NC}"
        FAILED_TESTS=$((FAILED_TESTS + 1))
    fi
}

# Run test loop
run_tests() {
    local run_number=${1:-1}

    echo ""
    echo -e "${BLUE}╔════════════════════════════════════════════════════╗${NC}"
    echo -e "${BLUE}║  Intent Function Comprehensive Test Suite         ║${NC}"
    echo -e "${BLUE}║  Run #$run_number                                         ║${NC}"
    echo -e "${BLUE}╚════════════════════════════════════════════════════╝${NC}"
    echo ""
    echo "Service:    $SERVICE_URL"
    echo "Revision:   $REVISION"
    echo "Output Dir: $RUN_DIR"
    echo "Time:       $(date)"
    echo ""

    # Reset stats for this run
    TOTAL_TESTS=0
    SUCCESSFUL_TESTS=0
    FAILED_TESTS=0
    FALLBACK_USED=0
    declare -gA FUNCTION_STATS

    # Read and execute test queries
    local test_id=0

    # Get list of functions to test
    if [ -n "$TEST_FUNCTION" ]; then
        FUNCTIONS=("$TEST_FUNCTION")
    else
        FUNCTIONS=($(cat "$QUERIES_FILE" | jq -r '.intentFunctions | keys[]'))
    fi

    for function_name in "${FUNCTIONS[@]}"; do
        echo -e "\n${YELLOW}═══════════════════════════════════════════════════${NC}"
        echo -e "${YELLOW}Testing: $function_name${NC}"
        echo -e "${YELLOW}═══════════════════════════════════════════════════${NC}"

        # Get queries for this function
        local query_count=$(cat "$QUERIES_FILE" | jq -r ".intentFunctions.${function_name}.queries | length")

        for ((i=0; i<query_count; i++)); do
            test_id=$((test_id + 1))
            local query=$(cat "$QUERIES_FILE" | jq -r ".intentFunctions.${function_name}.queries[$i]")
            send_query "$query" "$function_name" "$test_id"
        done
    done

    # Generate summary
    generate_summary
}

# Generate summary report
generate_summary() {
    echo ""
    echo -e "${BLUE}╔════════════════════════════════════════════════════╗${NC}"
    echo -e "${BLUE}║  TEST SUMMARY                                      ║${NC}"
    echo -e "${BLUE}╚════════════════════════════════════════════════════╝${NC}"
    echo ""

    local success_rate=0
    if [ $TOTAL_TESTS -gt 0 ]; then
        success_rate=$(echo "scale=1; $SUCCESSFUL_TESTS * 100 / $TOTAL_TESTS" | bc)
    fi

    echo "Total Tests:      $TOTAL_TESTS"
    echo "Successful:       $SUCCESSFUL_TESTS"
    echo "Failed:           $FAILED_TESTS"
    echo "Fallback Used:    $FALLBACK_USED"
    echo "Success Rate:     ${success_rate}%"
    echo ""

    # Function breakdown
    echo -e "${YELLOW}Function Breakdown:${NC}"
    for function_name in "${!FUNCTION_STATS[@]}"; do
        local stats="${FUNCTION_STATS[$function_name]}"
        local success=$(echo "$stats" | cut -d: -f1)
        local fail=$(echo "$stats" | cut -d: -f2)
        local total=$((success + fail))
        local rate=0
        if [ $total -gt 0 ]; then
            rate=$(echo "scale=1; $success * 100 / $total" | bc)
        fi
        printf "  %-25s %d/%d (%.1f%%)\n" "$function_name" $success $total $rate
    done

    echo ""
    echo -e "${CYAN}Results saved to: $RUN_DIR${NC}"
    echo ""

    # Save summary to file
    cat > "$RUN_DIR/SUMMARY.md" <<EOF
# Test Run Summary

**Date:** $(date)
**Revision:** $REVISION

## Overall Results

- **Total Tests:** $TOTAL_TESTS
- **Successful:** $SUCCESSFUL_TESTS
- **Failed:** $FAILED_TESTS
- **Fallback Used:** $FALLBACK_USED
- **Success Rate:** ${success_rate}%

## Function Breakdown

$(for function_name in "${!FUNCTION_STATS[@]}"; do
    stats="${FUNCTION_STATS[$function_name]}"
    success=$(echo "$stats" | cut -d: -f1)
    fail=$(echo "$stats" | cut -d: -f2)
    total=$((success + fail))
    rate=$(echo "scale=1; $success * 100 / $total" | bc 2>/dev/null || echo "0")
    echo "- **$function_name**: $success/$total (${rate}%)"
done)

## Test Queries

All test queries are defined in \`scripts/testing/test-queries.json\`

## Logs

Individual test logs: \`$RUN_DIR/test-*.json\`
EOF

    if [ $FAILED_TESTS -eq 0 ]; then
        echo -e "${GREEN}✓ All tests passed!${NC}\n"
        return 0
    else
        echo -e "${RED}✗ Some tests failed${NC}\n"
        return 1
    fi
}

# Main execution
if [ "$CONTINUOUS_MODE" = true ]; then
    echo -e "${YELLOW}Continuous monitoring mode enabled${NC}"
    echo "Press Ctrl+C to stop"
    echo ""

    run_number=1
    while true; do
        run_tests $run_number
        run_number=$((run_number + 1))
        echo -e "\n${CYAN}Waiting 60 seconds before next run...${NC}\n"
        sleep 60
    done
else
    run_tests 1
    exit $?
fi
