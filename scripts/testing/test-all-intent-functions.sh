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
#   --test-file <path>   Test file to use (default: test-queries.json)
#   --mode <mode>        Test mode: isolated|contextual (default: contextual)
#                        isolated: unique thread per test, clears history
#                        contextual: shared thread, maintains conversation
#
# Example:
#   ./scripts/testing/test-all-intent-functions.sh
#   ./scripts/testing/test-all-intent-functions.sh --function compare_periods
#   ./scripts/testing/test-all-intent-functions.sh --test-file test-queries-isolated.json --mode isolated
#   ./scripts/testing/test-all-intent-functions.sh --test-file test-queries-contextual.json --mode contextual

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
WAIT_TIME=60  # Increased from 30 to allow Cloud Logging propagation
TEST_FUNCTION=""
CONTINUOUS_MODE=false
TEST_FILE="test-queries.json"
TEST_MODE="isolated"  # isolated|contextual (default: isolated to prevent context bleeding)

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
        --test-file)
            TEST_FILE="$2"
            shift 2
            ;;
        --mode)
            TEST_MODE="$2"
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

# Validate test mode
if [ "$TEST_MODE" != "isolated" ] && [ "$TEST_MODE" != "contextual" ]; then
    echo -e "${RED}Error: --mode must be 'isolated' or 'contextual'${NC}"
    exit 1
fi

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

# Initialize markdown report
REPORT_FILE="$RUN_DIR/TEST_REPORT.md"

# Load test queries from JSON
QUERIES_FILE="$SCRIPT_DIR/$TEST_FILE"
if [ ! -f "$QUERIES_FILE" ]; then
    echo -e "${RED}Error: $TEST_FILE not found at $QUERIES_FILE${NC}"
    exit 1
fi

# Statistics
TOTAL_TESTS=0
SUCCESSFUL_TESTS=0
FAILED_TESTS=0
FALLBACK_USED=0
declare -A FUNCTION_STATS
declare -A FUNCTION_TIMINGS  # Track timing stats per function

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

    # Write markdown section header
    cat >> "$REPORT_FILE" <<EOF

---

## Test ${test_id}: ${function_name}

**Query:** "${query}"

EOF

    # Get auth token
    TOKEN=$(gcloud auth print-identity-token 2>/dev/null)
    if [ -z "$TOKEN" ]; then
        echo -e "${RED}✗ Failed to get auth token${NC}"
        cat >> "$REPORT_FILE" <<EOF
**Status:** ✗ FAILED
**Reason:** Failed to get auth token

EOF
        FAILED_TESTS=$((FAILED_TESTS + 1))
        return 1
    fi

    # Record timestamp for log filtering
    LOG_TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%S")

    # Determine thread ID based on test mode
    # - isolated mode: unique thread per test (clears history)
    # - contextual mode: shared thread (maintains conversation)
    if [ "$TEST_MODE" = "isolated" ]; then
        THREAD_ID="test-thread-isolated-${test_id}-$(date +%s)"
    else
        THREAD_ID="test-thread-contextual-shared"
    fi

    # Create Google Chat webhook payload
    PAYLOAD=$(cat <<EOFPAYLOAD
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
          "name": "spaces/test-space/threads/${THREAD_ID}"
        }
      },
      "space": {
        "name": "spaces/test-space-123",
        "type": "DM"
      }
    }
  }
}
EOFPAYLOAD
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
        cat >> "$REPORT_FILE" <<EOF
**Status:** ✗ FAILED
**Reason:** HTTP $HTTP_CODE error

EOF
        FAILED_TESTS=$((FAILED_TESTS + 1))
        return 1
    fi

    # Wait for async processing
    sleep $WAIT_TIME

    # Fetch logs with full response details
    gcloud logging read \
        "resource.type=cloud_run_revision AND \
         resource.labels.service_name=response-engine AND \
         resource.labels.revision_name=$REVISION AND \
         timestamp>=\"$LOG_TIMESTAMP\" AND \
         jsonPayload.message=\"Response generated successfully\"" \
        --limit 1 \
        --format=json \
        --project=$PROJECT_ID > "/tmp/test-${test_id}.json" 2>/dev/null

    if [ -s "/tmp/test-${test_id}.json" ]; then
        local response_text=$(cat "/tmp/test-${test_id}.json" | jq -r '.[0].jsonPayload.responseText // ""')
        local total_ms=$(cat "/tmp/test-${test_id}.json" | jq -r '.[0].jsonPayload.totalDurationMs // 0')
        local resolve_tenant_ms=$(cat "/tmp/test-${test_id}.json" | jq -r '.[0].jsonPayload.timings.resolveTenant // 0')
        local get_context_ms=$(cat "/tmp/test-${test_id}.json" | jq -r '.[0].jsonPayload.timings.getContext // 0')
        local generate_response_ms=$(cat "/tmp/test-${test_id}.json" | jq -r '.[0].jsonPayload.timings.generateResponse // 0')
        local format_response_ms=$(cat "/tmp/test-${test_id}.json" | jq -r '.[0].jsonPayload.timings.formatResponse // 0')
        local tool_calls=$(cat "/tmp/test-${test_id}.json" | jq -r '.[0].jsonPayload.toolCallsCount // 0')
        local chart_generated=$(cat "/tmp/test-${test_id}.json" | jq -r '.[0].jsonPayload.chartGenerated // false')
        local tool_calls_summary=$(cat "/tmp/test-${test_id}.json" | jq -c '.[0].jsonPayload.toolCallsSummary // []')

        # Display response preview
        if [ -n "$response_text" ] && [ "$response_text" != "null" ]; then
            local preview="${response_text:0:200}"
            echo -e "${CYAN}Response: \"${preview}...\"${NC}"
        fi

        # Write answer to markdown
        cat >> "$REPORT_FILE" <<EOF
