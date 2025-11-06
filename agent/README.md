# FDS Analytics Agent (ADK)

Minimal ADK agent that provides conversation orchestration for the FDS Analytics Tool Server.

## Architecture

```
Vertex AI Agent (ADK - Python)
  ↓ (orchestrates function calling)
Node.js Tool Server (Cloud Run)
  ↓ (executes BigQuery queries)
BigQuery Stored Procedures
  ↓ (returns analytics data)
restaurant_analytics + insights datasets
```

**Key Points:**
- Agent handles: Conversation management, NLU, function calling decisions
- Tool Server handles: BigQuery integration, business logic, chart generation
- ~150 lines of Python total (minimal maintenance)
- 100% CLI-based deployment (zero GUI interaction)

## Prerequisites

1. **Python 3.9+** installed
2. **gcloud CLI** authenticated:
   ```bash
   gcloud auth login
   gcloud auth application-default login
   gcloud config set project fdsanalytics
   ```
3. **Tool Server deployed** (Node.js service on Cloud Run)
4. **Infrastructure setup complete** (run setup script once)

## Quick Start

### 1. One-Time Infrastructure Setup

```bash
# Enable APIs, create GCS bucket, configure IAM
./scripts/deploy/setup-agent-infrastructure.sh
```

This script:
- Enables Vertex AI APIs
- Creates staging bucket (`gs://fdsanalytics-agent-staging`)
- Grants Extension Service Agent permission to invoke Tool Server
- Configures OIDC authentication

### 2. Install Python Dependencies

```bash
cd agent
pip install -r requirements.txt
```

### 3. Deploy the Agent

```bash
# Option A: Via deployment script (recommended)
./scripts/deploy/deploy-agent.sh

# Option B: Directly
cd agent
python deploy.py
```

Deployment takes 2-3 minutes. The agent resource name is saved to `.agent_resource`.

### 4. Test the Agent

```bash
cd agent
python test_agent.py
```

This runs 5 test queries to validate the deployment.

## Files

```
agent/
├── agent.py              # Main agent definition (~50 lines)
├── deploy.py             # Deployment script (~40 lines)
├── test_agent.py         # Test suite (~150 lines)
├── requirements.txt      # Python dependencies
├── .env.example          # Configuration template
├── .gitignore            # Ignore .env and cache files
├── .agent_resource       # Saved agent resource name (auto-generated)
└── README.md             # This file
```

## Agent Configuration

The agent is configured in `agent.py`:

- **Model:** `gemini-2.5-flash` (best price-performance for function calling)
- **Tools:** Loaded from `../vertex-ai-tools-config.yaml` (OpenAPI spec)
- **Authentication:** OIDC (configured in OpenAPI spec)
- **Temperature:** 1.0 (balanced creativity/consistency)
- **Top-P:** 0.95 (standard nucleus sampling)

## Environment Variables

Create `.env` from `.env.example`:

```bash
PROJECT_ID=fdsanalytics
REGION=us-central1
STAGING_BUCKET=gs://fdsanalytics-agent-staging
AGENT_DISPLAY_NAME=FDS Analytics Agent
```

## Blue/Green Deployment

**Important:** ADK agents (ReasoningEngines) do NOT support Cloud Run-style revisions or traffic splitting. Each deployment creates a new resource.

### Why Blue/Green?

Unlike Cloud Run, you cannot:
- ❌ Roll back to previous revision with one click
- ❌ Split traffic between versions (0%/100%, 50%/50%, etc.)
- ❌ Gradually migrate users to new version

Instead, use Blue/Green deployment for safe rollback:
- ✅ Deploy new version alongside old
- ✅ Test new version thoroughly before switching
- ✅ Keep old version running for instant rollback
- ✅ Delete old version only when confident

### Workflow

**Step 1: List Current Agents**

```bash
./scripts/deploy/list-agents.sh
```

Shows all deployed agents with their resource names.

**Step 2: Deploy New Version**

```bash
# Deploy v2 alongside existing v1
AGENT_DISPLAY_NAME="FDS Analytics Agent v2" ./scripts/deploy/deploy-agent.sh
```

This creates a NEW agent resource with a different name. The original agent continues running.

**Step 3: Test New Version**

