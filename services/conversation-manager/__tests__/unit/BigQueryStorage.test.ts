/**
 * Unit tests for BigQueryStorage
 */

import { BigQueryStorage, ConversationMessage } from '../../src/storage/BigQueryStorage';

// Mock BigQuery
jest.mock('@google-cloud/bigquery');

describe('BigQueryStorage', () => {
  let storage: BigQueryStorage;

  beforeEach(() => {
    jest.clearAllMocks();
    storage = new BigQueryStorage();
  });

  describe('generateConversationId', () => {
    it('should generate unique conversation IDs', () => {
      const tenantId = 'senso-sushi';
      const threadId = 'thread123';
      const timestamp1 = new Date('2025-10-22T14:00:00Z');
      const timestamp2 = new Date('2025-10-22T14:01:00Z');

      const id1 = BigQueryStorage.generateConversationId(tenantId, threadId, timestamp1);
      const id2 = BigQueryStorage.generateConversationId(tenantId, threadId, timestamp2);

      expect(id1).toBe('senso-sushi-thread123-1729605600000');
      expect(id2).toBe('senso-sushi-thread123-1729605660000');
      expect(id1).not.toBe(id2);
    });
  });

  describe('storeMessage', () => {
    it('should store a message successfully', async () => {
      const message: ConversationMessage = {
        conversationId: 'test-id',
        tenantId: 'senso-sushi',
        userId: 'user@test.com',
        threadId: 'thread123',
        role: 'user',
        content: 'Test message',
        timestamp: new Date(),
      };

      // Mock BigQuery insert
      const mockInsert = jest.fn().mockResolvedValue([]);
      const mockTable = {
        insert: mockInsert,
      };
      const mockDataset = jest.fn().mockReturnValue({
        table: jest.fn().mockReturnValue(mockTable),
      });

      (storage as any).bq = {
        dataset: mockDataset,
      };

      await storage.storeMessage(message);

      expect(mockInsert).toHaveBeenCalledTimes(1);
    });

    it('should retry on transient failures', async () => {
      const message: ConversationMessage = {
        conversationId: 'test-id',
        tenantId: 'senso-sushi',
        userId: 'user@test.com',
        threadId: 'thread123',
        role: 'user',
        content: 'Test message',
        timestamp: new Date(),
      };

      let callCount = 0;
      const mockInsert = jest.fn().mockImplementation(() => {
        callCount++;
        if (callCount < 3) {
          throw new Error('Transient error');
        }
        return Promise.resolve([]);
      });

      const mockTable = {
        insert: mockInsert,
      };
      const mockDataset = jest.fn().mockReturnValue({
        table: jest.fn().mockReturnValue(mockTable),
      });

      (storage as any).bq = {
        dataset: mockDataset,
      };

      await storage.storeMessage(message);

      expect(mockInsert).toHaveBeenCalledTimes(3);
    });

    it('should throw error after max retries', async () => {
      const message: ConversationMessage = {
        conversationId: 'test-id',
        tenantId: 'senso-sushi',
        userId: 'user@test.com',
        threadId: 'thread123',
        role: 'user',
        content: 'Test message',
        timestamp: new Date(),
      };

      const mockInsert = jest.fn().mockRejectedValue(new Error('Persistent error'));
      const mockTable = {
        insert: mockInsert,
      };
      const mockDataset = jest.fn().mockReturnValue({
        table: jest.fn().mockReturnValue(mockTable),
      });

      (storage as any).bq = {
        dataset: mockDataset,
      };

      await expect(storage.storeMessage(message)).rejects.toThrow('Failed to store message');
      expect(mockInsert).toHaveBeenCalledTimes(3);
    });
  });

  describe('getContext', () => {
    it('should retrieve messages for a thread', async () => {
      const mockRows = [
        {
          conversationId: 'id1',
          tenantId: 'senso-sushi',
          userId: 'user@test.com',
          threadId: 'thread123',
          role: 'user',
          content: 'Message 1',
          timestamp: { value: '2025-10-22T14:00:00Z' },
        },
        {
          conversationId: 'id2',
          tenantId: 'senso-sushi',
          userId: 'user@test.com',
          threadId: 'thread123',
          role: 'assistant',
          content: 'Message 2',
          timestamp: { value: '2025-10-22T14:01:00Z' },
        },
      ];

      const mockQuery = jest.fn().mockResolvedValue([mockRows]);
      (storage as any).bq = {
        query: mockQuery,
      };

      const result = await storage.getContext({
        userId: 'user@test.com',
        threadId: 'thread123',
      });

      expect(result).toHaveLength(2);
      expect(result[0].content).toBe('Message 1');
      expect(result[1].content).toBe('Message 2');
      expect(mockQuery).toHaveBeenCalledTimes(1);
    });

    it('should return empty array on error', async () => {
      const mockQuery = jest.fn().mockRejectedValue(new Error('Query failed'));
      (storage as any).bq = {
        query: mockQuery,
      };

      const result = await storage.getContext({
        userId: 'user@test.com',
        threadId: 'thread123',
      });

      expect(result).toEqual([]);
    });

    it('should limit messages to maxMessages parameter', async () => {
      const mockQuery = jest.fn().mockResolvedValue([[]]);
      (storage as any).bq = {
        query: mockQuery,
      };

      await storage.getContext({
        userId: 'user@test.com',
        threadId: 'thread123',
        maxMessages: 5,
      });

      const queryCall = mockQuery.mock.calls[0][0];
      expect(queryCall.params.maxMessages).toBe(5);
    });
  });

  describe('healthCheck', () => {
    it('should return true if table exists', async () => {
      const mockExists = jest.fn().mockResolvedValue([true]);
      const mockTable = {
        exists: mockExists,
      };
      const mockDataset = jest.fn().mockReturnValue({
        table: jest.fn().mockReturnValue(mockTable),
      });

      (storage as any).bq = {
        dataset: mockDataset,
      };

      const result = await storage.healthCheck();

      expect(result).toBe(true);
      expect(mockExists).toHaveBeenCalledTimes(1);
    });

    it('should return false if table does not exist', async () => {
      const mockExists = jest.fn().mockResolvedValue([false]);
      const mockTable = {
        exists: mockExists,
      };
      const mockDataset = jest.fn().mockReturnValue({
        table: jest.fn().mockReturnValue(mockTable),
      });

      (storage as any).bq = {
        dataset: mockDataset,
      };

      const result = await storage.healthCheck();

      expect(result).toBe(false);
    });

    it('should return false on error', async () => {
      const mockExists = jest.fn().mockRejectedValue(new Error('Connection failed'));
      const mockTable = {
        exists: mockExists,
      };
      const mockDataset = jest.fn().mockReturnValue({
        table: jest.fn().mockReturnValue(mockTable),
      });

      (storage as any).bq = {
        dataset: mockDataset,
      };

      const result = await storage.healthCheck();

      expect(result).toBe(false);
    });
  });
});
