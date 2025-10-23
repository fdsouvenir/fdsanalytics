import { ResponseEngine, ChatMessageRequest } from '../../src/core/ResponseEngine';
import { MCPClient } from '../../src/clients/MCPClient';
import { ConversationClient } from '../../src/clients/ConversationClient';
import { GeminiClient } from '../../src/clients/GeminiClient';
import { Config } from '../../src/config/config';
import {
  mockTenantConfig,
  mockConversationContext,
  mockQueryAnalyticsResult
} from '../fixtures/mockResponses';

jest.mock('../../src/clients/MCPClient');
jest.mock('../../src/clients/ConversationClient');
jest.mock('../../src/clients/GeminiClient');

describe('ResponseEngine', () => {
  let responseEngine: ResponseEngine;
  let mockConfig: Config;
  let mockMCPClient: jest.Mocked<MCPClient>;
  let mockConversationClient: jest.Mocked<ConversationClient>;
  let mockGeminiClient: jest.Mocked<GeminiClient>;

  beforeEach(() => {
    mockConfig = {
      projectId: 'test-project',
      region: 'us-central1',
      environment: 'test',
      logLevel: 'info',
      geminiSecretName: 'GEMINI_API_KEY',
      mcpServerUrl: 'http://localhost:3001',
      conversationManagerUrl: 'http://localhost:3002',
      port: 8080,
      enableCharts: true,
      enableForecasts: true,
      enableAnomalyDetection: true,
      maxChartDatapoints: 20,
      maxConversationHistory: 10,
      maxQueryResults: 100,
      geminiModelPro: 'gemini-2.5-pro',
      defaultTimezone: 'America/Chicago',
      defaultCurrency: 'USD'
    };

    mockMCPClient = new MCPClient('http://localhost:3001') as jest.Mocked<MCPClient>;
    mockConversationClient = new ConversationClient('http://localhost:3002') as jest.Mocked<ConversationClient>;
    mockGeminiClient = new GeminiClient('test-project', 'GEMINI_API_KEY') as jest.Mocked<GeminiClient>;

    responseEngine = new ResponseEngine(
      mockConfig,
      mockMCPClient,
      mockConversationClient,
      mockGeminiClient
    );

    // Setup default mocks
    mockConversationClient.getContext.mockResolvedValue(mockConversationContext);
    mockConversationClient.storeMessage.mockResolvedValue();
    mockMCPClient.callTool.mockResolvedValue(mockQueryAnalyticsResult);
    mockMCPClient.listTools.mockResolvedValue([
      {
        name: 'query_analytics',
        description: 'Query sales data',
        inputSchema: {}
      }
    ]);
    mockGeminiClient.generateResponse.mockResolvedValue({
      functionCall: {
        name: 'query_analytics',
        args: { metric: 'net_sales' }
      }
    });
    mockGeminiClient.generateFinalResponse.mockResolvedValue(
      'Today\'s sales were $5,234.'
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('handleMessage', () => {
    const validRequest: ChatMessageRequest = {
      workspaceId: 'workspace123',
      userId: 'user456',
      message: 'What were sales today?',
      threadId: 'thread789',
      messageId: 'msg123',
      timestamp: new Date().toISOString()
    };

    it('should process message and return response', async () => {
      const response = await responseEngine.handleMessage(validRequest);

      expect(response.text).toContain('$5,234');
      expect(response.responseType).toBe('NEW_MESSAGE');
      expect(mockConversationClient.getContext).toHaveBeenCalled();
      expect(mockMCPClient.callTool).toHaveBeenCalled();
      expect(mockGeminiClient.generateResponse).toHaveBeenCalled();
    });

    it('should store user message and bot response', async () => {
      await responseEngine.handleMessage(validRequest);

      expect(mockConversationClient.storeMessage).toHaveBeenCalledTimes(2);
      expect(mockConversationClient.storeMessage).toHaveBeenCalledWith(
        'user456',
        'thread789',
        'user',
        'What were sales today?'
      );
      expect(mockConversationClient.storeMessage).toHaveBeenCalledWith(
        'user456',
        'thread789',
        'assistant',
        expect.any(String)
      );
    });

    it('should handle conversation context failure gracefully', async () => {
      mockConversationClient.getContext.mockResolvedValue({
        relevantMessages: []
      });

      const response = await responseEngine.handleMessage(validRequest);

      expect(response.text).toBeDefined();
      expect(mockMCPClient.callTool).toHaveBeenCalled(); // Should still proceed
    });

    it('should handle MCP failure and return error', async () => {
      mockMCPClient.callTool.mockRejectedValue(new Error('MCP Server unavailable'));

      const response = await responseEngine.handleMessage(validRequest);

      expect(response.text).toContain('trouble accessing the data');
      expect(response.responseType).toBe('NEW_MESSAGE');
    });

    it('should handle Gemini failure and return error', async () => {
      mockGeminiClient.generateResponse.mockRejectedValue(new Error('Gemini API error'));

      const response = await responseEngine.handleMessage(validRequest);

      expect(response.text).toContain('Something went wrong');
    });

    it('should include threadId in response if provided', async () => {
      const response = await responseEngine.handleMessage(validRequest);

      expect(response.threadId).toBe('thread789');
    });

    it('should work without threadId', async () => {
      const requestWithoutThread = { ...validRequest, threadId: undefined };

      const response = await responseEngine.handleMessage(requestWithoutThread);

      expect(response.text).toBeDefined();
    });
  });
});
