import { ConversationClient } from '../../src/clients/ConversationClient';
import axios from 'axios';
import { mockConversationContext } from '../fixtures/mockResponses';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('ConversationClient', () => {
  let conversationClient: ConversationClient;
  let mockAxiosInstance: any;

  beforeEach(() => {
    mockAxiosInstance = {
      post: jest.fn()
    };
    mockedAxios.create = jest.fn().mockReturnValue(mockAxiosInstance);
    conversationClient = new ConversationClient('http://localhost:3002');
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getContext', () => {
    it('should return conversation context', async () => {
      mockAxiosInstance.post.mockResolvedValue({
        data: mockConversationContext
      });

      const context = await conversationClient.getContext(
        'user123',
        'thread456',
        'What were sales today?'
      );

      expect(context.relevantMessages).toHaveLength(2);
      expect(context.summary).toBe('User asking about daily sales');
      expect(mockAxiosInstance.post).toHaveBeenCalledWith('/get-context', {
        userId: 'user123',
        threadId: 'thread456',
        currentMessage: 'What were sales today?',
        maxMessages: 10
      });
    });

    it('should fallback to empty context on failure', async () => {
      mockAxiosInstance.post.mockRejectedValue(new Error('Service unavailable'));

      const context = await conversationClient.getContext(
        'user123',
        'thread456',
        'Test message'
      );

      expect(context.relevantMessages).toEqual([]);
      expect(context.summary).toBeUndefined();
    });

    it('should support custom maxMessages', async () => {
      mockAxiosInstance.post.mockResolvedValue({
        data: mockConversationContext
      });

      await conversationClient.getContext(
        'user123',
        'thread456',
        'Test',
        5
      );

      expect(mockAxiosInstance.post).toHaveBeenCalledWith('/get-context', {
        userId: 'user123',
        threadId: 'thread456',
        currentMessage: 'Test',
        maxMessages: 5
      });
    });
  });

  describe('storeMessage', () => {
    it('should store user message', async () => {
      mockAxiosInstance.post.mockResolvedValue({ data: { success: true } });

      await conversationClient.storeMessage(
        'user123',
        'thread456',
        'user',
        'What were sales today?'
      );

      expect(mockAxiosInstance.post).toHaveBeenCalledWith('/store-message', {
        userId: 'user123',
        threadId: 'thread456',
        role: 'user',
        content: 'What were sales today?'
      });
    });

    it('should store assistant message', async () => {
      mockAxiosInstance.post.mockResolvedValue({ data: { success: true } });

      await conversationClient.storeMessage(
        'user123',
        'thread456',
        'assistant',
        'Sales today were $5,234.'
      );

      expect(mockAxiosInstance.post).toHaveBeenCalledWith('/store-message', {
        userId: 'user123',
        threadId: 'thread456',
        role: 'assistant',
        content: 'Sales today were $5,234.'
      });
    });

    it('should not throw on failure (non-critical)', async () => {
      mockAxiosInstance.post.mockRejectedValue(new Error('Service unavailable'));

      await expect(
        conversationClient.storeMessage('user123', 'thread456', 'user', 'Test')
      ).resolves.not.toThrow();
    });
  });
});
