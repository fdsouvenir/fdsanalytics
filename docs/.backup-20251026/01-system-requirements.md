# System Requirements Document
## Senso Restaurant Analytics - Version 1.0

**Project:** Restaurant Analytics Chat Assistant  
**GCP Project ID:** fdsanalytics  
**Target Customer:** Senso Sushi (Frankfort) - Single Tenant  
**Platform:** Google Chat Workspace Addon  

---

## 1. Executive Summary

Build a conversational analytics assistant that allows restaurant managers to query sales data via Google Chat. The system ingests daily PMIX reports from Gmail, stores data in BigQuery, and uses Gemini AI to provide natural language responses with charts.

**Key Innovation:** Secure-by-design query architecture using MCP servers and BigQuery stored procedures to prevent SQL injection.

---

## 2. Functional Requirements

### 2.1 Core Features (Must Have - V1)

#### 2.1.1 Google Chat Integration
- ✅ Users interact via Google Chat Workspace addon
- ✅ Natural language queries: "How are beer sales this week?"
- ✅ Responses include formatted text + embedded charts
- ✅ Support for follow-up questions with conversation context

#### 2.1.2 Data Ingestion
- ✅ Automated Gmail monitoring for PMIX PDF reports
- ✅ Daily scheduled ingestion (3:00 AM CT)
- ✅ Historical backfill during `/setup` with progress updates
- ✅ Idempotent processing (MERGE upsert pattern)
- ✅ Support for re-processing failed reports

#### 2.1.3 Analytics Queries
Users can ask about:
- **Real-time sales:** "Today's sales", "How's this week going?"
- **Comparisons:** "This week vs last week", "Today vs yesterday"
- **Trends:** "What categories are up/down?"
- **Top performers:** "Best selling sushi rolls"
- **Forecasts:** "What are next week's predictions?"
- **Anomalies:** "Anything unusual today?"
- **Category filtering:** "Beer sales", "Signature roll trends"

#### 2.1.4 Response Generation
- ✅ Natural language responses (conversational tone)
- ✅ Embedded charts via quickchart.io (bar, line, pie)
- ✅ Bold formatting for key metrics
- ✅ Trend indicators (↑ ↓)
- ✅ Actionable insights

#### 2.1.5 Setup & Onboarding
- ✅ `/setup` command initiates:
  - Gmail OAuth authorization
  - Tenant provisioning (BQ dataset creation)
  - Historical backfill job (async)
  - Progress notifications to user
- ✅ `/status` command shows import progress

### 2.2 Future Features (Out of Scope for V1)

