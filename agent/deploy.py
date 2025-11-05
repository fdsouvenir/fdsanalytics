"""
Deploy FDS Analytics Agent to Vertex AI Agent Engine

This script deploys the ADK agent to Vertex AI's fully-managed runtime.
The agent will be accessible via REST API or Python SDK.

Usage:
    python deploy.py

Environment Variables:
    PROJECT_ID: GCP project ID (default: fdsanalytics)
    REGION: Deployment region (default: us-central1)
    STAGING_BUCKET: GCS bucket for staging (default: gs://fdsanalytics-agent-staging)
    AGENT_DISPLAY_NAME: Display name for the agent (default: FDS Analytics Agent)
"""

import vertexai
from vertexai import agent_engines
from agent import root_agent
import os
import sys
from pathlib import Path

# Configuration from environment or defaults
PROJECT_ID = os.getenv("PROJECT_ID", "fdsanalytics")
REGION = os.getenv("REGION", "us-central1")
STAGING_BUCKET = os.getenv(
    "STAGING_BUCKET",
    f"gs://{PROJECT_ID}-agent-staging"
)
AGENT_DISPLAY_NAME = os.getenv("AGENT_DISPLAY_NAME", "FDS Analytics Agent")

print("=" * 60)
print("FDS Analytics Agent - Deployment")
print("=" * 60)
print(f"Project ID:      {PROJECT_ID}")
print(f"Region:          {REGION}")
print(f"Staging Bucket:  {STAGING_BUCKET}")
print(f"Display Name:    {AGENT_DISPLAY_NAME}")
print("=" * 60)

# Initialize Vertex AI
print("\n[1/4] Initializing Vertex AI SDK...")
try:
    vertexai.init(
        project=PROJECT_ID,
        location=REGION,
        staging_bucket=STAGING_BUCKET,
    )
    print("✓ Vertex AI initialized")
except Exception as e:
    print(f"✗ Failed to initialize Vertex AI: {e}")
    sys.exit(1)

# Wrap agent in AdkApp
print("\n[2/4] Wrapping agent with AdkApp...")
try:
    app = agent_engines.AdkApp(
        agent=root_agent,
        enable_tracing=True,  # Enable Cloud Trace for observability
    )
    print("✓ Agent wrapped successfully")
except Exception as e:
    print(f"✗ Failed to wrap agent: {e}")
    sys.exit(1)

# Deploy to Agent Engine
print("\n[3/4] Deploying to Vertex AI Agent Engine...")
print("(This may take 2-3 minutes...)")
try:
    remote_app = agent_engines.create(
        agent_engine=app,
        display_name=AGENT_DISPLAY_NAME,
        requirements=[
            "google-cloud-aiplatform[adk,agent_engines]>=1.112",
            "pyyaml>=6.0",
        ]
    )
    print("✓ Agent deployed successfully!")
except Exception as e:
    print(f"✗ Deployment failed: {e}")
    sys.exit(1)

# Save resource name for later use
print("\n[4/4] Saving deployment information...")
resource_file = Path(__file__).parent / ".agent_resource"
try:
    with open(resource_file, "w") as f:
        f.write(remote_app.resource_name)
    print(f"✓ Resource name saved to: {resource_file}")
except Exception as e:
    print(f"⚠ Warning: Could not save resource name: {e}")

# Print deployment summary
print("\n" + "=" * 60)
print("DEPLOYMENT SUCCESSFUL!")
print("=" * 60)
print(f"\nResource Name:")
print(f"  {remote_app.resource_name}")
print(f"\nAPI Endpoint:")
print(f"  https://{REGION}-aiplatform.googleapis.com/v1/{remote_app.resource_name}:query")
print(f"\nTest the agent:")
print(f"  python test_agent.py")
print(f"\nView in Console:")
print(f"  https://console.cloud.google.com/vertex-ai/agents?project={PROJECT_ID}")
print("\n" + "=" * 60)