**Answer:**
> $(echo "$response_text" | sed 's/^/> /g')

EOF

        # Add tool calls summary if available
        if [ "$tool_calls_summary" != "[]" ] && [ "$tool_calls_summary" != "null" ]; then
            cat >> "$REPORT_FILE" <<EOF
**Tool Calls Made ($tool_calls):**
EOF
            # Parse and display each tool call
            echo "$tool_calls_summary" | jq -r '.[] | "- \(.tool) (params: \(.params | join(", ")))"' >> "$REPORT_FILE"
            cat >> "$REPORT_FILE" <<EOF

EOF
        fi

        # Calculate percentages for timing breakdown
        local resolve_pct=0
        local context_pct=0
        local generate_pct=0
        local format_pct=0
        if [ "$total_ms" -gt 0 ]; then
            resolve_pct=$(echo "scale=1; $resolve_tenant_ms * 100 / $total_ms" | bc 2>/dev/null || echo "0")
            context_pct=$(echo "scale=1; $get_context_ms * 100 / $total_ms" | bc 2>/dev/null || echo "0")
            generate_pct=$(echo "scale=1; $generate_response_ms * 100 / $total_ms" | bc 2>/dev/null || echo "0")
            format_pct=$(echo "scale=1; $format_response_ms * 100 / $total_ms" | bc 2>/dev/null || echo "0")
        fi

        # Convert milliseconds to seconds for display
        local total_sec=$(echo "scale=1; $total_ms / 1000" | bc 2>/dev/null || echo "0")

        # Write timing breakdown to markdown
        cat >> "$REPORT_FILE" <<EOF
**Timing Breakdown:**
- **Total Duration:** ${total_ms}ms (${total_sec}s)
  - Resolve Tenant: ${resolve_tenant_ms}ms (${resolve_pct}%)
  - Get Context: ${get_context_ms}ms (${context_pct}%)
  - Generate Response: ${generate_response_ms}ms (${generate_pct}%)
  - Format Response: ${format_response_ms}ms (${format_pct}%)

