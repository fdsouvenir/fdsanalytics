/**
 * BigQueryStorage - Handles message persistence in BigQuery
 */

import { BigQuery } from '@google-cloud/bigquery';
import { config } from '../config/config';

export interface ConversationMessage {
  conversationId: string;
  tenantId: string;
  userId: string;
  threadId: string;
  workspaceId?: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  messageId?: string;
  contextSummary?: string;
  toolCalls?: any;
  expirationTimestamp?: Date;
}

export interface GetContextParams {
  userId: string;
  threadId: string;
  maxMessages?: number;
}

export class BigQueryStorage {
  private bq: BigQuery;
  private datasetId: string;
  private tableId: string;

  constructor() {
    this.bq = new BigQuery({ projectId: config.projectId });
    this.datasetId = config.bqDatasetChatHistory;
    this.tableId = 'conversations';
  }

  /**
   * Store a message in BigQuery with retry logic
   */
  async storeMessage(message: ConversationMessage): Promise<void> {
    const maxRetries = 3;
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        await this.insertMessage(message);
        console.log(`Message stored successfully: ${message.conversationId}`);
        return;
      } catch (error) {
        lastError = error as Error;
        console.warn(`Store message attempt ${attempt}/${maxRetries} failed:`, error);

        if (attempt < maxRetries) {
          // Exponential backoff: 1s, 2s, 4s
          const delayMs = Math.pow(2, attempt - 1) * 1000;
          await this.sleep(delayMs);
        }
      }
    }

    throw new Error(
      `Failed to store message after ${maxRetries} attempts: ${lastError?.message}`
    );
  }

  /**
   * Insert message into BigQuery
   */
  private async insertMessage(message: ConversationMessage): Promise<void> {
    const table = this.bq.dataset(this.datasetId).table(this.tableId);

    const row = {
      conversation_id: message.conversationId,
      tenant_id: message.tenantId,
      user_id: message.userId,
      thread_id: message.threadId,
      workspace_id: message.workspaceId || null,
      role: message.role,
      content: message.content,
      timestamp: message.timestamp.toISOString(),
      message_id: message.messageId || null,
      context_summary: message.contextSummary || null,
      tool_calls: message.toolCalls ? JSON.stringify(message.toolCalls) : null,
      expiration_timestamp: message.expirationTimestamp
        ? message.expirationTimestamp.toISOString()
        : this.calculateExpirationTimestamp(message.timestamp),
    };

    await table.insert([row]);
  }

  /**
   * Retrieve conversation context (last N messages)
   */
  async getContext(params: GetContextParams): Promise<ConversationMessage[]> {
    const maxMessages = params.maxMessages || config.maxConversationHistory;

    const query = `
      SELECT
        conversation_id as conversationId,
        tenant_id as tenantId,
        user_id as userId,
        thread_id as threadId,
        workspace_id as workspaceId,
        role,
        content,
        timestamp,
        message_id as messageId,
        context_summary as contextSummary,
        tool_calls as toolCalls
      FROM \`${config.projectId}.${this.datasetId}.${this.tableId}\`
      WHERE thread_id = @threadId
        AND user_id = @userId
      ORDER BY timestamp DESC
      LIMIT @maxMessages
    `;

    const options = {
      query,
      params: {
        threadId: params.threadId,
        userId: params.userId,
        maxMessages,
      },
    };

    try {
      const [rows] = await this.bq.query(options);

      // Convert rows to ConversationMessage objects and reverse to chronological order
      return rows.reverse().map((row: any) => ({
        conversationId: row.conversationId,
        tenantId: row.tenantId,
        userId: row.userId,
        threadId: row.threadId,
        workspaceId: row.workspaceId,
        role: row.role,
        content: row.content,
        timestamp: new Date(row.timestamp.value || row.timestamp),
        messageId: row.messageId,
        contextSummary: row.contextSummary,
        toolCalls: row.toolCalls ? JSON.parse(row.toolCalls) : undefined,
      }));
    } catch (error) {
      console.error('Failed to retrieve conversation context:', error);
      // Return empty array on error (graceful degradation)
      return [];
    }
  }

  /**
   * Check if table exists and is accessible
   */
  async healthCheck(): Promise<boolean> {
    try {
      const dataset = this.bq.dataset(this.datasetId);
      const table = dataset.table(this.tableId);
      const [exists] = await table.exists();

      if (!exists) {
        console.error(`Table ${this.datasetId}.${this.tableId} does not exist`);
        return false;
      }

      return true;
    } catch (error) {
      console.error('BigQuery health check failed:', error);
      return false;
    }
  }

  /**
   * Calculate expiration timestamp (90 days from now)
   */
  private calculateExpirationTimestamp(timestamp: Date): string {
    const expiration = new Date(timestamp);
    expiration.setDate(expiration.getDate() + 90);
    return expiration.toISOString();
  }

  /**
   * Sleep utility for retry backoff
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Generate unique conversation ID
   */
  static generateConversationId(
    tenantId: string,
    threadId: string,
    timestamp: Date
  ): string {
    return `${tenantId}-${threadId}-${timestamp.getTime()}`;
  }
}
