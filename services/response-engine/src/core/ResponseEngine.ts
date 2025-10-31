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
 * - Response generation (Gemini with function calling)
 * - Chart generation
 * - Response formatting
 */
export class ResponseEngine {
  private tenantResolver: TenantResolver;
  private responseGenerator: ResponseGenerator;
  private responseFormatter: ResponseFormatter;

  constructor(
    private config: Config,
    private conversationClient: ConversationClient,
    private geminiClient: GeminiClient
  ) {
    this.tenantResolver = new TenantResolver();
    this.responseGenerator = new ResponseGenerator(
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
    const timings: Record<string, number> = {};

    try {
      // Step 1: Resolve tenant
      const step1Start = Date.now();
      const tenantConfig = await this.tenantResolver.resolveTenant(
        request.workspaceId,
        request.userId
      );
      timings.resolveTenant = Date.now() - step1Start;

      if (!tenantConfig) {
        return {
          text: 'Please run /setup first to configure your account.'
        };
      }

      // Step 2: Get conversation context
      // Fetch recent conversation history to enable follow-up questions
      // and maintain context across messages
      const step2Start = Date.now();
      const context = await this.conversationClient.getContext(
        request.userId,
        request.threadId || request.messageId,
        request.message,  // Current message for context
        10  // Max 10 most recent messages
      );
      timings.getContext = Date.now() - step2Start;

      console.log(JSON.stringify({
        severity: 'DEBUG',
        message: 'Fetched conversation context',
        messageCount: context.relevantMessages?.length || 0,
        durationMs: timings.getContext
      }));

      // Step 3: Generate response
      const step3Start = Date.now();
      const result = await this.responseGenerator.generate({
        userMessage: request.message,
        context,
        tenantConfig,
        currentDateTime: new Date(),
        availableCategories: []
      });
      timings.generateResponse = Date.now() - step3Start;

      // Step 4: Format response for Google Chat (do this first)
      const step4Start = Date.now();
      const response = this.responseFormatter.formatResponse(
        result.responseText,
        result.chartUrl,
        result.chartTitle
      );
      timings.formatResponse = Date.now() - step4Start;

      // Step 5: Store messages in history (DON'T WAIT - fire and forget)
      Promise.all([
        this.conversationClient.storeMessage(
          request.userId,
          request.threadId || request.messageId,
          'user',
          request.message
        ),
        this.conversationClient.storeMessage(
          request.userId,
          request.threadId || request.messageId,
          'assistant',
          result.responseText
        )
      ]).catch(error => {
        console.error('Failed to store conversation history (non-blocking)', {
          error: error.message,
          userId: request.userId
        });
      });

      // Log performance with detailed timings
      const totalDuration = Date.now() - startTime;
      console.log(JSON.stringify({
        severity: 'INFO',
        message: 'Response generated successfully',
        userId: request.userId,
        tenantId: tenantConfig.tenantId,
        userMessage: request.message,
        responseText: result.responseText,
        totalDurationMs: totalDuration,
        timings: {
          resolveTenant: timings.resolveTenant,
          getContext: timings.getContext,
          generateResponse: timings.generateResponse,
          formatResponse: timings.formatResponse
        },
        toolCallsCount: result.toolCallsMade.length,
        toolCallsSummary: result.toolCallsMade.map(tc => ({
          tool: tc.toolName,
          params: tc.parameters,
          result: tc.result
        })),
        chartGenerated: result.chartUrl !== null
      }));

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

}
