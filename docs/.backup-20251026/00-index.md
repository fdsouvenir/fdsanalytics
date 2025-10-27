# Restaurant Analytics System - Complete Documentation
## Senso Restaurant Analytics V1.0

**Project:** Restaurant Analytics Chat Assistant  
**Customer:** Senso Sushi (Frankfort) - Single Tenant  
**Platform:** Google Chat Workspace Addon  
**GCP Project:** fdsanalytics  
**Documentation Date:** October 22, 2025  

---

## 📚 Document Index

This directory contains complete specifications for rebuilding the restaurant analytics system from scratch. Read documents in order for best understanding.

### 1. [System Requirements](./01-system-requirements.md)
**Purpose:** What we're building and why  
**Contains:**
- Functional requirements (core features)
- Non-functional requirements (performance, security)
- Success criteria
- User stories
- Out of scope items

**Key Takeaways:**
- Single-tenant v1 with multi-tenant design considerations
- Natural language analytics via Google Chat
- PMIX ingestion from Gmail
- Secure-by-design with MCP + BQ stored procedures
- Target: <5s query response, 80%+ test coverage

---

### 2. [API Contracts & Interfaces](./02-api-contracts.md)
**Purpose:** Define all component interfaces  
**Contains:**
- Response Engine public API
- MCP server protocol
- BigQuery stored procedure signatures
- Chart Builder interface
- Error response standards
- Logging standards

**Key Takeaways:**
- Contract-driven development
- All interfaces use TypeScript for type safety
- Standard error response format
- Structured JSON logging

---

### 3. [Data Models & BigQuery Schemas](./03-data-models.md)
**Purpose:** Database structure and data types  
**Contains:**
- Complete BigQuery table schemas
- Relationships and foreign keys
- Query patterns and best practices
- Sample data
- Future dataset designs

**Key Takeaways:**
- Existing `restaurant_analytics` and `insights` datasets
- New `ingestion` dataset for tracking
- MERGE upsert pattern for idempotency
- Avoid Cartesian products in aggregations
- Currency stored as STRING, cast to FLOAT64 in queries

---

### 4. [Configuration Schema](./04-configuration-schema.md)
**Purpose:** Environment variables, secrets, and runtime config  
**Contains:**
- Environment variables (dev/prod)
- Secret Manager structure
- Service account permissions
- Cloud Run/Function configuration
- Cloud Scheduler setup

**Key Takeaways:**
- Secrets in Google Secret Manager
- Service account per component
- Environment-based configuration
- Feature flags for gradual rollout

---

### 5. [Error Handling Strategy](./05-error-handling.md)
**Purpose:** How to handle failures gracefully  
**Contains:**
- Error classification (user input, transient, etc.)
- Retry logic with exponential backoff
- Fallback strategies
- User-facing error messages
- Circuit breaker pattern

**Key Takeaways:**
- Retry transient errors (3 attempts)
- Graceful degradation for non-critical features
- User-friendly messages (no stack traces)
- Structured error logging

---

### 6. [Testing Strategy](./06-testing-strategy.md)
**Purpose:** Test approach and coverage goals  
**Contains:**
- Unit, integration, and E2E test scenarios
- Mock data and test fixtures
- Performance benchmarks
- CI/CD integration
- Coverage requirements (80%+)

**Key Takeaways:**
- 70% unit tests, 25% integration, 5% E2E
- Test BigQuery dataset for integration tests
- Comprehensive mocking strategy
- Automated testing in CI/CD pipeline

---

### 7. [Deployment Architecture](./07-deployment-architecture.md)
**Purpose:** GCP infrastructure and deployment process  
**Contains:**
- Service specifications (Cloud Run, Cloud Functions)
- IAM configuration
- CI/CD pipeline (GitHub Actions)
- Monitoring and alerting
- Disaster recovery procedures

**Key Takeaways:**
- Cloud Run for stateless services
- Cloud Function for Gmail ingestion
- Automated deployment via GitHub Actions
- Scale-to-zero for cost optimization
- Estimated cost: $40-80/month

---

### 8. [Project Structure](./08-project-structure.md)
**Purpose:** Code organization and file layout  
**Contains:**
- Directory structure
- Service-by-service breakdown
- Shared code organization
- Configuration files
- Naming conventions

