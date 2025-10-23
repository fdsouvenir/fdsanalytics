import { TenantConfig, getHardcodedTenantConfig } from '../config/tenantConfig';

/**
 * TenantResolver
 *
 * V1: Returns hardcoded senso-sushi tenant config
 * Future: Will query BigQuery config.customers table using workspaceId/userId
 */
export class TenantResolver {
  /**
   * Resolve tenant from user identity
   * @returns TenantConfig if tenant exists, null if user needs to run /setup
   */
  async resolveTenant(workspaceId: string, userId: string): Promise<TenantConfig | null> {
    // V1: Always return senso-sushi config
    // Future: SELECT * FROM config.customers WHERE workspace_id = ? AND user_id = ?
    return getHardcodedTenantConfig();
  }

  /**
   * Create new tenant (called during /setup)
   * V1: Not implemented (hardcoded tenant)
   */
  async createTenant(
    workspaceId: string,
    userId: string,
    businessName: string
  ): Promise<TenantConfig> {
    // V1: Throw error - setup not supported yet
    throw new Error('Tenant creation not supported in V1 (hardcoded tenant)');
  }
}