EOF

        if [ ${#response_text} -gt 0 ]; then
            # Validate response quality
            local is_valid="true"
            local validation_reason=""

            local validation=$("$SCRIPT_DIR/lib/validate-response.sh" "$query" "$response_text" 2>/dev/null)

            if [ -n "$validation" ]; then
                is_valid=$(echo "$validation" | jq -r '.valid // true' 2>/dev/null)
                validation_reason=$(echo "$validation" | jq -r '.reason // ""' 2>/dev/null)
            fi

            if [ "$is_valid" = "true" ]; then
                echo -e "${GREEN}✓ SUCCESS${NC} (${total_ms}ms)"

                if [ -n "$validation_reason" ]; then
                    echo -e "${BLUE}  ✓ Validated: $validation_reason${NC}"
                fi

                # Write success status to markdown
                cat >> "$REPORT_FILE" <<EOF
**Status:** ✓ PASSED
**Tool Calls:** $tool_calls
**Chart Generated:** $chart_generated
**Validation:** $validation_reason

EOF

                SUCCESSFUL_TESTS=$((SUCCESSFUL_TESTS + 1))

                # Track timing stats
                if [ -z "${FUNCTION_TIMINGS[$function_name]}" ]; then
                    FUNCTION_TIMINGS[$function_name]="$total_ms:$total_ms:$total_ms:1"  # min:max:sum:count
                else
                    local min=$(echo "${FUNCTION_TIMINGS[$function_name]}" | cut -d: -f1)
                    local max=$(echo "${FUNCTION_TIMINGS[$function_name]}" | cut -d: -f2)
                    local sum=$(echo "${FUNCTION_TIMINGS[$function_name]}" | cut -d: -f3)
                    local count=$(echo "${FUNCTION_TIMINGS[$function_name]}" | cut -d: -f4)

                    [ "$total_ms" -lt "$min" ] && min=$total_ms
                    [ "$total_ms" -gt "$max" ] && max=$total_ms
                    sum=$((sum + total_ms))
                    count=$((count + 1))

                    FUNCTION_TIMINGS[$function_name]="$min:$max:$sum:$count"
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
                echo -e "${RED}✗ FAILED${NC} (invalid response)"

                if [ -n "$validation_reason" ]; then
                    echo -e "${RED}  Reason: $validation_reason${NC}"
                fi

                # Write failure to markdown
                cat >> "$REPORT_FILE" <<EOF
**Status:** ✗ FAILED
**Reason:** Invalid response - $validation_reason

EOF

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
            echo -e "${RED}✗ FAILED${NC} (empty response)"

            cat >> "$REPORT_FILE" <<EOF
**Status:** ✗ FAILED
**Reason:** Empty response

EOF
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

        # Clean up temp file
        rm -f "/tmp/test-${test_id}.json"
    else
        echo -e "${RED}✗ NO RESPONSE${NC}"

        cat >> "$REPORT_FILE" <<EOF
**Status:** ✗ FAILED
**Reason:** No response log found

EOF
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
    echo "Service:     $SERVICE_URL"
    echo "Revision:    $REVISION"
    echo "Test File:   $TEST_FILE"
    echo "Test Mode:   $TEST_MODE"
    echo "Output Dir:  $RUN_DIR"
    echo "Time:        $(date)"
    echo ""

    # Initialize markdown report
    cat > "$REPORT_FILE" <<EOF
# Test Run Report

**Date:** $(date)
**Revision:** $REVISION
**Service URL:** $SERVICE_URL
**Test File:** $TEST_FILE
**Test Mode:** $TEST_MODE $([ "$TEST_MODE" = "isolated" ] && echo "(unique thread per test)" || echo "(shared conversation thread)")

EOF

    # Reset stats for this run
    TOTAL_TESTS=0
    SUCCESSFUL_TESTS=0
    FAILED_TESTS=0
    FALLBACK_USED=0
    declare -gA FUNCTION_STATS
    declare -gA FUNCTION_TIMINGS

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
    echo "Success Rate:     ${success_rate}%"
    echo ""

    # Write summary section to markdown
    cat >> "$REPORT_FILE" <<EOF

---

# Summary

## Overall Results

- **Total Tests:** $TOTAL_TESTS
- **Successful:** $SUCCESSFUL_TESTS
- **Failed:** $FAILED_TESTS
- **Success Rate:** ${success_rate}%

## Function Breakdown

EOF

    # Function breakdown with timing stats
    echo -e "${YELLOW}Function Breakdown:${NC}"
    for function_name in "${!FUNCTION_STATS[@]}"; do
        local stats="${FUNCTION_STATS[$function_name]}"
        local success=$(echo "$stats" | cut -d: -f1)
        local fail=$(echo "$stats" | cut -d: -f2)
        local total=$((success + fail))
        local rate=0
        if [ $total -gt 0 ]; then
            rate=$(echo "scale=1; $success * 100 / $total" | bc 2>/dev/null || echo "0")
        fi
        printf "  %-25s %d/%d (%.1f%%)\n" "$function_name" $success $total $rate

        # Add to markdown with timing stats
        echo "### $function_name" >> "$REPORT_FILE"
        echo "" >> "$REPORT_FILE"
        echo "- **Pass Rate:** $success/$total (${rate}%)" >> "$REPORT_FILE"

        # Add timing statistics if available
        if [ -n "${FUNCTION_TIMINGS[$function_name]}" ]; then
            local timings="${FUNCTION_TIMINGS[$function_name]}"
            local min=$(echo "$timings" | cut -d: -f1)
            local max=$(echo "$timings" | cut -d: -f2)
            local sum=$(echo "$timings" | cut -d: -f3)
            local count=$(echo "$timings" | cut -d: -f4)
            local avg=0
            if [ $count -gt 0 ]; then
                avg=$((sum / count))
            fi

            local min_sec=$(echo "scale=1; $min / 1000" | bc 2>/dev/null || echo "0")
            local max_sec=$(echo "scale=1; $max / 1000" | bc 2>/dev/null || echo "0")
            local avg_sec=$(echo "scale=1; $avg / 1000" | bc 2>/dev/null || echo "0")

            echo "- **Timing (ms):**" >> "$REPORT_FILE"
            echo "  - Min: ${min}ms (${min_sec}s)" >> "$REPORT_FILE"
            echo "  - Avg: ${avg}ms (${avg_sec}s)" >> "$REPORT_FILE"
            echo "  - Max: ${max}ms (${max_sec}s)" >> "$REPORT_FILE"

            printf "    Timing: min=${min}ms avg=${avg}ms max=${max}ms\n"
        fi
        echo "" >> "$REPORT_FILE"
    done

    echo ""
    echo -e "${CYAN}Report saved to: $REPORT_FILE${NC}"
    echo ""

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
