"""
Test FDS Analytics Agent

Interactive test script for the deployed ADK agent.
Sends sample queries and validates responses.

Usage:
    python test_agent.py [--resource RESOURCE_NAME]

Environment Variables:
    PROJECT_ID: GCP project ID (default: fdsanalytics)
    REGION: Agent region (default: us-central1)
"""

import asyncio
import sys
import os
from pathlib import Path
from datetime import datetime, timedelta

try:
    from vertexai import agent_engines
    import vertexai
except ImportError:
    print("Error: Vertex AI SDK not installed")
    print("Install with: pip install google-cloud-aiplatform[adk,agent_engines]")
    sys.exit(1)

# Configuration
PROJECT_ID = os.getenv("PROJECT_ID", "fdsanalytics")
REGION = os.getenv("REGION", "us-central1")

# Sample test queries
TEST_QUERIES = [
    {
        "name": "Daily Sales Query",
        "query": "Show me daily sales for May 2025",
        "expected_tool": "show_daily_sales"
    },
    {
        "name": "Top Items Query",
        "query": "What are the top 10 items in July 2025?",
        "expected_tool": "show_top_items"
    },
    {
        "name": "Category Breakdown Query",
        "query": "Show me sales by category for May 2025",
        "expected_tool": "show_category_breakdown"
    },
    {
        "name": "Period Comparison Query",
        "query": "Compare May and June 2025 sales",
        "expected_tool": "compare_periods"
    },
    {
        "name": "Peak Day Query",
        "query": "What was the best sales day in May 2025?",
        "expected_tool": "find_peak_day"
    }
]


async def test_agent(resource_name: str):
    """Test the deployed agent with sample queries."""

    print("=" * 60)
    print("FDS Analytics Agent - Test Suite")
    print("=" * 60)
    print(f"Project ID:  {PROJECT_ID}")
    print(f"Region:      {REGION}")
    print(f"Resource:    {resource_name}")
    print("=" * 60)
    print()

    # Initialize Vertex AI
    print("[1/3] Initializing Vertex AI SDK...")
    vertexai.init(
        project=PROJECT_ID,
        location=REGION,
    )
    print("✓ Initialized")
    print()

    # Get agent
    print("[2/3] Connecting to deployed agent...")
    try:
        remote_app = agent_engines.get(resource_name)
        print(f"✓ Connected to agent: {resource_name}")
    except Exception as e:
        print(f"✗ Failed to connect: {e}")
        print()
        print("Troubleshooting:")
        print("  1. Verify agent is deployed: gcloud ai reasoning-engines list")
        print("  2. Check resource name in .agent_resource file")
        print("  3. Ensure you have permission to access the agent")
        sys.exit(1)
    print()

    # Create test session
    print("[3/3] Creating test session...")
    try:
        session = await remote_app.async_create_session(
            user_id=f"test_user_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
        )
        session_id = session["id"]
        print(f"✓ Session created: {session_id}")
    except Exception as e:
        print(f"✗ Failed to create session: {e}")
        sys.exit(1)
    print()

    # Run test queries
    print("=" * 60)
    print("Running Test Queries")
    print("=" * 60)
    print()

    passed = 0
    failed = 0

    for i, test in enumerate(TEST_QUERIES, 1):
        print(f"[Test {i}/{len(TEST_QUERIES)}] {test['name']}")
        print(f"Query: {test['query']}")
        print()

        try:
            # Send query
            response_parts = []
            async for event in remote_app.async_stream_query(
                user_id=session["user_id"],
                session_id=session_id,
                message=test["query"]
            ):
                # Collect response parts
                if hasattr(event, 'text') and event.text:
                    response_parts.append(event.text)

            full_response = "".join(response_parts)

            if full_response:
                print("Response:")
                print("-" * 60)
                print(full_response[:500])  # Show first 500 chars
                if len(full_response) > 500:
                    print("... (truncated)")
                print("-" * 60)
                print("✓ Test passed")
                passed += 1
            else:
                print("✗ Test failed: No response received")
                failed += 1

        except Exception as e:
            print(f"✗ Test failed: {e}")
            failed += 1

        print()

    # Summary
    print("=" * 60)
    print("Test Summary")
    print("=" * 60)
    print(f"Total tests:  {len(TEST_QUERIES)}")
    print(f"Passed:       {passed} ✓")
    print(f"Failed:       {failed} ✗")
    print(f"Success rate: {(passed/len(TEST_QUERIES)*100):.1f}%")
    print("=" * 60)

    return failed == 0


def main():
    """Main entry point."""

    # Get resource name from argument or .agent_resource file
    resource_name = None

    if len(sys.argv) > 1 and sys.argv[1] == "--resource" and len(sys.argv) > 2:
        resource_name = sys.argv[2]
    else:
        # Try to read from .agent_resource file
        resource_file = Path(__file__).parent / ".agent_resource"
        if resource_file.exists():
            resource_name = resource_file.read_text().strip()
        else:
            print("Error: Agent resource name not found")
            print()
            print("Usage:")
            print("  python test_agent.py --resource RESOURCE_NAME")
            print()
            print("Or deploy the agent first:")
            print("  python deploy.py")
            sys.exit(1)

    # Run async test
    success = asyncio.run(test_agent(resource_name))

    sys.exit(0 if success else 1)


if __name__ == "__main__":
    main()