```bash
# Get v2 resource name from output or .agent_resource file
V2_RESOURCE=$(cat agent/.agent_resource)

# Test v2 thoroughly
python test_agent.py --resource "$V2_RESOURCE"

# Test with real queries
python -c "
from vertexai import agent_engines
import vertexai
import asyncio

vertexai.init(project='fdsanalytics', location='us-central1')
app = agent_engines.get('$V2_RESOURCE')

async def test():
    session = await app.async_create_session(user_id='test')
    async for event in app.async_stream_query(
        user_id='test',
        session_id=session['id'],
        message='Show me daily sales for May 2025'
    ):
        print(event.text, end='')
    print()

asyncio.run(test())
"
```

**Step 4: Decision Point**

**If v2 is GOOD:**

```bash
# Update your UI/application to use v2 resource name
# (Update environment variables, config files, etc.)

# List agents to confirm v1 resource name
./scripts/deploy/list-agents.sh

# Delete old v1
./scripts/deploy/delete-agent.sh <v1-resource-name>
```

**If v2 is BAD:**

```bash
# Keep using v1 (no changes to UI/application)

# Delete failed v2
./scripts/deploy/delete-agent.sh <v2-resource-name>

# v1 continues serving traffic - zero downtime!
```

### Naming Conventions

Use semantic versioning or date-based naming:

```bash
# Semantic versioning
AGENT_DISPLAY_NAME="FDS Analytics Agent v1.0.0"
AGENT_DISPLAY_NAME="FDS Analytics Agent v1.1.0"
AGENT_DISPLAY_NAME="FDS Analytics Agent v2.0.0"

# Date-based
AGENT_DISPLAY_NAME="FDS Analytics Agent 2025-11-05"
AGENT_DISPLAY_NAME="FDS Analytics Agent 2025-11-06"

# Feature-based
AGENT_DISPLAY_NAME="FDS Analytics Agent (Canary)"
AGENT_DISPLAY_NAME="FDS Analytics Agent (Prod)"
```

### Helper Scripts

**List all agents:**
```bash
./scripts/deploy/list-agents.sh

# Filter by pattern
./scripts/deploy/list-agents.sh "v2"
```

**Delete an agent:**
```bash
# With confirmation prompt
./scripts/deploy/delete-agent.sh <resource-name>

# Force delete (no prompt)
./scripts/deploy/delete-agent.sh --force <resource-name>

# Delete tracked agent
./scripts/deploy/delete-agent.sh  # Uses .agent_resource
```

### Complete Example

```bash
# Current state: "FDS Analytics Agent v1" is live

# 1. Deploy v2
echo "Deploying v2..."
AGENT_DISPLAY_NAME="FDS Analytics Agent v2" ./scripts/deploy/deploy-agent.sh
V2_RESOURCE=$(cat agent/.agent_resource)
echo "v2 deployed: $V2_RESOURCE"

# 2. Test v2
echo "Testing v2..."
python test_agent.py --resource "$V2_RESOURCE"

# 3. If tests pass, update application to use v2
echo "Tests passed! Update application config with: $V2_RESOURCE"

# 4. Verify v2 in production, then delete v1
sleep 300  # Wait 5 minutes to monitor
echo "Deleting v1..."
./scripts/deploy/list-agents.sh  # Find v1 resource name
./scripts/deploy/delete-agent.sh <v1-resource-name>

echo "Migration complete! v2 is now the only version running."
```

### Rollback Procedure

If you discover an issue with the new version after switching:

1. **Immediate:** Update application config to use old resource name
2. **Optional:** Redeploy old version with same code (from git)
3. **Cleanup:** Delete bad version after confirming rollback

This is why keeping the old version running for a grace period is recommended.

## Testing

### Automated Test Suite

```bash
python test_agent.py
```

Runs 5 predefined queries covering all major function types.

### Manual Testing

```python
import asyncio
from vertexai import agent_engines
import vertexai

# Initialize
vertexai.init(project="fdsanalytics", location="us-central1")
app = agent_engines.get("projects/.../reasoningEngines/...")

# Create session
session = await app.async_create_session(user_id="test_user")

# Query agent
async for event in app.async_stream_query(
    user_id="test_user",
    session_id=session["id"],
    message="Show me daily sales for May 2025"
):
    print(event.text, end="")
```

### REST API Testing

```bash
# Get resource name
AGENT_RESOURCE=$(cat .agent_resource)

# Create session
curl -X POST \
  -H "Authorization: Bearer $(gcloud auth print-access-token)" \
  -H "Content-Type: application/json" \
  https://us-central1-aiplatform.googleapis.com/v1/${AGENT_RESOURCE}:query \
  -d '{"class_method": "async_create_session", "input": {"user_id": "test"}}'

# Query agent
curl -X POST \
  -H "Authorization: Bearer $(gcloud auth print-access-token)" \
  -H "Content-Type: application/json" \
  https://us-central1-aiplatform.googleapis.com/v1/${AGENT_RESOURCE}:streamQuery?alt=sse \
  -d '{
    "class_method": "async_stream_query",
    "input": {
      "user_id": "test",
      "session_id": "SESSION_ID",
      "message": "Show me daily sales for May 2025"
    }
  }'
```

