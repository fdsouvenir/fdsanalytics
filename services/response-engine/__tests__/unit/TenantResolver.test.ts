import { TenantResolver } from '../../src/core/TenantResolver';
import { mockTenantConfig } from '../fixtures/mockResponses';

describe('TenantResolver', () => {
  let tenantResolver: TenantResolver;

  beforeEach(() => {
    tenantResolver = new TenantResolver();
  });

  describe('resolveTenant', () => {
    it('should return hardcoded senso-sushi tenant config', async () => {
      const result = await tenantResolver.resolveTenant('workspace123', 'user456');

      expect(result).not.toBeNull();
      expect(result?.tenantId).toBe('senso-sushi');
      expect(result?.businessName).toBe('Senso Sushi');
      expect(result?.bqProject).toBe('fdsanalytics');
      expect(result?.status).toBe('active');
    });

    it('should return same config for any workspace/user (V1)', async () => {
      const result1 = await tenantResolver.resolveTenant('workspace1', 'user1');
      const result2 = await tenantResolver.resolveTenant('workspace2', 'user2');

      expect(result1?.tenantId).toBe(result2?.tenantId);
    });
  });

  describe('createTenant', () => {
    it('should throw error (not implemented in V1)', async () => {
      await expect(
        tenantResolver.createTenant('workspace123', 'user456', 'Test Restaurant')
      ).rejects.toThrow('not supported in V1');
    });
  });
});