- ❌ Multi-tenant support (design for, don't implement)
- ❌ Labor report ingestion
- ❌ SpotOn API integration
- ❌ Mobile push notifications
- ❌ Custom report scheduling
- ❌ User roles & permissions (beyond owner)
- ❌ Billing integration
- ❌ Admin dashboard

---

## 3. Non-Functional Requirements

### 3.1 Performance
- Query responses within **5 seconds** (95th percentile)
- Chart generation within **2 seconds**
- Handle **100 queries/day** (single tenant)
- Ingestion processes **50 PDFs** in under 10 minutes

### 3.2 Security
- **Zero SQL injection risk** via:
  - MCP protocol validation
  - BigQuery stored procedures with parameterization
  - Enum validation against actual data
- Gmail OAuth with **minimal scopes** (readonly)
- Secrets stored in **Google Secret Manager**
- Service account per component (least privilege)

### 3.3 Reliability
- **99.5% uptime** for Response Engine
- **Idempotent operations** (safe retries)
- Graceful degradation if charts fail (text-only response)
- **Automatic retry** for transient Gmail/BQ errors (3 attempts, exponential backoff)

### 3.4 Scalability (Design for Future)
- Architecture supports **multi-tenant** without refactor
- BQ dataset per tenant (data isolation)
- MCP servers stateless (horizontal scaling)
- Conversation history bounded (last 10 messages)

### 3.5 Maintainability
- **TypeScript** for type safety
- Comprehensive logging (structured JSON)
- Environment-based configuration (dev/prod)
- Automated deployment scripts
- Unit test coverage **>80%**

### 3.6 Data Privacy
- **No PII** stored in chat history beyond user_id
- Gmail credentials encrypted at rest
- BQ data isolated per tenant (future)
- Audit logs for all data access

---

## 4. Technical Constraints

### 4.1 Platform
- **GCP only** - Cloud Functions (Gen2), Cloud Run, BigQuery, Secret Manager
- **Node.js 20** runtime
- **Existing BQ project:** `fdsanalytics`
- **Region:** us-central1

### 4.2 External Dependencies
- **Gemini API:**
  - Flash for conversation management
  - Pro (2.5) for response generation
- **Google Chat API** (Workspace addon)
- **Gmail API** (readonly scope)
- **quickchart.io** (free tier, no auth)

### 4.3 Data Constraints
- PMIX reports only (v1)
- Date range: January 2023 - present
- Category hierarchy: 2 levels (primary + subcategory)
- **Existing schema:** restaurant_analytics.reports, restaurant_analytics.metrics

### 4.4 Cost Targets
- **Gemini API:** <$50/month (single tenant)
- **BQ storage:** ~1GB (<$0.50/month)
- **BQ queries:** <$10/month
- **Cloud Functions:** Free tier eligible
- **Total:** <$100/month for single tenant

---

## 5. Success Criteria

### 5.1 V1 Launch Criteria
- [ ] User completes `/setup` successfully
- [ ] Historical data imported (213 reports)
- [ ] User asks 10 different query types, all return correct data
- [ ] Charts render in Google Chat
- [ ] No duplicate data in BQ after re-runs
- [ ] Response time <5s for 95% of queries
- [ ] Zero SQL injection vulnerabilities (security audit)

### 5.2 User Acceptance
- [ ] Restaurant manager uses daily for 2 weeks
- [ ] Manager prefers this over manual report checking
- [ ] At least 5 unique queries per day
- [ ] Positive feedback on response quality

### 5.3 Technical Quality
- [ ] All unit tests passing
- [ ] Integration tests cover happy path + 3 error scenarios
- [ ] Deployment fully automated (single command)
- [ ] Monitoring alerts configured (error rate, latency)
- [ ] Documentation complete (architecture + runbook)

---

## 6. Assumptions & Dependencies

### 6.1 Assumptions
- SpotOn continues sending daily PMIX emails (same format)
- Gmail delivers emails reliably
- User has Workspace admin rights (to install addon)
- Single restaurant location (no multi-location support)
- English language only

### 6.2 Dependencies
- Gmail API availability (Google SLA: 99.9%)
- Gemini API availability (no SLA, but stable)
- quickchart.io uptime (no SLA, free tier)
- BigQuery availability (Google SLA: 99.99%)

### 6.3 Risks
| Risk | Impact | Mitigation |
|------|--------|-----------|
| SpotOn changes PMIX format | HIGH | Parser version detection, graceful failure |
| Gemini API rate limits | MEDIUM | Request batching, caching responses |
| Gmail attachment size limits | LOW | Already within limits (~500KB PDFs) |
| Chart service downtime | LOW | Text-only fallback |
| BQ streaming buffer delays | LOW | MERGE pattern handles duplicates |

---

## 7. User Stories

### 7.1 Setup
**As a** restaurant manager  
**I want to** run `/setup` once  
**So that** the system imports my historical data automatically

**Acceptance Criteria:**
- Setup completes in <30 seconds
- I receive progress updates every 20 reports
- Final message confirms total reports imported
- I can immediately start asking questions

### 7.2 Daily Sales Check
**As a** restaurant manager  
**I want to** ask "How are sales today?"  
**So that** I can monitor performance without logging into SpotOn

**Acceptance Criteria:**
- Response in <5 seconds
- Shows total sales + comparison to yesterday
- Includes trend indicator (↑/↓)
- Formats currency properly ($X,XXX)

### 7.3 Category Analysis
**As a** restaurant manager  
**I want to** ask "Which beer categories are down this week?"  
**So that** I can adjust inventory or promotions

**Acceptance Criteria:**
- Lists categories with negative trends
- Shows % change week-over-week
- Includes a chart visualization
- Suggests top-performing alternatives

### 7.4 Forecasting
**As a** restaurant manager  
**I want to** ask "What should I expect next week?"  
**So that** I can plan staffing and inventory

**Acceptance Criteria:**
- Shows 7-day forecast
- Includes confidence intervals
- Highlights peak days
- Compares to historical average

---

## 8. Integration Points

### 8.1 Google Chat
- **Protocol:** Google Chat API (REST + Pub/Sub)
- **Authentication:** Service account
- **Message Format:** JSON (text + cards)
- **Rate Limits:** 50 requests/second

### 8.2 Gmail API
- **Scope:** `gmail.readonly`
- **Authentication:** OAuth 2.0 (user consent)
- **Operations:** Search messages, download attachments
- **Rate Limits:** 250 quota units/user/second

### 8.3 BigQuery
- **Authentication:** Application Default Credentials
- **Operations:** Query, insert (MERGE), create tables
- **Quota:** 100 concurrent queries, 2000 slots

### 8.4 Gemini API
- **Authentication:** API Key (Secret Manager)
- **Models:** gemini-2.5-flash, gemini-2.5-pro
- **Rate Limits:** 10 requests/minute (Flash), 2 requests/minute (Pro)

### 8.5 quickchart.io
- **Authentication:** None (free tier)
- **Protocol:** HTTPS GET with URL-encoded config
- **Rate Limits:** 60 requests/minute
- **Fallback:** Text-only response if unavailable

---

## 9. Data Flow

### 9.1 Ingestion Flow
```
SpotOn → Gmail → Cloud Scheduler → Cloud Function
→ Download PDF → Parse PMIX → MERGE to BQ
→ Update ingestion_log → (Optional) Notify user
```

### 9.2 Query Flow
```
User → Google Chat → Response Engine → Tenant Resolver
→ Conversation Manager (Flash) → Response Generator (Pro)
→ BigQuery analytics → BQ Stored Procedure → Data
→ Chart Builder → Response Engine → Google Chat → User
```

---

## 10. Compliance & Governance

### 10.1 Data Retention
- **Chat history:** 90 days (auto-delete)
- **Sales data:** Indefinite (business records)
- **Ingestion logs:** 1 year
- **Error logs:** 30 days

### 10.2 Access Control
- **BQ datasets:** Service account only (no human access in prod)
- **Secret Manager:** Cloud Functions service account only
- **Gmail OAuth:** User-specific (no shared credentials)

### 10.3 Monitoring
- **Error rate:** Alert if >5% in 5 minutes
- **Latency:** Alert if p95 >10 seconds
- **Ingestion failures:** Alert on any failed PDF parse
- **Cost:** Alert if daily spend >$5

---

## 11. Deployment Requirements

### 11.1 Environments
- **Development:** Local machine + dev BQ dataset
- **Production:** GCP Cloud Functions + production BQ dataset

### 11.2 Rollback Plan
- Cloud Functions support rollback to previous version
- BQ schema changes via migration scripts (forward-only)
- Feature flags for gradual rollout

### 11.3 Deployment Checklist
- [ ] All tests passing
- [ ] Environment variables configured
- [ ] Secrets deployed to Secret Manager
- [ ] BQ tables created (if schema changes)
- [ ] Cloud Scheduler jobs created
- [ ] Google Chat addon published
- [ ] Monitoring dashboards configured
- [ ] Documentation updated

---

## 12. Open Questions

1. **Chart complexity:** How many data points max per chart? (Suggest: 20)
2. **Conversation history:** Store in BQ or external DB? (Suggest: BQ for simplicity)
3. **Error messages:** How technical for end users? (Suggest: friendly with /support command)
4. **Timezone handling:** Always CT, or user-configurable? (Suggest: CT for v1)
5. **Backfill duration:** What's acceptable for 213 reports? (Suggest: <30 minutes)

---

**Document Version:** 1.0  
**Last Updated:** October 22, 2025  
**Next Review:** After v1 launch
