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
