# Architecture Documentation

## System Architecture Diagram

```mermaid
flowchart TD
    User([User]) --> GChat[Google Chat<br/>Workspace Addon]
    
    subgraph "Setup Flow"
        Setup[/setup command] --> OAuth[Gmail OAuth]
        OAuth --> CreateTenant[Create Tenant<br/>Provision BQ Dataset]
        CreateTenant --> BackfillJob[Kick off Backfill Job]
        BackfillJob --> Progress[Send Progress Updates]
        Progress --> GChat
    end
    
    subgraph "Data Ingestion Layer"
        Scheduler[Cloud Scheduler<br/>Daily 3am CT] --> GmailIngest[Gmail Ingestion Service]
        
        GmailIngest --> Gmail[(Gmail API<br/>Search PMIX/Labor emails)]
        Gmail --> Router[Report Type Router]
        
        Router --> PmixProc[PMIX Processor<br/>Parse PDF]
        Router --> LaborProc[Labor Report Processor<br/>Parse PDF]
        Router --> GenericProc[Generic Report Processor]
        
        SpotOnAPI[SpotOn API Sync<br/>Future] -.-> APIProc[API Processors<br/>Locations/Menu/Orders]
        
        PmixProc --> BQSales[(BigQuery<br/>tenant.sales.*)]
        LaborProc --> BQLabor[(BigQuery<br/>tenant.labor.*)]
        APIProc -.-> BQSpotOn[(BigQuery<br/>tenant.spoton_api.*)]
        
        BQSales --> BQUnified[(BigQuery<br/>tenant.unified.*<br/>Cross-source insights)]
        BQLabor --> BQUnified
        BQSpotOn -.-> BQUnified
        
        PmixProc --> IngestLog[(Ingestion Log<br/>Track processed items)]
        LaborProc --> IngestLog
    end
    
    subgraph "Response Engine"
        GChat --> RE[Response Engine<br/>stateless]
        RE --> TenantResolver[Tenant Resolver<br/>workspaceId + userId → tenantId]
        TenantResolver -->|tenant config| RE
        
        RE --> CM[Conversation Manager<br/>Gemini Flash<br/>Summarize relevant context]
        CM -->|relevant context| RE
        
        RE --> RG[Response Generator<br/>Gemini 2.5 Pro<br/>Orchestrate query + response]
        
        RG -->|MCP protocol| MCP[Intent BigQuery analytics<br/>query_analytics tool]
        MCP -->|structured params<br/>metric, timeframe, filters<br/>aggregation, groupBy| BQSales
        MCP -->|query labor data| BQLabor
        MCP -->|query unified data| BQUnified
        
        BQSales --> SP[Stored Procedures<br/>- Validate params<br/>- Check enums vs data<br/>- Build query safely<br/>- Execute]
        SP -->|data| MCP
        MCP -->|data| RG
        
        RG -->|chart specs| CB[Chart Builder<br/>quickchart.io]
        CB -->|chart URLs| RG
        
        RG -->|response + charts| RE
        RE -->|formatted for Google Chat| GChat
    end
    
    subgraph "Future: BQML"
        BQUnified -.-> BQML[BQML Models<br/>- Forecasts<br/>- Anomaly detection<br/>- Demand prediction]
        BQML -.->|separate MCP tools| MCP
    end
    
    style RE fill:#e1f5ff
    style RG fill:#fff4e1
    style BQSales fill:#f0f0f0
    style BQLabor fill:#f0f0f0
    style BQUnified fill:#e8f5e9
    style MCP fill:#e8f5e9
    style GmailIngest fill:#fff3e0
```

---

# Tenant Data Model - Multi-tenant Architecture

## Overview
This document outlines the tenant data model for future multi-tenant support. The current single-tenant implementation should be designed with these concepts in mind to minimize refactoring.

## Core Entities

### 1. Tenants (Restaurants/Businesses)
Primary isolation boundary. Each tenant gets their own BQ dataset and SpotOn connection.

```sql
CREATE TABLE tenants (
  tenant_id STRING PRIMARY KEY,           -- UUID
  business_name STRING NOT NULL,          -- "Senso Sushi"
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  status STRING NOT NULL,                 -- 'active', 'suspended', 'trial'
  
  -- SpotOn Integration
  spoton_merchant_id STRING,
  spoton_api_key_encrypted STRING,
  spoton_refresh_token_encrypted STRING,
  
  -- BigQuery Resources
  bq_dataset STRING NOT NULL,             -- 'tenant_abc123.restaurant_analytics'
  bq_project STRING NOT NULL,             -- 'fdsanalytics'
  
  -- Billing (future)
  subscription_tier STRING,               -- 'free', 'pro', 'enterprise'
  subscription_status STRING,
  
  -- Settings
  timezone STRING DEFAULT 'America/Chicago',
  currency STRING DEFAULT 'USD',
  
  -- Metadata
  domain STRING,                          -- For workspace domain matching
  updated_at TIMESTAMP
);
```

### 2. Users
Individual users who can access tenant data. One user can belong to one tenant.

