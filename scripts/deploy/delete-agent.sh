#!/bin/bash

##############################################################################
# Delete Vertex AI Agent (ReasoningEngine)
#
# Safely delete an ADK agent deployment with confirmation and cleanup.
# Supports Blue/Green deployment lifecycle management.
#
# Usage:
#   ./scripts/deploy/delete-agent.sh [RESOURCE_NAME] [OPTIONS]
#
# Arguments:
#   RESOURCE_NAME (optional): Full resource name to delete
#                             If omitted, uses .agent_resource file
#
# Options:
#   --force         Skip confirmation prompt
#   --list-only     List agents without deleting
#
# Examples:
#   # Delete agent tracked in .agent_resource (with confirmation)
#   ./scripts/deploy/delete-agent.sh
#
#   # Delete specific agent by resource name
#   ./scripts/deploy/delete-agent.sh projects/.../reasoningEngines/123
#
#   # Force delete without confirmation
#   ./scripts/deploy/delete-agent.sh --force
#
#   # List all agents without deleting
#   ./scripts/deploy/delete-agent.sh --list-only
#
# Blue/Green Workflow:
#   1. Deploy v2: AGENT_DISPLAY_NAME="Agent v2" ./deploy-agent.sh
#   2. Test v2: python test_agent.py --resource <v2-resource>
#   3. If bad: ./delete-agent.sh <v2-resource>
#   4. If good: ./delete-agent.sh <v1-resource>
##############################################################################

set -e  # Exit on error

# Configuration
PROJECT_ID="${PROJECT_ID:-fdsanalytics}"
REGION="${REGION:-us-central1}"
AGENT_DIR="$(cd "$(dirname "$0")/../.." && pwd)/agent"
RESOURCE_FILE="$AGENT_DIR/.agent_resource"

# Parse arguments
RESOURCE_NAME=""
FORCE=false
LIST_ONLY=false

while [[ $# -gt 0 ]]; do
    case $1 in
        --force)
            FORCE=true
            shift
            ;;
        --list-only)
            LIST_ONLY=true
            shift
            ;;
        --help|-h)
            head -n 48 "$0" | tail -n +3
            exit 0
            ;;
        *)
            RESOURCE_NAME="$1"
            shift
            ;;
    esac
done

echo "============================================================"
echo "FDS Analytics - Agent Deletion"
echo "============================================================"
echo ""

# Determine resource to delete
if [ -z "$RESOURCE_NAME" ]; then
    if [ -f "$RESOURCE_FILE" ]; then
        RESOURCE_NAME=$(cat "$RESOURCE_FILE")
        echo "Using resource from .agent_resource file:"
        echo "  $RESOURCE_NAME"
    else
        echo "✗ Error: No resource specified and .agent_resource file not found"
        echo ""
        echo "Usage:"
        echo "  ./scripts/deploy/delete-agent.sh <RESOURCE_NAME>"
        echo "  ./scripts/deploy/delete-agent.sh  # Uses .agent_resource"
        echo ""
        echo "List available agents:"
        echo "  ./scripts/deploy/list-agents.sh"
        exit 1
    fi
else
    echo "Using specified resource:"
    echo "  $RESOURCE_NAME"
fi

echo ""

# List all agents for context
echo "[1/3] Listing all deployed agents..."
echo ""

PYTHON_LIST_SCRIPT=$(cat <<'PYTHON_EOF'
import sys
import os
os.environ['PROJECT_ID'] = sys.argv[1]
os.environ['REGION'] = sys.argv[2]

try:
    import vertexai
    from google.cloud import aiplatform

    vertexai.init(project=sys.argv[1], location=sys.argv[2])

    # List all reasoning engines
    client = aiplatform.gapic.ReasoningEngineServiceClient(
        client_options={"api_endpoint": f"{sys.argv[2]}-aiplatform.googleapis.com"}
    )
    parent = f"projects/{sys.argv[1]}/locations/{sys.argv[2]}"

    agents = list(client.list_reasoning_engines(parent=parent))

    if not agents:
        print("  No agents found")
    else:
        print(f"  Found {len(agents)} agent(s):")
        print()
        for agent in agents:
            # Extract ID from resource name
            agent_id = agent.name.split('/')[-1]
            display_name = agent.display_name if agent.display_name else "Unnamed"
            create_time = agent.create_time.strftime("%Y-%m-%d %H:%M:%S") if agent.create_time else "Unknown"

            # Highlight if this is the target
            marker = "→" if agent.name == sys.argv[3] else " "
            print(f"  {marker} {display_name}")
            print(f"    Resource: {agent.name}")
            print(f"    Created:  {create_time}")
            print()

except ImportError:
    print("  ✗ Error: Vertex AI SDK not installed")
    print("  Install with: pip install google-cloud-aiplatform[adk,agent_engines]")
    sys.exit(1)
except Exception as e:
    print(f"  ✗ Error listing agents: {e}")
    sys.exit(1)
PYTHON_EOF
)

