#!/bin/bash
###############################################################################
# Backfill Insights Tables
#
# Populates insights tables (daily_comparisons, category_trends, top_items,
# daily_forecast) for historical date range by calling populate_daily_insights
# stored procedure.
#
# Usage:
#   ./scripts/backfill-insights.sh --start 2025-03-29 --end 2025-10-24
#   ./scripts/backfill-insights.sh --interactive
#   ./scripts/backfill-insights.sh --all-reports
###############################################################################

set -e

PROJECT_ID="fdsanalytics"
DATASET="insights"
PROCEDURE="populate_daily_insights"

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

###############################################################################
# Helper Functions
###############################################################################

log_info() {
  echo -e "${GREEN}[INFO]${NC} $1"
}

log_error() {
  echo -e "${RED}[ERROR]${NC} $1"
}

log_warn() {
  echo -e "${YELLOW}[WARN]${NC} $1"
}

# Generate date range
generate_date_range() {
  local start_date=$1
  local end_date=$2
  local current_date=$start_date

  while [[ "$current_date" != $(date -I -d "$end_date + 1 day" 2>/dev/null || date -v+1d -j -f "%Y-%m-%d" "$end_date" "+%Y-%m-%d") ]]; do
    echo "$current_date"
    current_date=$(date -I -d "$current_date + 1 day" 2>/dev/null || date -v+1d -j -f "%Y-%m-%d" "$current_date" "+%Y-%m-%d")
  done
}

# Get all report dates from BigQuery
get_all_report_dates() {
  log_info "Fetching all report dates from restaurant_analytics.reports..."

  bq query \
    --use_legacy_sql=false \
    --format=csv \
    --max_rows=1000 \
    "SELECT DISTINCT FORMAT_DATE('%Y-%m-%d', DATE(report_date)) as date
     FROM \`fdsanalytics.restaurant_analytics.reports\`
     ORDER BY date ASC" | tail -n +2
}

# Populate insights for a single date
populate_date() {
  local date=$1

  bq query \
    --use_legacy_sql=false \
    --location=us-central1 \
    --project_id=$PROJECT_ID \
    "CALL \`${PROJECT_ID}.${DATASET}.${PROCEDURE}\`('${date}');" > /dev/null 2>&1
}

# Backfill insights for date range
backfill_insights() {
  local start_date=$1
  local end_date=$2
  local dry_run=${3:-false}

  echo ""
  echo "=== Backfill Insights ==="
  echo "Date range: $start_date to $end_date"
  echo "Dry run: $dry_run"
  echo ""

  # Generate dates
  dates=($(generate_date_range "$start_date" "$end_date"))
  local total=${#dates[@]}

  log_info "Total dates: $total"
  echo ""

  if [[ "$dry_run" == "true" ]]; then
    log_warn "DRY RUN - would process these dates:"
    for date in "${dates[@]}"; do
      echo "  $date"
    done
    return 0
  fi

  # Process dates
  local completed=0
  local failed=0
  local start_time=$(date +%s)

  for date in "${dates[@]}"; do
    ((completed++))
    printf "[%d/%d] Processing %s... " "$completed" "$total" "$date"

    if populate_date "$date"; then
      echo -e "${GREEN}✓${NC}"
    else
      echo -e "${RED}✗${NC}"
      ((failed++))
    fi
  done

  local end_time=$(date +%s)
  local duration=$((end_time - start_time))

  echo ""
  echo "=== Summary ==="
  echo "Completed: $((completed - failed))/$total"
  echo "Failed: $failed"
  echo "Duration: ${duration}s"
}

###############################################################################
# Interactive Mode
###############################################################################

run_interactive() {
  echo "=== Backfill Insights - Interactive Mode ==="
  echo ""

  echo "Backfill mode:"
  echo "  1) All report dates (recommended)"
  echo "  2) Custom date range"
  read -p "Choose [1/2]: " mode

  if [[ "$mode" == "1" ]]; then
    # Get all report dates
    dates=($(get_all_report_dates))
    start_date=${dates[0]}
    end_date=${dates[-1]}

    log_info "Found ${#dates[@]} report dates ($start_date to $end_date)"
  else
    read -p "Start date (YYYY-MM-DD): " start_date
    read -p "End date (YYYY-MM-DD): " end_date
  fi

  read -p "Dry run first? [y/N]: " dry_run_answer
  dry_run="false"
  if [[ "$dry_run_answer" =~ ^[Yy]$ ]]; then
    dry_run="true"
  fi

  backfill_insights "$start_date" "$end_date" "$dry_run"

  if [[ "$dry_run" == "true" ]]; then
    echo ""
    read -p "Execute backfill? [y/N]: " execute_answer
    if [[ "$execute_answer" =~ ^[Yy]$ ]]; then
      backfill_insights "$start_date" "$end_date" "false"
    fi
  fi
}

###############################################################################
# Main
###############################################################################

main() {
  # Parse arguments
  dry_run="false"
  start_date=""
  end_date=""
  mode=""

  while [[ $# -gt 0 ]]; do
    case $1 in
      --interactive|-i)
        mode="interactive"
        shift
        ;;
      --all-reports)
        mode="all-reports"
        shift
        ;;
      --start)
        start_date="$2"
        shift 2
        ;;
      --end)
        end_date="$2"
        shift 2
        ;;
      --dry-run)
        dry_run="true"
        shift
        ;;
      --help|-h)
        echo "Usage: $0 [OPTIONS]"
        echo ""
        echo "Options:"
        echo "  --interactive, -i     Interactive mode (prompts for inputs)"
        echo "  --all-reports         Backfill all report dates from database"
        echo "  --start DATE          Start date (YYYY-MM-DD)"
        echo "  --end DATE            End date (YYYY-MM-DD)"
        echo "  --dry-run             Show what would be done without executing"
        echo "  --help, -h            Show this help message"
        echo ""
        echo "Examples:"
        echo "  $0 --interactive"
        echo "  $0 --all-reports"
        echo "  $0 --start 2025-03-29 --end 2025-10-24"
        echo "  $0 --start 2025-03-29 --end 2025-10-24 --dry-run"
        exit 0
        ;;
      *)
        log_error "Unknown option: $1"
        echo "Use --help for usage information"
        exit 1
        ;;
    esac
  done

  # Execute based on mode
  if [[ "$mode" == "interactive" ]]; then
    run_interactive
  elif [[ "$mode" == "all-reports" ]]; then
    dates=($(get_all_report_dates))
    start_date=${dates[0]}
    end_date=${dates[-1]}
    backfill_insights "$start_date" "$end_date" "$dry_run"
  elif [[ -n "$start_date" && -n "$end_date" ]]; then
    backfill_insights "$start_date" "$end_date" "$dry_run"
  else
    log_error "Missing required arguments"
    echo "Use --help for usage information"
    exit 1
  fi
}

main "$@"
