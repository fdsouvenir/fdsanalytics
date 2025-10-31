/**
 * TenantConfigService - Multi-tenant configuration management
 *
 * Phase 1: Simple 1-to-1 mapping (tenant_id → dataset name)
 * Phase 2: Query BigQuery/Firestore for real tenant configs
 *
 * This service maps tenant identifiers to their BigQuery configuration,
 * enabling true multi-tenancy where each tenant's data is isolated.
 */

export interface TenantConfig {
  tenantId: string;
  projectId: string;
  datasetAnalytics: string;  // e.g., "restaurant_analytics"
  datasetInsights: string;    // e.g., "insights"
  customerId: string;         // e.g., "senso-sushi" (customer_id in BigQuery)
}

export class TenantConfigService {
  /**
   * Get tenant configuration by tenant ID
   *
   * Phase 1: Returns hardcoded config for senso-sushi, simple 1-to-1 mapping for others
   * Phase 2: Will query config.tenants table in BigQuery for real multi-tenant setup
   *
   * @param tenantId - Tenant identifier (e.g., "senso-sushi", "company-a.com")
   * @returns Tenant configuration with BigQuery dataset details
   */
  static async getConfig(tenantId: string): Promise<TenantConfig> {
    // Phase 1 Implementation: Hardcoded for current single-tenant setup
    // This allows immediate deployment while planning for multi-tenancy

    if (tenantId === 'senso-sushi' || tenantId === 'default') {
      return {
        tenantId: 'senso-sushi',
        projectId: 'fdsanalytics',
        datasetAnalytics: 'restaurant_analytics',
        datasetInsights: 'insights',
        customerId: 'senso-sushi'
      };
    }

    // For other tenant IDs, use simple convention-based mapping
    // Assumes dataset name matches tenant ID (e.g., "company-a" → "company_a" dataset)
    // This is a placeholder until Phase 2 config table is implemented
    const datasetSafeName = tenantId.replace(/[^a-zA-Z0-9_]/g, '_').toLowerCase();

    console.log(JSON.stringify({
      severity: 'INFO',
      message: 'Using convention-based tenant config (Phase 1)',
      tenantId,
      datasetName: datasetSafeName,
      note: 'This will be replaced by config table lookup in Phase 2'
    }));

    return {
      tenantId,
      projectId: 'fdsanalytics',
      datasetAnalytics: `${datasetSafeName}_analytics`,
      datasetInsights: `${datasetSafeName}_insights`,
      customerId: tenantId
    };
  }

  /**
   * Validate that a tenant exists and is active
   *
   * Phase 1: Always returns true
   * Phase 2: Will check config.tenants table for tenant status
   */
  static async validateTenant(tenantId: string): Promise<boolean> {
    // Phase 1: Accept all tenant IDs
    // Phase 2: Query config.tenants WHERE tenant_id = ? AND status = 'active'
    return true;
  }

  /**
   * Get list of all active tenants
   *
   * Phase 1: Returns hardcoded list
   * Phase 2: Will query config.tenants table
   */
  static async listTenants(): Promise<string[]> {
    // Phase 1: Hardcoded
    return ['senso-sushi'];
  }
}

/*
 * Phase 2 Implementation Plan:
 *
 * 1. Create config.tenants table in BigQuery:
 *    CREATE TABLE config.tenants (
 *      tenant_id STRING NOT NULL,
 *      business_name STRING,
 *      project_id STRING DEFAULT 'fdsanalytics',
 *      dataset_analytics STRING NOT NULL,
 *      dataset_insights STRING NOT NULL,
 *      customer_id STRING NOT NULL,
 *      status STRING DEFAULT 'active',
 *      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP(),
 *      updated_at TIMESTAMP
 *    );
 *
 * 2. Update getConfig() to query this table:
 *    const query = `SELECT * FROM config.tenants WHERE tenant_id = @tenant_id AND status = 'active'`;
 *    const [rows] = await bqClient.query({ query, params: { tenant_id: tenantId } });
 *    if (!rows || rows.length === 0) {
 *      throw new Error(`Tenant not found: ${tenantId}`);
 *    }
 *    return rows[0];
 *
 * 3. Implement caching with TTL (e.g., 5 minutes) to avoid repeated BigQuery hits
 *
 * 4. Add tenant onboarding flow in Google Workspace Addon setup wizard
 */
