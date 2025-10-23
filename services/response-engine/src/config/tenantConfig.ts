export interface TenantConfig {
  tenantId: string;
  businessName: string;
  bqProject: string;
  bqDataset: string;
  timezone: string;
  currency: string;
  createdAt: Date;
  status: 'active' | 'suspended' | 'trial';
}

/**
 * V1 Implementation: Hardcoded single tenant (senso-sushi)
 * Future: Will query BigQuery config.customers table
 */
export function getHardcodedTenantConfig(): TenantConfig {
  return {
    tenantId: 'senso-sushi',
    businessName: 'Senso Sushi',
    bqProject: 'fdsanalytics',
    bqDataset: 'restaurant_analytics',
    timezone: 'America/Chicago',
    currency: 'USD',
    createdAt: new Date('2025-01-01'),
    status: 'active'
  };
}
