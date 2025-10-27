# Claude Code Subagents - Quick Reference Guide

## Overview

This project uses **7 specialized subagents** to build the system incrementally. Each agent has specific expertise and builds a portion of the codebase.

---

## 🤖 The 7 Agents

### 1️⃣ **foundation** - Foundation Builder
**Builds:** Shared types, utilities, error classes  
**Depends on:** Nothing (build first)  
**Output:** `shared/` package  
**Start with:** `claude-code --agent foundation "Build shared code"`

### 2️⃣ **data** - Data Layer Specialist  
**Builds:** BigQuery analytics, BigQuery stored procedures  
**Depends on:** foundation  
**Output:** `services/response-engine/` + `sql/`  
**Start with:** `claude-code --agent data "Build BigQuery analytics"`

### 3️⃣ **conversation** - Conversation Manager Specialist
**Builds:** Chat history and context management  
**Depends on:** foundation, data  
**Output:** `services/conversation-manager/`  
**Start with:** `claude-code --agent conversation "Build Conversation Manager"`

### 4️⃣ **ingestion** - Ingestion Pipeline Specialist
**Builds:** Gmail to BigQuery data pipeline  
**Depends on:** foundation, data  
**Output:** `services/gmail-ingestion/`  
**Start with:** `claude-code --agent ingestion "Build Gmail Ingestion"`

### 5️⃣ **orchestration** - Orchestration Specialist
**Builds:** Response Engine (main service)  
**Depends on:** foundation, data, conversation  
**Output:** `services/response-engine/`  
**Start with:** `claude-code --agent orchestration "Build Response Engine"`

### 6️⃣ **testing** - Testing Specialist
**Builds:** All tests (unit, integration, E2E)  
**Depends on:** All service agents  
**Output:** All `__tests__/` directories  
**Start with:** `claude-code --agent testing "Write comprehensive tests"`

### 7️⃣ **devops** - DevOps Specialist
**Builds:** Deployment scripts, CI/CD, Docker  
**Depends on:** All service agents  
**Output:** `scripts/`, `.github/`, Dockerfiles  
**Start with:** `claude-code --agent devops "Create deployment automation"`

---

## 📋 Build Order

### Phase 1: Foundation (Start Here)
```bash
claude-code --agent foundation "Build all shared types and utilities from docs/"
```
**Wait for completion before proceeding.**

### Phase 2: Core Services (Parallel)
```bash
# Can run these simultaneously in different terminals:
claude-code --agent data "Build BigQuery analytics with BigQuery stored procedures"
claude-code --agent conversation "Build Conversation Manager with Gemini Flash"
claude-code --agent ingestion "Build Gmail Ingestion service"
```
**Wait for all 3 to complete.**

### Phase 3: Orchestration
```bash
claude-code --agent orchestration "Build Response Engine that integrates all services"
```
**Wait for completion.**

### Phase 4: Testing & Deployment (Parallel or Sequential)
```bash
# Parallel (recommended):
claude-code --agent testing "Write comprehensive test suite with 80%+ coverage"
claude-code --agent devops "Create deployment scripts and CI/CD pipeline"

# Or sequential:
claude-code --agent testing "Write tests" && claude-code --agent devops "Create deployment"
```

---

## 🎯 Common Commands

### Check which agent should handle a task
```bash
# If working on shared utilities:
claude-code --agent foundation "Add currency formatting utility"

# If working on BigQuery queries:
claude-code --agent data "Add new stored procedure for X"

# If working on response generation:
claude-code --agent orchestration "Improve chart generation logic"

# If adding tests:
claude-code --agent testing "Add integration tests for MCP server"

# If updating deployment:
claude-code --agent devops "Update Cloud Run memory limits"
```

### Ask an agent questions
```bash
claude-code --agent data "How should I validate date ranges in queries?"
claude-code --agent orchestration "What's the fallback strategy if charts fail?"
claude-code --agent testing "What mocking strategy should I use for Gemini API?"
```

### Review agent's work
```bash
claude-code --agent foundation "Review the retry logic implementation"
claude-code --agent data "Check if stored procedures prevent SQL injection"
```

---

## 📚 Agent Expertise Reference

### When to use **foundation**:
- TypeScript types and interfaces
- Shared utilities (logger, retry, date/currency)
- Error classes
- Constants
- Anything in `shared/`

