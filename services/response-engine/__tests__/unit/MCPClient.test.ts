import { MCPClient } from '../../src/clients/MCPClient';
import axios from 'axios';
import { mockMCPToolsList, mockQueryAnalyticsResult } from '../fixtures/mockResponses';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('MCPClient', () => {
  let mcpClient: MCPClient;
  let mockAxiosInstance: any;

  beforeEach(() => {
    mockAxiosInstance = {
      post: jest.fn()
    };
    mockedAxios.create = jest.fn().mockReturnValue(mockAxiosInstance);
    mcpClient = new MCPClient('http://localhost:3001');
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('listTools', () => {
    it('should return list of available tools', async () => {
      mockAxiosInstance.post.mockResolvedValue({
        data: { result: mockMCPToolsList }
      });

      const tools = await mcpClient.listTools();

      expect(tools).toHaveLength(3);
      expect(tools[0].name).toBe('query_analytics');
      expect(mockAxiosInstance.post).toHaveBeenCalledWith('/mcp', {
        method: 'tools/list'
      });
    });

    it('should throw error if MCP returns error', async () => {
      mockAxiosInstance.post.mockResolvedValue({
        data: {
          error: {
            code: 500,
            message: 'Internal server error'
          }
        }
      });

      await expect(mcpClient.listTools()).rejects.toThrow('MCP Error');
    });
  });

  describe('callTool', () => {
    it('should call tool with parameters', async () => {
      mockAxiosInstance.post.mockResolvedValue({
        data: { result: mockQueryAnalyticsResult }
      });

      const result = await mcpClient.callTool('query_analytics', {
        metric: 'net_sales',
        timeframe: { type: 'relative', relative: 'today' },
        aggregation: 'sum'
      });

      expect(result).toEqual(mockQueryAnalyticsResult);
      expect(mockAxiosInstance.post).toHaveBeenCalledWith('/mcp', {
        method: 'tools/call',
        params: {
          name: 'query_analytics',
          arguments: expect.any(Object)
        }
      });
    });

    it('should retry on transient errors (3 times)', async () => {
      mockAxiosInstance.post
        .mockRejectedValueOnce(new Error('Network error'))
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({
          data: { result: mockQueryAnalyticsResult }
        });

      const result = await mcpClient.callTool('query_analytics', {
        metric: 'net_sales',
        timeframe: { type: 'relative', relative: 'today' },
        aggregation: 'sum'
      });

      expect(result).toEqual(mockQueryAnalyticsResult);
      expect(mockAxiosInstance.post).toHaveBeenCalledTimes(3);
    });

    it('should not retry on user input errors (400)', async () => {
      const error: any = new Error('Invalid category');
      error.response = { status: 400 };
      mockAxiosInstance.post.mockRejectedValue(error);

      await expect(
        mcpClient.callTool('query_analytics', { invalid: 'params' })
      ).rejects.toThrow();

      expect(mockAxiosInstance.post).toHaveBeenCalledTimes(1); // No retry
    });

    it('should throw after max retries exhausted', async () => {
      mockAxiosInstance.post.mockRejectedValue(new Error('Network error'));

      await expect(
        mcpClient.callTool('query_analytics', {})
      ).rejects.toThrow('Network error');

      expect(mockAxiosInstance.post).toHaveBeenCalledTimes(3); // 3 attempts
    });
  });
});
