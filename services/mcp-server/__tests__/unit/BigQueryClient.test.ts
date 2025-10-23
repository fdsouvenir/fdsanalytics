// Unit tests for BigQueryClient

import { BigQueryClient } from '../../src/bigquery/BigQueryClient';
import { BigQuery } from '@google-cloud/bigquery';

jest.mock('@google-cloud/bigquery');

describe('BigQueryClient', () => {
  let client: BigQueryClient;
  let mockBigQuery: jest.Mocked<BigQuery>;
  let mockJob: any;

  beforeEach(() => {
    mockJob = {
      getQueryResults: jest.fn().mockResolvedValue([
        [
          { category: '(Beer)', total: 1500 },
          { category: '(Sushi)', total: 2800 }
        ]
      ])
    };

    mockBigQuery = new BigQuery() as jest.Mocked<BigQuery>;
    mockBigQuery.createQueryJob = jest.fn().mockResolvedValue([mockJob]);

    (BigQuery as jest.MockedClass<typeof BigQuery>).mockImplementation(() => mockBigQuery);

    client = new BigQueryClient();
  });

  describe('query', () => {
    it('should execute query successfully', async () => {
      const result = await client.query('SELECT * FROM table');

      expect(result.rows).toHaveLength(2);
      expect(result.totalRows).toBe(2);
      expect(result.executionTimeMs).toBeGreaterThan(0);
    });

    it('should handle parameterized queries', async () => {
      const query = 'SELECT * FROM table WHERE category = @category';
      const params = { category: '(Beer)' };

      await client.query(query, params);

      expect(mockBigQuery.createQueryJob).toHaveBeenCalledWith(
        expect.objectContaining({
          query,
          params
        })
      );
    });

    it('should handle timeout errors', async () => {
      mockJob.getQueryResults = jest.fn().mockRejectedValue(
        new Error('DEADLINE_EXCEEDED')
      );

      await expect(client.query('SELECT * FROM table')).rejects.toThrow('QUERY_TIMEOUT');
    });

    it('should handle generic BigQuery errors', async () => {
      mockJob.getQueryResults = jest.fn().mockRejectedValue(
        new Error('Invalid table name')
      );

      await expect(client.query('SELECT * FROM invalid')).rejects.toThrow('BigQuery error');
    });

    it('should apply query timeout', async () => {
      await client.query('SELECT * FROM table');

      expect(mockBigQuery.createQueryJob).toHaveBeenCalledWith(
        expect.objectContaining({
          timeoutMs: 30000
        })
      );
    });
  });

  describe('callProcedure', () => {
    it('should call stored procedure successfully', async () => {
      const result = await client.callProcedure('dataset.procedure_name', {
        param1: 'value1',
        param2: 123
      });

      expect(result.rows).toHaveLength(2);
      expect(result.totalRows).toBe(2);
      expect(mockBigQuery.createQueryJob).toHaveBeenCalledWith(
        expect.objectContaining({
          params: expect.objectContaining({
            param1: 'value1',
            param2: 123
          })
        })
      );
    });

    it('should handle SIGNAL SQLSTATE errors from procedures', async () => {
      mockJob.getQueryResults = jest.fn().mockRejectedValue(
        new Error("SIGNAL SQLSTATE '45000' MESSAGE_TEXT = 'Invalid category'")
      );

      await expect(
        client.callProcedure('dataset.procedure', {})
      ).rejects.toThrow('Invalid category');
    });

    it('should handle procedure timeout', async () => {
      mockJob.getQueryResults = jest.fn().mockRejectedValue({
        code: 'DEADLINE_EXCEEDED'
      });

      await expect(
        client.callProcedure('dataset.procedure', {})
      ).rejects.toThrow('QUERY_TIMEOUT');
    });
  });

  describe('tableExists', () => {
    it('should return true for existing table', async () => {
      const mockTable = {
        exists: jest.fn().mockResolvedValue([true])
      };

      mockBigQuery.dataset = jest.fn().mockReturnValue({
        table: jest.fn().mockReturnValue(mockTable)
      }) as any;

      const exists = await client.tableExists('dataset', 'table');
      expect(exists).toBe(true);
    });

    it('should return false for non-existent table', async () => {
      const mockTable = {
        exists: jest.fn().mockResolvedValue([false])
      };

      mockBigQuery.dataset = jest.fn().mockReturnValue({
        table: jest.fn().mockReturnValue(mockTable)
      }) as any;

      const exists = await client.tableExists('dataset', 'table');
      expect(exists).toBe(false);
    });

    it('should handle errors gracefully', async () => {
      mockBigQuery.dataset = jest.fn().mockImplementation(() => {
        throw new Error('Access denied');
      });

      const exists = await client.tableExists('dataset', 'table');
      expect(exists).toBe(false);
    });
  });

  describe('getDistinctValues', () => {
    it('should retrieve distinct values', async () => {
      mockJob.getQueryResults = jest.fn().mockResolvedValue([
        [
          { value: '(Beer)' },
          { value: '(Sushi)' },
          { value: '(Food)' }
        ]
      ]);

      const values = await client.getDistinctValues('dataset', 'table', 'category');

      expect(values).toEqual(['(Beer)', '(Sushi)', '(Food)']);
    });

    it('should apply limit parameter', async () => {
      mockJob.getQueryResults = jest.fn().mockResolvedValue([[]]);

      await client.getDistinctValues('dataset', 'table', 'category', 50);

      expect(mockBigQuery.createQueryJob).toHaveBeenCalledWith(
        expect.objectContaining({
          params: expect.objectContaining({
            limit: 50
          })
        })
      );
    });
  });
});