```sql
CREATE TABLE users (
  user_id STRING PRIMARY KEY,             -- From Google OAuth
  email STRING UNIQUE NOT NULL,
  
  -- Tenant Association
  tenant_id STRING REFERENCES tenants(tenant_id),
  role STRING NOT NULL,                   -- 'owner', 'admin', 'member', 'viewer'
  
  -- Google Identity
  google_workspace_id STRING,             -- NULL for Gmail users
  google_domain STRING,                   -- 'sensosushi.com' or NULL
  
  -- Profile
  display_name STRING,
  avatar_url STRING,
  
  -- Access Control
  invited_by STRING REFERENCES users(user_id),
  invited_at TIMESTAMP,
  joined_at TIMESTAMP,
  last_seen_at TIMESTAMP,
  
  -- Status
  status STRING NOT NULL,                 -- 'active', 'pending', 'suspended'
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP
);
```

### 3. Invitations (for workspace domain matching)
Track pending invitations to join a tenant.

```sql
CREATE TABLE invitations (
  invitation_id STRING PRIMARY KEY,
  tenant_id STRING REFERENCES tenants(tenant_id),
  
  -- Who can join
  email STRING,                           -- Specific email invite
  domain STRING,                          -- Or domain-wide (e.g., '@sensosushi.com')
  
  -- Invitation details
  role STRING NOT NULL,                   -- Role they'll get upon acceptance
  invited_by STRING REFERENCES users(user_id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP,
  
  -- Status
  status STRING NOT NULL,                 -- 'pending', 'accepted', 'expired', 'revoked'
  accepted_by STRING REFERENCES users(user_id),
  accepted_at TIMESTAMP
);
```

## Tenant Resolution Flow

### Current (Single-tenant)
```javascript
async function resolveTenant(workspaceId, userId) {
  // Hardcoded for Senso Sushi
  return {
    tenantId: 'senso-sushi',
    config: {
      bqDataset: 'fdsanalytics.restaurant_analytics',
      restaurantName: 'Senso Sushi',
      timezone: 'America/Chicago'
    }
  };
}
```

### Future (Multi-tenant)
```javascript
async function resolveTenant(workspaceId, userId) {
  // 1. Check if user already belongs to a tenant
  const user = await db.users.findByUserId(userId);
  
  if (user && user.tenant_id) {
    const tenant = await db.tenants.findById(user.tenant_id);
    return {
      tenantId: tenant.tenant_id,
      config: mapTenantToConfig(tenant)
    };
  }
  
  // 2. Check for domain-based invitations (workspace users only)
  if (workspaceId && user.google_domain) {
    const invitation = await db.invitations.findPendingByDomain(
      user.google_domain
    );
    
    if (invitation) {
      // Prompt user to accept invitation
      return {
        tenantId: null,
        pendingInvitation: invitation
      };
    }
  }
  
  // 3. User has no tenant - needs to run /setup
  return {
    tenantId: null,
    requiresSetup: true
  };
}
```

## User Roles & Permissions

| Role | Can Query Data | Can Invite Users | Can Modify Integration | Can Delete Tenant |
|------|----------------|------------------|------------------------|-------------------|
| owner | ✓ | ✓ | ✓ | ✓ |
| admin | ✓ | ✓ | ✓ | ✗ |
| member | ✓ | ✗ | ✗ | ✗ |
| viewer | ✓ | ✗ | ✗ | ✗ |

## Setup Flow Examples

### Scenario 1: Gmail User Signup
```
1. User installs addon → no tenant found
2. User runs /setup
3. OAuth to SpotOn → provisions BQ dataset
4. Creates tenant (domain: NULL)
5. Creates user (role: owner)
6. User can now query their data
7. Cannot invite others (no shared domain)
```

### Scenario 2: Workspace User Signup
```
1. User installs addon → no tenant found
2. User runs /setup
3. OAuth to SpotOn → provisions BQ dataset
4. Creates tenant (domain: 'sensosushi.com')
5. Creates user (role: owner)
6. Owner can invite @sensosushi.com users
```

### Scenario 3: Workspace User Joins Existing Tenant
```
1. User installs addon → no tenant found
2. Domain matches existing tenant
3. System prompts: "Someone at sensosushi.com already uses this. Join their workspace?"
4. User accepts → creates user record (role: member)
5. User can now query shared tenant data
```

## Migration Path

### Phase 1: Single-tenant (Current)
- Hardcoded `resolveTenant()` function
- No database tables needed
- All config in environment variables

### Phase 2: Multi-tenant Foundation
- Implement tenant database tables
- Update `resolveTenant()` to query database
- Add `/setup` command handler
- Single tenant in production, multi-tenant ready

### Phase 3: Multi-tenant Launch
- Add billing integration
- Implement invitation system
- Public signup flow
- Admin dashboard for tenant management

## Key Design Principles

1. **Tenant is the isolation boundary** - not workspace, not user
2. **userId + workspaceId → tenantId** - resolution layer abstracts this
3. **Config injection everywhere** - no hardcoded dataset names
4. **BQ dataset per tenant** - complete data isolation
5. **One user, one tenant** - simplifies permissions (can revisit if needed)

## Notes for Current Implementation

When building single-tenant version:
- Always pass `workspaceId` and `userId` through the stack
- Use `resolveTenant()` abstraction (even if hardcoded)
- Store config as object, not scattered variables
- Design MCP server to accept dataset parameter
- Keep tenant concepts in code comments

This ensures smooth migration when multi-tenant is needed.
