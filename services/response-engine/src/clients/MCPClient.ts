import axios, { AxiosInstance } from 'axios';
import { GoogleAuth } from 'google-auth-library';

interface MCPRequest {
  method: 'tools/list' | 'tools/call';
  params?: {
    name?: string;
    arguments?: Record<string, any>;
  };
}

interface MCPResponse {
  result?: any;
  error?: {
    code: number;
    message: string;
  };
}

interface MCPTool {
  name: string;
  description: string;
  inputSchema: any;
}

/**
 * MCPClient - Calls MCP Server tools
 *
 * Handles:
 * - Listing available tools
 * - Calling tools with parameters
 * - Retry with exponential backoff (3 attempts)
 * - Error handling with fallback
 * - Service-to-service authentication
 */
export class MCPClient {
  private client: AxiosInstance;
  private auth: GoogleAuth;

  constructor(
    private mcpServerUrl: string,
    private timeout: number = 30000
  ) {
    this.client = axios.create({
      baseURL: mcpServerUrl,
      timeout: this.timeout,
      headers: {
        'Content-Type': 'application/json'
      }
    });

    this.auth = new GoogleAuth();
  }

  /**
   * Get authorization header with identity token from metadata server
   */
  private async getAuthHeaders(): Promise<Record<string, string>> {
    try {
      // Use the metadata server to get an identity token for the target audience
      const metadataServerUrl = 'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/identity';
      const response = await axios.get(metadataServerUrl, {
        params: { audience: this.mcpServerUrl },
        headers: { 'Metadata-Flavor': 'Google' },
        timeout: 5000
      });

      const idToken = response.data;
      return { 'Authorization': `Bearer ${idToken}` };
    } catch (error: any) {
      console.warn('Failed to get auth token from metadata server for MCP, proceeding without auth', {
        error: error.message
      });
      return {};
    }
  }

  /**
   * List available MCP tools
   */
  async listTools(): Promise<MCPTool[]> {
    const request: MCPRequest = {
      method: 'tools/list'
    };

    const response = await this.makeRequest<{ tools: MCPTool[] }>(request);
    // MCP Server returns { tools: [...] }, extract the array
    return response.tools || [];
  }

  /**
   * Call an MCP tool
   * @param toolName Name of the tool (query_analytics, get_forecast, get_anomalies)
   * @param args Tool-specific parameters
   */
  async callTool(toolName: string, args: Record<string, any>): Promise<any> {
    const request: MCPRequest = {
      method: 'tools/call',
      params: {
        name: toolName,
        arguments: args
      }
    };

    return await this.makeRequestWithRetry(request);
  }

  /**
   * Make MCP request with retry logic
   */
  private async makeRequestWithRetry<T>(request: MCPRequest, maxRetries = 3): Promise<T> {
    let lastError: Error | null = null;
    let delay = 1000; // Start with 1 second

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await this.makeRequest<T>(request);
      } catch (error: any) {
        lastError = error;

        // Don't retry on user input errors (400)
        if (error.response?.status === 400) {
          throw error;
        }

        // Last attempt - throw error
        if (attempt === maxRetries) {
          break;
        }

        // Log retry
        console.warn('MCP request failed, retrying...', {
          attempt,
          maxRetries,
          error: error.message,
          delayMs: delay
        });

        // Wait with exponential backoff
        await this.sleep(delay);
        delay *= 2; // Double the delay for next attempt
      }
    }

    throw lastError;
  }

  /**
   * Make HTTP request to MCP server
   */
  private async makeRequest<T>(request: MCPRequest): Promise<T> {
    try {
      const authHeaders = await this.getAuthHeaders();
      const response = await this.client.post<MCPResponse>('/mcp', request, {
        headers: authHeaders
      });

      if (response.data.error) {
        throw new Error(`MCP Error: ${response.data.error.message}`);
      }

      return response.data.result as T;
    } catch (error: any) {
      if (error.code === 'ECONNREFUSED') {
        throw new Error('MCP Server unavailable');
      }
      throw error;
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
