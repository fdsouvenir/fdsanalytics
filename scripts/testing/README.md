# Testing Scripts

This directory contains automated testing scripts for the FDS Analytics services.

## test-response-engine.sh

Automated test harness for testing the response-engine service with various queries.

### Features

- **Auto-detection**: Automatically detects the latest deployed revision
- **Comprehensive logging**: Captures all relevant logs from Cloud Logging
- **Fallback monitoring**: Tracks when the fallback pattern is used
- **Summary report**: Generates a markdown summary with success rates
- **Organized output**: Saves all logs in timestamped directories

### Usage

```bash
# Run with latest revision (auto-detected)
./scripts/testing/test-response-engine.sh

# Test a specific revision
./scripts/testing/test-response-engine.sh --revision response-engine-00064-xkm

# Customize output directory
./scripts/testing/test-response-engine.sh --output-dir /tmp/my-tests

# Adjust wait time for slower queries
./scripts/testing/test-response-engine.sh --wait-time 20

# Show help
./scripts/testing/test-response-engine.sh --help
```

### Output

All test results are saved to `test-results/run-<timestamp>/`:

- `test-N-<name>-final.json` - Final response logs
- `test-N-<name>-fallback.json` - Fallback pattern logs
- `test-N-<name>-debug.json` - Debug info for failures
- `SUMMARY.md` - Test run summary with statistics

### Test Queries

The script runs 5 test queries by default:

1. Compare May and June sushi sales
2. Compare June and July sushi sales
3. Compare April and May beer sales
4. Compare May and June food sales
5. Top 5 selling items in July

### Exit Codes

- `0` - All tests passed
- `1` - One or more tests failed

### Example Output

```
========================================
Response Engine Automated Test Suite
========================================
Service:    https://response-engine-111874159771.us-central1.run.app
Revision:   response-engine-00064-xkm
Output Dir: ./test-results/run-20251025-132000
Time:       Sat Oct 25 01:20:00 PM CDT 2025

TEST: test-1-sushi-comparison
Query: compare may and june sushi sales in 2025
✓ Request accepted (HTTP 200)
✓ SUCCESS - textLength: 132
  ℹ Used fallback pattern

...

========================================
TEST SUMMARY
========================================

Total Tests: 5
Successful: 5
Failed: 0
Fallback Used: 3
Success Rate: 100.0%

✓ All tests passed!
```

## Troubleshooting

### Authentication Issues

If you get authentication errors:

```bash
gcloud auth login
gcloud auth application-default login
gcloud config set project fdsanalytics
```

### No Logs Found

If logs aren't appearing:

1. Check the revision name is correct
2. Increase `--wait-time` (queries might take longer)
3. Verify the service is deployed and healthy

### Empty Responses

If you see textLength: 0:

1. Check the debug logs in the output directory
2. Review the fallback logs to see if the fallback pattern was attempted
3. Check Cloud Logging for errors in the response-engine service