**Key Takeaways:**
- Monorepo with workspaces
- Services in `services/` directory
- Shared code in `shared/` directory
- TypeScript throughout
- Path aliases for imports

---

## 🏗️ Architecture Overview

```
┌─────────────┐
│   User      │
└──────┬──────┘
       │
       ▼
┌─────────────────────────────────────────────────────┐
│              Google Chat Workspace Addon            │
└──────────────────────┬──────────────────────────────┘
                       │
                       ▼
       ┌───────────────────────────────┐
       │      Response Engine          │
       │      (Cloud Run)              │
       └───────┬───────────────┬───────┘
               │               │
       ┌───────▼─────┐   ┌────▼────────┐
       │ Conversation│   │ BigQuery analytics  │
       │  Manager    │   │ (Cloud Run) │
       │ (Cloud Run) │   └────┬────────┘
       └──────┬──────┘        │
              │               │
              └───────┬───────┘
                      ▼
              ┌───────────────┐
              │   BigQuery    │
              │   - sales/    │
              │   - insights/ │
              │   - chat/     │
              │   - ingestion/│
              └───────────────┘

┌──────────────────┐         ┌──────────────┐
│ Cloud Scheduler  │────────►│ Gmail        │
│ (Daily 3am)      │         │ Ingestion    │
└──────────────────┘         │ (Function)   │
                             └──────┬───────┘
                                    │
                             ┌──────▼───────┐
                             │  Gmail API   │
                             └──────────────┘
```

---

## 🎯 Key Design Decisions

### 1. Security: MCP + Stored Procedures
**Problem:** Prevent SQL injection  
**Solution:** MCP protocol validates parameters → BigQuery stored procedures build queries safely  
**Benefit:** Injection-proof by design

### 2. Architecture: Separation of Concerns
**Components:**
- Response Engine: Orchestration
- Conversation Manager: History + context
- BigQuery analytics: Data access
- Chart Builder: Visualization

**Benefit:** Each component has single responsibility, easy to test

### 3. Ingestion: Gmail + MERGE Pattern
**Problem:** SpotOn API not available yet  
**Solution:** Parse PMIX PDFs from Gmail  
**Idempotency:** MERGE upsert pattern prevents duplicates

### 4. Multi-tenant: Design Now, Build Later
**V1:** Hardcoded single tenant config  
**Future:** Add tenant resolver + database  
**Benefit:** Minimal refactor when adding multi-tenancy

---

## 🚀 Quick Start Guide

### For Development

```bash
# 1. Clone repository
git clone https://github.com/yourorg/restaurant-analytics
cd restaurant-analytics

# 2. Install dependencies
npm install

# 3. Setup environment
cp .env.development.template .env.development
# Edit .env.development with your values

# 4. Authenticate with GCP
gcloud auth login
gcloud auth application-default login

# 5. Start local services
docker-compose up
```

### For Deployment

```bash
# 1. Run tests
npm test

# 2. Deploy all services
./scripts/deploy/deploy-all.sh

# 3. Verify deployment
npm run test:smoke
```

---

## 📋 Implementation Checklist

### Phase 1: Setup & Infrastructure
- [ ] Create GCP project resources
- [ ] Create service accounts + IAM permissions
- [ ] Create BigQuery datasets and tables
- [ ] Deploy stored procedures
- [ ] Store secrets in Secret Manager
- [ ] Setup Cloud Scheduler

### Phase 2: Core Services
- [ ] Build BigQuery analytics
  - [ ] Implement query_analytics tool
  - [ ] Implement get_forecast tool
  - [ ] Implement get_anomalies tool
  - [ ] Write unit tests
- [ ] Build Conversation Manager
  - [ ] Implement context extraction
  - [ ] Implement message storage
  - [ ] Write unit tests
- [ ] Build Response Engine
  - [ ] Implement message handler
  - [ ] Implement tenant resolver
  - [ ] Implement response formatter
  - [ ] Write unit tests

### Phase 3: Ingestion
- [ ] Build Gmail Ingestion Service
  - [ ] Implement Gmail client
  - [ ] Implement PMIX parser
  - [ ] Implement backfill service
  - [ ] Write unit tests