if ! python3 -c "$PYTHON_LIST_SCRIPT" "$PROJECT_ID" "$REGION" "$RESOURCE_NAME"; then
    echo ""
    echo "⚠ Warning: Could not list agents, but continuing..."
    echo ""
fi

# Exit if list-only mode
if [ "$LIST_ONLY" = true ]; then
    echo "============================================================"
    echo "List-only mode - no deletion performed"
    echo "============================================================"
    exit 0
fi

# Confirmation prompt (unless --force)
echo "[2/3] Confirming deletion..."
if [ "$FORCE" = false ]; then
    echo ""
    echo "⚠️  WARNING: This will permanently delete the agent and all its sessions."
    echo ""
    echo "Resource to delete:"
    echo "  $RESOURCE_NAME"
    echo ""
    read -p "Are you sure you want to delete this agent? (yes/no): " CONFIRMATION
    echo ""

    if [ "$CONFIRMATION" != "yes" ]; then
        echo "Deletion cancelled"
        exit 0
    fi
else
    echo "  Skipping confirmation (--force mode)"
fi

# Delete the agent
echo "[3/3] Deleting agent..."
echo ""

PYTHON_DELETE_SCRIPT=$(cat <<'PYTHON_EOF'
import sys
import os

os.environ['PROJECT_ID'] = sys.argv[1]
os.environ['REGION'] = sys.argv[2]

try:
    import vertexai
    from vertexai import agent_engines

    vertexai.init(project=sys.argv[1], location=sys.argv[2])

    resource_name = sys.argv[3]
    print(f"  Fetching agent: {resource_name}")

    # Get the agent
    app = agent_engines.get(resource_name)

    print(f"  Deleting agent (force=True to delete sessions)...")

    # Delete with force=True to delete child resources (sessions)
    app.delete(force=True)

    print("  ✓ Agent deleted successfully")

except ImportError:
    print("  ✗ Error: Vertex AI SDK not installed")
    print("  Install with: pip install google-cloud-aiplatform[adk,agent_engines]")
    sys.exit(1)
except Exception as e:
    print(f"  ✗ Error deleting agent: {e}")
    sys.exit(1)
PYTHON_EOF
)

if python3 -c "$PYTHON_DELETE_SCRIPT" "$PROJECT_ID" "$REGION" "$RESOURCE_NAME"; then
    # Clean up .agent_resource file if this was the tracked agent
    if [ -f "$RESOURCE_FILE" ]; then
        TRACKED_RESOURCE=$(cat "$RESOURCE_FILE")
        if [ "$TRACKED_RESOURCE" = "$RESOURCE_NAME" ]; then
            echo ""
            echo "  Cleaning up .agent_resource file..."
            rm "$RESOURCE_FILE"
            echo "  ✓ Removed .agent_resource (deleted agent was tracked)"
        fi
    fi

    echo ""
    echo "============================================================"
    echo "DELETION SUCCESSFUL"
    echo "============================================================"
    echo ""
    echo "The agent has been permanently deleted."
    echo ""
    echo "To deploy a new agent:"
    echo "  ./scripts/deploy/deploy-agent.sh"
    echo ""
    echo "To list remaining agents:"
    echo "  ./scripts/deploy/list-agents.sh"
    echo ""
    echo "============================================================"
else
    echo ""
    echo "✗ Deletion failed"
    echo ""
    echo "Troubleshooting:"
    echo "  1. Verify resource name is correct"
    echo "  2. Check you have permission to delete agents"
    echo "  3. Ensure Vertex AI SDK is installed: pip install google-cloud-aiplatform[adk,agent_engines]"
    echo "  4. Check project and region are correct"
    echo ""
    exit 1
fi
