// Unit tests for Validator

import { Validator } from '../../src/bigquery/Validator';
import { BigQueryClient } from '../../src/bigquery/BigQueryClient';

// Mock BigQueryClient
jest.mock('../../src/bigquery/BigQueryClient');

describe('Validator', () => {
  let validator: Validator;
  let mockBqClient: jest.Mocked<BigQueryClient>;

  beforeEach(() => {
    mockBqClient = new BigQueryClient() as jest.Mocked<BigQueryClient>;
    validator = new Validator(mockBqClient);

    // Mock the query method to return test categories
    mockBqClient.query = jest.fn().mockImplementation((query: string) => {
      if (query.includes('primary_category')) {
        return Promise.resolve({
          rows: [
            { primary_category: '(Beer)' },
            { primary_category: '(Sushi)' },
            { primary_category: '(Food)' },
            { primary_category: '(Wine)' }
          ],
          totalRows: 4,
          executionTimeMs: 100
        });
      }
      if (query.includes('subcategory')) {
        return Promise.resolve({
          rows: [
            { subcategory: 'Bottle Beer' },
            { subcategory: 'Draft Beer' },
            { subcategory: 'Signature Rolls' },
            { subcategory: 'Classic Rolls' }
          ],
          totalRows: 4,
          executionTimeMs: 100
        });
      }
      return Promise.resolve({ rows: [], totalRows: 0, executionTimeMs: 0 });
    });
  });

  describe('validateCategory', () => {
    it('should validate existing category', async () => {
      const result = await validator.validateCategory('(Beer)');
      expect(result.valid).toBe(true);
    });

    it('should reject non-existent category', async () => {
      const result = await validator.validateCategory('(Beers)');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('not found');
      expect(result.suggestions).toBeDefined();
      expect(result.suggestions!.length).toBeGreaterThan(0);
    });

    it('should accept undefined category (optional)', async () => {
      const result = await validator.validateCategory(undefined);
      expect(result.valid).toBe(true);
    });

    it('should handle case-insensitive suggestions', async () => {
      const result = await validator.validateCategory('beer');
      expect(result.valid).toBe(false);
      expect(result.suggestions).toContain('(Beer)');
    });
  });

  describe('validateSubcategory', () => {
    it('should validate existing subcategory', async () => {
      const result = await validator.validateSubcategory('Bottle Beer');
      expect(result.valid).toBe(true);
    });

    it('should reject non-existent subcategory', async () => {
      const result = await validator.validateSubcategory('Invalid Category');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('not found');
    });

    it('should accept undefined subcategory (optional)', async () => {
      const result = await validator.validateSubcategory(undefined);
      expect(result.valid).toBe(true);
    });
  });

  describe('validateTimeframe', () => {
    it('should validate absolute timeframe', () => {
      const result = validator.validateTimeframe({
        type: 'absolute',
        start: '2025-01-01',
        end: '2025-01-31'
      });
      expect(result.valid).toBe(true);
    });

    it('should reject absolute timeframe with missing dates', () => {
      const result = validator.validateTimeframe({
        type: 'absolute',
        start: '2025-01-01'
      });
      expect(result.valid).toBe(false);
      expect(result.error).toContain('requires both start and end');
    });

    it('should reject invalid date format', () => {
      const result = validator.validateTimeframe({
        type: 'absolute',
        start: 'not-a-date',
        end: '2025-01-31'
      });
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Invalid date format');
    });

    it('should reject start date after end date', () => {
      const result = validator.validateTimeframe({
        type: 'absolute',
        start: '2025-02-01',
        end: '2025-01-01'
      });
      expect(result.valid).toBe(false);
      expect(result.error).toContain('must be before or equal to');
    });

    it('should validate relative timeframe', () => {
      const result = validator.validateTimeframe({
        type: 'relative',
        relative: 'last_week'
      });
      expect(result.valid).toBe(true);
    });

    it('should reject relative timeframe without relative value', () => {
      const result = validator.validateTimeframe({
        type: 'relative'
      });
      expect(result.valid).toBe(false);
    });
  });

  describe('validateQueryAnalytics', () => {
    it('should validate complete query params', async () => {
      const params = {
        metric: 'net_sales' as const,
        timeframe: {
          type: 'relative' as const,
          relative: 'last_week' as const
        },
        aggregation: 'sum' as const,
        filters: {
          primaryCategory: '(Beer)'
        },
        limit: 50
      };

      const result = await validator.validateQueryAnalytics(params);
      expect(result.valid).toBe(true);
    });

    it('should reject invalid category in filters', async () => {
      const params = {
        metric: 'net_sales' as const,
        timeframe: {
          type: 'relative' as const,
          relative: 'last_week' as const
        },
        aggregation: 'sum' as const,
        filters: {
          primaryCategory: 'Invalid'
        }
      };

      const result = await validator.validateQueryAnalytics(params);
      expect(result.valid).toBe(false);
    });

    it('should validate comparison timeframe', async () => {
      const params = {
        metric: 'net_sales' as const,
        timeframe: {
          type: 'relative' as const,
          relative: 'this_week' as const
        },
        aggregation: 'sum' as const,
        comparison: {
          baselineTimeframe: {
            type: 'relative' as const,
            relative: 'last_week' as const
          }
        }
      };

      const result = await validator.validateQueryAnalytics(params);
      expect(result.valid).toBe(true);
    });
  });

  describe('getAvailableCategories', () => {
    it('should return cached categories', async () => {
      // First call to populate cache
      await validator.validateCategory('(Beer)');

      // Second call should use cache
      const categories = await validator.getAvailableCategories();
      expect(categories).toEqual(['(Beer)', '(Sushi)', '(Food)', '(Wine)']);
      expect(mockBqClient.query).toHaveBeenCalledTimes(2); // Once for categories, once for subcategories
    });
  });
});
