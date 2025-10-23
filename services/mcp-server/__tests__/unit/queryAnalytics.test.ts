// Unit tests for QueryAnalyticsTool

import { QueryAnalyticsTool } from '../../src/tools/queryAnalytics.tool';
import { BigQueryClient } from '../../src/bigquery/BigQueryClient';
import { Validator } from '../../src/bigquery/Validator';

jest.mock('../../src/bigquery/BigQueryClient');
jest.mock('../../src/bigquery/Validator');

describe('QueryAnalyticsTool', () => {
  let tool: QueryAnalyticsTool;
  let mockBqClient: jest.Mocked<BigQueryClient>;
  let mockValidator: jest.Mocked<Validator>;

  beforeEach(() => {
    mockBqClient = new BigQueryClient() as jest.Mocked<BigQueryClient>;
    mockValidator = new Validator(mockBqClient) as jest.Mocked<Validator>;
    tool = new QueryAnalyticsTool(mockBqClient, mockValidator);

    // Setup default mocks
    mockValidator.validateQueryAnalytics = jest.fn().mockResolvedValue({ valid: true });
    mockValidator.getAvailableCategories = jest.fn().mockResolvedValue(['(Beer)', '(Sushi)']);

    mockBqClient.callProcedure = jest.fn().mockResolvedValue({
      rows: [
        { primary_category: '(Beer)', metric_value: 1500.50 },
        { primary_category: '(Sushi)', metric_value: 2800.75 }
      ],
      totalRows: 2,
      executionTimeMs: 245
    });
  });

  describe('execute', () => {
    it('should execute valid query successfully', async () => {
      const params = {
        metric: 'net_sales',
        timeframe: {
          type: 'relative',
          relative: 'last_week'
        },
        aggregation: 'sum',
        groupBy: ['category']
      };

      const result = await tool.execute(params);

      expect(result.rows).toHaveLength(2);
      expect(result.totalRows).toBe(2);
      expect(result.executionTimeMs).toBeGreaterThan(0);
      expect(result.metadata).toBeDefined();
      expect(result.metadata?.timeframe).toBeDefined();
    });

    it('should reject invalid parameters', async () => {
      mockValidator.validateQueryAnalytics = jest.fn().mockResolvedValue({
        valid: false,
        error: 'Invalid category'
      });

      const params = {
        metric: 'net_sales',
        timeframe: {
          type: 'relative',
          relative: 'last_week'
        },
        aggregation: 'sum',
        filters: {
          primaryCategory: 'Invalid'
        }
      };

      await expect(tool.execute(params)).rejects.toThrow('Invalid category');
    });

    it('should handle absolute timeframe', async () => {
      const params = {
        metric: 'net_sales',
        timeframe: {
          type: 'absolute',
          start: '2025-01-01',
          end: '2025-01-31'
        },
        aggregation: 'sum'
      };

      const result = await tool.execute(params);

      expect(mockBqClient.callProcedure).toHaveBeenCalledWith(
        'restaurant_analytics.query_metrics',
        expect.objectContaining({
          start_date: '2025-01-01',
          end_date: '2025-01-31'
        })
      );
    });

    it('should handle filters', async () => {
      const params = {
        metric: 'net_sales',
        timeframe: {
          type: 'relative',
          relative: 'today'
        },
        aggregation: 'sum',
        filters: {
          primaryCategory: '(Beer)',
          subcategory: 'Bottle Beer'
        }
      };

      await tool.execute(params);

      expect(mockBqClient.callProcedure).toHaveBeenCalledWith(
        'restaurant_analytics.query_metrics',
        expect.objectContaining({
          primary_category: '(Beer)',
          subcategory: 'Bottle Beer'
        })
      );
    });

    it('should handle baseline comparison', async () => {
      const params = {
        metric: 'net_sales',
        timeframe: {
          type: 'relative',
          relative: 'this_week'
        },
        aggregation: 'sum',
        comparison: {
          baselineTimeframe: {
            type: 'relative',
            relative: 'last_week'
          }
        }
      };

      await tool.execute(params);

      expect(mockBqClient.callProcedure).toHaveBeenCalledWith(
        'restaurant_analytics.query_metrics',
        expect.objectContaining({
          baseline_start_date: expect.any(String),
          baseline_end_date: expect.any(String)
        })
      );
    });

    it('should apply limit parameter', async () => {
      const params = {
        metric: 'quantity_sold',
        timeframe: {
          type: 'relative',
          relative: 'last_30_days'
        },
        aggregation: 'sum',
        limit: 25
      };

      await tool.execute(params);

      expect(mockBqClient.callProcedure).toHaveBeenCalledWith(
        'restaurant_analytics.query_metrics',
        expect.objectContaining({
          max_rows: 25
        })
      );
    });

    it('should handle BigQuery timeout error', async () => {
      mockBqClient.callProcedure = jest.fn().mockRejectedValue(
        new Error('QUERY_TIMEOUT: Query exceeded 30 second timeout')
      );

      const params = {
        metric: 'net_sales',
        timeframe: {
          type: 'relative',
          relative: 'last_week'
        },
        aggregation: 'sum'
      };

      await expect(tool.execute(params)).rejects.toThrow('QUERY_TIMEOUT');
    });

    it('should transform invalid category error with suggestions', async () => {
      mockBqClient.callProcedure = jest.fn().mockRejectedValue(
        new Error('Invalid primary_category: (Beers) not found in data')
      );

      const params = {
        metric: 'net_sales',
        timeframe: {
          type: 'relative',
          relative: 'today'
        },
        aggregation: 'sum',
        filters: {
          primaryCategory: '(Beers)'
        }
      };

      await expect(tool.execute(params)).rejects.toThrow('Available categories');
    });
  });

  describe('parameter validation', () => {
    it('should reject missing required parameters', async () => {
      const params = {
        metric: 'net_sales'
        // Missing timeframe and aggregation
      };

      await expect(tool.execute(params)).rejects.toThrow();
    });

    it('should reject invalid metric', async () => {
      const params = {
        metric: 'invalid_metric',
        timeframe: {
          type: 'relative',
          relative: 'today'
        },
        aggregation: 'sum'
      };

      await expect(tool.execute(params)).rejects.toThrow();
    });

    it('should reject invalid aggregation', async () => {
      const params = {
        metric: 'net_sales',
        timeframe: {
          type: 'relative',
          relative: 'today'
        },
        aggregation: 'invalid'
      };

      await expect(tool.execute(params)).rejects.toThrow();
    });
  });
});
