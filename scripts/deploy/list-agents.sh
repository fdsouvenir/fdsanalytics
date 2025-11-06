#!/bin/bash

##############################################################################
# List Vertex AI Agents (ReasoningEngines)
#
# Display all deployed ADK agents with details.
# Highlights the currently tracked agent from .agent_resource file.
#
# Usage:
#   ./scripts/deploy/list-agents.sh [FILTER_PATTERN]
#
# Arguments:
#   FILTER_PATTERN (optional): Filter agents by display name pattern
#
# Examples:
#   # List all agents
#   ./scripts/deploy/list-agents.sh
#
#   # Filter by name pattern
#   ./scripts/deploy/list-agents.sh "FDS Analytics"
#
#   # Filter for test agents
#   ./scripts/deploy/list-agents.sh "Test"
#
# Environment Variables:
#   PROJECT_ID (default: fdsanalytics)
#   REGION (default: us-central1)
##############################################################################

set -e  # Exit on error

# Configuration
PROJECT_ID="${PROJECT_ID:-fdsanalytics}"
REGION="${REGION:-us-central1}"
AGENT_DIR="$(cd "$(dirname "$0")/../.." && pwd)/agent"
RESOURCE_FILE="$AGENT_DIR/.agent_resource"

# Parse arguments
FILTER_PATTERN="${1:-}"

echo "============================================================"
echo "FDS Analytics - List Agents"
echo "============================================================"
echo "Project ID: $PROJECT_ID"
echo "Region:     $REGION"
if [ -n "$FILTER_PATTERN" ]; then
    echo "Filter:     $FILTER_PATTERN"
fi
echo "============================================================"
echo ""

# Get tracked resource if exists
TRACKED_RESOURCE=""
if [ -f "$RESOURCE_FILE" ]; then
    TRACKED_RESOURCE=$(cat "$RESOURCE_FILE")
fi

# List agents using Python
PYTHON_SCRIPT=$(cat <<'PYTHON_EOF'
import sys
import os

os.environ['PROJECT_ID'] = sys.argv[1]
os.environ['REGION'] = sys.argv[2]

try:
    import vertexai
    from google.cloud import aiplatform
    from datetime import datetime

    vertexai.init(project=sys.argv[1], location=sys.argv[2])

    # Get filter pattern and tracked resource
    filter_pattern = sys.argv[3] if len(sys.argv) > 3 else ""
    tracked_resource = sys.argv[4] if len(sys.argv) > 4 else ""

    # List all reasoning engines
    client = aiplatform.gapic.ReasoningEngineServiceClient(
        client_options={"api_endpoint": f"{sys.argv[2]}-aiplatform.googleapis.com"}
    )
    parent = f"projects/{sys.argv[1]}/locations/{sys.argv[2]}"

    agents = list(client.list_reasoning_engines(parent=parent))

    # Filter if pattern provided
    if filter_pattern:
        agents = [a for a in agents if filter_pattern.lower() in (a.display_name or "").lower()]

    if not agents:
        if filter_pattern:
            print(f"No agents found matching '{filter_pattern}'")
        else:
            print("No agents found")
        print()
        print("Deploy your first agent:")
        print("  ./scripts/deploy/deploy-agent.sh")
        sys.exit(0)

    # Display header
    print(f"Found {len(agents)} agent(s):")
    print()
    print("─" * 80)

    # Display each agent
    for i, agent in enumerate(agents, 1):
        # Extract details
        agent_id = agent.name.split('/')[-1]
        display_name = agent.display_name if agent.display_name else "Unnamed Agent"
        create_time = agent.create_time.strftime("%Y-%m-%d %H:%M:%S %Z") if agent.create_time else "Unknown"
        update_time = agent.update_time.strftime("%Y-%m-%d %H:%M:%S %Z") if agent.update_time else "Unknown"

        # Check if this is the tracked agent
        is_tracked = (agent.name == tracked_resource)
        marker = "★ TRACKED" if is_tracked else ""

        # Display agent info
        print(f"[{i}] {display_name} {marker}")
        print(f"    Resource ID:   {agent_id}")
        print(f"    Resource Name: {agent.name}")
        print(f"    Created:       {create_time}")
        print(f"    Updated:       {update_time}")

        # Show endpoint
        endpoint = f"https://{sys.argv[2]}-aiplatform.googleapis.com/v1/{agent.name}:query"
        print(f"    Endpoint:      {endpoint}")

        if i < len(agents):
            print()

    print("─" * 80)
    print()

    # Show tracked agent note
    if tracked_resource:
        print("Note:")
        print("  ★ = Currently tracked in .agent_resource file")
        print(f"      ({tracked_resource})")
        print()
    else:
        print("Note:")
        print("  No agent currently tracked in .agent_resource file")
        print("  Deploy an agent to create tracking: ./scripts/deploy/deploy-agent.sh")
        print()

except ImportError:
    print("✗ Error: Vertex AI SDK not installed")
    print()
    print("Install with:")
    print("  pip install google-cloud-aiplatform[adk,agent_engines]")
    print()
    sys.exit(1)
except Exception as e:
    print(f"✗ Error listing agents: {e}")
    print()
    print("Troubleshooting:")
    print("  1. Verify you have permission to list agents")
    print("  2. Check project and region are correct")
    print("  3. Ensure Vertex AI API is enabled")
    print()
    sys.exit(1)
PYTHON_EOF
)

python3 -c "$PYTHON_SCRIPT" "$PROJECT_ID" "$REGION" "$FILTER_PATTERN" "$TRACKED_RESOURCE"

# Show helpful commands
echo "Useful Commands:"
echo "  Deploy new agent:    ./scripts/deploy/deploy-agent.sh"
echo "  Test agent:          cd agent && python test_agent.py"
echo "  Delete agent:        ./scripts/deploy/delete-agent.sh <RESOURCE_NAME>"
echo "  Filter agents:       ./scripts/deploy/list-agents.sh \"pattern\""
echo ""
echo "Blue/Green Deployment:"
echo "  Deploy v2:  AGENT_DISPLAY_NAME=\"Agent v2\" ./scripts/deploy/deploy-agent.sh"
echo "  Test v2:    python test_agent.py --resource <v2-resource>"
echo "  Delete old: ./scripts/deploy/delete-agent.sh <v1-resource>"
echo ""
