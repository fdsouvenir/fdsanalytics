/**
 * Unit tests for ConversationManager
 */

import { ConversationManager } from '../../src/core/ConversationManager';
import { BigQueryStorage } from '../../src/storage/BigQueryStorage';
import { GeminiClient } from '../../src/gemini/GeminiClient';
import { mockMessages } from '../fixtures/mockMessages';

// Mock dependencies
jest.mock('../../src/storage/BigQueryStorage');
jest.mock('../../src/gemini/GeminiClient');

describe('ConversationManager', () => {
  let conversationManager: ConversationManager;
  let mockStorage: jest.Mocked<BigQueryStorage>;
  let mockGeminiClient: jest.Mocked<GeminiClient>;

  beforeEach(() => {
    jest.clearAllMocks();
    conversationManager = new ConversationManager();
    mockStorage = (conversationManager as any).storage;
    mockGeminiClient = (conversationManager as any).geminiClient;

    // Mock initialization
    mockGeminiClient.initialize = jest.fn().mockResolvedValue(undefined);
  });

  describe('initialize', () => {
    it('should initialize GeminiClient', async () => {
      await conversationManager.initialize();

      expect(mockGeminiClient.initialize).toHaveBeenCalledTimes(1);
    });

    it('should only initialize once', async () => {
      await conversationManager.initialize();
      await conversationManager.initialize();

      expect(mockGeminiClient.initialize).toHaveBeenCalledTimes(1);
    });

    it('should throw error if initialization fails', async () => {
      mockGeminiClient.initialize.mockRejectedValue(new Error('Init failed'));

      await expect(conversationManager.initialize()).rejects.toThrow('Init failed');
    });
  });

  describe('getContext', () => {
    beforeEach(async () => {
      await conversationManager.initialize();
    });

    it('should retrieve and summarize conversation context', async () => {
      mockStorage.getContext = jest.fn().mockResolvedValue(mockMessages);
      mockGeminiClient.summarize = jest.fn().mockResolvedValue({
        summary: 'User asking about beer and sushi sales',
        method: 'gemini',
        confidence: 0.9,
      });

      const result = await conversationManager.getContext({
        userId: 'user@test.com',
        threadId: 'thread123',
        currentMessage: 'What about wine?',
      });

      expect(result.relevantMessages).toHaveLength(5);
      expect(result.summary).toContain('beer and sushi');
      expect(mockStorage.getContext).toHaveBeenCalledWith({
        userId: 'user@test.com',
        threadId: 'thread123',
        maxMessages: 10,
      });
    });

    it('should handle empty conversation', async () => {
      mockStorage.getContext = jest.fn().mockResolvedValue([]);

      const result = await conversationManager.getContext({
        userId: 'user@test.com',
        threadId: 'thread123',
        currentMessage: 'Hello',
      });

      expect(result.relevantMessages).toEqual([]);
      expect(result.summary).toContain('New conversation');
    });

    it('should respect maxMessages parameter', async () => {
      mockStorage.getContext = jest.fn().mockResolvedValue(mockMessages.slice(0, 5));

      await conversationManager.getContext({
        userId: 'user@test.com',
        threadId: 'thread123',
        currentMessage: 'Test',
        maxMessages: 5,
      });

      expect(mockStorage.getContext).toHaveBeenCalledWith({
        userId: 'user@test.com',
        threadId: 'thread123',
        maxMessages: 5,
      });
    });

    it('should gracefully degrade on storage error', async () => {
      mockStorage.getContext = jest.fn().mockRejectedValue(new Error('Storage error'));

      const result = await conversationManager.getContext({
        userId: 'user@test.com',
        threadId: 'thread123',
        currentMessage: 'Test',
      });

      expect(result.relevantMessages).toEqual([]);
      expect(result.summary).toContain('Unable to retrieve');
    });

    it('should auto-initialize if not initialized', async () => {
      const newManager = new ConversationManager();
      const newMockGeminiClient = (newManager as any).geminiClient;
      const newMockStorage = (newManager as any).storage;

      newMockGeminiClient.initialize = jest.fn().mockResolvedValue(undefined);
      newMockStorage.getContext = jest.fn().mockResolvedValue([]);

      await newManager.getContext({
        userId: 'user@test.com',
        threadId: 'thread123',
        currentMessage: 'Test',
      });

      expect(newMockGeminiClient.initialize).toHaveBeenCalledTimes(1);
    });
  });

  describe('storeMessage', () => {
    beforeEach(async () => {
      await conversationManager.initialize();
    });

    it('should store user message', async () => {
      mockStorage.storeMessage = jest.fn().mockResolvedValue(undefined);

      await conversationManager.storeMessage({
        userId: 'user@test.com',
        threadId: 'thread123',
        role: 'user',
        content: 'Test message',
      });

      expect(mockStorage.storeMessage).toHaveBeenCalledTimes(1);
      const storedMessage = mockStorage.storeMessage.mock.calls[0][0];
      expect(storedMessage.role).toBe('user');
      expect(storedMessage.content).toBe('Test message');
      expect(storedMessage.userId).toBe('user@test.com');
      expect(storedMessage.threadId).toBe('thread123');
      expect(storedMessage.tenantId).toBe('senso-sushi');
    });

    it('should store assistant message', async () => {
      mockStorage.storeMessage = jest.fn().mockResolvedValue(undefined);

      await conversationManager.storeMessage({
        userId: 'user@test.com',
        threadId: 'thread123',
        role: 'assistant',
        content: 'Test response',
        contextSummary: 'Summary',
        toolCalls: { tool: 'query_analytics' },
      });

      expect(mockStorage.storeMessage).toHaveBeenCalledTimes(1);
      const storedMessage = mockStorage.storeMessage.mock.calls[0][0];
      expect(storedMessage.role).toBe('assistant');
      expect(storedMessage.contextSummary).toBe('Summary');
      expect(storedMessage.toolCalls).toEqual({ tool: 'query_analytics' });
    });

    it('should throw error if storage fails', async () => {
      mockStorage.storeMessage = jest.fn().mockRejectedValue(new Error('Storage failed'));

      await expect(
        conversationManager.storeMessage({
          userId: 'user@test.com',
          threadId: 'thread123',
          role: 'user',
          content: 'Test',
        })
      ).rejects.toThrow('Storage failed');
    });

    it('should generate unique conversation IDs', async () => {
      mockStorage.storeMessage = jest.fn().mockResolvedValue(undefined);

      await conversationManager.storeMessage({
        userId: 'user@test.com',
        threadId: 'thread123',
        role: 'user',
        content: 'Message 1',
      });

      await conversationManager.storeMessage({
        userId: 'user@test.com',
        threadId: 'thread123',
        role: 'user',
        content: 'Message 2',
      });

      const id1 = mockStorage.storeMessage.mock.calls[0][0].conversationId;
      const id2 = mockStorage.storeMessage.mock.calls[1][0].conversationId;

      expect(id1).not.toBe(id2);
    });
  });

  describe('healthCheck', () => {
    it('should check health of all dependencies', async () => {
      mockStorage.healthCheck = jest.fn().mockResolvedValue(true);
      mockGeminiClient.healthCheck = jest.fn().mockResolvedValue(true);

      const result = await conversationManager.healthCheck();

      expect(result.healthy).toBe(true);
      expect(result.bigquery).toBe(true);
      expect(result.gemini).toBe(true);
      expect(mockStorage.healthCheck).toHaveBeenCalledTimes(1);
      expect(mockGeminiClient.healthCheck).toHaveBeenCalledTimes(1);
    });

    it('should report unhealthy if BigQuery fails', async () => {
      mockStorage.healthCheck = jest.fn().mockResolvedValue(false);
      mockGeminiClient.healthCheck = jest.fn().mockResolvedValue(true);

      const result = await conversationManager.healthCheck();

      expect(result.healthy).toBe(false);
      expect(result.bigquery).toBe(false);
      expect(result.gemini).toBe(true);
    });

    it('should report unhealthy if Gemini fails', async () => {
      mockStorage.healthCheck = jest.fn().mockResolvedValue(true);
      mockGeminiClient.healthCheck = jest.fn().mockResolvedValue(false);

      const result = await conversationManager.healthCheck();

      expect(result.healthy).toBe(false);
      expect(result.bigquery).toBe(true);
      expect(result.gemini).toBe(false);
    });

    it('should report unhealthy if both fail', async () => {
      mockStorage.healthCheck = jest.fn().mockResolvedValue(false);
      mockGeminiClient.healthCheck = jest.fn().mockResolvedValue(false);

      const result = await conversationManager.healthCheck();

      expect(result.healthy).toBe(false);
      expect(result.bigquery).toBe(false);
      expect(result.gemini).toBe(false);
    });
  });
});