### When to use **data**:
- BigQuery schemas and tables
- Stored procedures
- BigQuery analytics implementation
- Query validation
- Data access layer
- Anything in `services/response-engine/` or `sql/`

### When to use **conversation**:
- Chat history storage
- Context extraction
- Gemini Flash integration
- Message threading
- Anything in `services/conversation-manager/`

### When to use **ingestion**:
- Gmail API integration
- PDF parsing
- PMIX report processing
- Backfill orchestration
- Data pipeline logic
- Anything in `services/gmail-ingestion/`

### When to use **orchestration**:
- Response Engine
- Service integration
- Gemini Pro for responses
- Chart generation
- Google Chat API
- Main orchestration logic
- Anything in `services/response-engine/`

### When to use **testing**:
- Unit tests
- Integration tests
- E2E tests
- Test fixtures
- Mocking strategies
- Coverage reports
- Anything in `__tests__/` or `test-data/`

### When to use **devops**:
- Dockerfiles
- docker-compose.yml
- Deployment scripts
- GitHub Actions
- IAM and service accounts
- Cloud Scheduler
- Infrastructure
- Anything in `scripts/` or `.github/`

---

## ⚠️ Important Rules

### ✅ Do:
- Build agents in order (foundation → services → testing/devops)
- Let each agent focus on its expertise
- Read all docs in `docs/` before starting
- Write tests as you build
- Follow specifications exactly

### ❌ Don't:
- Skip the foundation agent
- Let agents work outside their scope
- Build orchestration before services are ready
- Write all code then test (test incrementally)
- Improvise - follow the specifications

---

## 🔍 Troubleshooting

### "Agent says it doesn't have enough context"
→ Make sure `docs/` folder is in context  
→ Reference specific docs: `--context docs/02-api-contracts.md`

### "Agent is building something outside its scope"
→ Stop and redirect to correct agent  
→ Example: If `orchestration` tries to write SQL, redirect to `data` agent

### "Dependencies not satisfied"
→ Check if prerequisite agents have completed  
→ Foundation must be done before any other agent starts  
→ data, conversation must be done before orchestration starts

### "Tests failing"
→ Check which agent built the code  
→ Have that agent fix the tests  
→ If integration tests fail, may need multiple agents to collaborate

---

## 📊 Progress Tracking

Use this checklist:

- [ ] **Phase 1: Foundation**
  - [ ] Types implemented
  - [ ] Logger working
  - [ ] Retry logic tested
  - [ ] Error classes created
  - [ ] All unit tests passing

- [ ] **Phase 2: Services**
  - [ ] BigQuery analytics (data agent)
    - [ ] Stored procedures created
    - [ ] Tools implemented
    - [ ] Tests passing
  - [ ] Conversation Manager (conversation agent)
    - [ ] Storage working
    - [ ] Summarization working
    - [ ] Tests passing
  - [ ] Gmail Ingestion (ingestion agent)
    - [ ] Gmail client working
    - [ ] Parser working
    - [ ] Tests passing

- [ ] **Phase 3: Orchestration**
  - [ ] Response Engine built
  - [ ] Integrates all services
  - [ ] Gemini Pro working
  - [ ] Charts generating
  - [ ] Tests passing

- [ ] **Phase 4: Quality & Deployment**
  - [ ] Test coverage >80%
  - [ ] All integration tests passing
  - [ ] Dockerfiles created
  - [ ] Deployment scripts working
  - [ ] CI/CD configured

---

## 🚀 Quick Start

```bash
# 1. Ensure docs/ folder is accessible
cd your-project
ls docs/  # Should see all .md files

# 2. Start with foundation
claude-code --agent foundation "Read all docs and build shared code foundation"

# 3. Wait for completion, then continue with services
# ... follow build order above
```

---

## 💡 Pro Tips

1. **Use context wisely:** Agents already know their expertise from `.claude/subagents.yaml`. Just give them clear instructions.

2. **Be specific:** Instead of "build the service", say "build BigQuery analytics following docs/02-api-contracts.md Section 5"

3. **Incremental validation:** After each agent completes, run tests before moving on.

4. **Parallel where possible:** Agents 2, 3, 4 can work in parallel. Same with agents 6 and 7.

5. **Review before merging:** Have agents review each other's work when there are integration points.

---

**Need help?** Check the full specifications in `docs/` or refer to `.claude/subagents.yaml` for detailed agent configurations.