### Phase 4: Integration & Testing
- [ ] Write integration tests
- [ ] Write E2E tests
- [ ] Performance testing
- [ ] Load testing
- [ ] Manual QA

### Phase 5: Deployment
- [ ] Setup CI/CD pipeline
- [ ] Deploy to production
- [ ] Configure monitoring
- [ ] Setup alerts
- [ ] Documentation review

### Phase 6: Launch
- [ ] Run /setup for Senso
- [ ] Backfill historical data
- [ ] Train user
- [ ] Monitor for 2 weeks
- [ ] Iterate based on feedback

---

## 🔧 Technology Stack

### Runtime
- **Language:** TypeScript / Node.js 20
- **Platform:** Google Cloud Platform

### Services
- **Compute:** Cloud Run, Cloud Functions Gen2
- **Database:** BigQuery
- **Storage:** Cloud Storage (for backups)
- **Secrets:** Secret Manager
- **Scheduling:** Cloud Scheduler
- **Monitoring:** Cloud Logging, Cloud Monitoring

### AI/ML
- **Gemini Flash:** Conversation management, PDF parsing
- **Gemini Pro:** Response generation with function calling

### External APIs
- **Google Chat API:** Workspace addon
- **Gmail API:** Email/attachment access
- **quickchart.io:** Chart generation

### Development
- **Testing:** Jest
- **Linting:** ESLint
- **Type Checking:** TypeScript
- **CI/CD:** GitHub Actions

---

## 📊 Success Metrics

### Performance
- Query response time: **< 5 seconds (p95)**
- Chart generation: **< 2 seconds**
- PDF ingestion: **< 5 seconds per PDF**
- Backfill speed: **< 10 minutes for 100 PDFs**

### Reliability
- Uptime: **99.5%+**
- Error rate: **< 5%**
- Test coverage: **> 80%**

### Cost
- Total monthly cost: **< $100** (single tenant)

### User Adoption
- Daily active usage: **5+ queries/day**
- User satisfaction: **Positive feedback**
- Reduces manual report checking time

---

## 🤝 Contributing

### Code Standards
- All code in TypeScript
- Follow ESLint rules
- Write tests for all new features
- Document complex logic
- Use structured logging

### Pull Request Process
1. Create feature branch
2. Write code + tests
3. Run `npm test` and `npm run lint`
4. Submit PR with description
5. Wait for CI/CD checks
6. Address review comments
7. Merge after approval

---

## 📞 Support

### For Development Questions
- Check documentation in `docs/`
- Review code examples in `__tests__/`
- Ask in team Slack channel

### For Production Issues
- Check `docs/runbooks/troubleshooting.md`
- Review logs in Cloud Logging
- Check monitoring dashboards
- Page on-call engineer if critical

---

## 🗺️ Roadmap

### V1.0 (Current)
- ✅ Single tenant (Senso Sushi)
- ✅ PMIX ingestion from Gmail
- ✅ Natural language queries
- ✅ Charts in Google Chat

### V1.1 (Next)
- ⏳ Labor report ingestion
- ⏳ Cross-source insights (profitability)
- ⏳ Scheduled reports

### V2.0 (Future)
- 🔮 Multi-tenant architecture
- 🔮 SpotOn API integration
- 🔮 Custom report builder
- 🔮 Mobile app

---

## 📝 Document Maintenance

**Review Schedule:** Quarterly  
**Last Updated:** October 22, 2025  
**Next Review:** January 22, 2026  

**Update Process:**
1. Make changes to relevant document
2. Update version number and date
3. Update this index if adding/removing documents
4. Commit with descriptive message

---

## ✅ Ready to Build?

You now have complete specifications to:
1. Understand the system architecture
2. Implement all components
3. Deploy to production
4. Test thoroughly
5. Monitor and maintain

**Next Steps:**
1. Read documents 1-8 in order
2. Review PROJECT_INFO.md for current setup
3. Start with Phase 1 of implementation checklist
4. Build incrementally with tests

**Questions?** Refer to specific documents for detailed information on each topic.

---

**Happy Building! 🚀**