## Updating the Agent

### Modify Agent Instructions

Edit `agent/agent.py` instructions and redeploy:

```bash
./scripts/deploy/deploy-agent.sh
```

### Add New Tools

1. Update `vertex-ai-tools-config.yaml` with new function
2. Implement function in Tool Server (`services/response-engine/`)
3. Redeploy Tool Server: `./scripts/deploy/deploy-response-engine.sh`
4. Redeploy agent: `./scripts/deploy/deploy-agent.sh`

### Change Model

Edit `agent/agent.py`:

```python
root_agent = LlmAgent(
    name="fds_analytics_agent",
    model="gemini-2.5-pro",  # Change to pro for better reasoning
    ...
)
```

Then redeploy.

## Monitoring & Debugging

### View Agent Logs

```bash
gcloud logging read \
  'resource.type="aiplatform.googleapis.com/ReasoningEngine"' \
  --project=fdsanalytics \
  --limit=50 \
  --format=json
```

### View Tool Server Logs

```bash
gcloud run services logs read response-engine \
  --region=us-central1 \
  --limit=50
```

### Cloud Trace

Agent has tracing enabled. View in Console:

https://console.cloud.google.com/traces?project=fdsanalytics

### Console

View agent in Vertex AI Console:

https://console.cloud.google.com/vertex-ai/agents?project=fdsanalytics

## Troubleshooting

### Deployment Fails

**Symptom:** `deploy.py` exits with error

**Solutions:**
1. Run setup script: `./scripts/deploy/setup-agent-infrastructure.sh`
2. Verify APIs enabled: `gcloud services list --enabled | grep vertex`
3. Check IAM permissions: https://console.cloud.google.com/iam-admin/iam?project=fdsanalytics
4. Verify staging bucket: `gsutil ls gs://fdsanalytics-agent-staging`

### Agent Returns Errors

**Symptom:** Test queries fail with errors

**Solutions:**
1. Verify Tool Server is running: `gcloud run services list --region=us-central1`
2. Check Tool Server logs: `gcloud run services logs read response-engine --limit=20`
3. Verify IAM permissions for Extension Service Agent
4. Test Tool Server directly: `./scripts/testing/test-tool-server.sh`

### No Response from Agent

**Symptom:** Agent connects but returns empty responses

**Solutions:**
1. Check agent logs for errors
2. Verify OpenAPI spec is valid: `yq . ../vertex-ai-tools-config.yaml`
3. Ensure Tool Server URL in OpenAPI spec is correct
4. Test with simpler query: "Hello, are you there?"

### Permission Denied Errors

**Symptom:** 403 errors when calling Tool Server

**Solutions:**
1. Verify Extension Service Agent has `roles/run.invoker` on Tool Server
2. Check OIDC configuration in OpenAPI spec
3. Verify Tool Server SA exists: `gcloud iam service-accounts list`

## Performance

- **Agent response time:** 100-200ms (orchestration overhead)
- **Tool Server latency:** 200-800ms (BigQuery execution)
- **Total end-to-end:** 300-1000ms per query

Cached queries (via insights) are ~3x faster.

## Cost Optimization

- **Model:** gemini-2.5-flash (~$0.10 per 1M tokens)
- **Hosting:** Agent Engine is serverless (pay per request)
- **Tool Server:** Cloud Run (pay per use)
- **Typical cost:** $0.01-0.05 per conversation (10-20 turns)

## Support

For issues or questions:
- Check logs first (agent + Tool Server)
- Review troubleshooting section above
- File issue in GitHub repo
- Contact: fred@fdsconsulting.com

## Next Steps

1. ✅ Deploy agent: `./scripts/deploy/deploy-agent.sh`
2. ✅ Test agent: `python test_agent.py`
3. ✅ Review logs: Check Cloud Logging
4. 🚀 Integrate with UI: Connect Google Workspace Addon
5. 📊 Monitor usage: Set up dashboards in Console

## Resources

- [ADK Documentation](https://google.github.io/adk-docs/)
- [Vertex AI Agent Builder](https://cloud.google.com/vertex-ai/docs/agent-builder)
- [OpenAPI 3.0 Spec](https://swagger.io/specification/)
- [Project Documentation](../docs/00-index.md)
