/**
 * ConversationManager - Main orchestrator for conversation context and storage
 */

import { BigQueryStorage, ConversationMessage } from '../storage/BigQueryStorage';
import { ContextSummarizer, ConversationContext } from './ContextSummarizer';
import { GeminiClient } from '../gemini/GeminiClient';
import { config } from '../config/config';

export interface GetContextRequest {
  userId: string;
  threadId: string;
  currentMessage: string;
  maxMessages?: number;
}

export interface StoreMessageRequest {
  userId: string;
  threadId: string;
  role: 'user' | 'assistant';
  content: string;
  workspaceId?: string;
  messageId?: string;
  contextSummary?: string;
  toolCalls?: any;
}

export class ConversationManager {
  private storage: BigQueryStorage;
  private summarizer: ContextSummarizer;
  private geminiClient: GeminiClient;
  private initialized: boolean = false;

  constructor() {
    this.storage = new BigQueryStorage();
    this.geminiClient = new GeminiClient();
    this.summarizer = new ContextSummarizer(this.geminiClient);
  }

  /**
   * Initialize the ConversationManager (load Gemini API key, etc.)
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    try {
      await this.geminiClient.initialize();
      this.initialized = true;
      console.log('ConversationManager initialized successfully');
    } catch (error) {
      console.error('Failed to initialize ConversationManager:', error);
      throw error;
    }
  }

  /**
   * Get conversation context for a thread
   */
  async getContext(request: GetContextRequest): Promise<ConversationContext> {
    if (!this.initialized) {
      await this.initialize();
    }

    const startTime = Date.now();

    try {
      // Retrieve conversation history from BigQuery
      const messages = await this.storage.getContext({
        userId: request.userId,
        threadId: request.threadId,
        maxMessages: request.maxMessages || config.maxConversationHistory,
      });

      console.log(`Retrieved ${messages.length} messages from thread ${request.threadId}`);

      // Generate summary and extract context
      const context = await this.summarizer.summarize(messages, request.currentMessage);

      const duration = Date.now() - startTime;
      console.log(`Context generation completed in ${duration}ms`);

      return context;
    } catch (error) {
      console.error('Error getting conversation context:', error);

      // Graceful degradation: return empty context
      return {
        relevantMessages: [],
        summary: 'Unable to retrieve conversation history.',
        entitiesExtracted: {
          categories: [],
          dateRanges: [],
          metrics: [],
        },
      };
    }
  }

  /**
   * Store a message in the conversation history
   */
  async storeMessage(request: StoreMessageRequest): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }

    const timestamp = new Date();
    const tenantId = config.defaultTenantId;

    const message: ConversationMessage = {
      conversationId: BigQueryStorage.generateConversationId(
        tenantId,
        request.threadId,
        timestamp
      ),
      tenantId,
      userId: request.userId,
      threadId: request.threadId,
      workspaceId: request.workspaceId,
      role: request.role,
      content: request.content,
      timestamp,
      messageId: request.messageId,
      contextSummary: request.contextSummary,
      toolCalls: request.toolCalls,
    };

    try {
      await this.storage.storeMessage(message);
      console.log(`Message stored: ${message.conversationId}`);
    } catch (error) {
      console.error('Error storing message:', error);
      throw error;
    }
  }

  /**
   * Health check for all dependencies
   */
  async healthCheck(): Promise<{
    healthy: boolean;
    bigquery: boolean;
    gemini: boolean;
  }> {
    const bqHealthy = await this.storage.healthCheck();
    const geminiHealthy = await this.geminiClient.healthCheck();

    return {
      healthy: bqHealthy && geminiHealthy,
      bigquery: bqHealthy,
      gemini: geminiHealthy,
    };
  }
}
