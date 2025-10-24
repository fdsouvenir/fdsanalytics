import { MCPClient } from '../clients/MCPClient';
import { ConversationClient } from '../clients/ConversationClient';
import { GeminiClient } from '../clients/GeminiClient';
import { TenantResolver } from './TenantResolver';
import { ResponseGenerator } from './ResponseGenerator';
import { ResponseFormatter } from './ResponseFormatter';
import { Config } from '../config/config';

export interface ChatMessageRequest {
  workspaceId: string;
  userId: string;
  message: string;
  threadId?: string;
  messageId: string;
  timestamp: string;
}

export interface ChatMessageResponse {
  text: string;
  cardsV2?: Array<{
    cardId: string;
    card: any;
  }>;
  actionResponse?: {
    type: 'UPDATE_MESSAGE' | 'NEW_MESSAGE';
  };
}

/**
 * ResponseEngine - Main orchestrator
 *
 * Coordinates all services:
 * - Tenant resolution
 * - Conversation context
 * - Response generation (Gemini + MCP)
 * - Chart generation
 * - Response formatting
 */
export class ResponseEngine {
  private tenantResolver: TenantResolver;
  private responseGenerator: ResponseGenerator;
  private responseFormatter: ResponseFormatter;

  constructor(
    private config: Config,
    private mcpClient: MCPClient,
    private conversationClient: ConversationClient,
    private geminiClient: GeminiClient
  ) {
    this.tenantResolver = new TenantResolver();
    this.responseGenerator = new ResponseGenerator(
      mcpClient,
      geminiClient,
      config.enableCharts,
      config.maxChartDatapoints
    );
    this.responseFormatter = new ResponseFormatter(config.defaultCurrency);
  }

  /**
   * Handle incoming chat message
   */
  async handleMessage(request: ChatMessageRequest): Promise<ChatMessageResponse> {
    const startTime = Date.now();

    try {
      // Step 1: Resolve tenant
      const tenantConfig = await this.tenantResolver.resolveTenant(
        request.workspaceId,
        request.userId
      );

      if (!tenantConfig) {
        return {
          text: 'Please run /setup first to configure your account.'
        };
      }

      // Step 2: Get conversation context (with fallback)
      const context = await this.conversationClient.getContext(
        request.userId,
        request.threadId || request.messageId,
        request.message,
        this.config.maxConversationHistory
      );

      // DEBUG: Check what context was retrieved
      console.log('DEBUG: Context from Conversation Manager:', JSON.stringify({
        userId: request.userId,
        threadId: request.threadId || request.messageId,
        hasContext: !!context,
        messageCount: context?.relevantMessages?.length || 0,
        messages: context?.relevantMessages?.slice(-3) || []
      }, null, 2));

      // Step 3: Get available categories from MCP
      const availableCategories = await this.getAvailableCategories();

      // Step 4: Generate response
      const result = await this.responseGenerator.generate({
        userMessage: request.message,
        context,
        tenantConfig,
        currentDateTime: new Date(),
        availableCategories
      });

      // Step 5: Store user message and bot response in history
      await this.conversationClient.storeMessage(
        request.userId,
        request.threadId || request.messageId,
        'user',
        request.message
      );

      await this.conversationClient.storeMessage(
        request.userId,
        request.threadId || request.messageId,
        'assistant',
        result.responseText
      );

      // Step 6: Format response for Google Chat
      const response = this.responseFormatter.formatResponse(
        result.responseText,
        result.chartUrl,
        result.chartTitle
      );

      // Log performance
      const duration = Date.now() - startTime;
      console.log('Response generated successfully', {
        userId: request.userId,
        tenantId: tenantConfig.tenantId,
        durationMs: duration,
        toolCallsCount: result.toolCallsMade.length,
        chartGenerated: result.chartUrl !== null
      });

      return response;
    } catch (error: any) {
      console.error('Error handling message', {
        error: error.message,
        userId: request.userId,
        message: request.message
      });

      // Return user-friendly error
      const errorResponse = this.responseFormatter.formatError(
        'I encountered an unexpected error. Please try again.'
      );

      return errorResponse;
    }
  }

  /**
   * Get available categories from MCP
   * Uses a simple query to get distinct categories
   */
  private async getAvailableCategories(): Promise<string[]> {
    try {
      // Query for distinct categories (last 30 days)
      const result = await this.mcpClient.callTool('query_analytics', {
        metric: 'net_sales',
        timeframe: {
          type: 'relative',
          relative: 'last_month'
        },
        aggregation: 'sum',
        groupBy: ['category'],
        limit: 100
      });

      if (result.rows && Array.isArray(result.rows)) {
        return result.rows.map((row: any) => row.primary_category || row.category).filter(Boolean);
      }

      return [];
    } catch (error: any) {
      console.warn('Failed to get available categories', {
        error: error.message
      });
      // Return empty array on failure (non-critical)
      return [];
    }
  }
}
